const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Secrets: taken from env if set, otherwise generated once and persisted so
// per-user flags and login sessions stay valid across restarts.
function loadSecrets() {
  const file = path.join(DATA_DIR, 'secrets.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* first run */ }
  let changed = false;
  for (const key of ['flagSecret', 'jwtSecret']) {
    if (!saved[key]) { saved[key] = crypto.randomBytes(32).toString('hex'); changed = true; }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(saved, null, 2), { mode: 0o600 });
  return saved;
}
const saved = loadSecrets();

module.exports = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATA_DIR,
  DB_FILE: process.env.DB_FILE || path.join(DATA_DIR, 'rootquest.db'),
  FLAG_SECRET: process.env.FLAG_SECRET || saved.flagSecret,
  JWT_SECRET: process.env.JWT_SECRET || saved.jwtSecret,
  IS_PROD: process.env.NODE_ENV === 'production',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  // Minutes ahead of UTC used to decide when "today" starts (330 = IST).
  DAILY_TZ_OFFSET_MIN: parseInt(process.env.DAILY_TZ_OFFSET_MIN || '330', 10),
  MAX_GROUP_SIZE: parseInt(process.env.MAX_GROUP_SIZE || '10', 10),
  HINT_PENALTY_PCT: [10, 20, 30], // deduction for unlocking hint level 1, 2, 3
  API_LIMIT_PER_MIN: parseInt(process.env.API_LIMIT_PER_MIN || '300', 10),
  SUBMIT_LIMIT_PER_MIN: parseInt(process.env.SUBMIT_LIMIT_PER_MIN || '5', 10),
  // Set to the number of reverse proxies in front of the app (1 for nginx,
  // Caddy, Render, Fly, Railway, a Cloudflare tunnel...) so rate limiting sees
  // the real client IP instead of the proxy's.
  TRUST_PROXY: process.env.TRUST_PROXY || '',
};
