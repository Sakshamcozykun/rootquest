const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const S = require('../services');

const router = express.Router();
router.use(requireAuth);

const view = (s) => ({
  id: s.id, started_at: s.started_at, duration_min: s.duration_min, ended_at: s.ended_at,
  ends_at: s.started_at + s.duration_min * 60000,
  remaining_sec: s.ended_at ? 0 : Math.max(0, Math.round((s.started_at + s.duration_min * 60000 - Date.now()) / 1000)),
});

router.get('/', (req, res) => {
  const active = S.activeSession(req.user.id);
  const past = db.prepare('SELECT * FROM timed_sessions WHERE user_id = ? AND ended_at IS NOT NULL ORDER BY id DESC LIMIT 10').all(req.user.id)
    .map((s) => ({
      ...view(s),
      solves: db.prepare('SELECT COUNT(*) n FROM solves WHERE session_id = ?').get(s.id).n,
      points: db.prepare('SELECT COALESCE(SUM(points_awarded),0) p FROM solves WHERE session_id = ?').get(s.id).p,
    }));
  res.json({ active: active ? view(active) : null, history: past });
});

router.post('/start', (req, res) => {
  const minutes = Number((req.body || {}).duration_min);
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 180) {
    return res.status(400).json({ error: 'Duration must be a whole number of minutes between 10 and 180.' });
  }
  if (S.activeSession(req.user.id)) return res.status(409).json({ error: 'You already have a timed session running.' });
  const info = db.prepare('INSERT INTO timed_sessions (user_id, started_at, duration_min) VALUES (?, ?, ?)').run(req.user.id, Date.now(), minutes);
  res.status(201).json({ session: view(db.prepare('SELECT * FROM timed_sessions WHERE id = ?').get(info.lastInsertRowid)) });
});

router.post('/end', (req, res) => {
  const s = S.activeSession(req.user.id);
  if (!s) return res.status(400).json({ error: 'No timed session is running.' });
  db.prepare('UPDATE timed_sessions SET ended_at = ? WHERE id = ?').run(Date.now(), s.id);
  res.json({ session_id: s.id });
});

router.get('/:id/summary', (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const s = db.prepare('SELECT * FROM timed_sessions WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!s) return res.status(404).json({ error: 'Session not found.' });
  S.closeIfExpired(s);
  const end = s.ended_at || Date.now();
  const solves = db.prepare(`
    SELECT c.id, c.title, c.category, c.difficulty, c.skills, c.points, s.points_awarded, s.solved_at
    FROM solves s JOIN challenges c ON c.id = s.challenge_id WHERE s.session_id = ? ORDER BY s.solved_at`).all(s.id);
  const attempts = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(correct),0) ok FROM submissions WHERE user_id = ? AND submitted_at BETWEEN ? AND ?')
    .get(req.user.id, s.started_at, end);
  const skills = {};
  for (const r of solves) for (const k of S.splitSkills(r.skills)) skills[k] = (skills[k] || 0) + 1;
  res.json({
    session: view(s),
    running: !s.ended_at,
    time_used_sec: Math.round((end - s.started_at) / 1000),
    total_points: solves.reduce((a, r) => a + r.points_awarded, 0),
    solves: solves.map((r) => ({
      id: r.id, title: r.title, category: r.category, difficulty: r.difficulty,
      points_awarded: r.points_awarded, at_sec: Math.round((r.solved_at - s.started_at) / 1000),
    })),
    attempts: attempts.n, correct_attempts: attempts.ok,
    accuracy_pct: attempts.n ? Math.round((attempts.ok / attempts.n) * 100) : null,
    skills_practised: Object.entries(skills).map(([skill, count]) => ({ skill, count })),
  });
});

module.exports = router;
