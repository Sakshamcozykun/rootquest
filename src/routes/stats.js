const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const S = require('../services');

const router = express.Router();

// Global scoreboard counts public challenges only, so group-made challenges cannot inflate it.
const SCOREBOARD_SQL = `
  SELECT u.id, u.username, COALESCE(SUM(s.points_awarded), 0) AS points, COUNT(s.id) AS solves, MAX(s.solved_at) AS last_solve
  FROM users u
  LEFT JOIN solves s ON s.user_id = u.id AND s.challenge_id IN (SELECT id FROM challenges WHERE group_id IS NULL)
  WHERE u.role = 'user'
  GROUP BY u.id
  ORDER BY points DESC, last_solve ASC, u.id ASC`;

function ranked(rows) {
  let rank = 0, prev = null;
  return rows.map((r, i) => {
    if (prev === null || r.points !== prev) { rank = i + 1; prev = r.points; }
    return { ...r, rank };
  });
}

router.get('/scoreboard', requireAuth, (req, res) => {
  const all = ranked(db.prepare(SCOREBOARD_SQL).all());
  res.json({ scoreboard: all.slice(0, 100), me: all.find((r) => r.id === req.user.id) || null, total_players: all.length });
});

router.get('/profile/me', requireAuth, (req, res) => {
  const user = req.user;
  const all = ranked(db.prepare(SCOREBOARD_SQL).all());
  const me = all.find((r) => r.id === user.id) || { points: 0, solves: 0, rank: null };
  const solves = db.prepare(`
    SELECT c.id, c.title, c.category, c.difficulty, s.points_awarded, s.hint_penalty_pct, s.solved_at, c.group_id
    FROM solves s JOIN challenges c ON c.id = s.challenge_id
    WHERE s.user_id = ? ORDER BY s.solved_at DESC`).all(user.id);
  const total = db.prepare(`SELECT COUNT(*) n FROM challenges c WHERE ${S.VISIBLE_SQL}`).get({ uid: user.id }).n;
  const submissions = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(correct),0) ok FROM submissions WHERE user_id = ?').get(user.id);
  res.json({
    user: { id: user.id, username: user.username, role: user.role },
    points: me.points, rank: me.rank, total_players: all.length,
    solved_count: solves.length, visible_challenges: total,
    attempts: submissions.n, correct_attempts: submissions.ok,
    streak: S.effectiveStreak(user),
    skills: S.skillStats(user),
    recommended: S.recommendNext(user),
    recent_solves: solves.slice(0, 15),
  });
});

router.get('/users/:username', requireAuth, (req, res) => {
  const target = db.prepare('SELECT id, username FROM users WHERE username = ? AND role = \'user\'').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  const all = ranked(db.prepare(SCOREBOARD_SQL).all());
  const row = all.find((r) => r.id === target.id);
  const recent = db.prepare(`
    SELECT c.title, c.category, s.points_awarded, s.solved_at FROM solves s JOIN challenges c ON c.id = s.challenge_id
    WHERE s.user_id = ? AND c.group_id IS NULL ORDER BY s.solved_at DESC LIMIT 10`).all(target.id);
  res.json({
    username: target.username, points: row.points, rank: row.rank, solves: row.solves,
    skills: S.skillStats(req.user, target.id), recent_solves: recent,
  });
});

module.exports = router;
