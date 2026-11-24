const express = require('express');
const db = require('../db');
const { requireAuth, submitLimiter } = require('../auth');
const { renderDescription, checkFlag, dynamicFlag } = require('../flags');
const S = require('../services');
const { HINT_PENALTY_PCT } = require('../config');

const router = express.Router();
router.use(requireAuth);
const digits = (_req, _res, next, val) => (/^\d+$/.test(val) ? next() : next('route'));
router.param('id', digits);
router.param('level', digits);

const FLAG_SHAPE = /^RQ\{[0-9a-f]{16}\}$/;

// ---------- list ----------
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.title, c.category, c.difficulty, c.points, c.skills, c.group_id, g.name AS group_name,
      (SELECT COUNT(*) FROM solves s WHERE s.challenge_id = c.id) AS solve_count,
      EXISTS (SELECT 1 FROM solves s WHERE s.challenge_id = c.id AND s.user_id = @uid) AS solved
    FROM challenges c LEFT JOIN groups g ON g.id = c.group_id
    WHERE ${S.VISIBLE_SQL}
    ORDER BY c.points ASC, c.id ASC`).all({ uid: req.user.id });
  const daily = S.dailyChallengeId();
  res.json({
    challenges: rows.map((r) => ({ ...r, solved: !!r.solved, skills: S.splitSkills(r.skills), is_daily: r.id === daily })),
  });
});

// ---------- daily ----------
router.get('/daily/today', (req, res) => {
  const id = S.dailyChallengeId();
  if (!id) return res.json({ daily: null, streak: 0 });
  const c = db.prepare('SELECT id, title, category, difficulty, points FROM challenges WHERE id = ?').get(id);
  const solved = !!db.prepare('SELECT 1 FROM solves WHERE user_id = ? AND challenge_id = ?').get(req.user.id, id);
  res.json({ daily: { ...c, solved }, date: S.todayStr(), streak: S.effectiveStreak(req.user) });
});

// ---------- detail ----------
router.get('/:id', (req, res) => {
  const c = S.getVisibleChallenge(req.user, Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Challenge not found.' });

  const solve = db.prepare('SELECT * FROM solves WHERE user_id = ? AND challenge_id = ?').get(req.user.id, c.id);
  const session = S.activeSession(req.user.id);
  const hintsDisabled = !!session && !solve;
  const unlocked = new Map(db.prepare('SELECT level FROM hint_unlocks WHERE user_id = ? AND challenge_id = ?')
    .all(req.user.id, c.id).map((r) => [r.level, true]));
  const hints = db.prepare('SELECT level, text FROM hints WHERE challenge_id = ? ORDER BY level').all(c.id).map((h) => {
    const open = !hintsDisabled && (unlocked.has(h.level) || !!solve);
    return { level: h.level, penalty_pct: HINT_PENALTY_PCT[h.level - 1], unlocked: open, text: open ? h.text : null };
  });
  const penalty = S.hintPenaltyPct(req.user.id, c.id);

  const myGroups = S.userGroupIds(req.user.id);
  let teammates = [];
  if (myGroups.length) {
    teammates = db.prepare(`
      SELECT DISTINCT u.username, s.solved_at FROM solves s
      JOIN users u ON u.id = s.user_id
      JOIN group_members gm ON gm.user_id = s.user_id
      WHERE s.challenge_id = ? AND s.user_id != ? AND gm.group_id IN (${myGroups.map(() => '?').join(',')})
      ORDER BY s.solved_at`).all(c.id, req.user.id, ...myGroups);
  }

  res.json({
    id: c.id, title: c.title, category: c.category, difficulty: c.difficulty, points: c.points,
    skills: S.splitSkills(c.skills), group_id: c.group_id,
    description: renderDescription(c, req.user.id),
    lab_url: c.lab ? `/lab/${c.lab}/` : null,
    solved: !!solve,
    solved_at: solve ? solve.solved_at : null,
    points_awarded: solve ? solve.points_awarded : null,
    hints, hints_disabled: hintsDisabled, hint_penalty_pct: penalty,
    potential_points: Math.max(1, Math.round(c.points * (1 - penalty / 100))),
    solve_count: db.prepare('SELECT COUNT(*) n FROM solves WHERE challenge_id = ?').get(c.id).n,
    teammates_solved: teammates,
    is_daily: S.dailyChallengeId() === c.id,
    timed_session_active: !!session,
    // Walkthrough is only revealed once the challenge is solved.
    writeup: solve ? c.writeup : null,
    real_world_link: solve ? c.real_world_link : null,
  });
});

// ---------- submit flag ----------
router.post('/:id/submit', submitLimiter, (req, res) => {
  const c = S.getVisibleChallenge(req.user, Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Challenge not found.' });
  const value = req.body && req.body.flag;
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    return res.status(400).json({ error: 'Enter a flag (max 200 characters).' });
  }

  const existing = db.prepare('SELECT 1 FROM solves WHERE user_id = ? AND challenge_id = ?').get(req.user.id, c.id);
  if (existing) return res.json({ correct: true, already_solved: true, message: 'You already solved this one.' });

  const correct = checkFlag(c, req.user.id, value);
  db.prepare('INSERT INTO submissions (user_id, challenge_id, correct, submitted_at) VALUES (?, ?, ?, ?)')
    .run(req.user.id, c.id, correct ? 1 : 0, Date.now());

  if (!correct) {
    // Flag-sharing detection: is this a valid flag that belongs to someone else?
    if (c.flag_type === 'dynamic' && FLAG_SHAPE.test(value.trim())) {
      const others = db.prepare('SELECT id FROM users WHERE id != ?').all(req.user.id);
      const owner = others.find((o) => dynamicFlag(o.id, c.id) === value.trim());
      if (owner) {
        db.prepare('INSERT INTO alerts (type, user_id, owner_id, challenge_id, same_group, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run('flag_sharing', req.user.id, owner.id, c.id, S.shareAGroup(req.user.id, owner.id) ? 1 : 0, Date.now());
        return res.json({ correct: false, message: 'Incorrect. That flag is valid for a different account - this has been logged. Solve it yourself!' });
      }
    }
    return res.json({ correct: false, message: 'Incorrect flag. Try again.' });
  }

  const session = S.activeSession(req.user.id);
  const penalty = S.hintPenaltyPct(req.user.id, c.id);
  const awarded = Math.max(1, Math.round(c.points * (1 - penalty / 100)));
  let streak = null;
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO solves (user_id, challenge_id, points_awarded, hint_penalty_pct, session_id, solved_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, c.id, awarded, penalty, session ? session.id : null, Date.now());
    if (!c.group_id && S.dailyChallengeId() === c.id) streak = S.bumpStreak(req.user.id);
  });
  try { tx(); } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.json({ correct: true, already_solved: true, message: 'You already solved this one.' });
    throw e;
  }
  res.json({
    correct: true, points_awarded: awarded, hint_penalty_pct: penalty, daily_streak: streak,
    message: `Correct! +${awarded} points.`,
    writeup: c.writeup, real_world_link: c.real_world_link,
  });
});

// ---------- hint ladder ----------
router.post('/:id/hints/:level/unlock', (req, res) => {
  const c = S.getVisibleChallenge(req.user, Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Challenge not found.' });
  const level = Number(req.params.level);
  if (db.prepare('SELECT 1 FROM solves WHERE user_id = ? AND challenge_id = ?').get(req.user.id, c.id)) {
    return res.status(400).json({ error: 'Already solved - all hints are open for you.' });
  }
  if (S.activeSession(req.user.id)) return res.status(403).json({ error: 'Hints are disabled during a timed session.' });
  const hint = db.prepare('SELECT level, text FROM hints WHERE challenge_id = ? AND level = ?').get(c.id, level);
  if (!hint) return res.status(404).json({ error: 'No such hint.' });

  const already = db.prepare('SELECT 1 FROM hint_unlocks WHERE user_id = ? AND challenge_id = ? AND level = ?').get(req.user.id, c.id, level);
  if (!already) {
    const max = db.prepare('SELECT COALESCE(MAX(level), 0) AS m FROM hint_unlocks WHERE user_id = ? AND challenge_id = ?').get(req.user.id, c.id).m;
    if (level !== max + 1) return res.status(400).json({ error: `Unlock hint ${max + 1} first - hints open in order.` });
    db.prepare('INSERT INTO hint_unlocks (user_id, challenge_id, level, unlocked_at) VALUES (?, ?, ?, ?)').run(req.user.id, c.id, level, Date.now());
  }
  const penalty = S.hintPenaltyPct(req.user.id, c.id);
  res.json({
    level, text: hint.text, hint_penalty_pct: penalty,
    potential_points: Math.max(1, Math.round(c.points * (1 - penalty / 100))),
  });
});

// ---------- notes (private, optionally shared with one of your groups) ----------
router.get('/:id/notes', (req, res) => {
  const c = S.getVisibleChallenge(req.user, Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Challenge not found.' });
  const mine = db.prepare('SELECT text, group_id, updated_at FROM notes WHERE user_id = ? AND challenge_id = ?').get(req.user.id, c.id) || null;
  const groups = db.prepare('SELECT g.id, g.name FROM groups g JOIN group_members m ON m.group_id = g.id WHERE m.user_id = ? ORDER BY g.name').all(req.user.id);
  const ids = groups.map((g) => g.id);
  const shared = ids.length ? db.prepare(`
    SELECT u.username, n.text, n.updated_at, g.name AS group_name FROM notes n
    JOIN users u ON u.id = n.user_id JOIN groups g ON g.id = n.group_id
    WHERE n.challenge_id = ? AND n.user_id != ? AND n.group_id IN (${ids.map(() => '?').join(',')})
    ORDER BY n.updated_at DESC`).all(c.id, req.user.id, ...ids) : [];
  res.json({ mine, groups, shared });
});

router.put('/:id/notes', (req, res) => {
  const c = S.getVisibleChallenge(req.user, Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Challenge not found.' });
  const { text, group_id } = req.body || {};
  if (typeof text !== 'string' || text.length > 10000) return res.status(400).json({ error: 'Notes must be text up to 10,000 characters.' });
  let gid = null;
  if (group_id !== null && group_id !== undefined && group_id !== '') {
    gid = Number(group_id);
    if (!S.userGroupIds(req.user.id).includes(gid)) return res.status(403).json({ error: 'You are not in that group.' });
  }
  db.prepare(`INSERT INTO notes (user_id, challenge_id, group_id, text, updated_at) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(user_id, challenge_id) DO UPDATE SET text = excluded.text, group_id = excluded.group_id, updated_at = excluded.updated_at`)
    .run(req.user.id, c.id, gid, text, Date.now());
  res.json({ ok: true });
});

module.exports = router;
