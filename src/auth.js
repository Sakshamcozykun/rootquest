const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { JWT_SECRET, IS_PROD, SUBMIT_LIMIT_PER_MIN, API_LIMIT_PER_MIN } = require('./config');

const COOKIE = 'rq_token';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function issueCookie(res, user) {
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax', // also blocks cross-site POSTs (CSRF)
    secure: IS_PROD,
    maxAge: MAX_AGE_MS,
  });
}

function clearCookie(res) {
  res.clearCookie(COOKIE);
}

// Loads req.user if a valid session cookie is present (does not block).
function loadUser(req, _res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) {
    try {
      const { uid } = jwt.verify(token, JWT_SECRET);
      const user = db.prepare('SELECT id, username, role, streak, last_daily_date FROM users WHERE id = ?').get(uid);
      if (user) req.user = user;
    } catch (_) { /* invalid or expired - treat as logged out */ }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
  next();
}

// Limiters. Flag submissions are limited per logged-in user, not per IP,
// so people sharing a college network do not block each other.
const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: SUBMIT_LIMIT_PER_MIN,
  keyGenerator: (req) => `user:${req.user ? req.user.id : 'anon'}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: `Too many attempts. Max ${SUBMIT_LIMIT_PER_MIN} flag submissions per minute - slow down and think.` }),
  validate: { keyGeneratorIpFallback: false },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many login attempts. Try again in a few minutes.' }),
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: API_LIMIT_PER_MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many requests.' }),
});

module.exports = { issueCookie, clearCookie, loadUser, requireAuth, requireAdmin, submitLimiter, authLimiter, apiLimiter };
