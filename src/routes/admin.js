const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');
const { validateChallenge, saveHints, LAB_KEYS } = require('../challengeInput');

const router = express.Router();
router.use(requireAdmin);
router.param('id', (_req, _res, next, val) => (/^\d+$/.test(val) ? next() : next('route')));

function adminView(c) {
  return {
    ...c,
    hints: db.prepare('SELECT level, text FROM hints WHERE challenge_id = ? ORDER BY level').all(c.id),
    solve_count: db.prepare('SELECT COUNT(*) n FROM solves WHERE challenge_id = ?').get(c.id).n,
  };
}

router.get('/challenges', (_req, res) => {
  const rows = db.prepare(`SELECT c.*, g.name AS group_name FROM challenges c LEFT JOIN groups g ON g.id = c.group_id ORDER BY c.id`).all();
  res.json({ challenges: rows.map(adminView), labs: LAB_KEYS });
});

router.post('/challenges', (req, res) => {
  const parsed = validateChallenge(req.body, { isAdmin: true, maxPoints: 1000 });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const c = parsed.value;
  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO challenges (title, category, difficulty, points, description, flag_type, static_flag, lab, skills, writeup, real_world_link, group_id, active, created_by, created_at)
      VALUES (@title, @category, @difficulty, @points, @description, @flag_type, @static_flag, @lab, @skills, @writeup, @real_world_link, NULL, @active, @uid, @now)`)
      .run({ ...c, uid: req.user.id, now: Date.now() });
    saveHints(db, info.lastInsertRowid, parsed.hints);
    return info.lastInsertRowid;
  });
  res.status(201).json({ id: tx() });
});

router.put('/challenges/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM challenges WHERE id = ?').get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Challenge not found.' });
  const parsed = validateChallenge(req.body, { isAdmin: true, maxPoints: 1000 });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const c = parsed.value;
  db.transaction(() => {
    db.prepare(`UPDATE challenges SET title=@title, category=@category, difficulty=@difficulty, points=@points, description=@description,
      flag_type=@flag_type, static_flag=@static_flag, lab=@lab, skills=@skills, writeup=@writeup, real_world_link=@real_world_link, active=@active
      WHERE id=@id`).run({ ...c, id: existing.id });
    saveHints(db, existing.id, parsed.hints);
  })();
  res.json({ ok: true });
});

router.delete('/challenges/:id', (req, res) => {
  const info = db.prepare('DELETE FROM challenges WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Challenge not found.' });
  res.json({ ok: true });
});

router.get('/alerts', (_req, res) => {
  const alerts = db.prepare(`
    SELECT a.id, a.type, a.same_group, a.created_at, c.id AS challenge_id, c.title AS challenge,
           u.username AS submitter, o.username AS flag_owner
    FROM alerts a JOIN challenges c ON c.id = a.challenge_id
    JOIN users u ON u.id = a.user_id LEFT JOIN users o ON o.id = a.owner_id
    ORDER BY a.created_at DESC LIMIT 200`).all();
  res.json({ alerts: alerts.map((a) => ({ ...a, same_group: !!a.same_group })) });
});

router.delete('/alerts/:id', (req, res) => {
  db.prepare('DELETE FROM alerts WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

router.get('/users', (_req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.role, u.created_at,
      (SELECT COUNT(*) FROM solves s WHERE s.user_id = u.id) AS solves,
      (SELECT COALESCE(SUM(points_awarded),0) FROM solves s WHERE s.user_id = u.id) AS points,
      (SELECT COUNT(*) FROM alerts a WHERE a.user_id = u.id) AS alerts
    FROM users u ORDER BY u.id`).all();
  res.json({ users });
});

router.get('/stats', (_req, res) => {
  const n = (sql) => db.prepare(sql).get().n;
  res.json({
    users: n("SELECT COUNT(*) n FROM users WHERE role = 'user'"),
    challenges: n('SELECT COUNT(*) n FROM challenges WHERE group_id IS NULL'),
    solves: n('SELECT COUNT(*) n FROM solves'),
    submissions: n('SELECT COUNT(*) n FROM submissions'),
    groups: n('SELECT COUNT(*) n FROM groups'),
    alerts: n('SELECT COUNT(*) n FROM alerts'),
  });
});

module.exports = router;
