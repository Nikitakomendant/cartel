'use strict';
/**
 * Media handling.
 *  Images are re-encoded by sharp (this strips EXIF/GPS data and any payload
 *  hidden in the file) into responsive WebP sizes + a JPEG for social previews.
 *  Videos are accepted only as real MP4/WebM (checked by file signature).
 *  Candidate CVs live in a private folder outside the web root.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { db, now, j, p } = require('./db');
const { UPLOAD_DIR, PRIVATE_DIR } = require('./config');
const sec = require('./security');

sharp.cache(false);
sharp.concurrency(2);

const WIDTHS = [480, 960, 1600, 2400];

function newName() {
  const d = new Date();
  const dir = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  fs.mkdirSync(path.join(UPLOAD_DIR, dir), { recursive: true });
  return { dir, base: sec.randomToken(12).replace(/[-_]/g, 'x') };
}

async function saveImage(buf, originalName, userId) {
  const sig = sec.sniff(buf);
  if (!sig || sig.kind !== 'image') throw new Error('Підтримуються лише JPG, PNG, WebP або AVIF.');
  const img = sharp(buf, { failOn: 'error', limitInputPixels: 80e6 }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error('Не вдалося прочитати зображення.');
  const { dir, base } = newName();
  const variants = {};
  const alpha = !!meta.hasAlpha;
  for (const w of WIDTHS) {
    if (w > meta.width && w !== WIDTHS[0]) continue;
    const file = `${dir}/${base}-${w}.webp`;
    await sharp(buf).rotate().resize({ width: Math.min(w, meta.width), withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 }).toFile(path.join(UPLOAD_DIR, file));
    variants[w] = file;
  }
  // social preview / fallback (JPEG or PNG for transparent logos)
  const fbFile = `${dir}/${base}-fb.${alpha ? 'png' : 'jpg'}`;
  const fb = sharp(buf).rotate().resize({ width: Math.min(1600, meta.width), withoutEnlargement: true });
  await (alpha ? fb.png({ compressionLevel: 9 }) : fb.jpeg({ quality: 82, mozjpeg: true })).toFile(path.join(UPLOAD_DIR, fbFile));
  variants.fallback = fbFile;
  const ogFile = `${dir}/${base}-og.jpg`;
  await sharp(buf).rotate().resize(1200, 630, { fit: 'cover', position: 'attention' }).flatten({ background: '#ffffff' })
    .jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(UPLOAD_DIR, ogFile));
  variants.og = ogFile;
  // tiny blurred placeholder (inline base64, ~300 bytes)
  const lqip = await sharp(buf).rotate().resize(24).webp({ quality: 40 }).toBuffer();
  variants.lqip = `data:image/webp;base64,${lqip.toString('base64')}`;
  const w = meta.orientation >= 5 ? meta.height : meta.width;
  const h = meta.orientation >= 5 ? meta.width : meta.height;
  const info = db.prepare(`INSERT INTO media(kind, file, original_name, mime, size, width, height, variants, alt, created_at, uploaded_by)
    VALUES ('image',?,?,?,?,?,?,?,?,?,?)`).run(fbFile, sec.cleanLine(originalName, 200), sig.mime, buf.length, w, h, j(variants), j({ uk: '', en: '' }), now(), userId);
  return info.lastInsertRowid;
}

async function saveVideo(buf, originalName, userId) {
  const sig = sec.sniff(buf);
  if (!sig || sig.kind !== 'video') throw new Error('Підтримуються лише відео MP4 або WebM.');
  const { dir, base } = newName();
  const file = `${dir}/${base}.${sig.ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  const info = db.prepare(`INSERT INTO media(kind, file, original_name, mime, size, variants, alt, created_at, uploaded_by)
    VALUES ('video',?,?,?,?,?,?,?,?)`).run(file, sec.cleanLine(originalName, 200), sig.mime, buf.length, j({}), j({ uk: '', en: '' }), now(), userId);
  return info.lastInsertRowid;
}

function getMedia(id) {
  if (!id) return null;
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(id);
  if (!m) return null;
  return { ...m, variants: p(m.variants) || {}, alt: p(m.alt) || {} };
}
const cache = new Map();
function mediaCached(id) {
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  const m = getMedia(id);
  if (cache.size > 5000) cache.clear();
  cache.set(id, m);
  return m;
}
function invalidate(id) { cache.delete(Number(id)); }

function removeMedia(id) {
  const m = getMedia(id);
  if (!m) return;
  const files = new Set([m.file, ...Object.entries(m.variants).filter(([k]) => k !== 'lqip').map(([, v]) => v)]);
  for (const f of files) {
    const full = path.join(UPLOAD_DIR, f);
    if (full.startsWith(UPLOAD_DIR + path.sep)) fs.rm(full, { force: true }, () => {});
  }
  db.prepare('DELETE FROM media WHERE id=?').run(id);
  invalidate(id);
}

// ---------- CVs (private) ----------
const CV_TYPES = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', jpg: 'image/jpeg', png: 'image/png' };
function checkCv(buf) {
  const sig = sec.sniff(buf);
  if (!sig) return null;
  if (sig.ext === 'zip') return sec.isDocx(buf) ? { ext: 'docx', mime: CV_TYPES.docx } : null;
  if (['pdf', 'doc', 'jpg', 'png'].includes(sig.ext)) return { ext: sig.ext, mime: CV_TYPES[sig.ext] };
  return null;
}
function saveCv(buf, type) {
  const name = `${sec.randomToken(18)}.${type.ext}`;
  fs.writeFileSync(path.join(PRIVATE_DIR, 'cv', name), buf, { mode: 0o640 });
  return name;
}
function cvPath(name) {
  if (!/^[A-Za-z0-9_-]+\.(pdf|docx?|jpg|png)$/.test(String(name || ''))) return null;
  return path.join(PRIVATE_DIR, 'cv', name);
}

module.exports = { saveImage, saveVideo, getMedia, mediaCached, invalidate, removeMedia, checkCv, saveCv, cvPath, WIDTHS };
