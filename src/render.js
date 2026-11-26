'use strict';
/**
 * Nunjucks environment (autoescape ON — every value is HTML-escaped unless it
 * went through the rich-text sanitiser) and template helpers.
 */
const path = require('path');
const nunjucks = require('nunjucks');
const config = require('./config');
const sec = require('./security');
const { getSetting } = require('./db');
const { mediaCached } = require('./media');
const DEFAULT_STRINGS = require('./strings');

const env = nunjucks.configure(path.join(config.ROOT, 'views'), {
  autoescape: true,
  noCache: !config.isProd,
  throwOnUndefined: false,
  trimBlocks: true,
  lstripBlocks: true,
});

const ASSET_VERSION = Date.now().toString(36);

function languages() {
  return getSetting('languages') || [{ code: 'uk', name: 'Українська', short: 'UA' }, { code: 'en', name: 'English', short: 'EN' }];
}
const defaultLang = () => languages()[0].code;

/** Translate a {uk, en} object for the current language (falls back to the default language). */
function tr(obj, lang) {
  if (obj == null) return '';
  if (typeof obj !== 'object') return String(obj);
  return obj[lang] || obj[defaultLang()] || '';
}
function uiString(key, lang) {
  const over = getSetting('strings') || {};
  return tr(over[key], lang) || tr(DEFAULT_STRINGS[key], lang) || key;
}
/** Localised path: '/about' → '/en/about' for English. */
function localPath(p, lang) {
  p = p || '/';
  if (lang === defaultLang()) return p;
  return `/${lang}${p === '/' ? '' : p}`;
}

/** Responsive <img> markup for a media id. */
function img(id, opts = {}) {
  const m = typeof id === 'object' && id ? id : mediaCached(id);
  if (!m || m.kind !== 'image') return '';
  const v = m.variants || {};
  const widths = Object.keys(v).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
  const srcset = widths.map((w) => `/media/${v[w]} ${Math.min(w, m.width)}w`).join(', ');
  const src = `/media/${v[widths[Math.min(1, widths.length - 1)]] || m.file}`;
  const alt = opts.alt !== undefined ? opts.alt : tr(m.alt, opts.lang);
  const attrs = [
    `src="${src}"`, srcset ? `srcset="${srcset}"` : '', `sizes="${opts.sizes || '100vw'}"`,
    `width="${m.width}"`, `height="${m.height}"`, `alt="${esc(alt)}"`,
    opts.eager ? 'fetchpriority="high"' : 'loading="lazy"', 'decoding="async"',
    opts.cls ? `class="${esc(opts.cls)}"` : '',
  ].filter(Boolean).join(' ');
  return new nunjucks.runtime.SafeString(`<img ${attrs}>`);
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mediaUrl(id, variant) {
  const m = mediaCached(id);
  if (!m) return '';
  if (variant && m.variants?.[variant]) return `/media/${m.variants[variant]}`;
  return `/media/${m.file}`;
}

/** YouTube/Vimeo → privacy-friendly embed URL; anything else → '' */
function embedUrl(u) {
  const s = String(u || '');
  let m = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`;
  m = s.match(/vimeo\.com\/(?:video\/)?(\d{5,12})/);
  if (m) return `https://player.vimeo.com/video/${m[1]}?dnt=1`;
  return '';
}

env.addFilter('t', (obj, lang) => tr(obj, lang));
env.addFilter('rich', (html) => new nunjucks.runtime.SafeString(sec.sanitizeRich(html)));
env.addFilter('safeurl', (u) => sec.safeUrl(u));
env.addFilter('tel', (s) => sec.telHref(s));
env.addFilter('isExternal', (u) => /^https?:\/\//i.test(String(u || '')));
env.addFilter('json', (v) => new nunjucks.runtime.SafeString(JSON.stringify(v ?? null).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')));
env.addFilter('jsonattr', (v) => JSON.stringify(v ?? null));
env.addFilter('date', (ts, withTime = true) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
});
env.addFilter('filesize', (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.ceil((n || 0) / 1024) + ' КБ'));
env.addFilter('host', (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } });
env.addFilter('nl2br', (s) => new nunjucks.runtime.SafeString(esc(s).replace(/\r?\n/g, '<br>')));
env.addGlobal('img', img);
env.addGlobal('mediaUrl', mediaUrl);
env.addGlobal('media', mediaCached);
env.addGlobal('embedUrl', embedUrl);
env.addGlobal('v', ASSET_VERSION);
env.addGlobal('adminPath', config.adminPath);
env.addGlobal('adminUrl', config.adminUrl);
env.addGlobal('now', () => Date.now());
env.addGlobal('year', () => new Date().getFullYear());

module.exports = { env, tr, uiString, localPath, languages, defaultLang, img, mediaUrl, embedUrl, esc };
