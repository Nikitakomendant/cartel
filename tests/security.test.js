'use strict';
/**
 * Security regression tests against a running instance with a FRESH database.
 *   BASE=http://localhost:3000 ADMIN_EMAIL=… ADMIN_PASSWORD=… node --test tests/security.test.js
 * Note: the last test deliberately triggers the temporary IP ban — restart the server afterwards.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.BASE || 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@cartel.ua';
const PASS = process.env.ADMIN_PASSWORD || 'TestAdmin12345';
const NEWPASS = 'Changed-Secret-2026';
let cookie = '';
let csrf = '';

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.auth !== false && cookie) headers.cookie = cookie;
  return fetch(BASE + path, { redirect: 'manual', ...opts, headers });
}
const form = (o) => new URLSearchParams(o).toString();
async function token(page, form = 'contact') {
  const html = await (await req(page, { auth: false })).text();
  return html.match(/name="_token" value="([^"]+)"/)[1];
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('security headers on public pages', async () => {
  const r = await req('/', { auth: false });
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src 'self' 'nonce-/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.ok(r.headers.get('referrer-policy'));
  assert.match(r.headers.get('permissions-policy'), /camera=\(\)/);
});

test('admin login: open-redirect blocked, cookie flags, session works', async () => {
  const r = await req('/admin/login', { method: 'POST', auth: false, headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE },
    body: form({ email: EMAIL, password: PASS, next: '//evil.example/x' }) });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/admin'); // not //evil.example
  const sc = r.headers.getSetCookie().find((c) => /=[^;]+;/.test(c) && !/Expires=Thu, 01 Jan 1970/.test(c));
  assert.match(sc, /HttpOnly/i);
  assert.match(sc, /SameSite=Lax/i);
  cookie = sc.split(';')[0];
  // first login forces a password change
  let page = await (await req('/admin/account')).text();
  csrf = page.match(/name="_csrf" value="([^"]+)"/)[1];
  const ch = await req('/admin/account/password', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE },
    body: form({ _csrf: csrf, current: PASS, password: NEWPASS, password2: NEWPASS }) });
  assert.equal(ch.status, 303);
  cookie = ch.headers.getSetCookie().find((c) => !/Expires=Thu, 01 Jan 1970/.test(c)).split(';')[0]; // session rotated after password change
  page = await (await req('/admin')).text();
  csrf = page.match(/data-csrf="([^"]+)"/)[1];
  assert.match(page, /Вітаємо/);
});

test('CSRF: state-changing admin requests without token or from foreign origin are rejected', async () => {
  const noToken = await req('/admin/c/brand/new', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE }, body: '' });
  assert.equal(noToken.status, 403);
  const foreign = await req('/admin/c/brand/new', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' }, body: form({ _csrf: csrf }) });
  assert.equal(foreign.status, 403);
  const api = await req('/admin/api/reorder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"type":"brand","ids":[]}' });
  assert.equal(api.status, 403);
});

test('unauthenticated access to CMS and APIs is refused', async () => {
  for (const p of ['/admin', '/admin/applications', '/admin/c/brand', '/admin/users']) {
    const r = await req(p, { auth: false });
    assert.equal(r.status, 302, p);
    assert.match(r.headers.get('location'), /^\/admin\/login/);
  }
  const j = await req('/admin/api/media', { auth: false, headers: { accept: 'application/json' } });
  assert.equal(j.status, 401);
});

test('stored XSS: scripts and javascript: URLs are stripped from CMS content', async () => {
  const r = await req('/admin/c/brand/new', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE }, body: form({ _csrf: csrf }) });
  const id = r.headers.get('location').match(/\/(\d+)$/)[1];
  const payload = {
    slug: 'xss-test',
    data: {
      name: { uk: 'XSS <img src=x onerror=alert(1)>', en: '' }, category: 'restaurant',
      description: { uk: '<p>ok</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src=x onerror=alert(2)><p onclick="alert(3)">t</p>', en: '' },
      website: 'javascript:alert(1)', instagram: 'data:text/html,<script>alert(1)</script>', menu_url: '/menu"><script>',
    },
  };
  const s = await req(`/admin/api/c/brand/${id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, origin: BASE }, body: JSON.stringify(payload) });
  assert.equal(s.status, 200, await s.text());
  const html = await (await req('/brands/xss-test', { auth: false })).text();
  assert.ok(!/<script>alert/.test(html), 'script tag rendered');
  assert.ok(!/<(img|p|a|svg)\b[^>]*\son(error|click|load)=/i.test(html), 'event handler rendered');
  assert.ok(!html.includes('/menu"'), 'URL with markup kept');
  assert.ok(!/href="javascript:/i.test(html), 'javascript: URL rendered');
  assert.ok(!/data:text\/html/.test(html));
  assert.match(html, /XSS &lt;img/); // shown as text, escaped
});

test('public forms: honeypot, timing token, validation, rate limit', async () => {
  // too fast (bot) — token younger than 3 s
  let t = await token('/contacts');
  let r = await req('/api/forms/contact', { method: 'POST', auth: false, headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: form({ _token: t, name: 'Bot', contact: 'bot@x.com', message: 'hi', consent: 'on' }) });
  assert.equal(r.status, 400);
  // forged token
  r = await req('/api/forms/contact', { method: 'POST', auth: false, headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: form({ _token: '1.abc.forged', name: 'Bot', contact: 'bot@x.com', message: 'hi', consent: 'on' }) });
  assert.equal(r.status, 400);
  // honeypot filled → fake success, nothing stored
  t = await token('/contacts'); await sleep(3200);
  r = await req('/api/forms/contact', { method: 'POST', auth: false, headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: form({ _token: t, website_url: 'http://spam', name: 'HoneyBot', contact: 'bot@x.com', message: 'hi', consent: 'on' }) });
  assert.equal(r.status, 200);
  // server-side validation (no consent, bad contact)
  t = await token('/contacts'); await sleep(3200);
  r = await req('/api/forms/contact', { method: 'POST', auth: false, headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: form({ _token: t, name: 'A', contact: 'not-an-email', message: 'hi' }) });
  assert.equal(r.status, 422);
  const d = await r.json();
  assert.ok(d.errors.contact && d.errors.consent);
  // valid → then replay of the same token is refused
  t = await token('/contacts'); await sleep(3200);
  const good = form({ _token: t, name: 'Real <b>Person</b>', contact: 'real@example.com', message: 'Hello', consent: 'on' });
  r = await req('/api/forms/contact', { method: 'POST', auth: false, headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: good });
  assert.equal(r.status, 200);
  r = await req('/api/forms/contact', { method: 'POST', auth: false, headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: good });
  assert.equal(r.status, 400, 'replayed token must be refused');
  // honeypot entry was not stored; real one is, and is escaped in the CMS
  const list = await (await req('/admin/submissions')).text();
  assert.ok(!list.includes('HoneyBot'));
  assert.match(list, /Real &lt;b&gt;Person&lt;\/b&gt;/);
  // rate limit: the limiter allows 6 attempts per 15 min per form (6 already used above)
  r = await req('/api/forms/contact', { method: 'POST', auth: false, headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: good });
  assert.equal(r.status, 429);
});

test('uploads: SVG/HTML disguised as images are rejected; CVs are not publicly reachable', async () => {
  const fd = new FormData();
  fd.append('files', new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], { type: 'image/svg+xml' }), 'logo.svg');
  fd.append('files', new Blob(['<html><script>alert(1)</script>'], { type: 'image/jpeg' }), 'photo.jpg');
  const r = await req('/admin/api/media', { method: 'POST', headers: { 'x-csrf-token': csrf, origin: BASE, accept: 'application/json' }, body: fd });
  const d = await r.json();
  assert.equal(d.items.length, 0);
  assert.equal(d.errors.length, 2);
  for (const p of ['/media/../data/cartel.db', '/media/2026/01/x.html', '/media/%2e%2e/%2e%2e/server.js', '/static/../server.js', '/data/cartel.db', '/data/private/cv/x.pdf', '/.git/config']) {
    const x = await req(p, { auth: false });
    assert.ok([400, 404].includes(x.status), `${p} → ${x.status}`);
  }
  const cv = await req('/admin/applications/1/cv', { auth: false });
  assert.equal(cv.status, 302);
});

test('SQL injection attempts in filters are harmless', async () => {
  const r = await req("/admin/applications?q=%27%20OR%201%3D1--&status=new%27%3B%20DROP%20TABLE%20users--&vacancy=1%20OR%201%3D1");
  assert.equal(r.status, 200);
  const users = await req('/admin/users');
  assert.equal(users.status, 200); // table still exists
});

test('account lockout after 5 wrong passwords', async () => {
  for (let i = 0; i < 5; i++) {
    await req('/admin/login', { method: 'POST', auth: false, headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE }, body: form({ email: EMAIL, password: 'wrong-' + i }) });
  }
  const r = await req('/admin/login', { method: 'POST', auth: false, headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE }, body: form({ email: EMAIL, password: NEWPASS }) });
  assert.equal(r.status, 401);
  assert.match(await r.text(), /заблоковано|Забагато/);
});

test('scanner probes get a temporary IP ban (run last)', async () => {
  for (const p of ['/wp-login.php', '/.env', '/phpmyadmin/', '/xmlrpc.php', '/.git/HEAD', '/vendor/phpunit/x']) await req(p, { auth: false });
  const r = await req('/', { auth: false });
  assert.equal(r.status, 429);
});
