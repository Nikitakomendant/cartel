'use strict';
/**
 * Static export for Cloudflare Pages.
 *
 *   1. start the CMS locally   (npm start)
 *   2. node scripts/build-static.js [http://127.0.0.1:3000] [out-dir]
 *
 * Crawls every public page (UA + EN), rewrites what only made sense with a Node
 * server (CSP nonces, signed form tokens, staff-login link) and writes a folder that
 * Cloudflare Pages can serve as-is: HTML, /static, /media, _redirects, _headers.
 */
const fs = require('fs');
const path = require('path');

const ORIGIN = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '..', 'dist'));
const ROOT = path.join(__dirname, '..');
const BASE_URL = process.env.BASE_URL || 'https://cartel.ua';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const write = (rel, data) => {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
};
const copyDir = (from, to, filter = () => true) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b, filter);
    else if (filter(a)) fs.copyFileSync(a, b);
  }
};

async function get(p) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(ORIGIN + p, { redirect: 'manual', headers: { 'X-Forwarded-Proto': 'https' } });
    if (r.status === 429) { await sleep(5000); continue; }
    return r;
  }
  throw new Error('rate limited: ' + p);
}

function clean(html) {
  return html
    // CSP nonces are per-request; static hosting can't issue them (CSP lives in _headers)
    .replace(/\s+nonce="[^"]*"/g, '')
    // signed form tokens expire — the browser fills a timestamp instead (see static/js/site.js)
    .replace(/(<input type="hidden" name="_token" value=")[^"]*(")/g, '$1$2')
    // CMS login does not exist on the static site
    .replace(/\s*·\s*<a href="\/admin"[^>]*>[^<]*<\/a>/g, '')
    // old Node server asked crawlers to keep ?preview= pages out; harmless but pointless now
    .replace(/<meta name="robots" content="noindex, nofollow">/g, (m) => m);
}

// /about → about.html: Cloudflare Pages serves it at /about (a folder with index.html would 308 to /about/, but canonical URLs have no slash)
const fileFor = (p) => (p === '/' ? 'index.html' : p.replace(/^\//, '') + '.html');

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // ---------- 1. pages ----------
  const sitemap = await (await get('/sitemap.xml')).text();
  const queue = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(/\/$/, '') || '/');
  const seen = new Set();
  const pages = [];
  const broken = [];
  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    const r = await get(p);
    if (r.status >= 300 && r.status < 400) { broken.push(`${p} -> redirect ${r.status} ${r.headers.get('location')}`); continue; }
    if (r.status !== 200) { broken.push(`${p} -> ${r.status}`); continue; }
    const html = clean(await r.text());
    write(fileFor(p), html);
    pages.push(p);
    // follow internal links we did not know about
    for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) {
      const l = m[1].replace(/\/$/, '') || '/';
      if (/^\/(static|media|admin|api|favicon|apple|site\.webmanifest|robots|sitemap)/.test(l) || /\.[a-z0-9]{2,5}$/i.test(l)) continue;
      if (!seen.has(l)) queue.push(l);
    }
    await sleep(40);
  }
  console.log(`pages: ${pages.length}`);
  if (broken.length) console.log('skipped:\n  ' + broken.join('\n  '));

  // ---------- 2. 404 ----------
  const nf = await get('/this-page-does-not-exist');
  write('404.html', clean(await nf.text()));

  // ---------- 3. assets ----------
  const skipAdmin = (f) => !/[\\/]js[\\/](admin|editor)\.js$/.test(f) && !/[\\/]css[\\/]admin\.css$/.test(f);
  copyDir(path.join(ROOT, 'public'), path.join(OUT, 'static'), skipAdmin);

  // site.js: browser generates the anti-bot timestamp that used to be a signed server token
  const sj = path.join(OUT, 'static/js/site.js');
  let js = fs.readFileSync(sj, 'utf8');
  const hook = "$$('[data-form]').forEach(function (form) {";
  if (!js.includes(hook)) throw new Error('site.js form hook not found');
  const stamp = hook + "\n    var tk = $('input[name=\"_token\"]', form); if (tk) tk.value = String(Date.now());";
  js = js.replace(hook, () => stamp); // function form: a string would treat `$$` as an escaped `$`
  // job form submits only the vacancy id — send the visible title too, the static site has no DB to look it up
  const body = 'body: new FormData(form)';
  if (!js.includes(body)) throw new Error('site.js fetch body not found');
  const withTitle = "body: (function () { var fd = new FormData(form); var sel = $('select[name=\"vacancy\"]', form); if (sel && sel.selectedIndex >= 0) fd.append('vacancy_title', sel.options[sel.selectedIndex].text); return fd; })()";
  js = js.replace(body, () => withTitle);
  fs.writeFileSync(sj, js);

  const uploads = path.join(ROOT, 'uploads');
  const okMedia = /\.(webp|jpg|png|mp4|webm)$/;
  if (fs.existsSync(uploads)) copyDir(uploads, path.join(OUT, 'media'), (f) => okMedia.test(f));

  fs.copyFileSync(path.join(ROOT, 'public/img/favicon-32.png'), path.join(OUT, 'favicon.ico'));
  fs.copyFileSync(path.join(ROOT, 'public/img/apple-touch-icon.png'), path.join(OUT, 'apple-touch-icon.png'));

  // ---------- 4. generated endpoints ----------
  write('sitemap.xml', sitemap);
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${BASE_URL}/sitemap.xml\n`);
  write('site.webmanifest', JSON.stringify({
    name: 'CARTEL', short_name: 'CARTEL', start_url: '/', display: 'browser', background_color: '#f4f5f2', theme_color: '#13231e',
    icons: [{ src: '/static/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/static/img/logo-512.png', sizes: '512x512', type: 'image/png' }],
  }));

  // ---------- 5. _redirects (from the CMS table + language prefix) ----------
  const { DatabaseSync } = require('node:sqlite');
  const dbFile = path.join(ROOT, 'data', 'cartel.db');
  const lines = ['# generated by scripts/build-static.js', '/uk / 301', '/uk/* /:splat 301'];
  if (fs.existsSync(dbFile)) {
    const db = new DatabaseSync(dbFile, { readOnly: true });
    for (const r of db.prepare('SELECT from_path, to_path, code FROM redirects ORDER BY id').all()) {
      lines.push(`${r.from_path} ${r.to_path} ${r.code === 302 ? 302 : 301}`);
      if (r.to_path.startsWith('/')) lines.push(`/en${r.from_path} /en${r.to_path} ${r.code === 302 ? 302 : 301}`);
    }
    db.close();
  }
  write('_redirects', lines.join('\n') + '\n');

  // ---------- 6. _headers ----------
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://www.googletagmanager.com https://*.googletagmanager.com https://connect.facebook.net https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "media-src 'self' blob:",
    "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.facebook.com https://connect.facebook.net https://challenges.cloudflare.com",
    'frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://www.googletagmanager.com https://challenges.cloudflare.com',
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    "worker-src 'self' blob:", "manifest-src 'self'", 'upgrade-insecure-requests',
  ].join('; ');
  write('_headers', `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin

/static/*
  Cache-Control: public, max-age=604800
/static/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/media/*
  Cache-Control: public, max-age=2592000
/api/*
  Cache-Control: no-store
`);

  // ---------- 7. report ----------
  let files = 0, bytes = 0;
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { files++; bytes += fs.statSync(f).size; } } })(OUT);
  console.log(`done → ${OUT}\nfiles: ${files}, size: ${(bytes / 1048576).toFixed(1)} MB`);
})().catch((e) => { console.error(e); process.exit(1); });
