'use strict';
const path = require('path');
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const config = require('./src/config');
const sec = require('./src/security');
const { db, getSetting } = require('./src/db');
const { env } = require('./src/render');
const schema = require('./src/schema');
const auth = require('./src/auth');

schema.setLanguages((getSetting('languages') || [{ code: 'uk' }, { code: 'en' }]).map((l) => l.code));

const app = express();
env.express(app);
app.set('view engine', 'njk');
app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? parseInt(config.trustProxy, 10) : config.trustProxy);
app.disable('x-powered-by');
app.set('etag', 'weak');

// ---------- real visitor IP behind Cloudflare / Cloudflare Tunnel ----------
// Without this every visitor looks like the proxy's IP, so rate limits and IP bans would hit everyone at once.
// Enable with BEHIND_CLOUDFLARE=1 ONLY when the app port is reachable solely through Cloudflare/nginx.
if (process.env.BEHIND_CLOUDFLARE === '1') {
  const net = require('net');
  app.use((req, res, next) => {
    const cf = String(req.get('cf-connecting-ip') || '').trim();
    if (cf && net.isIP(cf)) Object.defineProperty(req, 'ip', { value: cf, configurable: true });
    next();
  });
}

// ---------- first line of defence ----------
app.use(sec.scannerShield);
app.use(sec.requestTimeout(60_000));
if (config.forceHttps) {
  app.use((req, res, next) => (req.secure ? next() : res.redirect(301, `https://${req.get('host')}${req.originalUrl}`)));
}
// Reject unexpected Host headers in production (host header injection / cache poisoning)
if (config.isProd && process.env.ALLOWED_HOSTS) {
  const allowed = process.env.ALLOWED_HOSTS.split(',').map((h) => h.trim().toLowerCase());
  if (config.adminHost && !allowed.includes(config.adminHost)) allowed.push(config.adminHost);
  app.use((req, res, next) => (allowed.includes(String(req.hostname).toLowerCase()) ? next() : res.status(421).end()));
}
app.use(rateLimit({
  windowMs: 60e3, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false,
  skip: (req) => req.path.startsWith('/static/') || req.path.startsWith('/media/'),
  handler: (req, res) => { sec.strike(req.ip); res.status(429).type('text').send('Too many requests'); },
}));
app.use(compression());
app.use(sec.permissionsPolicy);

// ---------- static files ----------
const staticOpts = (maxAge) => ({
  maxAge, immutable: maxAge > 0, index: false, dotfiles: 'deny', redirect: false, fallthrough: true,
  setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cross-Origin-Resource-Policy', 'same-site'); },
});
app.use('/static', express.static(path.join(config.ROOT, 'public'), staticOpts(config.isProd ? '365d' : 0)));
app.use('/media', (req, res, next) => {
  // only the formats we produce ourselves can ever be served from uploads
  if (!/^\/\d{4}\/\d{2}\/[A-Za-z0-9]+(-\d+|-fb|-og)?\.(webp|jpg|png|mp4|webm)$/.test(req.path)) return res.status(404).end();
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  next();
}, express.static(config.UPLOAD_DIR, staticOpts('30d')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(config.ROOT, 'public/img/favicon-32.png'), { maxAge: '30d' }));
app.get('/apple-touch-icon.png', (req, res) => res.sendFile(path.join(config.ROOT, 'public/img/apple-touch-icon.png'), { maxAge: '30d' }));

// ---------- sessions & per-request nonce ----------
app.use(cookieParser());
app.use(auth.loadSession);
app.use(sec.nonceMiddleware);
app.get('/healthz', (req, res) => { db.prepare('SELECT 1').get(); res.type('text').send('ok'); });

// ---------- admin (CMS) ----------
// Optional: separate domain for staff (ADMIN_HOST=admin.example.com)
if (config.adminHost) {
  app.use((req, res, next) => {
    const onAdminHost = req.hostname.toLowerCase() === config.adminHost;
    const isAdminPath = req.path === config.adminPath || req.path.startsWith(config.adminPath + '/');
    if (onAdminHost && !isAdminPath && !req.path.startsWith('/static') && !req.path.startsWith('/uploads') && req.path !== '/healthz') return res.redirect(config.adminPath);
    if (!onAdminHost && isAdminPath) return res.status(404).send('Not found');
    next();
  });
}
app.use(config.adminPath, sec.helmetFor({ admin: true }), (req, res, next) => {
  res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); next();
}, require('./src/routes/admin'));

// ---------- public site ----------
app.use(sec.helmetFor());
app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 50 }));
app.use(express.json({ limit: '64kb' }));
app.use(require('./src/routes/public').router);

// ---------- errors ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', req.method, req.originalUrl, err.stack || err);
  if (res.headersSent) return;
  if (status === 413) return res.status(413).type('text').send('Payload too large');
  if (status === 400 || err.type === 'entity.parse.failed') return res.status(400).type('text').send('Bad request');
  res.status(status);
  try {
    res.render('pages/500.njk', { lang: 'uk', s: (k) => require('./src/render').uiString(k, 'uk'), nonce: res.locals.nonce, meta: { title: 'CARTEL', noindex: true } });
  } catch { res.type('text').send('Server error'); }
});

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

async function start() {
  // make sure the database has content on the very first start
  await require('./src/seed').ensureSeed();
  schema.setLanguages((getSetting('languages') || []).map((l) => l.code));
  const server = app.listen(config.port, config.host, () => {
    console.log(`CARTEL site → ${config.baseUrl}  (CMS: ${config.baseUrl}${config.adminPath})`);
  });
  // Built-in daily backup (no cron needed). Disable with AUTO_BACKUP=0. Copies live in data/backups (last 14 kept).
  if (process.env.AUTO_BACKUP !== '0') {
    const { execFile } = require('child_process');
    const runBackup = () => execFile(process.execPath, ['--no-warnings', require('path').join(__dirname, 'scripts', 'backup.js')], { timeout: 120_000 },
      (err, out) => console.log(err ? '[backup] failed: ' + err.message : '[backup] ' + String(out).trim()));
    setTimeout(runBackup, 60_000).unref();
    setInterval(runBackup, 24 * 3600e3).unref();
  }
  server.headersTimeout = 20_000;
  server.requestTimeout = 120_000;
  server.keepAliveTimeout = 10_000;
  const shutdown = () => { server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 5000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}
if (require.main === module) start().catch((e) => { console.error(e); process.exit(1); });

module.exports = { app, start };
