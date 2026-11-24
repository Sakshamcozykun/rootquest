const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const S = require('../services');
const { MAX_GROUP_SIZE } = require('../config');
const { validateChallenge, saveHints } = require('../challengeInput');

const router = express.Router();
router.use(requireAuth);
const digits = (_req, _res, next, val) => (/^\d+$/.test(val) ? next() : next('route'));
['id', 'userId', 'cid'].forEach((p) => router.param(p, digits));

const MAX_OWNED_GROUPS = 5;

function membership(groupId, user) {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  if (!group) return {};
  const m = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, user.id);
  if (!m && user.role !== 'admin') return { group, denied: true };
  return { group, role: m ? m.role : 'admin' };
}

function groupBoard(gid) {
  const rows = db.prepare(`
    SELECT u.id, u.username, gm.role, COALESCE(SUM(s.points_awarded), 0) AS points, COUNT(s.id) AS solves, MAX(s.solved_at) AS last_solve
    FROM group_members gm JOIN users u ON u.id = gm.user_id
    LEFT JOIN solves s ON s.user_id = u.id AND s.challenge_id IN (SELECT id FROM challenges WHERE group_id IS NULL OR group_id = @gid)
    WHERE gm.group_id = @gid GROUP BY u.id ORDER BY points DESC, last_solve ASC, u.id ASC`).all({ gid });
  const total = rows.reduce((a, r) => a + r.points, 0);
  return rows.map((r, i) => ({ ...r, rank: i + 1, share_pct: total ? Math.round((r.points / total) * 100) : 0, top_contributor: i === 0 && r.points > 0 }));
}

// ---------- list / create / join ----------
router.get('/', (req, res) => {
  const groups = db.prepare(`
    SELECT g.id, g.name, gm.role, g.owner_id, (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS member_count
    FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ? ORDER BY g.name`).all(req.user.id);
  res.json({ groups: groups.map((g) => ({ ...g, total_points: groupBoard(g.id).reduce((a, r) => a + r.points, 0) })), max_size: MAX_GROUP_SIZE });
});

router.post('/', (req, res) => {
  const name = typeof (req.body || {}).name === 'string' ? req.body.name.trim() : '';
  if (!/^[A-Za-z0-9 _-]{3,30}$/.test(name)) return res.status(400).json({ error: 'Group name must be 3-30 characters (letters, digits, space, - or _).' });
  if (db.prepare('SELECT COUNT(*) n FROM groups WHERE owner_id = ?').get(req.user.id).n >= MAX_OWNED_GROUPS) {
    return res.status(400).json({ error: `You can own at most ${MAX_OWNED_GROUPS} groups.` });
  }
  if (db.prepare('SELECT 1 FROM groups WHERE name = ?').get(name)) return res.status(409).json({ error: 'A group with that name already exists.' });
  const tx = db.transaction(() => {
    const info = db.prepare('INSERT INTO groups (name, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?)').run(name, req.user.id, S.inviteCode(), Date.now());
    db.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").run(info.lastInsertRowid, req.user.id, Date.now());
    return info.lastInsertRowid;
  });
  res.status(201).json({ id: tx() });
});

router.post('/join', (req, res) => {
  const code = typeof (req.body || {}).invite_code === 'string' ? req.body.invite_code.trim().toUpperCase() : '';
  const group = code ? db.prepare('SELECT * FROM groups WHERE invite_code = ?').get(code) : null;
  if (!group) return res.status(404).json({ error: 'Invalid invite code.' });
  if (db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, req.user.id)) {
    return res.status(409).json({ error: 'You are already in that group.' });
  }
  const count = db.prepare('SELECT COUNT(*) n FROM group_members WHERE group_id = ?').get(group.id).n;
  if (count >= MAX_GROUP_SIZE) return res.status(400).json({ error: `That group is full (max ${MAX_GROUP_SIZE} members).` });
  db.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(group.id, req.user.id, Date.now());
  res.json({ id: group.id, name: group.name });
});

// ---------- details ----------
router.get('/:id', (req, res) => {
  const { group, role, denied } = membership(Number(req.params.id), req.user);
  if (!group || denied) return res.status(404).json({ error: 'Group not found.' });
  const members = groupBoard(group.id);
  const activity = db.prepare(`
    SELECT u.username, c.id AS challenge_id, c.title, s.points_awarded, s.solved_at
    FROM solves s JOIN users u ON u.id = s.user_id JOIN challenges c ON c.id = s.challenge_id
    JOIN group_members gm ON gm.user_id = s.user_id AND gm.group_id = @gid
    WHERE c.group_id IS NULL OR c.group_id = @gid ORDER BY s.solved_at DESC LIMIT 15`).all({ gid: group.id });
  const challenges = db.prepare(`
    SELECT c.id, c.title, c.category, c.difficulty, c.points,
      EXISTS (SELECT 1 FROM solves s WHERE s.challenge_id = c.id AND s.user_id = @uid) AS solved,
      (SELECT COUNT(*) FROM solves s JOIN group_members gm ON gm.user_id = s.user_id AND gm.group_id = c.group_id WHERE s.challenge_id = c.id) AS member_solves
    FROM challenges c WHERE c.group_id = @gid ORDER BY c.id`).all({ uid: req.user.id, gid: group.id });
  res.json({
    group: {
      id: group.id, name: group.name, owner_id: group.owner_id, max_size: MAX_GROUP_SIZE,
      invite_code: role === 'owner' || role === 'admin' ? group.invite_code : null,
    },
    my_role: role,
    members,
    total_points: members.reduce((a, m) => a + m.points, 0),
    activity,
    challenges: challenges.map((c) => ({ ...c, solved: !!c.solved })),
  });
});

router.get('/:id/scoreboard', (req, res) => {
  const { group, denied } = membership(Number(req.params.id), req.user);
  if (!group || denied) return res.status(404).json({ error: 'Group not found.' });
  const board = groupBoard(group.id);
  res.json({ scoreboard: board, total_points: board.reduce((a, r) => a + r.points, 0) });
});

// ---------- owner actions ----------
router.post('/:id/regenerate-invite', (req, res) => {
  const { group, role, denied } = membership(Number(req.params.id), req.user);
  if (!group || denied) return res.status(404).json({ error: 'Group not found.' });
  if (role !== 'owner') return res.status(403).json({ error: 'Only the owner can do that.' });
  const code = S.inviteCode();
  db.prepare('UPDATE groups SET invite_code = ? WHERE id = ?').run(code, group.id);
  res.json({ invite_code: code });
});

router.delete('/:id/members/:userId', (req, res) => {
  const { group, role, denied } = membership(Number(req.params.id), req.user);
  if (!group || denied) return res.status(404).json({ error: 'Group not found.' });
  const target = Number(req.params.userId);
  const isSelf = target === req.user.id;
  if (!isSelf && role !== 'owner') return res.status(403).json({ error: 'Only the owner can remove members.' });
  if (target === group.owner_id) return res.status(400).json({ error: 'The owner cannot leave. Delete the group instead.' });
  const info = db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(group.id, target);
  if (!info.changes) return res.status(404).json({ error: 'That user is not in the group.' });
  // Their private notes shared with this group stop being shared.
  db.prepare('UPDATE notes SET group_id = NULL WHERE user_id = ? AND group_id = ?').run(target, group.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const { group, role, denied } = membership(Number(req.params.id), req.user);
  if (!group || denied) return res.status(404).json({ error: 'Group not found.' });
  if (role !== 'owner') return res.status(403).json({ error: 'Only the owner can delete the group.' });
  db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
  res.json({ ok: true });
});

// Group-only challenges: visible to members only, count towards the group scoreboard only.
router.post('/:id/challenges', (req, res) => {
  const { group, role, denied } = membership(Number(req.params.id), req.user);
  if (!group || denied) return res.status(404).json({ error: 'Group not found.' });
  if (role !== 'owner') return res.status(403).json({ error: 'Only the group owner can add challenges.' });
  if (db.prepare('SELECT COUNT(*) n FROM challenges WHERE group_id = ?').get(group.id).n >= 30) {
    return res.status(400).json({ error: 'A group can have at most 30 private challenges.' });
  }
  const parsed = validateChallenge(req.body, { isAdmin: false, maxPoints: 100 });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const c = parsed.value;
  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO challenges (title, category, difficulty, points, description, flag_type, static_flag, lab, skills, writeup, real_world_link, group_id, active, created_by, created_at)
      VALUES (@title, @category, @difficulty, @points, @description, @flag_type, @static_flag, NULL, @skills, @writeup, @real_world_link, @gid, 1, @uid, @now)`)
      .run({ ...c, gid: group.id, uid: req.user.id, now: Date.now() });
    saveHints(db, info.lastInsertRowid, parsed.hints);
    return info.lastInsertRowid;
  });
  res.status(201).json({ id: tx() });
});

router.delete('/:id/challenges/:cid', (req, res) => {
  const { group, role, denied } = membership(Number(req.params.id), req.user);
  if (!group || denied) return res.status(404).json({ error: 'Group not found.' });
  if (role !== 'owner') return res.status(403).json({ error: 'Only the group owner can delete challenges.' });
  const info = db.prepare('DELETE FROM challenges WHERE id = ? AND group_id = ?').run(Number(req.params.cid), group.id);
  if (!info.changes) return res.status(404).json({ error: 'Challenge not found in this group.' });
  res.json({ ok: true });
});

module.exports = router;
