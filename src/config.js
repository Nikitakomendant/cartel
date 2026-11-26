'use strict';
/**
 * Central configuration. Everything sensitive comes from environment variables
 * (see .env.example). Nothing secret is stored in the repository.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Minimal .env loader (no extra dependency). Real env vars take precedence.
(function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'));
const PRIVATE_DIR = path.join(DATA_DIR, 'private');
for (const d of [DATA_DIR, UPLOAD_DIR, PRIVATE_DIR, path.join(PRIVATE_DIR, 'cv'), path.join(DATA_DIR, 'backups')]) {
  fs.mkdirSync(d, { recursive: true, mode: 0o750 });
}

const isProd = process.env.NODE_ENV === 'production';

// Secret used for signing form tokens. Generated once and persisted if not provided.
function loadSecret() {
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 32) return process.env.APP_SECRET;
  const f = path.join(DATA_DIR, '.secret');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}

let adminPath = (process.env.ADMIN_PATH || '/admin').trim();
if (!adminPath.startsWith('/')) adminPath = '/' + adminPath;
adminPath = adminPath.replace(/\/+$/, '') || '/admin';
const adminHost = (process.env.ADMIN_HOST || '').trim().toLowerCase();
const adminUrl = adminHost ? 'https://' + adminHost + adminPath : '';

module.exports = {
  ROOT,
  DATA_DIR,
  UPLOAD_DIR,
  PRIVATE_DIR,
  isProd,
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  secret: loadSecret(),
  adminPath,
  adminHost,
  adminUrl,
  trustProxy: process.env.TRUST_PROXY || (isProd ? '1' : 'loopback'),
  forceHttps: process.env.FORCE_HTTPS === '1',
  session: {
    idleMinutes: parseInt(process.env.SESSION_IDLE_MINUTES || '120', 10),
    absoluteHours: parseInt(process.env.SESSION_ABSOLUTE_HOURS || '12', 10),
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === '1',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'CARTEL <no-reply@cartel.ua>',
  },
  turnstileSecret: process.env.TURNSTILE_SECRET || '',
  peopleforce: {
    apiKey: process.env.PEOPLEFORCE_API_KEY || '',
    baseUrl: (process.env.PEOPLEFORCE_BASE_URL || 'https://app.peopleforce.io/api/public/v3').replace(/\/+$/, ''),
  },
  limits: {
    imageMb: parseInt(process.env.MAX_IMAGE_MB || '25', 10),
    videoMb: parseInt(process.env.MAX_VIDEO_MB || '200', 10),
    cvMb: parseInt(process.env.MAX_CV_MB || '10', 10),
  },
};
