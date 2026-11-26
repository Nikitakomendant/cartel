'use strict';
/** Emergency access: node scripts/create-admin.js email@cartel.ua "Імʼя" — prints a temporary password. */
const crypto = require('crypto');
const { db, now } = require('../src/db');
const sec = require('../src/security');
const [email, name = 'Адміністратор'] = process.argv.slice(2);
if (!sec.isEmail(email)) { console.error('Usage: node scripts/create-admin.js email@domain "Name"'); process.exit(1); }
const pw = crypto.randomBytes(12).toString('base64url') + '7a';
const ex = db.prepare('SELECT id FROM users WHERE email=?').get(email);
if (ex) db.prepare("UPDATE users SET pass_hash=?, role='admin', active=1, must_change_pw=1, failed_count=0, locked_until=NULL WHERE id=?").run(sec.hashPassword(pw), ex.id);
else db.prepare("INSERT INTO users(email, name, role, pass_hash, must_change_pw, created_at) VALUES (?,?, 'admin', ?, 1, ?)").run(email, name, sec.hashPassword(pw), now());
console.log(`Admin ${email}\nTemporary password: ${pw}\n(must be changed on first login)`);
