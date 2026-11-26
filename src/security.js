'use strict';
/**
 * Security primitives used across the app:
 *  - password hashing (scrypt, built into Node — no native deps)
 *  - TOTP two-factor codes (RFC 6238)
 *  - signed anti-spam form tokens with replay protection
 *  - HTML sanitising for rich text, URL allow-listing
 *  - file signature (magic bytes) checks for uploads
 *  - HTTP hardening middleware: CSP with per-request nonce, scanner blocking,
 *    temporary IP bans, request timeouts
 */
const crypto = require('crypto');
const sanitizeHtml = require('sanitize-html');
const helmet = require('helmet');
const config = require('./config');

// ---------------- passwords ----------------
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw).normalize('NFKC'), salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [alg, n, saltB64, keyB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const key = Buffer.from(keyB64, 'base64');
    const test = crypto.scryptSync(String(pw).normalize('NFKC'), Buffer.from(saltB64, 'base64'), key.length, { ...SCRYPT, N: parseInt(n, 10) });
    return crypto.timingSafeEqual(key, test);
  } catch { return false; }
}
// Burn comparable CPU time when the user does not exist (prevents user enumeration by timing).
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));
function passwordProblems(pw) {
  const s = String(pw || '');
  if (s.length < 10) return 'Пароль має містити щонайменше 10 символів.';
  if (s.length > 200) return 'Пароль задовгий.';
  if (!/[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(s) || !/\d/.test(s)) return 'Пароль має містити літери та цифри.';
  const common = ['password1', 'qwerty1234', '1234567890', 'cartel2024', 'cartel2025', 'cartel2026', 'admin12345'];
  if (common.includes(s.toLowerCase())) return 'Цей пароль занадто простий.';
  return null;
}

// ---------------- TOTP (2FA) ----------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0; const out = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totpCode(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, '0');
  return code;
}
function newTotpSecret() { return base32Encode(crypto.randomBytes(20)); }
function verifyTotp(secret, code) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const step = Math.floor(Date.now() / 30000);
  for (const d of [-1, 0, 1]) {
    if (crypto.timingSafeEqual(Buffer.from(totpCode(secret, step + d)), Buffer.from(c))) return true;
  }
  return false;
}

// ---------------- tokens ----------------
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const hmac = (s) => crypto.createHmac('sha256', config.secret).update(String(s)).digest('base64url');
const ipHash = (ip) => hmac('ip:' + ip).slice(0, 24); // store pseudonymised IPs only
function safeEqual(a, b) {
  const A = Buffer.from(String(a || '')), B = Buffer.from(String(b || ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

/** Public forms: signed token "ts.nonce.sig". Must be ≥ 3 s old (bots submit instantly) and ≤ 6 h. */
const usedNonces = new Map();
function issueFormToken(form) {
  const ts = Date.now().toString(36);
  const nonce = randomToken(9);
  return `${ts}.${nonce}.${hmac(`${form}|${ts}|${nonce}`)}`;
}
function checkFormToken(form, token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return 'invalid';
  const [ts, nonce, sig] = parts;
  if (!safeEqual(sig, hmac(`${form}|${ts}|${nonce}`))) return 'invalid';
  const age = Date.now() - parseInt(ts, 36);
  if (!(age >= 3000)) return 'too_fast';
  if (age > 6 * 3600 * 1000) return 'expired';
  if (usedNonces.has(nonce)) return 'replay';
  return null;
}
/** Mark a token as used — called only after a submission was accepted, so fixing a typo doesn't expire the form. */
function consumeFormToken(token) {
  const nonce = String(token || '').split('.')[1];
  if (!nonce) return;
  usedNonces.set(nonce, Date.now());
  if (usedNonces.size > 20000) { // prune
    const cutoff = Date.now() - 6 * 3600 * 1000;
    for (const [k, v] of usedNonces) if (v < cutoff) usedNonces.delete(k);
  }
}

// ---------------- sanitising ----------------
const RICH_OPTS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'h3', 'h4', 'blockquote'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  transformTags: {
    b: 'strong', i: 'em', h1: 'h3', h2: 'h3', div: 'p',
    a: (tag, attribs) => {
      const ext = /^https?:/i.test(attribs.href || '');
      return { tagName: 'a', attribs: { href: attribs.href || '#', ...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {}) } };
    },
  },
  exclusiveFilter: (frame) => frame.tag === 'p' && !frame.text.trim() && !frame.mediaChildren?.length,
};
const sanitizeRich = (html) => sanitizeHtml(String(html || ''), RICH_OPTS).trim();
const stripTags = (s) => sanitizeHtml(String(s ?? ''), { allowedTags: [], allowedAttributes: {} });

/** Plain text field: remove control chars, trim, cap length. */
function cleanText(s, max = 2000) {
  return String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
/** Single line (no CR/LF — protects e-mail headers). */
const cleanLine = (s, max = 300) => cleanText(s, max).replace(/[\r\n]+/g, ' ');

/** Allow only safe URL schemes. Returns '' for anything suspicious (javascript:, data:, etc.). */
function safeUrl(u) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (/^(https?:\/\/|mailto:|tel:|viber:|tg:)/i.test(s)) {
    if (/[\s<>"'`]/.test(s.replace(/^mailto:[^?]*\?/, ''))) return encodeURI(decodeURI(s)).replace(/["'<>`]/g, '');
    return s;
  }
  if (/[\s<>"'`\\]/.test(s.split('#')[0])) return ''; // no markup or quotes inside relative links
  if (s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\')) return s;
  if (s.startsWith('#') || s.startsWith('?')) return s;
  if (/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return 'https://' + s; // "site.com" → https://site.com
  return '';
}
const isEmail = (s) => /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,190}\.[A-Za-z]{2,}$/.test(String(s || ''));
const isPhone = (s) => /^[+()\d\s-]{7,22}$/.test(String(s || '')) && String(s).replace(/\D/g, '').length >= 9;
const telHref = (s) => 'tel:' + String(s || '').replace(/[^\d+]/g, '');

// ---------------- upload signatures ----------------
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  const hex = buf.subarray(0, 12).toString('hex');
  if (hex.startsWith('ffd8ff')) return { ext: 'jpg', mime: 'image/jpeg', kind: 'image' };
  if (hex.startsWith('89504e470d0a1a0a')) return { ext: 'png', mime: 'image/png', kind: 'image' };
  if (hex.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp', kind: 'image' };
  if (buf.subarray(4, 12).toString().match(/^ftyp(avif|avis)/)) return { ext: 'avif', mime: 'image/avif', kind: 'image' };
  if (buf.subarray(4, 8).toString() === 'ftyp') return { ext: 'mp4', mime: 'video/mp4', kind: 'video' };
  if (hex.startsWith('1a45dfa3')) return { ext: 'webm', mime: 'video/webm', kind: 'video' };
  if (buf.subarray(0, 5).toString() === '%PDF-') return { ext: 'pdf', mime: 'application/pdf', kind: 'doc' };
  if (hex.startsWith('d0cf11e0a1b11ae1')) return { ext: 'doc', mime: 'application/msword', kind: 'doc' };
  if (hex.startsWith('504b0304')) return { ext: 'zip', mime: 'application/zip', kind: 'zip' };
  return null;
}
/** DOCX is a ZIP that contains word/document.xml */
function isDocx(buf) {
  return buf.subarray(0, 4).toString('hex') === '504b0304' && buf.includes(Buffer.from('word/'));
}

// ---------------- HTTP hardening ----------------
function nonceMiddleware(req, res, next) {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
}

function helmetFor({ admin = false } = {}) {
  const thirdPartyScripts = admin ? [] : ['https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://challenges.cloudflare.com'];
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`, ...(admin ? [] : ["'strict-dynamic'"]), ...thirdPartyScripts],
        'style-src': ["'self'", "'unsafe-inline'"],
        // public: any https image host (map tiles, analytics pixels); admin: own files + map tiles only
        'img-src': admin ? ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'] : ["'self'", 'data:', 'blob:', 'https:'],
        'font-src': ["'self'"],
        'media-src': ["'self'", 'blob:'],
        'connect-src': ["'self'", ...(admin ? [] : ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com', 'https://www.facebook.com', 'https://connect.facebook.net', 'https://challenges.cloudflare.com'])],
        'frame-src': admin ? ["'self'"] : ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com', 'https://www.googletagmanager.com', 'https://challenges.cloudflare.com'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': admin ? ["'self'"] : ["'none'"],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
        ...(config.isProd ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: config.isProd ? { maxAge: 63072000, includeSubDomains: true, preload: false } : false,
    frameguard: { action: admin ? 'sameorigin' : 'deny' },
    xPoweredBy: false,
  });
}
function permissionsPolicy(req, res, next) {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  next();
}

// Scanners & exploit probes: answer fast with 404 and temporarily ban repeat offenders.
const PROBE_RE = /(\/wp-(admin|login|content|includes|json)|xmlrpc\.php|\/\.env|\/\.git|\/\.svn|\/\.hg|\/\.DS_Store|phpmyadmin|\/pma\b|\.php\d?$|\.asp(x)?$|\.jsp$|\/cgi-bin|\/vendor\/phpunit|\/\.aws|\/\.ssh|\/etc\/passwd|\/actuator|\/server-status|\/boaform|\/HNAP1|\.\.\/|%2e%2e|\/shell|\/config\.json$|\/backup\.(zip|sql|tar))/i;
const strikes = new Map(); // ip -> {n, until}
function isBanned(ip) {
  const s = strikes.get(ip);
  return !!(s && s.until && s.until > Date.now());
}
function strike(ip, weight = 1) {
  const s = strikes.get(ip) || { n: 0, until: 0, first: Date.now() };
  if (Date.now() - s.first > 3600e3) { s.n = 0; s.first = Date.now(); }
  s.n += weight;
  if (s.n >= 12) s.until = Date.now() + 3600e3; // 1-hour ban
  strikes.set(ip, s);
  if (strikes.size > 50000) strikes.clear();
}
function scannerShield(req, res, next) {
  const ip = req.ip;
  if (isBanned(ip)) { res.status(429).set('Retry-After', '3600').type('text').send('Too many requests'); return; }
  let url = req.originalUrl || '';
  try { url = decodeURIComponent(url); } catch { strike(ip); return res.status(400).end(); }
  if (PROBE_RE.test(url) || url.includes('\0')) {
    strike(ip, 2);
    return res.status(404).type('text').send('Not found');
  }
  if (url.length > 2048) return res.status(414).end();
  next();
}

function requestTimeout(ms) {
  return (req, res, next) => {
    req.setTimeout(ms);
    res.setTimeout(ms, () => { if (!res.headersSent) res.status(503).type('text').send('Timeout'); });
    next();
  };
}

/** Same-origin check for state-changing requests (defence in depth on top of CSRF tokens). */
function sameOrigin(req) {
  const origin = req.get('origin') || req.get('referer');
  if (!origin) return true; // some privacy browsers strip both; CSRF token still required
  try {
    const o = new URL(origin);
    return o.host === req.get('host');
  } catch { return false; }
}

module.exports = {
  hashPassword, verifyPassword, DUMMY_HASH, passwordProblems,
  newTotpSecret, verifyTotp, totpCode,
  randomToken, sha256, hmac, ipHash, safeEqual,
  issueFormToken, checkFormToken, consumeFormToken,
  sanitizeRich, stripTags, cleanText, cleanLine, safeUrl, isEmail, isPhone, telHref,
  sniff, isDocx,
  nonceMiddleware, helmetFor, permissionsPolicy, scannerShield, strike, requestTimeout, sameOrigin,
};
