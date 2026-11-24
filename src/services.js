const crypto = require('crypto');
const db = require('./db');
const { DAILY_TZ_OFFSET_MIN, HINT_PENALTY_PCT } = require('./config');

// ---------- visibility ----------
// A challenge is visible if it is public, or belongs to one of the user's groups, or the user is admin.
const VISIBLE_SQL = `(c.active = 1 AND (c.group_id IS NULL OR c.group_id IN (SELECT group_id FROM group_members WHERE user_id = @uid)))`;

function getVisibleChallenge(user, id) {
  const c = db.prepare('SELECT c.* FROM challenges c WHERE c.id = ?').get(id);
  if (!c) return null;
  if (user.role === 'admin') return c;
  if (!c.active) return null;
  if (c.group_id) {
    const m = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(c.group_id, user.id);
    if (!m) return null;
  }
  return c;
}

function userGroupIds(userId) {
  return db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(userId).map((r) => r.group_id);
}

function shareAGroup(a, b) {
  return !!db.prepare(`SELECT 1 FROM group_members x JOIN group_members y ON x.group_id = y.group_id
                       WHERE x.user_id = ? AND y.user_id = ? LIMIT 1`).get(a, b);
}

// ---------- daily challenge + streak ----------
function todayStr(offsetMin = DAILY_TZ_OFFSET_MIN, now = Date.now()) {
  return new Date(now + offsetMin * 60000).toISOString().slice(0, 10);
}

function yesterdayStr() {
  return todayStr(DAILY_TZ_OFFSET_MIN, Date.now() - 24 * 3600 * 1000);
}

// Deterministic: everybody gets the same daily challenge for a given date.
function dailyChallengeId() {
  const ids = db.prepare('SELECT id FROM challenges WHERE active = 1 AND group_id IS NULL ORDER BY id').all().map((r) => r.id);
  if (!ids.length) return null;
  const n = crypto.createHash('sha256').update(todayStr()).digest().readUInt32BE(0);
  return ids[n % ids.length];
}

// Streak shown to the user: lapses to 0 if they missed yesterday.
function effectiveStreak(user) {
  if (!user.last_daily_date) return 0;
  if (user.last_daily_date === todayStr() || user.last_daily_date === yesterdayStr()) return user.streak;
  return 0;
}

function bumpStreak(userId) {
  const u = db.prepare('SELECT streak, last_daily_date FROM users WHERE id = ?').get(userId);
  const today = todayStr();
  if (u.last_daily_date === today) return u.streak;
  const next = u.last_daily_date === yesterdayStr() ? u.streak + 1 : 1;
  db.prepare('UPDATE users SET streak = ?, last_daily_date = ? WHERE id = ?').run(next, today, userId);
  return next;
}

// ---------- hints ----------
function hintPenaltyPct(userId, challengeId) {
  const r = db.prepare('SELECT MAX(level) AS lvl FROM hint_unlocks WHERE user_id = ? AND challenge_id = ?').get(userId, challengeId);
  return r.lvl ? HINT_PENALTY_PCT[r.lvl - 1] : 0;
}

// ---------- timed mode ----------
function closeIfExpired(session) {
  if (session && !session.ended_at) {
    const end = session.started_at + session.duration_min * 60000;
    if (Date.now() >= end) {
      db.prepare('UPDATE timed_sessions SET ended_at = ? WHERE id = ?').run(end, session.id);
      session.ended_at = end;
    }
  }
  return session;
}

function activeSession(userId) {
  const s = db.prepare('SELECT * FROM timed_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1').get(userId);
  closeIfExpired(s);
  return s && !s.ended_at ? s : null;
}

// ---------- skills ----------
const splitSkills = (s) => (s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

// Per-skill progress over the challenges visible to this user.
function skillStats(user, targetUserId = user.id) {
  const visible = db.prepare(`SELECT c.id, c.skills FROM challenges c WHERE ${VISIBLE_SQL}`).all({ uid: user.id });
  const solved = new Set(db.prepare('SELECT challenge_id FROM solves WHERE user_id = ?').all(targetUserId).map((r) => r.challenge_id));
  const map = new Map();
  for (const c of visible) {
    for (const sk of splitSkills(c.skills)) {
      const e = map.get(sk) || { skill: sk, solved: 0, total: 0 };
      e.total += 1;
      if (solved.has(c.id)) e.solved += 1;
      map.set(sk, e);
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, pct: Math.round((e.solved / e.total) * 100) }))
    .sort((a, b) => a.skill.localeCompare(b.skill));
}

// Weakest skill = lowest solved %, ties broken by fewest solves. Suggest its easiest unsolved challenge.
function recommendNext(user) {
  const stats = skillStats(user).filter((s) => s.solved < s.total);
  if (!stats.length) return null;
  stats.sort((a, b) => a.pct - b.pct || a.solved - b.solved || a.skill.localeCompare(b.skill));
  const weakest = stats[0];
  const candidates = db.prepare(`
    SELECT c.id, c.title, c.category, c.difficulty, c.points, c.skills FROM challenges c
    WHERE ${VISIBLE_SQL}
      AND c.id NOT IN (SELECT challenge_id FROM solves WHERE user_id = @uid)
      AND (',' || REPLACE(LOWER(c.skills), ' ', '') || ',') LIKE @pat
    ORDER BY c.points ASC, c.id ASC LIMIT 1`).get({ uid: user.id, pat: `%,${weakest.skill.replace(/\s/g, '')},%` });
  return candidates ? { skill: weakest.skill, pct: weakest.pct, challenge: candidates } : null;
}

// ---------- misc ----------
function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike characters
  const bytes = crypto.randomBytes(8);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

module.exports = {
  VISIBLE_SQL, getVisibleChallenge, userGroupIds, shareAGroup,
  todayStr, dailyChallengeId, effectiveStreak, bumpStreak,
  hintPenaltyPct, activeSession, closeIfExpired,
  splitSkills, skillStats, recommendNext, inviteCode,
};
