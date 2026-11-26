'use strict';
/**
 * Online backup of the database + archive of uploads and CVs.
 * Run daily from cron:  0 4 * * *  cd /srv/cartel && node scripts/backup.js
 * Keeps the last 14 copies. Copy data/backups to another server/cloud as well.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../src/config');
const { db } = require('../src/db');

(async () => {
  const dir = path.join(config.DATA_DIR, 'backups');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dbFile = path.join(dir, `cartel-${stamp}.db`);
  await db.backup(dbFile);
  const tarFile = path.join(dir, `files-${stamp}.tar.gz`);
  try {
    execFileSync('tar', ['-czf', tarFile, '-C', path.dirname(config.UPLOAD_DIR), path.basename(config.UPLOAD_DIR), '-C', config.DATA_DIR, 'private']);
  } catch (e) { console.error('tar failed:', e.message); }
  const keep = (re) => fs.readdirSync(dir).filter((f) => re.test(f)).sort().reverse().slice(14).forEach((f) => fs.rmSync(path.join(dir, f)));
  keep(/^cartel-.*\.db$/); keep(/^files-.*\.tar\.gz$/);
  console.log('backup ok:', dbFile);
  process.exit(0);
})();
