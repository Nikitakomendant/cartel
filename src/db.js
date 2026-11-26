'use strict';
/**
 * SQLite storage (WAL mode). All queries use prepared statements — no string
 * concatenation of user input into SQL anywhere in the project.
 *
 * Content model: one generic `entries` table holds every editable content type
 * (pages, brands, investment projects, team, quotes, events, vacancies, stories).
 *   data  — current draft (what editors see in the CMS)
 *   live  — published snapshot (what visitors see)
 * Every save/publish/restore writes a row to `revisions` for full history.
 */
const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('./config');

const db = new Database(process.env.DB_FILE || path.join(DATA_DIR, 'cartel.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','marketing','hr')),
  pass_hash TEXT NOT NULL,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_pw INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'full',
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  ip TEXT, ua TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER,
  updated_by INTEGER
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  slug TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  system INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  live TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by INTEGER,
  published_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS entries_type_slug ON entries(type, slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS entries_type_status ON entries(type, status, sort);
CREATE TABLE IF NOT EXISTS revisions (
  id INTEGER PRIMARY KEY,
  entity TEXT NOT NULL,
  ref TEXT NOT NULL,
  action TEXT NOT NULL,
  data TEXT NOT NULL,
  user_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS revisions_ref ON revisions(entity, ref, created_at DESC);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  file TEXT NOT NULL,
  original_name TEXT,
  mime TEXT, size INTEGER, width INTEGER, height INTEGER,
  variants TEXT,
  alt TEXT,
  folder TEXT,
  created_at INTEGER NOT NULL,
  uploaded_by INTEGER
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY,
  vacancy_id INTEGER,
  vacancy_title TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  message TEXT,
  cv_file TEXT, cv_name TEXT, cv_mime TEXT, cv_size INTEGER,
  consent_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  lang TEXT,
  ip_hash TEXT,
  email_status TEXT,
  pf_status TEXT, pf_error TEXT,
  created_at INTEGER NOT NULL,
  viewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS applications_created ON applications(created_at DESC);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  form TEXT NOT NULL,
  data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  lang TEXT,
  ip_hash TEXT,
  email_status TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS redirects (
  id INTEGER PRIMARY KEY,
  from_path TEXT NOT NULL UNIQUE,
  to_path TEXT NOT NULL,
  code INTEGER NOT NULL DEFAULT 301,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created ON audit(created_at DESC);
`);

const now = () => Date.now();
const j = (v) => JSON.stringify(v ?? null);
const p = (s) => { try { return s == null ? null : JSON.parse(s); } catch { return null; } };

// ---------- settings ----------
const settingsCache = new Map();
function getSetting(key, fallback = null) {
  if (settingsCache.has(key)) return settingsCache.get(key);
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  const v = row ? p(row.value) : fallback;
  settingsCache.set(key, v);
  return v;
}
function setSetting(key, value, userId = null, { revision = true } = {}) {
  db.prepare(`INSERT INTO settings(key, value, updated_at, updated_by) VALUES (?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
    .run(key, j(value), now(), userId);
  settingsCache.delete(key);
  if (revision) addRevision('settings', key, 'save', value, userId);
}

// ---------- revisions ----------
const MAX_REVISIONS = 60;
function addRevision(entity, ref, action, data, userId) {
  db.prepare('INSERT INTO revisions(entity, ref, action, data, user_id, created_at) VALUES (?,?,?,?,?,?)')
    .run(entity, String(ref), action, j(data), userId, now());
  // keep the history bounded
  db.prepare(`DELETE FROM revisions WHERE entity=? AND ref=? AND id NOT IN
    (SELECT id FROM revisions WHERE entity=? AND ref=? ORDER BY id DESC LIMIT ?)`)
    .run(entity, String(ref), entity, String(ref), MAX_REVISIONS);
}
function listRevisions(entity, ref) {
  return db.prepare(`SELECT r.id, r.action, r.created_at, u.name AS user_name FROM revisions r
    LEFT JOIN users u ON u.id = r.user_id WHERE entity=? AND ref=? ORDER BY r.id DESC`).all(entity, String(ref));
}
function getRevision(id) {
  const r = db.prepare('SELECT * FROM revisions WHERE id=?').get(id);
  if (r) r.data = p(r.data);
  return r;
}

// ---------- entries ----------
function hydrate(row) {
  if (!row) return null;
  return { ...row, data: p(row.data) || {}, live: p(row.live), dirty: row.live !== row.data };
}
const entries = {
  get(id) { return hydrate(db.prepare('SELECT * FROM entries WHERE id=?').get(id)); },
  bySlug(type, slug) { return hydrate(db.prepare('SELECT * FROM entries WHERE type=? AND slug=?').get(type, slug)); },
  list(type, { statuses = null } = {}) {
    let rows;
    if (statuses) {
      const qs = statuses.map(() => '?').join(',');
      rows = db.prepare(`SELECT * FROM entries WHERE type=? AND status IN (${qs}) ORDER BY sort, id`).all(type, ...statuses);
    } else rows = db.prepare('SELECT * FROM entries WHERE type=? ORDER BY sort, id').all(type);
    return rows.map(hydrate);
  },
  /** Public view: only published, using the live snapshot (or draft in preview mode). */
  published(type, { preview = false } = {}) {
    const rows = preview
      ? db.prepare(`SELECT * FROM entries WHERE type=? AND status IN ('published','draft') ORDER BY sort, id`).all(type)
      : db.prepare(`SELECT * FROM entries WHERE type=? AND status='published' AND live IS NOT NULL ORDER BY sort, id`).all(type);
    return rows.map(hydrate).map((e) => ({ id: e.id, slug: e.slug, sort: e.sort, ...(preview ? e.data : e.live) }));
  },
  publicOne(type, slug, { preview = false } = {}) {
    const e = this.bySlug(type, slug);
    if (!e) return null;
    if (preview && e.status !== 'archived') return { id: e.id, slug: e.slug, ...e.data };
    if (e.status !== 'published' || !e.live) return null;
    return { id: e.id, slug: e.slug, ...e.live };
  },
  create(type, { slug = null, data = {}, status = 'draft', system = 0, sort = null, publish = false }, userId = null) {
    const t = now();
    if (sort === null) sort = (db.prepare('SELECT COALESCE(MAX(sort),0)+10 AS s FROM entries WHERE type=?').get(type).s);
    const info = db.prepare(`INSERT INTO entries(type, slug, sort, status, system, data, live, created_at, updated_at, updated_by, published_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(type, slug, sort, publish ? 'published' : status, system, j(data), publish ? j(data) : null, t, t, userId, publish ? t : null);
    addRevision('entry', info.lastInsertRowid, publish ? 'publish' : 'create', data, userId);
    return info.lastInsertRowid;
  },
  saveDraft(id, { data, slug }, userId) {
    const cur = this.get(id);
    if (!cur) throw new Error('not found');
    db.prepare('UPDATE entries SET data=?, slug=COALESCE(?, slug), updated_at=?, updated_by=? WHERE id=?')
      .run(j(data), cur.system ? null : slug, now(), userId, id);
    addRevision('entry', id, 'save', data, userId);
  },
  publish(id, userId) {
    const cur = this.get(id);
    db.prepare(`UPDATE entries SET live=data, status='published', published_at=?, updated_by=? WHERE id=?`).run(now(), userId, id);
    addRevision('entry', id, 'publish', cur.data, userId);
  },
  setStatus(id, status, userId) {
    db.prepare('UPDATE entries SET status=?, updated_at=?, updated_by=? WHERE id=?').run(status, now(), userId, id);
  },
  discardDraft(id, userId) {
    const cur = this.get(id);
    if (!cur || !cur.live) return;
    db.prepare('UPDATE entries SET data=live, updated_at=?, updated_by=? WHERE id=?').run(now(), userId, id);
    addRevision('entry', id, 'discard', cur.live, userId);
  },
  remove(id) { db.prepare('DELETE FROM entries WHERE id=? AND system=0').run(id); },
  reorder(type, ids) {
    const st = db.prepare('UPDATE entries SET sort=? WHERE id=? AND type=?');
    db.transaction(() => ids.forEach((id, i) => st.run((i + 1) * 10, id, type)))();
  },
};

function audit(userId, action, details, ip) {
  db.prepare('INSERT INTO audit(user_id, action, details, ip, created_at) VALUES (?,?,?,?,?)')
    .run(userId || null, action, details ? String(details).slice(0, 500) : null, ip || null, now());
}

module.exports = { db, now, j, p, getSetting, setSetting, addRevision, listRevisions, getRevision, entries, audit, settingsCache };
