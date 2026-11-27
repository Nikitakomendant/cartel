'use strict';
/**
 * Staff authentication: server-side sessions (only a SHA-256 of the cookie token
 * is stored), idle + absolute expiry, account lockout, optional TOTP 2FA,
 * role-based permissions and per-session CSRF tokens.
 */
const { db, now, audit } = require('./db');
const sec = require('./security');
const config = require('./config');

const COOKIE = config.isProd ? '__Host-cartel_sid' : 'cartel_sid';
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

/** What each role may do. Keep in one place so the UI and the server agree. */
const PERMS = {
  admin: ['*'],
  marketing: ['content', 'media', 'contacts', 'submissions', 'strings', 'seo', 'redirects', 'preview'],
  hr: ['vacancies', 'applications', 'hr_contacts', 'preview'],
};
const ROLE_LABELS = { admin: 'Адміністратор', marketing: 'Маркетинг', hr: 'HR' };
function can(user, perm) {
  if (!user) return false;
  const list = PERMS[user.role] || [];
  return list.includes('*') || list.includes(perm);
}

function cookieOpts(maxAgeMs) {
  return { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/', ...(maxAgeMs ? { maxAge: maxAgeMs } : {}) };
}

function createSession(res, req, userId, stage = 'full') {
  const token = sec.randomToken(32);
  const t = now();
  db.prepare('INSERT INTO sessions(id_hash, user_id, csrf, stage, created_at, last_seen, ip, ua) VALUES (?,?,?,?,?,?,?,?)')
    .run(sec.sha256(token), userId, sec.randomToken(24), stage, t, t, req.ip, String(req.get('user-agent') || '').slice(0, 200));
  res.cookie(COOKIE, token, cookieOpts(config.session.absoluteHours * 3600e3));
}
function destroySession(req, res) {
  const token = req.cookies?.[COOKIE];
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE id_hash=?').run(sec.sha256(token));
  res.clearCookie(COOKIE, cookieOpts());
}
function destroyAllSessions(userId) { db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId); }

/** Attaches req.user / req.session when a valid staff session cookie is present. */
function loadSession(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token || token.length > 100) return next();
  const s = db.prepare(`SELECT s.*, u.email, u.name, u.role, u.active, u.must_change_pw, u.totp_enabled
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash=?`).get(sec.sha256(token));
  const t = now();
  if (!s || !s.active || t - s.last_seen > config.session.idleMinutes * 60e3 || t - s.created_at > config.session.absoluteHours * 3600e3) {
    if (s) db.prepare('DELETE FROM sessions WHERE id_hash=?').run(s.id_hash);
    res.clearCookie(COOKIE, cookieOpts());
    return next();
  }
  if (t - s.last_seen > 60e3) db.prepare('UPDATE sessions SET last_seen=? WHERE id_hash=?').run(t, s.id_hash);
  req.session = s;
  if (s.stage === 'full') req.user = { id: s.user_id, email: s.email, name: s.name, role: s.role, must_change_pw: !!s.must_change_pw, totp_enabled: !!s.totp_enabled };
  next();
}

/** Returns {user} | {error} | {need2fa:true} */
function attemptLogin(email, password, ip) {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').trim());
  if (!u) { sec.verifyPassword(password, sec.DUMMY_HASH); return { error: 'Невірний email або пароль.' }; }
  if (!u.active) { sec.verifyPassword(password, sec.DUMMY_HASH); return { error: 'Невірний email або пароль.' }; }
  if (u.locked_until && u.locked_until > now()) {
    return { error: `Забагато невдалих спроб. Спробуйте через ${Math.ceil((u.locked_until - now()) / 60e3)} хв.` };
  }
  if (!sec.verifyPassword(password, u.pass_hash)) {
    const fails = u.failed_count + 1;
    const lock = fails >= MAX_FAILS ? now() + LOCK_MINUTES * 60e3 : null;
    db.prepare('UPDATE users SET failed_count=?, locked_until=? WHERE id=?').run(lock ? 0 : fails, lock, u.id);
    audit(u.id, 'login_failed', lock ? 'account locked' : `attempt ${fails}`, ip);
    return { error: lock ? `Забагато невдалих спроб. Обліковий запис заблоковано на ${LOCK_MINUTES} хв.` : 'Невірний email або пароль.' };
  }
  db.prepare('UPDATE users SET failed_count=0, locked_until=NULL WHERE id=?').run(u.id);
  return { user: u, need2fa: !!u.totp_enabled };
}
function completeLogin(userId, ip) {
  db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(now(), userId);
  audit(userId, 'login', null, ip);
}

// ---------------- middleware ----------------
function requireUser(req, res, next) {
  if (req.user) return next();
  if (req.xhr || req.get('accept')?.includes('application/json')) return res.status(401).json({ error: 'Сесія завершилась. Увійдіть знову.' });
  const nextUrl = encodeURIComponent(req.originalUrl.startsWith(config.adminPath) ? req.originalUrl : config.adminPath);
  res.redirect(`${config.adminPath}/login?next=${nextUrl}`);
}
function requirePerm(perm) {
  return (req, res, next) => {
    if (can(req.user, perm)) return next();
    res.status(403);
    if (req.get('accept')?.includes('application/json')) return res.json({ error: 'Недостатньо прав.' });
    res.render('admin/error.njk', { title: 'Немає доступу', message: 'Ваша роль не має доступу до цього розділу.' });
  };
}

/** CSRF: token is bound to the session; required for every non-GET admin request. */
function csrf(req, res, next) {
  res.locals.csrf = req.session?.csrf || '';
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.get('x-csrf-token') || req.body?._csrf;
  if (!req.session || !sec.safeEqual(token, req.session.csrf) || !sec.sameOrigin(req)) {
    sec.strike(req.ip);
    return res.status(403).type('text').send('Запит відхилено (CSRF). Оновіть сторінку та спробуйте ще раз.');
  }
  next();
}

module.exports = {
  COOKIE, PERMS, ROLE_LABELS, can, createSession, destroySession, destroyAllSessions, loadSession,
  attemptLogin, completeLogin, requireUser, requirePerm, csrf,
};
