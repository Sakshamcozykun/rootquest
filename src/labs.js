// Built-in practice labs. They are served from the same origin as the platform but
// are deliberately small, self-contained and isolated from the real database:
//   robots  - hidden path found via robots.txt
//   cookie  - client-side role cookie that can be edited
//   sqli    - login form with a deliberately injectable query (runs on a throw-away in-memory DB)
//   strings - binary blob with a flag hidden between random bytes
// Every lab shows the flag that belongs to the LOGGED-IN user (same HMAC flag used for submission).
const crypto = require('crypto');
const express = require('express');
const Database = require('better-sqlite3');
const db = require('./db');
const { FLAG_SECRET } = require('./config');
const { dynamicFlag } = require('./flags');

const router = express.Router();
router.use(express.urlencoded({ extended: false, limit: '10kb' }));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body{font-family:ui-monospace,Menlo,Consolas,monospace;background:#10151c;color:#d6dde6;margin:0;padding:40px 16px;display:flex;justify-content:center}
  main{max-width:560px;width:100%}
  h1{font-size:20px;margin:0 0 4px} .tag{color:#7a8797;font-size:12px;margin-bottom:24px}
  .box{border:1px solid #2a3442;border-radius:8px;padding:20px;background:#151c26}
  input{width:100%;box-sizing:border-box;padding:10px;margin:6px 0 14px;background:#0d1219;border:1px solid #2a3442;color:#d6dde6;border-radius:6px;font:inherit}
  button{padding:10px 18px;background:#3ddc97;color:#06251a;border:0;border-radius:6px;font:inherit;font-weight:700;cursor:pointer}
  .flag{color:#3ddc97;font-weight:700;word-break:break-all} .err{color:#ff7b72} a{color:#3ddc97}
  code{background:#0d1219;padding:2px 6px;border-radius:4px}
</style></head><body><main>${body}
<p class="tag" style="margin-top:24px"><a href="/#/challenges">&larr; back to RootQuest</a></p></main></body></html>`;
}

// All labs need a RootQuest login so the flag can be personalised.
router.use((req, res, next) => {
  if (!req.user) {
    return res.status(401).send(page('Login required', '<h1>Login required</h1><div class="box">Log in to RootQuest first, then reopen this lab: <a href="/#/login">log in</a></div>'));
  }
  next();
});

function labChallengeId(lab) {
  const row = db.prepare('SELECT id FROM challenges WHERE lab = ? AND active = 1 ORDER BY id LIMIT 1').get(lab);
  return row ? row.id : null;
}

function withFlag(lab, req, res, render) {
  const id = labChallengeId(lab);
  if (!id) return res.status(404).send(page('Not available', '<h1>This lab is not available.</h1>'));
  res.send(render(dynamicFlag(req.user.id, id)));
}

// ---------- lab: robots ----------
const vaultToken = crypto.createHmac('sha256', FLAG_SECRET).update('robots-vault').digest('hex').slice(0, 8);

router.get('/robots/', (_req, res) => {
  res.send(page('ACME Intranet', `<h1>ACME Corp Intranet</h1><div class="tag">Internal tools - employees only</div>
    <div class="box">Welcome. Nothing to see on this page... or is there? Search engines are told to stay away from certain places.</div>`));
});

router.get('/robots/robots.txt', (_req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /lab/robots/vault-${vaultToken}/\n`);
});

router.get(`/robots/vault-${vaultToken}/`, (req, res) => {
  withFlag('robots', req, res, (flag) => page('Vault', `<h1>Vault</h1><div class="box">You found the hidden vault.<br><br>Flag: <span class="flag">${esc(flag)}</span></div>`));
});

// ---------- lab: cookie ----------
router.get('/cookie/', (req, res) => {
  const role = req.cookies && req.cookies.rq_lab_role;
  if (!role) res.cookie('rq_lab_role', 'guest', { path: '/lab/cookie', sameSite: 'lax' }); // intentionally not httpOnly
  if (role === 'admin') {
    return withFlag('cookie', req, res, (flag) => page('Admin area', `<h1>Admin area</h1><div class="box">Welcome back, administrator.<br><br>Flag: <span class="flag">${esc(flag)}</span></div>`));
  }
  res.send(page('Members area', `<h1>Members area</h1><div class="tag">Logged in as <code>${esc(role || 'guest')}</code></div>
    <div class="box">Hello, <b>${esc(role || 'guest')}</b>. Only administrators can see the flag. The site remembers who you are in your browser...</div>`));
});

// ---------- lab: sqli ----------
// Separate in-memory database: nothing here can touch the platform's data.
const labDb = new Database(':memory:');
labDb.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT)');
labDb.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('guest', 'guest123');
labDb.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('admin', crypto.randomBytes(12).toString('hex'));

function loginForm(message) {
  return page('Staff Login', `<h1>Staff Login</h1><div class="tag">Northwind Staff Portal</div>
    <form class="box" method="post" action="/lab/sqli/login">
      <label>Username<input name="username" autocomplete="off"></label>
      <label>Password<input name="password" type="password" autocomplete="off"></label>
      <button type="submit">Sign in</button>${message ? `<p class="err">${message}</p>` : ''}
    </form>
    <p class="tag">Hint for beginners: the guest account is <code>guest</code> / <code>guest123</code>.</p>`);
}

router.get('/sqli/', (_req, res) => res.send(loginForm('')));

router.post('/sqli/login', (req, res) => {
  const username = String((req.body && req.body.username) || '').slice(0, 200);
  const password = String((req.body && req.body.password) || '').slice(0, 200);
  // Tiny "WAF": the lab is injectable on purpose, but these SQLite features could freeze or
  // exhaust the shared server (infinite recursion, huge allocations), so they are refused.
  if (/recursive|randomblob|zeroblob|load_extension|attach|pragma/i.test(username + ' ' + password)) {
    return res.send(loginForm('Blocked by the web application firewall.'));
  }
  // VULNERABLE ON PURPOSE: string concatenation instead of a parameterised query.
  const sql =`SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
  let row;
  try {
    row = labDb.prepare(sql).get();
  } catch (e) {
    return res.send(loginForm(`Database error: ${esc(e.message)}`));
  }
  if (!row) return res.send(loginForm('Invalid username or password.'));
  if (row.username === 'admin') {
    return withFlag('sqli', req, res, (flag) => page('Admin', `<h1>Welcome, admin</h1><div class="box">Flag: <span class="flag">${esc(flag)}</span></div>`));
  }
  res.send(page('Welcome', `<h1>Welcome, ${esc(row.username)}</h1><div class="box">You are logged in as a regular user. There is nothing secret here - only <code>admin</code> sees the flag.</div>`));
});

// ---------- lab: strings ----------
router.get('/strings/', (_req, res) => {
  res.send(page('Evidence locker', `<h1>Evidence locker</h1><div class="tag">Case file #4471</div>
    <div class="box">Investigators recovered this file from a suspect's laptop. It does not open in any program, but something readable might be inside.<br><br>
    <a href="/lab/strings/evidence.bin" download>Download evidence.bin</a></div>`));
});

router.get('/strings/evidence.bin', (req, res) => {
  const id = labChallengeId('strings');
  if (!id) return res.status(404).send('Not available');
  const flag = dynamicFlag(req.user.id, id);
  const junk = () => crypto.randomBytes(1500 + Math.floor(Math.random() * 500));
  const buf = Buffer.concat([
    Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01]), // fake ELF-looking header
    junk(), Buffer.from('\0\0config_version=3\0\0'),
    junk(), Buffer.from('\0\0decoy: RQ{this_is_not_the_flag}\0\0'),
    junk(), Buffer.from(`\0\0${flag}\0\0`),
    junk(),
  ]);
  res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="evidence.bin"' });
  res.send(buf);
});

module.exports = router;
