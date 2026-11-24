const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./src/config');
const { loadUser, apiLimiter } = require('./src/auth');
const { seed } = require('./src/seed');

seed();

const app = express();
app.disable('x-powered-by');
// Behind a reverse proxy / load balancer, trust its X-Forwarded-* headers.
// TRUST_PROXY=1 for one hop (the usual case); also accepts "loopback" or an IP list.
if (config.TRUST_PROXY) {
  app.set('trust proxy', /^\d+$/.test(config.TRUST_PROXY) ? parseInt(config.TRUST_PROXY, 10) : config.TRUST_PROXY);
}
app.use(helmet({
  // HSTS / upgrade-insecure-requests only make sense behind HTTPS, so keep plain http://localhost usable.
  hsts: config.IS_PROD,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"], // labs use a small inline <style>
      'img-src': ["'self'", 'data:'],
      'upgrade-insecure-requests': config.IS_PROD ? [] : null,
    },
  },
}));
app.use(cookieParser());
app.use(loadUser);

// ---- API ----
app.use('/api', apiLimiter, express.json({ limit: '50kb' }));
// Reject non-JSON bodies on state-changing calls (extra CSRF defence on top of SameSite cookies).
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers['content-length'] !== '0' &&
      req.headers['content-length'] !== undefined && !req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json.' });
  }
  next();
});
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/challenges', require('./src/routes/challenges'));
app.use('/api/groups', require('./src/routes/groups'));
app.use('/api/timed', require('./src/routes/timed'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api', require('./src/routes/stats'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// ---- practice labs ----
app.use('/lab', require('./src/labs'));

// ---- frontend ----
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules/chart.js/dist/chart.umd.js')));
app.use(express.static(path.join(__dirname, 'public')));

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

if (require.main === module) {
  app.listen(config.PORT, () => console.log(`RootQuest running on http://localhost:${config.PORT}`));
}
module.exports = app;
