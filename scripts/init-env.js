'use strict';
/**
 * Creates a production .env with a random APP_SECRET.
 *   node scripts/init-env.js cartel.ua [admin.cartel.ua]
 * Existing .env is never overwritten.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [domain, adminHost] = process.argv.slice(2);
if (!domain) { console.error('Використання: node scripts/init-env.js cartel.ua [admin.cartel.ua]'); process.exit(1); }
const file = path.join(__dirname, '..', '.env');
if (fs.existsSync(file)) { console.error('.env вже існує — нічого не змінено.'); process.exit(1); }
const hosts = [domain, 'www.' + domain, adminHost].filter(Boolean).join(',');
const lines = [
  'NODE_ENV=production', 'PORT=3000', `BASE_URL=https://${domain}`, `ALLOWED_HOSTS=${hosts}`,
  'ADMIN_PATH=/admin', 'TRUST_PROXY=1', 'BEHIND_CLOUDFLARE=1', 'AUTO_BACKUP=1',
  `APP_SECRET=${crypto.randomBytes(32).toString('hex')}`,
];
if (adminHost) lines.push(`ADMIN_HOST=${adminHost}`);
fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
console.log('.env створено. Перевірте BASE_URL і ALLOWED_HOSTS, далі: npm start');
