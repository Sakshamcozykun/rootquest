const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { issueCookie, clearCookie, requireAuth, authLimiter } = require('../auth');
const { effectiveStreak } = require('../services');

const router = express.Router();

const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role, streak: effectiveStreak(u) });

router.post('/register', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters: letters, digits or underscore.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: 'Password must be 8-72 characters.' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'That username is taken.' });
  }
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, hash, Date.now());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  issueCookie(res, user);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  // Always run a bcrypt compare so response time does not reveal whether the username exists.
  const hash = user ? user.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali';
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) return res.status(401).json({ error: 'Wrong username or password.' });
  issueCookie(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (_req, res) => {
  clearCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

router.post('/change-password', requireAuth, authLimiter, async (req, res) => {
  const { current, next } = req.body || {};
  if (typeof current !== 'string' || typeof next !== 'string' || next.length < 8 || next.length > 72) {
    return res.status(400).json({ error: 'New password must be 8-72 characters.' });
  }
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!(await bcrypt.compare(current, row.password_hash))) return res.status(401).json({ error: 'Current password is wrong.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(next, 10), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
