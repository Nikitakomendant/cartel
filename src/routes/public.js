'use strict';
const express = require('express');
const multer = require('multer');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const config = require('../config');
const sec = require('../security');
const { db, now, j, getSetting, entries } = require('../db');
const R = require('../render');
const { CATEGORIES } = require('../schema');
const mailer = require('../mailer');
const media = require('../media');
const peopleforce = require('../peopleforce');
const auth = require('../auth');

const router = express.Router();

// System pages: path → page slug in the CMS
const SYSTEM = { '/': 'home', '/about': 'about', '/brands': 'brands', '/investments': 'investments', '/cooperation': 'cooperation', '/vacancies': 'vacancies', '/contacts': 'contacts', '/privacy': 'privacy' };
const NAV = [['/about', 'nav.about'], ['/brands', 'nav.brands'], ['/investments', 'nav.investments'], ['/cooperation', 'nav.cooperation'], ['/vacancies', 'nav.vacancies'], ['/contacts', 'nav.contacts']];
const pagePath = (slug) => (slug === 'home' ? '/' : `/${slug}`);

// ---------------- language detection ----------------
router.use((req, res, next) => {
  const langs = R.languages();
  const def = langs[0].code;
  const m = req.path.match(/^\/([a-z]{2})(\/.*)?$/);
  if (m && m[1] !== def && langs.some((l) => l.code === m[1])) {
    req.lang = m[1];
    req.cleanPath = m[2] || '/';
  } else if (m && m[1] === def && (m[2] || '/') !== '/' ) {
    return res.redirect(301, m[2]); // /uk/about → /about
  } else {
    req.lang = def;
    req.cleanPath = req.path;
  }
  next();
});

// ---------------- legacy URLs & redirects managed in CMS ----------------
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let pth = req.path;
  if (pth.length > 1 && pth.endsWith('/')) pth = pth.replace(/\/+$/, '');
  pth = pth.replace(/\/index\.html?$/i, '') || '/';
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  const r = db.prepare('SELECT * FROM redirects WHERE from_path=? COLLATE NOCASE').get(pth);
  if (r) {
    db.prepare('UPDATE redirects SET hits=hits+1 WHERE id=?').run(r.id);
    const to = sec.safeUrl(r.to_path) || '/';
    return res.redirect(r.code === 302 ? 302 : 301, to);
  }
  if (pth !== req.path) return res.redirect(301, pth + qs);
  next();
});

// ---------------- per-request context ----------------
function buildContext(req, res) {
  const lang = req.lang;
  const preview = !!(req.query.preview && req.user && auth.can(req.user, 'preview'));
  const cache = {};
  const memo = (k, fn) => (k in cache ? cache[k] : (cache[k] = fn()));
  const brandUrl = (b) => R.localPath(`/brands/${b.slug}`, lang);
  const prepBrand = (b) => ({ ...b, url: brandUrl(b), cardImage: b.card || b.hero || (b.gallery || [])[0] || null });

  const data = {
    brands: (category) => memo('brands', () => entries.published('brand', { preview }).map(prepBrand))
      .filter((b) => !category || category === 'all' || b.category === category),
    brandsByIds: (ids) => {
      const all = data.brands();
      if (!ids || !ids.length) return all;
      return ids.map((id) => all.find((b) => b.id === id)).filter(Boolean);
    },
    brand: (id) => data.brands().find((b) => b.id === id) || null,
    categories: () => CATEGORIES.filter((c) => data.brands(c.v).length).map((c) => c.v),
    directory: () => CATEGORIES.map((c) => ({ cat: c.v, items: data.brands(c.v).filter((b) => b.show_in_contacts !== false) })).filter((g) => g.items.length),
    mapPoints: () => data.brands().filter((b) => b.geo).map((b) => ({ lat: b.geo.lat, lng: b.geo.lng, name: R.tr(b.name, lang), cat: b.category, url: b.url, address: R.tr(b.address, lang) })),
    quotes: (ids) => {
      const all = memo('quotes', () => entries.published('quote', { preview }));
      if (!ids || !ids.length) return all;
      return ids.map((id) => all.find((q) => q.id === id)).filter(Boolean);
    },
    team: () => memo('team', () => entries.published('team', { preview })),
    events: () => memo('events', () => entries.published('event', { preview })),
    stories: () => memo('stories', () => entries.published('story', { preview })),
    projects: () => memo('projects', () => entries.published('project', { preview }).map((p) => ({ ...p, url: p.has_page ? R.localPath(`/investments/${p.slug}`, lang) : null }))),
    project: (id) => data.projects().find((p) => p.id === id) || null,
    vacancies: () => memo('vacancies', () => entries.published('vacancy', { preview }).map((v) => ({ ...v, url: R.localPath(`/vacancies/${v.slug}`, lang) }))),
    formToken: (form) => sec.issueFormToken(form),
  };

  const company = getSetting('company', {}) || {};
  const seo = getSetting('seo', {}) || {};
  const analytics = getSetting('analytics', {}) || {};
  const forms = getSetting('forms', {}) || {};
  const path = req.cleanPath;
  return {
    lang, preview, path, data,
    langs: R.languages().map((l) => ({ ...l, href: R.localPath(path, l.code), active: l.code === lang })),
    defaultLang: R.defaultLang(),
    t: (o) => R.tr(o, lang),
    s: (k) => R.uiString(k, lang),
    lp: (p) => R.localPath(p, lang),
    nav: NAV.map(([p, k]) => ({ href: R.localPath(p, lang), label: R.uiString(k, lang), active: path === p || path.startsWith(p + '/') })),
    company, social: getSetting('social', {}) || {}, hr: getSetting('hr', {}) || {}, seo, analytics,
    turnstileKey: config.turnstileSecret ? forms.turnstile_site_key : '',
    contactTopics: forms.contact_topics || [],
    baseUrl: config.baseUrl,
    nonce: res.locals.nonce,
    user: req.user,
    cats: CATEGORIES,
    maps: getSetting('maps', {}) || {},
  };
}

function renderPage(res, view, ctx, meta) {
  const { t } = ctx;
  const seoTitle = t(meta.seo_title) || meta.title;
  const suffix = t(ctx.seo.title_suffix) || 'CARTEL';
  ctx.meta = {
    title: meta.isHome ? (seoTitle || suffix) : (seoTitle ? `${seoTitle} — ${suffix}` : suffix),
    description: t(meta.seo_description) || meta.description || t(ctx.seo.default_description) || '',
    image: R.mediaUrl(meta.seo_image || meta.image || ctx.seo.default_image, 'og'),
    noindex: !!meta.noindex || ctx.preview,
    type: meta.ogType || 'website',
    jsonld: meta.jsonld || null,
  };
  ctx.canonical = config.baseUrl + R.localPath(ctx.path, ctx.lang);
  ctx.alternates = ctx.langs.map((l) => ({ code: l.code, href: config.baseUrl + l.href }));
  if (ctx.preview) res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex');
  res.render(view, ctx);
}

const textOf = (html) => sec.stripTags(html).replace(/\s+/g, ' ').trim();
const excerpt = (s, n = 160) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

function orgJsonLd(ctx) {
  const c = ctx.company;
  return {
    '@context': 'https://schema.org', '@type': 'Organization', name: 'CARTEL', url: config.baseUrl,
    logo: config.baseUrl + '/static/img/logo-512.png',
    telephone: (c.phones || [])[0]?.number,
    email: (c.emails || [])[0]?.email,
    address: ctx.t(c.address) || undefined,
    sameAs: Object.values(ctx.social || {}).filter((u) => /^https:/.test(u || '')),
  };
}

// ---------------- pages ----------------
function showPage(slug, req, res, next) {
  const ctx = buildContext(req, res);
  const page = entries.publicOne('page', slug, { preview: ctx.preview });
  if (!page) return next();
  const blocks = (page.blocks || []).filter((b) => !b.hidden);
  const firstHero = blocks[0]?.type === 'hero';
  const heroImg = blocks.find((b) => b.type === 'hero')?.data?.image;
  renderPage(res, 'pages/page.njk', { ...ctx, page, blocks, firstHero, pageSlug: slug }, {
    title: ctx.t(page.title), seo_title: page.seo_title, seo_description: page.seo_description,
    seo_image: page.seo_image, image: heroImg, noindex: page.noindex, isHome: slug === 'home',
    jsonld: slug === 'home' ? orgJsonLd(ctx) : null,
  });
}
for (const [p, slug] of Object.entries(SYSTEM)) {
  router.get(p, (req, res, next) => (req.cleanPath === p ? showPage(slug, req, res, next) : next()));
}
// language-prefixed versions (e.g. /en/about)
router.get(/^\/[a-z]{2}(\/.*)?$/, (req, res, next) => {
  const slug = SYSTEM[req.cleanPath];
  if (slug && req.cleanPath !== req.path) return showPage(slug, req, res, next);
  next();
});

function brandPage(req, res, next) {
  const slug = (req.cleanPath.match(/^\/brands\/([a-z0-9-]{1,80})$/) || [])[1];
  if (!slug) return next();
  const ctx = buildContext(req, res);
  const b = entries.publicOne('brand', slug, { preview: ctx.preview });
  if (!b) return next();
  const brand = { ...b, url: R.localPath(`/brands/${b.slug}`, ctx.lang) };
  const t = ctx.t;
  const typeMap = { restaurant: 'Restaurant', hotel: 'Hotel', spa: 'DaySpa' };
  const jsonld = {
    '@context': 'https://schema.org', '@type': typeMap[b.category] || 'LocalBusiness', name: t(b.name),
    url: config.baseUrl + brand.url, image: b.hero ? config.baseUrl + R.mediaUrl(b.hero, 'og') : undefined,
    telephone: b.reception_phone || (b.phones || [])[0], address: t(b.address) || undefined,
    ...(b.geo ? { geo: { '@type': 'GeoCoordinates', latitude: b.geo.lat, longitude: b.geo.lng } } : {}),
    ...(b.menu_url ? { hasMenu: b.menu_url } : {}),
    parentOrganization: { '@type': 'Organization', name: 'CARTEL' },
  };
  const related = ctx.data.brands(b.category).filter((x) => x.id !== b.id).slice(0, 3);
  renderPage(res, 'pages/brand.njk', { ...ctx, firstHero: true, brand, related, blocks: (b.blocks || []).filter((x) => !x.hidden) }, {
    title: t(b.name), seo_title: b.seo_title, seo_description: b.seo_description,
    description: t(b.tagline) || excerpt(textOf(t(b.description))), seo_image: b.seo_image, image: b.hero, noindex: b.noindex, jsonld,
  });
}
function projectPage(req, res, next) {
  const slug = (req.cleanPath.match(/^\/investments\/([a-z0-9-]{1,80})$/) || [])[1];
  if (!slug) return next();
  const ctx = buildContext(req, res);
  const p = entries.publicOne('project', slug, { preview: ctx.preview });
  if (!p) return next();
  if (!p.has_page) return res.redirect(302, R.localPath('/investments', ctx.lang) + '#' + p.slug);
  renderPage(res, 'pages/project.njk', { ...ctx, firstHero: true, project: p, blocks: (p.blocks || []).filter((x) => !x.hidden) }, {
    title: ctx.t(p.title), seo_title: p.seo_title, seo_description: p.seo_description, description: ctx.t(p.short),
    seo_image: p.seo_image, image: p.image, noindex: p.noindex,
  });
}
function vacancyPage(req, res, next) {
  const slug = (req.cleanPath.match(/^\/vacancies\/([a-z0-9-]{1,80})$/) || [])[1];
  if (!slug) return next();
  const ctx = buildContext(req, res);
  const v = entries.publicOne('vacancy', slug, { preview: ctx.preview });
  if (!v) {
    // closed vacancy: send visitors to the list instead of a dead end
    if (entries.bySlug('vacancy', slug)) return res.redirect(302, R.localPath('/vacancies', ctx.lang));
    return next();
  }
  const t = ctx.t;
  const row = entries.bySlug('vacancy', slug);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'JobPosting', title: t(v.title),
    description: [t(v.summary), t(v.duties), t(v.requirements), t(v.conditions)].filter(Boolean).join('<br>'),
    datePosted: new Date(row.published_at || row.created_at).toISOString().slice(0, 10),
    hiringOrganization: { '@type': 'Organization', name: 'CARTEL', sameAs: config.baseUrl },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: t(v.location) || 'Буковель', addressCountry: 'UA' } },
    employmentType: 'FULL_TIME',
  };
  const brand = v.brand ? ctx.data.brand(v.brand) : null;
  renderPage(res, 'pages/vacancy.njk', { ...ctx, vacancy: { ...v, url: R.localPath(`/vacancies/${v.slug}`, ctx.lang) }, brand }, {
    title: t(v.title), description: t(v.summary) || excerpt(textOf(t(v.duties))), jsonld, ogType: 'article',
  });
}
function customPage(req, res, next) {
  const slug = (req.cleanPath.match(/^\/([a-z0-9-]{1,80})$/) || [])[1];
  if (!slug || Object.values(SYSTEM).includes(slug)) return next();
  return showPage(slug, req, res, next);
}
router.get(/.*/, (req, res, next) => brandPage(req, res, () => projectPage(req, res, () => vacancyPage(req, res, () => customPage(req, res, next)))));

// ---------------- forms ----------------
const formLimiter = rateLimit({
  windowMs: 15 * 60e3, limit: 6, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip) + '|' + req.params.form,
  handler: (req, res) => respond(req, res, 429, { ok: false, error: R.uiString('form.err_rate', req.lang) }),
});
const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.cvMb * 1024 * 1024, files: 1, fields: 20, fieldSize: 20000, parts: 25 },
}).single('cv');

function respond(req, res, status, body) {
  if (req.get('accept')?.includes('application/json')) return res.status(status).json(body);
  // no-JS fallback: back to the page with a result marker
  const back = sec.safeUrl(req.get('referer') || '/') || '/';
  let u; try { u = new URL(back, config.baseUrl); } catch { u = new URL('/', config.baseUrl); }
  u.searchParams.set('form', body.ok ? 'sent' : 'error');
  return res.redirect(303, u.pathname + u.search + '#form');
}

async function verifyTurnstile(req) {
  const forms = getSetting('forms', {}) || {};
  if (!config.turnstileSecret || !forms.turnstile_site_key) return true;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: config.turnstileSecret, response: String(req.body['cf-turnstile-response'] || ''), remoteip: req.ip }),
    });
    const d = await r.json();
    return !!d.success;
  } catch { return true; } // fail open — the other spam layers still apply
}

/** Common anti-spam gate: honeypot, signed time token, captcha (optional), link-spam heuristic. */
async function spamGate(req, form) {
  const b = req.body || {};
  if (b.website_url || b.fax) return 'honeypot';
  const tk = sec.checkFormToken(form, b._token);
  if (tk) return tk;
  if (!(await verifyTurnstile(req))) return 'captcha';
  const text = Object.values(b).filter((v) => typeof v === 'string').join(' ');
  if ((text.match(/https?:\/\//g) || []).length > 6) return 'links';
  if (/\b(viagra|casino|slot ?gacor|judi bola|togel|porn|crypto airdrop)\b/i.test(text)) return 'keywords';
  return null;
}

const fieldsOnly = multer({ limits: { files: 0, fields: 20, fieldSize: 20000, parts: 20 } }).none();
router.post('/api/forms/:form', formLimiter, (req, res, next) => {
  // browsers send FormData as multipart; the no-JS fallback sends urlencoded (already parsed)
  if (!req.is('multipart/form-data')) return next();
  const parser = req.params.form === 'apply' ? cvUpload : fieldsOnly;
  parser(req, res, (err) => {
    if (err) return respond(req, res, 400, { ok: false, errors: req.params.form === 'apply' ? { cv: R.uiString('form.err_file', req.lang) } : {}, error: R.uiString('form.error', req.lang) });
    next();
  });
}, async (req, res) => {
  const form = req.params.form;
  if (!['cooperation', 'contact', 'apply'].includes(form)) return res.status(404).json({ ok: false });
  const lang = R.languages().some((l) => l.code === req.body?.lang) ? req.body.lang : R.defaultLang();
  req.lang = lang;
  const s = (k) => R.uiString(k, lang);
  const b = req.body || {};

  const spam = await spamGate(req, form);
  if (spam) {
    sec.strike(req.ip);
    if (['too_fast', 'expired', 'invalid', 'replay'].includes(spam)) return respond(req, res, 400, { ok: false, error: s('form.err_token'), reload: true });
    // pretend success to bots
    return respond(req, res, 200, { ok: true, message: s('form.success_text') });
  }

  const errors = {};
  const field = (k, max = 300) => sec.cleanLine(b[k], max);
  const name = field('name', 120);
  if (!name) errors.name = s('form.err_required');
  if (b.consent !== 'on' && b.consent !== '1' && b.consent !== 'true') errors.consent = s('form.err_consent');
  const forms = getSetting('forms', {}) || {};
  const hr = getSetting('hr', {}) || {};
  const ipH = sec.ipHash(req.ip);

  if (form === 'cooperation' || form === 'contact') {
    const contact = field('contact', 150);
    if (!contact) errors.contact = s('form.err_contact');
    else if (!sec.isEmail(contact) && !sec.isPhone(contact)) errors.contact = s('form.err_contact');
    const record = { name, contact };
    let to = form === 'cooperation' ? forms.cooperation_to : forms.contact_to;
    let rows;
    if (form === 'cooperation') {
      record.company = field('company', 200);
      record.direction = ['business', 'creators'].includes(b.direction) ? b.direction : '';
      record.links = sec.cleanText(b.links, 600);
      record.proposal = sec.cleanText(b.proposal, 5000);
      if (!record.company) errors.company = s('form.err_required');
      if (!record.direction) errors.direction = s('form.err_required');
      if (!record.proposal) errors.proposal = s('form.err_required');
      const dirLabel = record.direction === 'creators' ? 'Creators & Influencers' : 'Business Cooperation';
      rows = [['Напрям', dirLabel], ['Імʼя', name], ['Компанія / профіль', record.company], ['Контакт', contact], ['Сайт / соцмережі', record.links], ['Пропозиція', record.proposal], ['Мова сайту', lang.toUpperCase()]];
    } else {
      record.message = sec.cleanText(b.message, 5000);
      if (!record.message) errors.message = s('form.err_required');
      const topics = forms.contact_topics || [];
      const ti = parseInt(b.topic, 10);
      if (Number.isInteger(ti) && topics[ti]) {
        record.topic = R.tr(topics[ti].label, 'uk');
        if (topics[ti].email) to = topics[ti].email;
      }
      rows = [['Тема', record.topic], ['Імʼя', name], ['Контакт', contact], ['Повідомлення', record.message], ['Мова сайту', lang.toUpperCase()]];
    }
    if (Object.keys(errors).length) return respond(req, res, 422, { ok: false, errors, error: s('form.error') });

    sec.consumeFormToken(b._token);
    const info = db.prepare('INSERT INTO submissions(form, data, lang, ip_hash, created_at) VALUES (?,?,?,?,?)').run(form, j(record), lang, ipH, now());
    const status = await mailer.send({
      to, subject: `${form === 'cooperation' ? 'Співпраця' : 'Звернення з сайту'}: ${name}`,
      title: form === 'cooperation' ? 'Нова заявка на співпрацю' : 'Нове звернення з сайту', rows,
      footer: `Заявка №${info.lastInsertRowid}. Переглянути: ${config.baseUrl}${config.adminPath}/submissions/${info.lastInsertRowid}`,
      replyTo: sec.isEmail(contact) ? contact : undefined,
    });
    db.prepare('UPDATE submissions SET email_status=? WHERE id=?').run(status, info.lastInsertRowid);
    return respond(req, res, 200, { ok: true, message: s('form.success_text') });
  }

  // ---- job application ----
  const phone = field('phone', 40);
  if (!sec.isPhone(phone)) errors.phone = s('form.err_phone');
  const email = field('email', 200);
  if (email && !sec.isEmail(email)) errors.email = s('form.err_email');
  let vacancy = null;
  const vid = parseInt(b.vacancy, 10);
  if (vid) {
    const v = entries.get(vid);
    if (v && v.type === 'vacancy' && v.status === 'published') vacancy = v;
  }
  let cvType = null;
  if (req.file && req.file.size) {
    cvType = media.checkCv(req.file.buffer);
    if (!cvType) errors.cv = s('form.err_file');
  }
  if (Object.keys(errors).length) return respond(req, res, 422, { ok: false, errors, error: s('form.error') });

  sec.consumeFormToken(b._token);
  const cvFile = cvType ? media.saveCv(req.file.buffer, cvType) : null;
  const vacancyTitle = vacancy ? R.tr(vacancy.live?.title, 'uk') : 'Загальна анкета';
  const message = sec.cleanText(b.message, 3000);
  const app = {
    vacancy_id: vacancy?.id || null, vacancy_title: vacancyTitle, name, phone, email: email || null, message: message || null,
    cv_file: cvFile, cv_name: cvFile ? sec.cleanLine(req.file.originalname, 150).replace(/[^\p{L}\p{N}._ -]/gu, '_') : null,
    cv_mime: cvType?.mime || null, cv_size: cvFile ? req.file.size : null, consent_at: now(), lang, ip_hash: ipH, created_at: now(),
  };
  const info = db.prepare(`INSERT INTO applications(vacancy_id, vacancy_title, name, phone, email, message, cv_file, cv_name, cv_mime, cv_size, consent_at, lang, ip_hash, created_at)
    VALUES (@vacancy_id,@vacancy_title,@name,@phone,@email,@message,@cv_file,@cv_name,@cv_mime,@cv_size,@consent_at,@lang,@ip_hash,@created_at)`).run(app);
  const id = info.lastInsertRowid;
  respond(req, res, 200, { ok: true, message: s('form.success_apply') });

  // notifications after responding — the candidate never waits for SMTP / PeopleForce
  setImmediate(async () => {
    const status = await mailer.send({
      to: hr.recipients, subject: `Відгук на вакансію: ${vacancyTitle} — ${name}`,
      title: `Новий відгук: ${vacancyTitle}`,
      rows: [['Вакансія', vacancyTitle], ['Імʼя', name], ['Телефон', phone], ['Email', email], ['Коментар', message], ['Резюме', cvFile ? 'у вкладенні' : 'не додано']],
      footer: `Відгук №${id}. Відкрити в CMS: ${config.baseUrl}${config.adminPath}/applications/${id}`,
      replyTo: email || undefined,
      attachments: cvFile ? [{ filename: app.cv_name || `cv.${cvType.ext}`, path: media.cvPath(cvFile), contentType: cvType.mime }] : undefined,
    });
    const pf = await peopleforce.pushCandidate(app);
    db.prepare('UPDATE applications SET email_status=?, pf_status=?, pf_error=? WHERE id=?').run(status, pf.status, pf.error || null, id);
  });
});

// ---------------- SEO endpoints ----------------
router.get('/robots.txt', (req, res) => {
  const noindex = process.env.SITE_NOINDEX === '1';
  res.type('text/plain').send(noindex ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nDisallow: ${config.adminPath}\nDisallow: /api/\nDisallow: /*?preview=\n\nSitemap: ${config.baseUrl}/sitemap.xml\n`);
});
router.get('/sitemap.xml', (req, res) => {
  const langs = R.languages();
  const urls = [];
  const add = (p, ts) => urls.push({ p, ts });
  for (const pg of entries.list('page', { statuses: ['published'] })) if (pg.live && !pg.live.noindex) add(pagePath(pg.slug), pg.published_at);
  for (const b of entries.list('brand', { statuses: ['published'] })) if (b.live && !b.live.noindex) add(`/brands/${b.slug}`, b.published_at);
  for (const p of entries.list('project', { statuses: ['published'] })) if (p.live?.has_page && !p.live.noindex) add(`/investments/${p.slug}`, p.published_at);
  for (const v of entries.list('vacancy', { statuses: ['published'] })) if (v.live) add(`/vacancies/${v.slug}`, v.published_at);
  const x = (s) => R.esc(s);
  const body = urls.map(({ p, ts }) => langs.map((l) => `<url><loc>${x(config.baseUrl + R.localPath(p, l.code))}</loc>${ts ? `<lastmod>${new Date(ts).toISOString().slice(0, 10)}</lastmod>` : ''}${
    langs.map((a) => `<xhtml:link rel="alternate" hreflang="${a.code}" href="${x(config.baseUrl + R.localPath(p, a.code))}"/>`).join('')
  }<xhtml:link rel="alternate" hreflang="x-default" href="${x(config.baseUrl + p)}"/></url>`).join('')).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>`);
});
router.get('/.well-known/security.txt', (req, res) => {
  const c = getSetting('company', {}) || {};
  const mail = (c.emails || []).find((e) => sec.isEmail(e.email))?.email || 'security@cartel.ua';
  const exp = new Date(Date.now() + 180 * 864e5).toISOString();
  res.type('text/plain').send(`Contact: mailto:${mail}\nExpires: ${exp}\nPreferred-Languages: uk, en\nCanonical: ${config.baseUrl}/.well-known/security.txt\n`);
});
router.get('/site.webmanifest', (req, res) => {
  res.type('application/manifest+json').send(JSON.stringify({
    name: 'CARTEL', short_name: 'CARTEL', start_url: '/', display: 'browser', background_color: '#f4f5f2', theme_color: '#13231e',
    icons: [{ src: '/static/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/static/img/logo-512.png', sizes: '512x512', type: 'image/png' }],
  }));
});

// ---------------- 404 ----------------
router.use((req, res) => {
  const ctx = buildContext(req, res);
  res.status(404);
  renderPage(res, 'pages/404.njk', ctx, { title: ctx.s('e404.title'), noindex: true });
});

module.exports = { router, buildContext, renderPage };
