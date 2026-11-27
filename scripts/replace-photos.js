'use strict';
/**
 * Replace the photos on an already running site with the set from seed-assets/photos.json.
 *   node scripts/replace-photos.js          (Docker: docker compose exec cartel node scripts/replace-photos.js)
 * Makes a database backup first; every change is also in the CMS history and can be restored there.
 */
const path = require('path');
const config = require('../src/config');
const { db } = require('../src/db');
const { applyPhotos } = require('../src/photos');

(async () => {
  const backup = path.join(config.DATA_DIR, 'backups', `before-photos-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  await db.backup(backup);
  console.log('backup:', backup);
  const r = await applyPhotos({ log: (m) => console.log(' ', m) });
  console.log(`done: ${r.photos} photos imported`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
