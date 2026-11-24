const crypto = require('crypto');
const { FLAG_SECRET } = require('./config');

function hmacHex(label, userId, challengeId) {
  return crypto.createHmac('sha256', FLAG_SECRET).update(`${label}:${userId}:${challengeId}`).digest('hex');
}

// RQ{<16 hex chars>} - unique for every (user, challenge) pair, never stored.
function dynamicFlag(userId, challengeId) {
  return `RQ{${hmacHex('flag', userId, challengeId).slice(0, 16)}}`;
}

// Non-zero single byte key used by XOR-style challenges, also per user.
function xorKey(userId, challengeId) {
  const b = parseInt(hmacHex('xor', userId, challengeId).slice(0, 2), 16);
  return b === 0 ? 0x5a : b;
}

function rot13(s) {
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function caesar(s, shift) {
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
  });
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const hex = (s) => Buffer.from(s, 'utf8').toString('hex');
const reverse = (s) => [...s].reverse().join('');
const binary = (s) => [...Buffer.from(s, 'utf8')].map((n) => n.toString(2).padStart(8, '0')).join(' ');

const TRANSFORMS = {
  FLAG: (f) => f,
  B64: b64,
  HEX: hex,
  ROT13: rot13,
  BIN: binary,
  REV: reverse,
  CAESAR: (f) => caesar(f, 7),
  LAYERED: (f) => hex(b64(reverse(f))), // reverse -> base64 -> hex
  XOR: null, // needs the per-user key, handled below
};

// Replaces {{FLAG}}, {{FLAG_B64}}, {{FLAG_HEX}}, ... in a challenge description
// with a value derived from THIS user's flag. Static challenges are left as-is.
function renderDescription(challenge, userId) {
  if (challenge.flag_type !== 'dynamic') return challenge.description;
  const flag = dynamicFlag(userId, challenge.id);
  return challenge.description.replace(/\{\{FLAG(?:_([A-Z0-9]+))?\}\}/g, (match, kind) => {
    if (!kind) return flag;
    if (kind === 'XOR') {
      const key = xorKey(userId, challenge.id);
      return Buffer.from(flag, 'utf8').map((byte) => byte ^ key).toString('hex');
    }
    return TRANSFORMS[kind] ? TRANSFORMS[kind](flag) : match;
  });
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function checkFlag(challenge, userId, submitted) {
  const expected = challenge.flag_type === 'static' ? challenge.static_flag : dynamicFlag(userId, challenge.id);
  return safeEqual(expected, submitted.trim());
}

module.exports = { dynamicFlag, xorKey, renderDescription, checkFlag, safeEqual };
