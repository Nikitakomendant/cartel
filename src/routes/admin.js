'use strict';
/**
 * CMS routes. Everything here requires a staff session except /login.
 * Permissions are checked per route (see PERMS in auth.js).
 */
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const config = require('../config');
const sec = require('../security');
const auth = require('../auth');
const schema = require('../schema');
const media = require('../media');
const mailer = require('../mailer');
const R = require('../render');
const { db, now, j, p, getSetting, setSetting, entries, listRevisions, getRevision, addRevision, audit } = require('../db');
const SETTINGS = require('../settings-schema');

const router = express.Router();
const A = config.adminPath;
const json = express.json({ limit: '3mb' });
const form = express.urlencoded({ extended: false, limit: '200kb', parameterLimit: 200 });
router.use(form);
router.use((req, res, next) => {
  res.locals.A = A;
  res.locals.me = req.user;
  res.locals.can = (perm) => auth.can(req.user, perm);
  res.locals.roleLabel = auth.ROLE_LABELS;
  res.locals.path = req.path;
  res.locals.flash = req.query.ok ? String(req.query.ok).slice(0, 200) : null;
  res.locals.flashError = req.query.err ? String(req.query.err).slice(0, 200) : null;
  res.locals.langs = R.languages();
  next();
});
const ok = (res, url, msg) => res.redirect(303, `${url}${url.includes('?') ? '&' : '?'}ok=${encodeURIComponent(msg)}`);
const fail = (res, url, msg) => res.redirect(303, `${url}${url.includes('?') ? '&' : '?'}err=${encodeURIComponent(msg)}`);

// ---------------- login / 2FA ----------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60e3, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => { sec.strike(req.ip); res.status(429).render('admin/login.njk', { error: 'Забагато спроб входу. Зачекайте 15 хвилин.' }); },
});
const safeNext = (n) => (typeof n === 'string' && n.startsWith(A) && !n.startsWith('//') && !/[\r\n]/.test(n) ? n : A);

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(safeNext(req.query.next));
  res.render('admin/login.njk', { next: safeNext(req.query.next) });
});
router.post('/login', loginLimiter, (req, res) => {
  if (!sec.sameOrigin(req)) return res.status(403).render('admin/login.njk', { error: 'Запит відхилено.' });
  const email = sec.cleanLine(req.body.email, 200);
  const r = auth.attemptLogin(email, String(req.body.password || '').slice(0, 300), req.ip);
  const next = safeNext(req.body.next);
  if (r.error) return res.status(401).render('admin/login.njk', { error: r.error, email, next });
  auth.destroySession(req, res);
  if (r.need2fa) {
    auth.createSession(res, req, r.user.id, '2fa');
    return res.redirect(303, `${A}/login/2fa?next=${encodeURIComponent(next)}`);
  }
  auth.createSession(res, req, r.user.id, 'full');
  auth.completeLogin(r.user.id, req.ip);
  res.redirect(303, next);
});
const twofaLimiter = rateLimit({ windowMs: 15 * 60e3, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false });
router.get('/login/2fa', (req, res) => {
  if (!req.session || req.session.stage !== '2fa') return res.redirect(`${A}/login`);
  res.render('admin/login-2fa.njk', { next: safeNext(req.query.next) });
});
router.post('/login/2fa', twofaLimiter, (req, res) => {
  if (!req.session || req.session.stage !== '2fa' || !sec.sameOrigin(req)) return res.redirect(303, `${A}/login`);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.user_id);
  if (!u || !sec.verifyTotp(u.totp_secret, req.body.code)) {
    audit(u?.id, 'login_2fa_failed', null, req.ip);
    return res.status(401).render('admin/login-2fa.njk', { error: 'Невірний код. Перевірте час на телефоні та спробуйте ще раз.', next: safeNext(req.body.next) });
  }
  auth.destroySession(req, res);
  auth.createSession(res, req, u.id, 'full');
  auth.completeLogin(u.id, req.ip);
  res.redirect(303, safeNext(req.body.next));
});

// ---------------- everything below requires login ----------------
router.use(auth.requireUser, auth.csrf);
router.use((req, res, next) => {
  if (req.user.must_change_pw && !req.path.startsWith('/account') && req.path !== '/logout') return res.redirect(`${A}/account?force=1`);
  next();
});

router.post('/logout', (req, res) => { audit(req.user.id, 'logout', null, req.ip); auth.destroySession(req, res); res.redirect(303, `${A}/login`); });

// ---------------- dashboard ----------------
router.get('/', (req, res) => {
  const counts = {
    apps: db.prepare("SELECT COUNT(*) n FROM applications WHERE status='new'").get().n,
    subs: db.prepare("SELECT COUNT(*) n FROM submissions WHERE status='new'").get().n,
    vac: db.prepare("SELECT COUNT(*) n FROM entries WHERE type='vacancy' AND status='published'").get().n,
    brands: db.prepare("SELECT COUNT(*) n FROM entries WHERE type='brand' AND status='published'").get().n,
  };
  const types = Object.keys(schema.TYPES).filter((t) => auth.can(req.user, schema.TYPES[t].perm));
  const dirty = types.length ? db.prepare(`SELECT id, type, slug, data, live, status, updated_at FROM entries WHERE type IN (${types.map(() => '?').join(',')})
    AND (live IS NULL OR live != data) AND status NOT IN ('archived') ORDER BY updated_at DESC LIMIT 12`).all(...types).map((e) => ({ ...e, data: p(e.data) })) : [];
  const recentApps = auth.can(req.user, 'applications') ? db.prepare('SELECT id, name, vacancy_title, status, created_at FROM applications ORDER BY id DESC LIMIT 6').all() : [];
  const mailIssues = !mailer.isConfigured();
  res.render('admin/dashboard.njk', { title: 'Головна', counts, dirty, recentApps, mailIssues, titleOf, TYPES: schema.TYPES });
});

function titleOf(type, data) {
  const d = data || {};
  const v = d.title || d.name || d.author || d.text;
  const s = R.tr(v, 'uk');
  return s ? (s.length > 80 ? s.slice(0, 78) + '…' : s) : '(без назви)';
}
function previewPath(type, e) {
  const d = e.data || {};
  switch (type) {
    case 'page': return e.slug === 'home' ? '/' : `/${e.slug}`;
    case 'brand': return `/brands/${e.slug}`;
    case 'project': return d.has_page ? `/investments/${e.slug}` : '/investments';
    case 'vacancy': return `/vacancies/${e.slug}`;
    case 'story': return '/vacancies';
    case 'quote': return '/';
    default: return '/about';
  }
}
const UK = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'e', ъ: '' };
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[а-яієїґёыэъ]/g, (c) => UK[c] ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/['’ʼ`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'item';
}
const RESERVED = ['admin', 'api', 'static', 'media', 'brands', 'investments', 'vacancies', 'cooperation', 'contacts', 'about', 'privacy', 'home', 'sitemap', 'robots', 'healthz', 'favicon', 'en', 'uk', 'login', '.well-known'];
function uniqueSlug(type, wanted, exceptId) {
  let base = slugify(wanted), s = base, i = 2;
  if (type === 'page' && (RESERVED.includes(s) || /^[a-z]{2}$/.test(s))) s = base = `${base}-page`;
  while (db.prepare('SELECT id FROM entries WHERE type=? AND slug=? AND id != ?').get(type, s, exceptId || 0)) s = `${base}-${i++}`;
  return s;
}

// ---------------- generic content ----------------
function typeGuard(req, res, next) {
  const def = schema.TYPES[req.params.type];
  if (!def) return res.status(404).render('admin/error.njk', { title: 'Не знайдено', message: 'Такого розділу немає.' });
  if (!auth.can(req.user, def.perm)) return res.status(403).render('admin/error.njk', { title: 'Немає доступу', message: 'Ваша роль не має доступу до цього розділу.' });
  req.def = def;
  next();
}
const STATUS = {
  published: 'Опубліковано', draft: 'Чернетка', hidden: 'Приховано', inactive: 'Неактивна', archived: 'В архіві',
};
router.get('/c/:type', typeGuard, (req, res) => {
  const type = req.params.type;
  const filter = req.query.status || (type === 'vacancy' ? 'active' : 'all');
  let list = entries.list(type);
  const tabs = type === 'vacancy' ? [
    { k: 'active', l: 'Опубліковані та чернетки', n: list.filter((e) => ['published', 'draft'].includes(e.status)).length },
    { k: 'inactive', l: 'Неактивні', n: list.filter((e) => e.status === 'inactive').length },
    { k: 'archived', l: 'Архів', n: list.filter((e) => e.status === 'archived').length },
  ] : null;
  if (type === 'vacancy') {
    if (filter === 'active') list = list.filter((e) => ['published', 'draft'].includes(e.status));
    else list = list.filter((e) => e.status === filter);
  }
  const appsByVacancy = type === 'vacancy' ? Object.fromEntries(db.prepare('SELECT vacancy_id, COUNT(*) n, SUM(status=\'new\') nn FROM applications GROUP BY vacancy_id').all().map((r) => [r.vacancy_id, r])) : {};
  res.render('admin/list.njk', {
    title: req.def.label, type, def: req.def, list, STATUS, titleOf, tabs, filter, appsByVacancy,
    thumb: (e) => { const d = e.data; const id = d.card || d.hero || d.photo || d.image || d.cover; return id ? R.mediaUrl(id, '480') : null; },
    sub: (e) => {
      const d = e.data;
      if (type === 'brand') return (schema.CATEGORIES.find((c) => c.v === d.category) || {}).l;
      if (type === 'vacancy') return R.tr(d.location, 'uk');
      if (type === 'page') return e.slug === 'home' ? '/' : `/${e.slug}`;
      return R.tr(d.position || d.role || d.subtitle || d.date, 'uk');
    },
  });
});
router.post('/c/:type/new', typeGuard, (req, res) => {
  const type = req.params.type;
  const data = schema.normalizeEntry(type, {});
  let slug = null;
  if (req.def.slug || type === 'page') slug = uniqueSlug(type, `novyi-${type}`);
  if (type === 'page') {
    const t = sec.cleanLine(req.body.title, 120);
    if (!t) return fail(res, `${A}/c/page`, 'Вкажіть назву сторінки.');
    data.title.uk = t;
    slug = uniqueSlug('page', req.body.slug || t);
  }
  const id = entries.create(type, { slug, data, status: 'draft' }, req.user.id);
  audit(req.user.id, 'create', `${type}#${id}`, req.ip);
  res.redirect(303, `${A}/c/${type}/${id}`);
});

function loadEntry(req, res, next) {
  const e = entries.get(parseInt(req.params.id, 10));
  if (!e || e.type !== req.params.type) return res.status(404).render('admin/error.njk', { title: 'Не знайдено', message: 'Запис не знайдено — можливо, його видалили.' });
  req.entry = e;
  next();
}
/** Labels for the media and linked entries used inside the editor. */
function editorRefs(data, fields) {
  const ids = schema.collectMediaIds(data, new Set(), fields);
  const mediaMap = {};
  for (const id of ids) {
    const m = media.getMedia(id);
    if (m) mediaMap[id] = { id: m.id, kind: m.kind, thumb: m.kind === 'image' ? `/media/${m.variants['480'] || m.file}` : null, name: m.original_name, url: `/media/${m.file}` };
  }
  const options = {};
  for (const t of ['brand', 'project', 'quote']) {
    options[t] = entries.list(t).filter((e) => e.status !== 'archived').map((e) => ({ id: e.id, label: titleOf(t, e.data) + (e.status !== 'published' ? ' (не опубліковано)' : '') }));
  }
  return { mediaMap, options };
}
router.get('/c/:type/:id', typeGuard, loadEntry, (req, res) => {
  const e = req.entry;
  const refs = editorRefs(e.data, req.def.allFields);
  res.render('admin/edit.njk', {
    title: titleOf(e.type, e.data), def: req.def, e, STATUS,
    boot: {
      type: e.type, id: e.id, slug: e.slug, system: !!e.system, status: e.status, dirty: e.dirty, hasLive: !!e.live,
      data: e.data, schema: schema.clientSchema(), refs, langs: R.languages(), preview: previewPath(e.type, e),
      revisions: listRevisions('entry', e.id).length,
    },
  });
});

function applyEdit(req, e) {
  const body = req.body || {};
  const data = schema.normalizeEntry(e.type, body.data || {});
  let slug = null;
  if (!e.system && (req.def.slug || e.type === 'page') && typeof body.slug === 'string') {
    const wanted = body.slug.trim() || R.tr(data.title || data.name, 'uk');
    slug = uniqueSlug(e.type, wanted, e.id);
  }
  return { data, slug };
}
router.post('/api/c/:type/:id/save', json, typeGuard, loadEntry, (req, res) => {
  const { data, slug } = applyEdit(req, req.entry);
  entries.saveDraft(req.entry.id, { data, slug }, req.user.id);
  const e = entries.get(req.entry.id);
  res.json({ ok: true, slug: e.slug, dirty: e.dirty, status: e.status, warnings: schema.validateEntry(e.type, data), preview: previewPath(e.type, e) });
});
router.post('/api/c/:type/:id/publish', json, typeGuard, loadEntry, (req, res) => {
  const { data, slug } = applyEdit(req, req.entry);
  const errors = schema.validateEntry(req.entry.type, data);
  entries.saveDraft(req.entry.id, { data, slug }, req.user.id);
  if (errors.length) return res.status(422).json({ ok: false, errors });
  entries.publish(req.entry.id, req.user.id);
  audit(req.user.id, 'publish', `${req.entry.type}#${req.entry.id}`, req.ip);
  const e = entries.get(req.entry.id);
  res.json({ ok: true, slug: e.slug, dirty: false, status: e.status, preview: previewPath(e.type, e) });
});
router.post('/c/:type/:id/status', typeGuard, loadEntry, (req, res) => {
  const e = req.entry;
  const to = req.body.status;
  const allowed = e.type === 'vacancy' ? ['published', 'draft', 'inactive', 'archived'] : ['published', 'hidden', 'draft'];
  if (!allowed.includes(to)) return fail(res, `${A}/c/${e.type}/${e.id}`, 'Невідомий статус.');
  if (e.system && to !== 'published') return fail(res, `${A}/c/${e.type}/${e.id}`, 'Системну сторінку не можна приховати.');
  if (to === 'published') {
    const errs = schema.validateEntry(e.type, e.data);
    if (errs.length) return fail(res, `${A}/c/${e.type}/${e.id}`, errs[0]);
    entries.publish(e.id, req.user.id);
  } else entries.setStatus(e.id, to, req.user.id);
  audit(req.user.id, `status:${to}`, `${e.type}#${e.id}`, req.ip);
  const back = req.body.back === 'list' ? `${A}/c/${e.type}` : `${A}/c/${e.type}/${e.id}`;
  ok(res, back, { published: 'Опубліковано', hidden: 'Приховано з сайту', draft: 'Знято з публікації', inactive: 'Вакансію деактивовано — вона зникла з сайту', archived: 'Перенесено в архів' }[to]);
});
router.post('/c/:type/:id/duplicate', typeGuard, loadEntry, (req, res) => {
  const e = req.entry;
  if (e.system) return fail(res, `${A}/c/${e.type}/${e.id}`, 'Системні сторінки не дублюються — створіть нову сторінку.');
  const data = JSON.parse(JSON.stringify(e.data));
  const tk = data.title ? 'title' : data.name ? 'name' : null;
  if (tk) for (const l of Object.keys(data[tk] || {})) if (data[tk][l]) data[tk][l] += l === 'uk' ? ' (копія)' : ' (copy)';
  if (Array.isArray(data.blocks)) data.blocks = data.blocks.map((b) => ({ ...b, id: sec.randomToken(6).replace(/[^a-z0-9]/gi, 'x') }));
  const slug = e.slug ? uniqueSlug(e.type, `${e.slug}-kopiia`) : null;
  const id = entries.create(e.type, { slug, data, status: 'draft' }, req.user.id);
  audit(req.user.id, 'duplicate', `${e.type}#${e.id} → #${id}`, req.ip);
  ok(res, `${A}/c/${e.type}/${id}`, 'Створено копію (чернетка)');
});
router.post('/c/:type/:id/discard', typeGuard, loadEntry, (req, res) => {
  entries.discardDraft(req.entry.id, req.user.id);
  ok(res, `${A}/c/${req.entry.type}/${req.entry.id}`, 'Чернетку скасовано — повернуто опубліковану версію');
});
router.post('/c/:type/:id/delete', typeGuard, loadEntry, (req, res) => {
  const e = req.entry;
  if (e.system) return fail(res, `${A}/c/${e.type}/${e.id}`, 'Системну сторінку не можна видалити.');
  if (e.type === 'vacancy' && db.prepare('SELECT COUNT(*) n FROM applications WHERE vacancy_id=?').get(e.id).n) {
    return fail(res, `${A}/c/${e.type}/${e.id}`, 'На вакансію є відгуки — перенесіть її в архів замість видалення.');
  }
  addRevision('entry', e.id, 'delete', e.data, req.user.id);
  entries.remove(e.id);
  audit(req.user.id, 'delete', `${e.type}#${e.id} ${titleOf(e.type, e.data)}`, req.ip);
  ok(res, `${A}/c/${e.type}`, 'Видалено');
});
router.get('/c/:type/:id/history', typeGuard, loadEntry, (req, res) => {
  res.render('admin/history.njk', { title: 'Історія змін', e: req.entry, def: req.def, revs: listRevisions('entry', req.entry.id), titleOf });
});
router.post('/c/:type/:id/restore/:rev', typeGuard, loadEntry, (req, res) => {
  const r = getRevision(parseInt(req.params.rev, 10));
  if (!r || r.entity !== 'entry' || r.ref !== String(req.entry.id)) return fail(res, `${A}/c/${req.entry.type}/${req.entry.id}/history`, 'Версію не знайдено.');
  const data = schema.normalizeEntry(req.entry.type, r.data);
  entries.saveDraft(req.entry.id, { data, slug: null }, req.user.id);
  addRevision('entry', req.entry.id, 'restore', data, req.user.id);
  audit(req.user.id, 'restore', `${req.entry.type}#${req.entry.id} rev ${r.id}`, req.ip);
  ok(res, `${A}/c/${req.entry.type}/${req.entry.id}`, 'Версію відновлено як чернетку. Перевірте й натисніть «Опублікувати».');
});
router.post('/api/reorder', json, (req, res) => {
  const type = req.body?.type;
  const def = schema.TYPES[type];
  if (!def || !auth.can(req.user, def.perm)) return res.status(403).json({ error: 'Недостатньо прав.' });
  const ids = (req.body.ids || []).map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 500);
  entries.reorder(type, ids);
  res.json({ ok: true });
});

// ---------------- media library ----------------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.limits.videoMb * 1024 * 1024, files: 20, fields: 5 } });
const mediaJson = (m) => ({ id: m.id, kind: m.kind, name: m.original_name, w: m.width, h: m.height, size: m.size, alt: m.alt, thumb: m.kind === 'image' ? `/media/${m.variants['480'] || m.file}` : null, url: `/media/${m.file}`, created_at: m.created_at });
router.get('/media', auth.requirePerm('media'), (req, res) => res.render('admin/media.njk', { title: 'Медіатека' }));
router.get('/api/media', (req, res) => {
  if (!auth.can(req.user, 'media') && !auth.can(req.user, 'vacancies')) return res.status(403).json({ error: 'Недостатньо прав.' });
  const kind = ['image', 'video'].includes(req.query.kind) ? req.query.kind : null;
  const q = sec.cleanLine(req.query.q, 80);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = []; const args = [];
  if (kind) { where.push('kind=?'); args.push(kind); }
  if (q) { where.push('(original_name LIKE ? OR alt LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM media ${w}`).get(...args).n;
  const rows = db.prepare(`SELECT * FROM media ${w} ORDER BY id DESC LIMIT 60 OFFSET ?`).all(...args, (page - 1) * 60)
    .map((m) => mediaJson({ ...m, variants: p(m.variants) || {}, alt: p(m.alt) || {} }));
  res.json({ items: rows, total, page, pages: Math.ceil(total / 60) });
});
router.post('/api/media', auth.requirePerm('media'), (req, res) => {
  upload.array('files', 20)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Файл завеликий (максимум ${config.limits.videoMb} МБ для відео, ${config.limits.imageMb} МБ для фото).` : 'Не вдалося завантажити файл.' });
    const out = []; const errors = [];
    for (const f of req.files || []) {
      try {
        const sig = sec.sniff(f.buffer);
        let id;
        if (sig?.kind === 'image') {
          if (f.size > config.limits.imageMb * 1048576) throw new Error(`Фото більше ${config.limits.imageMb} МБ.`);
          id = await media.saveImage(f.buffer, f.originalname, req.user.id);
        } else if (sig?.kind === 'video') id = await media.saveVideo(f.buffer, f.originalname, req.user.id);
        else throw new Error('Формат не підтримується. Фото: JPG, PNG, WebP. Відео: MP4, WebM.');
        out.push(mediaJson(media.getMedia(id)));
      } catch (e) { errors.push(`${f.originalname}: ${e.message}`); }
    }
    if (out.length) audit(req.user.id, 'media_upload', `${out.length} files`, req.ip);
    res.status(out.length || !errors.length ? 200 : 400).json({ items: out, errors });
  });
});
router.post('/api/media/:id', json, auth.requirePerm('media'), (req, res) => {
  const m = media.getMedia(parseInt(req.params.id, 10));
  if (!m) return res.status(404).json({ error: 'Не знайдено' });
  const alt = {};
  for (const l of R.languages()) alt[l.code] = sec.cleanLine(req.body?.alt?.[l.code], 250);
  db.prepare('UPDATE media SET alt=? WHERE id=?').run(j(alt), m.id);
  media.invalidate(m.id);
  res.json({ ok: true });
});
function mediaUsage(id) {
  const used = [];
  for (const e of db.prepare('SELECT id, type, data, live FROM entries').all()) {
    const def = schema.TYPES[e.type];
    if (!def) continue;
    const ids = new Set();
    schema.collectMediaIds(p(e.data), ids, def.allFields);
    schema.collectMediaIds(p(e.live), ids, def.allFields);
    if (ids.has(id)) used.push({ type: e.type, id: e.id, title: titleOf(e.type, p(e.data)) });
  }
  if ((getSetting('seo') || {}).default_image === id) used.push({ type: 'settings', id: 'seo', title: 'SEO за замовчуванням' });
  return used;
}
router.get('/api/media/:id/usage', auth.requirePerm('media'), (req, res) => res.json({ used: mediaUsage(parseInt(req.params.id, 10)) }));
router.post('/api/media/:id/delete', json, auth.requirePerm('media'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const used = mediaUsage(id);
  if (used.length && !req.body?.force) return res.status(409).json({ error: 'Файл використовується', used });
  media.removeMedia(id);
  audit(req.user.id, 'media_delete', `#${id}`, req.ip);
  res.json({ ok: true });
});

// ---------------- applications (HR) ----------------
const APP_STATUS = { new: 'Нова', viewed: 'Переглянута', progress: 'В роботі', interview: 'Співбесіда', hired: 'Прийнято', rejected: 'Відмова' };
router.get('/applications', auth.requirePerm('applications'), (req, res) => {
  const st = APP_STATUS[req.query.status] ? req.query.status : null;
  const vid = parseInt(req.query.vacancy, 10) || null;
  const q = sec.cleanLine(req.query.q, 80);
  const where = []; const args = [];
  if (st) { where.push('status=?'); args.push(st); }
  if (vid) { where.push('vacancy_id=?'); args.push(vid); }
  if (q) { where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = db.prepare(`SELECT * FROM applications ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 500`).all(...args);
  const vacancies = entries.list('vacancy').map((v) => ({ id: v.id, label: titleOf('vacancy', v.data), status: v.status }));
  res.render('admin/applications.njk', { title: 'Відгуки кандидатів', rows, APP_STATUS, st, vid, q, vacancies });
});
router.get('/applications.csv', auth.requirePerm('applications'), (req, res) => {
  const rows = db.prepare('SELECT * FROM applications ORDER BY id DESC').all();
  const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const head = ['ID', 'Дата', 'Вакансія', 'Імʼя', 'Телефон', 'Email', 'Статус', 'Коментар кандидата', 'Нотатки HR', 'Резюме'];
  const lines = rows.map((r) => [r.id, new Date(r.created_at).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }), r.vacancy_title, r.name, r.phone, r.email, APP_STATUS[r.status], r.message, r.notes, r.cv_file ? 'так' : 'ні'].map(cell).join(';'));
  audit(req.user.id, 'applications_export', `${rows.length} rows`, req.ip);
  res.set('Content-Disposition', `attachment; filename="cartel-applications-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.type('text/csv; charset=utf-8').send('﻿' + [head.map(cell).join(';'), ...lines].join('\r\n'));
});
router.get('/applications/:id', auth.requirePerm('applications'), (req, res) => {
  const a = db.prepare('SELECT * FROM applications WHERE id=?').get(parseInt(req.params.id, 10));
  if (!a) return res.status(404).render('admin/error.njk', { title: 'Не знайдено', message: 'Відгук не знайдено.' });
  if (a.status === 'new') { db.prepare("UPDATE applications SET status='viewed', viewed_at=? WHERE id=?").run(now(), a.id); a.status = 'viewed'; }
  audit(req.user.id, 'application_view', `#${a.id}`, req.ip);
  const prev = db.prepare('SELECT id FROM applications WHERE id > ? ORDER BY id ASC LIMIT 1').get(a.id);
  const next = db.prepare('SELECT id FROM applications WHERE id < ? ORDER BY id DESC LIMIT 1').get(a.id);
  const vac = a.vacancy_id ? entries.get(a.vacancy_id) : null;
  res.render('admin/application.njk', { title: `Відгук: ${a.name}`, a, APP_STATUS, prev, next, vac });
});
router.post('/applications/:id', auth.requirePerm('applications'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const st = APP_STATUS[req.body.status] ? req.body.status : null;
  if (st) db.prepare('UPDATE applications SET status=? WHERE id=?').run(st, id);
  if (typeof req.body.notes === 'string') db.prepare('UPDATE applications SET notes=? WHERE id=?').run(sec.cleanText(req.body.notes, 5000), id);
  ok(res, `${A}/applications/${id}`, 'Збережено');
});
router.post('/applications/:id/delete', auth.requirePerm('applications'), (req, res) => {
  const a = db.prepare('SELECT * FROM applications WHERE id=?').get(parseInt(req.params.id, 10));
  if (a) {
    const f = media.cvPath(a.cv_file);
    if (f) fs.rm(f, { force: true }, () => {});
    db.prepare('DELETE FROM applications WHERE id=?').run(a.id);
    audit(req.user.id, 'application_delete', `#${a.id}`, req.ip);
  }
  ok(res, `${A}/applications`, 'Відгук і файл резюме видалено');
});
router.get('/applications/:id/cv', auth.requirePerm('applications'), (req, res) => {
  const a = db.prepare('SELECT * FROM applications WHERE id=?').get(parseInt(req.params.id, 10));
  const f = a && media.cvPath(a.cv_file);
  if (!f || !fs.existsSync(f)) return res.status(404).type('text').send('Файл не знайдено');
  audit(req.user.id, 'cv_open', `#${a.id}`, req.ip);
  const inline = req.query.download !== '1' && /^(application\/pdf|image\/(jpeg|png))$/.test(a.cv_mime);
  const name = (a.cv_name || `cv-${a.id}`).replace(/[^\p{L}\p{N}._ -]/gu, '_');
  res.set({
    'Content-Type': a.cv_mime || 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="cv-${a.id}${name.match(/\.\w+$/)?.[0] || ''}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    // PDF: the browser's own viewer renders it (Chrome refuses PDFs in sandboxed frames); images & downloads: fully sandboxed
    'Content-Security-Policy': a.cv_mime === 'application/pdf' && inline ? "default-src 'none'; frame-ancestors 'self'" : "default-src 'none'; img-src 'self'; frame-ancestors 'self'; sandbox",
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN',
  });
  fs.createReadStream(f).pipe(res);
});

// ---------------- form submissions (marketing) ----------------
const SUB_STATUS = { new: 'Нова', progress: 'В роботі', done: 'Оброблено', spam: 'Спам' };
const FORM_LABEL = { cooperation: 'Співпраця', contact: 'Контакти' };
router.get('/submissions', auth.requirePerm('submissions'), (req, res) => {
  const f = FORM_LABEL[req.query.form] ? req.query.form : null;
  const rows = (f ? db.prepare('SELECT * FROM submissions WHERE form=? ORDER BY id DESC LIMIT 500').all(f) : db.prepare('SELECT * FROM submissions ORDER BY id DESC LIMIT 500').all())
    .map((r) => ({ ...r, data: p(r.data) || {} }));
  res.render('admin/submissions.njk', { title: 'Заявки з форм', rows, f, SUB_STATUS, FORM_LABEL });
});
router.get('/submissions/:id', auth.requirePerm('submissions'), (req, res) => {
  const r = db.prepare('SELECT * FROM submissions WHERE id=?').get(parseInt(req.params.id, 10));
  if (!r) return res.status(404).render('admin/error.njk', { title: 'Не знайдено', message: 'Заявку не знайдено.' });
  if (r.status === 'new') db.prepare("UPDATE submissions SET status='progress' WHERE id=?").run(r.id);
  res.render('admin/submission.njk', { title: `Заявка №${r.id}`, r: { ...r, data: p(r.data) || {} }, SUB_STATUS, FORM_LABEL });
});
router.post('/submissions/:id', auth.requirePerm('submissions'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.body.delete === '1') { db.prepare('DELETE FROM submissions WHERE id=?').run(id); audit(req.user.id, 'submission_delete', `#${id}`, req.ip); return ok(res, `${A}/submissions`, 'Видалено'); }
  if (SUB_STATUS[req.body.status]) db.prepare('UPDATE submissions SET status=? WHERE id=?').run(req.body.status, id);
  ok(res, `${A}/submissions/${id}`, 'Збережено');
});

// ---------------- settings (schema-driven, same editor as content) ----------------
function settingsGuard(req, res, next) {
  const g = SETTINGS[req.params.group];
  if (!g) return res.status(404).render('admin/error.njk', { title: 'Не знайдено', message: 'Такого розділу налаштувань немає.' });
  if (!auth.can(req.user, g.perm)) return res.status(403).render('admin/error.njk', { title: 'Немає доступу', message: 'Ваша роль не має доступу до цих налаштувань.' });
  req.g = g;
  next();
}
router.get('/settings/:group', settingsGuard, (req, res) => {
  const g = req.g;
  const stored = getSetting(g.key, g.wrap ? [] : {});
  const value = g.wrap ? { [g.wrap]: stored } : (stored || {});
  const fields = g.groups.flatMap((x) => x.fields);
  const refs = editorRefs({}, []);
  for (const id of schema.collectMediaIds(value, new Set(), fields)) {
    const m = media.getMedia(id);
    if (m) refs.mediaMap[id] = { id, kind: m.kind, thumb: `/media/${m.variants['480'] || m.file}`, name: m.original_name };
  }
  res.render('admin/settings.njk', {
    title: g.label, g, group: req.params.group, revisions: listRevisions('settings', g.key).slice(0, 15),
    boot: { settings: req.params.group, data: value, groups: g.groups, refs, langs: R.languages(), schema: schema.clientSchema() },
  });
});
router.post('/api/settings/:group', json, settingsGuard, (req, res) => {
  const g = req.g;
  const fields = g.groups.flatMap((x) => x.fields);
  const data = schema.normalize(fields, req.body?.data || {});
  const err = g.validate ? g.validate(data) : null;
  if (err) return res.status(422).json({ ok: false, errors: [err] });
  const value = g.wrap ? data[g.wrap] : { ...(getSetting(g.key, {}) || {}), ...data };
  setSetting(g.key, value, req.user.id);
  if (g.after) g.after(data);
  audit(req.user.id, 'settings', g.key, req.ip);
  res.json({ ok: true });
});
router.post('/settings/:group/restore/:rev', settingsGuard, (req, res) => {
  const r = getRevision(parseInt(req.params.rev, 10));
  if (!r || r.entity !== 'settings' || r.ref !== req.g.key) return fail(res, `${A}/settings/${req.params.group}`, 'Версію не знайдено.');
  setSetting(req.g.key, r.data, req.user.id);
  if (req.g.after) req.g.after(req.g.wrap ? { [req.g.wrap]: r.data } : r.data);
  audit(req.user.id, 'settings_restore', `${req.g.key} rev ${r.id}`, req.ip);
  ok(res, `${A}/settings/${req.params.group}`, 'Попередню версію відновлено');
});
router.post('/settings/test-email', auth.requirePerm('*'), async (req, res) => {
  const to = sec.cleanLine(req.body.to, 200);
  if (!sec.isEmail(to)) return fail(res, `${A}/system`, 'Вкажіть коректний email.');
  const r = await mailer.send({ to, subject: 'Тест пошти CARTEL CMS', title: 'Пошта працює', rows: [['Сайт', config.baseUrl], ['Час', new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })]] });
  if (r === 'sent') return ok(res, `${A}/system`, `Тестовий лист надіслано на ${to}`);
  fail(res, `${A}/system`, r === 'not_configured' ? 'SMTP не налаштовано у файлі .env' : `Помилка: ${r}`);
});

// UI strings: a translation table
const DEFAULT_STRINGS = require('../strings');
router.get('/strings', auth.requirePerm('strings'), (req, res) => {
  const over = getSetting('strings', {}) || {};
  const rows = Object.entries(DEFAULT_STRINGS).map(([k, def]) => ({ k, def, val: over[k] || {} }));
  res.render('admin/strings.njk', { title: 'Тексти інтерфейсу', rows });
});
router.post('/strings', auth.requirePerm('strings'), (req, res) => {
  const over = {};
  for (const k of Object.keys(DEFAULT_STRINGS)) {
    const v = {};
    for (const l of R.languages()) {
      const s = sec.cleanLine(req.body[`${k}__${l.code}`], 400);
      if (s && s !== DEFAULT_STRINGS[k][l.code]) v[l.code] = s;
    }
    if (Object.keys(v).length) over[k] = v;
  }
  setSetting('strings', over, req.user.id);
  audit(req.user.id, 'settings', 'strings', req.ip);
  ok(res, `${A}/strings`, 'Тексти збережено');
});

// ---------------- redirects ----------------
router.get('/redirects', auth.requirePerm('redirects'), (req, res) => {
  res.render('admin/redirects.njk', { title: 'Перенаправлення (301)', rows: db.prepare('SELECT * FROM redirects ORDER BY from_path').all() });
});
router.post('/redirects', auth.requirePerm('redirects'), (req, res) => {
  if (req.body.delete) {
    db.prepare('DELETE FROM redirects WHERE id=?').run(parseInt(req.body.delete, 10));
    return ok(res, `${A}/redirects`, 'Видалено');
  }
  let from = sec.cleanLine(req.body.from, 300);
  try { if (/^https?:/i.test(from)) from = new URL(from).pathname; } catch { /* keep */ }
  from = ('/' + from.replace(/^\/+/, '')).replace(/\/+$/, '').replace(/\/index\.html?$/i, '') || '/';
  const to = sec.safeUrl(sec.cleanLine(req.body.to, 500));
  const code = req.body.code === '302' ? 302 : 301;
  if (from === '/' || !to) return fail(res, `${A}/redirects`, 'Вкажіть старий шлях (напр. /restorany/teppan) і нову адресу.');
  if (from === to) return fail(res, `${A}/redirects`, 'Стара й нова адреси однакові.');
  db.prepare('INSERT INTO redirects(from_path, to_path, code, created_at) VALUES (?,?,?,?) ON CONFLICT(from_path) DO UPDATE SET to_path=excluded.to_path, code=excluded.code').run(from, to, code, now());
  audit(req.user.id, 'redirect', `${from} → ${to}`, req.ip);
  ok(res, `${A}/redirects`, 'Збережено');
});

// ---------------- users ----------------
router.get('/users', auth.requirePerm('*'), (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, active, totp_enabled, last_login_at, locked_until, created_at FROM users ORDER BY active DESC, role, name').all();
  res.render('admin/users.njk', { title: 'Користувачі', users, newPassword: null });
});
function tempPassword() { return sec.randomToken(9).replace(/[-_]/g, 'k') + '7q'; }
router.post('/users', auth.requirePerm('*'), (req, res) => {
  const email = sec.cleanLine(req.body.email, 200).toLowerCase();
  const name = sec.cleanLine(req.body.name, 120);
  const role = ['admin', 'marketing', 'hr'].includes(req.body.role) ? req.body.role : null;
  if (!sec.isEmail(email) || !name || !role) return fail(res, `${A}/users`, 'Заповніть імʼя, email і роль.');
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return fail(res, `${A}/users`, 'Користувач з таким email уже існує.');
  const pw = tempPassword();
  db.prepare('INSERT INTO users(email, name, role, pass_hash, must_change_pw, created_at) VALUES (?,?,?,?,1,?)').run(email, name, role, sec.hashPassword(pw), now());
  audit(req.user.id, 'user_create', `${email} (${role})`, req.ip);
  const users = db.prepare('SELECT id, email, name, role, active, totp_enabled, last_login_at, locked_until, created_at FROM users ORDER BY active DESC, role, name').all();
  res.render('admin/users.njk', { title: 'Користувачі', users, newPassword: { email, pw } });
});
router.post('/users/:id', auth.requirePerm('*'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) return fail(res, `${A}/users`, 'Користувача не знайдено.');
  const admins = db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1").get().n;
  const act = req.body.action;
  if (act === 'role') {
    const role = ['admin', 'marketing', 'hr'].includes(req.body.role) ? req.body.role : u.role;
    if (u.role === 'admin' && role !== 'admin' && admins <= 1) return fail(res, `${A}/users`, 'Має залишитися хоча б один адміністратор.');
    db.prepare('UPDATE users SET role=? WHERE id=?').run(role, id);
    auth.destroyAllSessions(id);
  } else if (act === 'toggle') {
    if (id === req.user.id) return fail(res, `${A}/users`, 'Не можна деактивувати себе.');
    if (u.active && u.role === 'admin' && admins <= 1) return fail(res, `${A}/users`, 'Має залишитися хоча б один адміністратор.');
    db.prepare('UPDATE users SET active=? WHERE id=?').run(u.active ? 0 : 1, id);
    auth.destroyAllSessions(id);
  } else if (act === 'reset') {
    const pw = tempPassword();
    db.prepare('UPDATE users SET pass_hash=?, must_change_pw=1, failed_count=0, locked_until=NULL WHERE id=?').run(sec.hashPassword(pw), id);
    auth.destroyAllSessions(id);
    audit(req.user.id, 'user_reset_password', u.email, req.ip);
    const users = db.prepare('SELECT id, email, name, role, active, totp_enabled, last_login_at, locked_until, created_at FROM users ORDER BY active DESC, role, name').all();
    return res.render('admin/users.njk', { title: 'Користувачі', users, newPassword: { email: u.email, pw } });
  } else if (act === 'reset2fa') {
    db.prepare('UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE id=?').run(id);
  } else if (act === 'unlock') {
    db.prepare('UPDATE users SET failed_count=0, locked_until=NULL WHERE id=?').run(id);
  }
  audit(req.user.id, `user_${act}`, u.email, req.ip);
  ok(res, `${A}/users`, 'Збережено');
});

// ---------------- own account: password & 2FA ----------------
router.get('/account', async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  let qr = null, secret = null;
  if (!u.totp_enabled && req.query.setup2fa) {
    secret = u.totp_secret || sec.newTotpSecret();
    if (!u.totp_secret) db.prepare('UPDATE users SET totp_secret=? WHERE id=?').run(secret, u.id);
    const label = encodeURIComponent(`CARTEL CMS:${u.email}`);
    qr = await QRCode.toDataURL(`otpauth://totp/${label}?secret=${secret}&issuer=CARTEL%20CMS`, { margin: 1, width: 220 });
  }
  res.render('admin/account.njk', { title: 'Мій профіль', u, qr, secret, force: !!req.query.force || u.must_change_pw });
});
router.post('/account/password', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!sec.verifyPassword(req.body.current, u.pass_hash)) return fail(res, `${A}/account`, 'Поточний пароль невірний.');
  if (req.body.password !== req.body.password2) return fail(res, `${A}/account`, 'Нові паролі не збігаються.');
  const prob = sec.passwordProblems(req.body.password);
  if (prob) return fail(res, `${A}/account`, prob);
  if (sec.verifyPassword(req.body.password, u.pass_hash)) return fail(res, `${A}/account`, 'Новий пароль має відрізнятися від поточного.');
  db.prepare('UPDATE users SET pass_hash=?, must_change_pw=0 WHERE id=?').run(sec.hashPassword(req.body.password), u.id);
  auth.destroyAllSessions(u.id);
  auth.createSession(res, req, u.id, 'full');
  audit(u.id, 'password_change', null, req.ip);
  ok(res, A, 'Пароль змінено');
});
router.post('/account/2fa', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (req.body.action === 'enable') {
    if (!u.totp_secret || !sec.verifyTotp(u.totp_secret, req.body.code)) return fail(res, `${A}/account?setup2fa=1`, 'Код не підійшов. Спробуйте ще раз.');
    db.prepare('UPDATE users SET totp_enabled=1 WHERE id=?').run(u.id);
    audit(u.id, '2fa_enable', null, req.ip);
    return ok(res, `${A}/account`, 'Двофакторний вхід увімкнено');
  }
  if (req.body.action === 'disable') {
    if (!sec.verifyPassword(req.body.current, u.pass_hash)) return fail(res, `${A}/account`, 'Пароль невірний.');
    db.prepare('UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE id=?').run(u.id);
    audit(u.id, '2fa_disable', null, req.ip);
    return ok(res, `${A}/account`, 'Двофакторний вхід вимкнено');
  }
  res.redirect(303, `${A}/account`);
});

// ---------------- system & audit ----------------
router.get('/system', auth.requirePerm('*'), (req, res) => {
  const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
  const backups = fs.readdirSync(`${config.DATA_DIR}/backups`).filter((f) => f.endsWith('.db')).sort().reverse().slice(0, 10);
  res.render('admin/system.njk', {
    title: 'Система', smtp: mailer.isConfigured(), smtpHost: config.smtp.host, from: config.smtp.from, pf: !!config.peopleforce.apiKey,
    turnstile: !!config.turnstileSecret, dbSize: size(`${config.DATA_DIR}/cartel.db`), backups, baseUrl: config.baseUrl, isProd: config.isProd,
    initialPw: fs.existsSync(`${config.DATA_DIR}/INITIAL_ADMIN_PASSWORD.txt`),
    counts: { media: db.prepare('SELECT COUNT(*) n FROM media').get().n, entries: db.prepare('SELECT COUNT(*) n FROM entries').get().n, apps: db.prepare('SELECT COUNT(*) n FROM applications').get().n },
  });
});
router.post('/system/backup', auth.requirePerm('*'), async (req, res) => {
  const file = `${config.DATA_DIR}/backups/cartel-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  await db.backup(file);
  audit(req.user.id, 'backup', file, req.ip);
  ok(res, `${A}/system`, 'Резервну копію бази створено');
});
router.get('/audit', auth.requirePerm('*'), (req, res) => {
  const rows = db.prepare('SELECT a.*, u.name, u.email FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 300').all();
  res.render('admin/audit.njk', { title: 'Журнал дій', rows });
});

router.use((req, res) => res.status(404).render('admin/error.njk', { title: 'Не знайдено', message: 'Такої сторінки в CMS немає.' }));

module.exports = router;
