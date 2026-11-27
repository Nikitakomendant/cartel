/**
 * POST /api/forms/{cooperation|contact|apply}
 *
 * Cloudflare Pages Function — replaces the Express form handler of the old Node CMS.
 * Mail goes out through the Resend HTTP API (SMTP is not available on Workers).
 *
 * Environment variables (Pages → Settings → Variables and Secrets):
 *   RESEND_API_KEY      required   API key from resend.com (secret)
 *   MAIL_FROM           required   e.g.  CARTEL <no-reply@cartel.ua>   (domain must be verified in Resend)
 *   TURNSTILE_SECRET    optional   enables Cloudflare Turnstile check (also add the widget, see README)
 *   MAIL_TO_COOPERATION optional   overrides recipients (comma separated)
 *   MAIL_TO_CONTACT     optional   overrides recipients for the contact form (all topics)
 *   MAIL_TO_HR          optional   overrides recipients for job applications
 */

const DEFAULTS = {
  cooperation: ['cartel.marketing.info@gmail.com'],
  contact: ['cartel.marketing.info@gmail.com'],
  hr: ['hr@carte-l.com'],
  // order matches the <select name="topic"> on the contacts page
  topics: [
    { label: 'Бронювання та загальні питання', to: 'cartel.marketing.info@gmail.com' },
    { label: 'Корпоративи, бенкети, весілля', to: 'event@carte-l.com' },
    { label: 'Працевлаштування', to: 'hr@carte-l.com' },
    { label: 'Маркетинг', to: 'cartel.marketing.info@gmail.com' },
    { label: 'Постачання продуктів', to: 'zakaz@carte-l.com' },
    { label: 'Закупівля обладнання', to: 'kondratiev@carte-l.com' },
  ],
};

const MAX_CV = 10 * 1024 * 1024;

const T = {
  uk: {
    ok: 'Ми отримали ваше звернення і відповімо найближчим часом.',
    okApply: 'Ми отримали ваш відгук. Рекрутер звʼяжеться з вами найближчим часом.',
    error: 'Не вдалося надіслати. Перевірте поля і спробуйте ще раз.',
    required: 'Заповніть це поле.', consent: 'Потрібна згода на обробку даних.',
    contact: 'Вкажіть email або телефон.', phone: 'Вкажіть номер телефону, напр. +380 67 000 00 00.',
    email: 'Вкажіть коректний email.', file: 'Файл не підходить: дозволені PDF, DOC, DOCX, JPG, PNG до 10 МБ.',
    token: 'Сторінка застаріла. Оновіть її та надішліть форму ще раз.',
    unavailable: 'Сервіс тимчасово недоступний. Зателефонуйте нам або спробуйте пізніше.',
  },
  en: {
    ok: 'We have received your message and will reply shortly.',
    okApply: 'We have received your application. Our recruiter will contact you shortly.',
    error: 'Could not send. Please check the fields and try again.',
    required: 'Please fill in this field.', consent: 'Consent is required.',
    contact: 'Please enter an email or phone number.', phone: 'Please enter a phone number, e.g. +380 67 000 00 00.',
    email: 'Please enter a valid email.', file: 'File not accepted: PDF, DOC, DOCX, JPG, PNG up to 10 MB.',
    token: 'This page has expired. Please reload it and submit again.',
    unavailable: 'The service is temporarily unavailable. Please call us or try again later.',
  },
};

// ---------- helpers (ported from src/security.js) ----------
const cleanText = (s, max = 2000) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const cleanLine = (s, max = 300) => cleanText(s, max).replace(/[\r\n]+/g, ' ');
const isEmail = (s) => /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,190}\.[A-Za-z]{2,}$/.test(String(s || ''));
const isPhone = (s) => /^[+()\d\s-]{7,22}$/.test(String(s || '')) && String(s).replace(/\D/g, '').length >= 9;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = (v, fallback) => (v ? String(v).split(/[,;\s]+/).filter(isEmail) : fallback).filter(Boolean);

function sniffCv(bytes) {
  const h = (n) => Array.from(bytes.subarray(0, n), (b) => b.toString(16).padStart(2, '0')).join('');
  const head = h(8);
  if (head.startsWith('25504446')) return { ext: 'pdf', mime: 'application/pdf' };
  if (head.startsWith('ffd8ff')) return { ext: 'jpg', mime: 'image/jpeg' };
  if (head.startsWith('89504e470d0a1a0a')) return { ext: 'png', mime: 'image/png' };
  if (head === 'd0cf11e0a1b11ae1') return { ext: 'doc', mime: 'application/msword' };
  if (head.startsWith('504b0304')) {
    const txt = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
    if (txt.includes('[Content_Types].xml') || txt.includes('word/')) {
      return { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    }
  }
  return null;
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function renderHtml(title, rows, footer) {
  const tr = rows.filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:8px 16px 8px 0;color:#667;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:8px 0;color:#122;white-space:pre-wrap">${esc(v)}</td></tr>`).join('');
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;background:#f4f5f2;padding:24px">
  <div style="max-width:640px;margin:auto;background:#fff;padding:28px;border:1px solid #dde2dd">
  <h2 style="margin:0 0 16px;font-weight:600;color:#13231e">${esc(title)}</h2>
  <table style="border-collapse:collapse;width:100%">${tr}</table>
  ${footer ? `<p style="margin-top:24px;color:#667;font-size:13px">${esc(footer)}</p>` : ''}
  </div></body></html>`;
}
const renderText = (title, rows, footer) =>
  `${title}\n\n${rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${footer || ''}`;

async function sendMail(env, { to, subject, title, rows, footer, replyTo, attachments }) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return { ok: false, reason: 'not_configured' };
  if (!to.length) return { ok: false, reason: 'no_recipients' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM, to, subject: cleanLine(subject, 200),
        html: renderHtml(title, rows, footer), text: renderText(title, rows, footer),
        ...(replyTo && isEmail(replyTo) ? { reply_to: replyTo } : {}),
        ...(attachments?.length ? { attachments } : {}),
      }),
    });
    if (!r.ok) console.error('[mail] resend failed', r.status, (await r.text()).slice(0, 300));
    return { ok: r.ok, reason: r.ok ? 'sent' : `http_${r.status}` };
  } catch (e) {
    console.error('[mail] resend unreachable', e && e.message);
    return { ok: false, reason: 'network' };
  }
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token || ''), remoteip: ip || '' }),
    });
    return !!(await r.json()).success;
  } catch { return true; } // fail open — the other layers still apply
}

async function spamGate(env, b, ip) {
  if (b.website_url || b.fax) return 'honeypot';
  // browser writes Date.now() into _token on page load (static/js/site.js)
  const age = Date.now() - parseInt(b._token, 10);
  if (!Number.isFinite(age)) return 'invalid';
  if (age < 3000) return 'too_fast';
  if (age > 6 * 3600 * 1000) return 'expired';
  if (!(await verifyTurnstile(env, b['cf-turnstile-response'], ip))) return 'captcha';
  const text = Object.values(b).filter((v) => typeof v === 'string').join(' ');
  if ((text.match(/https?:\/\//g) || []).length > 6) return 'links';
  if (/\b(viagra|casino|slot ?gacor|judi bola|togel|porn|crypto airdrop)\b/i.test(text)) return 'keywords';
  return null;
}

// ---------- handler ----------
export async function onRequestPost({ request, env, params }) {
  const form = params.form;
  const wantsJson = (request.headers.get('accept') || '').includes('application/json');
  const url = new URL(request.url);

  const respond = (status, body) => {
    if (wantsJson) return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    // no-JS fallback: back to the page with a result marker
    let back = new URL('/', url);
    try { const ref = new URL(request.headers.get('referer') || '/', url); if (ref.origin === url.origin) back = ref; } catch { /* keep default */ }
    back.searchParams.set('form', body.ok ? 'sent' : 'error');
    return new Response(null, { status: 303, headers: { Location: back.pathname + back.search + '#form' } });
  };

  if (!['cooperation', 'contact', 'apply'].includes(form)) return Response.json({ ok: false }, { status: 404 });

  // same-origin only
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return Response.json({ ok: false }, { status: 403 });

  let fd;
  try { fd = await request.formData(); } catch { return respond(400, { ok: false, error: T.uk.error }); }
  const b = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string') b[k] = v;
  const file = fd.get('cv');

  const lang = b.lang === 'en' ? 'en' : 'uk';
  const s = T[lang];
  const ip = request.headers.get('cf-connecting-ip') || '';

  const spam = await spamGate(env, b, ip);
  if (spam) {
    if (['too_fast', 'expired', 'invalid'].includes(spam)) return respond(400, { ok: false, error: s.token, reload: true });
    return respond(200, { ok: true, message: s.ok }); // pretend success to bots
  }

  const errors = {};
  const field = (k, max = 300) => cleanLine(b[k], max);
  const name = field('name', 120);
  if (!name) errors.name = s.required;
  if (!['on', '1', 'true'].includes(b.consent)) errors.consent = s.consent;

  // ---- cooperation / contact ----
  if (form === 'cooperation' || form === 'contact') {
    const contact = field('contact', 150);
    if (!contact || (!isEmail(contact) && !isPhone(contact))) errors.contact = s.contact;
    let to, rows, subject, title;

    if (form === 'cooperation') {
      const company = field('company', 200);
      const direction = ['business', 'creators'].includes(b.direction) ? b.direction : '';
      const links = cleanText(b.links, 600);
      const proposal = cleanText(b.proposal, 5000);
      if (!company) errors.company = s.required;
      if (!direction) errors.direction = s.required;
      if (!proposal) errors.proposal = s.required;
      to = list(env.MAIL_TO_COOPERATION, DEFAULTS.cooperation);
      subject = `Співпраця: ${name}`;
      title = 'Нова заявка на співпрацю';
      rows = [['Напрям', direction === 'creators' ? 'Creators & Influencers' : 'Business Cooperation'], ['Імʼя', name], ['Компанія / профіль', company], ['Контакт', contact], ['Сайт / соцмережі', links], ['Пропозиція', proposal], ['Мова сайту', lang.toUpperCase()]];
    } else {
      const message = cleanText(b.message, 5000);
      if (!message) errors.message = s.required;
      to = list(env.MAIL_TO_CONTACT, DEFAULTS.contact);
      let topic = '';
      const ti = parseInt(b.topic, 10);
      if (Number.isInteger(ti) && DEFAULTS.topics[ti]) {
        topic = DEFAULTS.topics[ti].label;
        if (!env.MAIL_TO_CONTACT) to = [DEFAULTS.topics[ti].to];
      }
      subject = `Звернення з сайту: ${name}`;
      title = 'Нове звернення з сайту';
      rows = [['Тема', topic], ['Імʼя', name], ['Контакт', contact], ['Повідомлення', message], ['Мова сайту', lang.toUpperCase()]];
    }
    if (Object.keys(errors).length) return respond(422, { ok: false, errors, error: s.error });

    const res = await sendMail(env, { to, subject, title, rows, replyTo: isEmail(contact) ? contact : undefined, footer: `Надіслано з ${url.host}` });
    if (!res.ok) return respond(502, { ok: false, error: s.unavailable });
    return respond(200, { ok: true, message: s.ok });
  }

  // ---- job application ----
  const phone = field('phone', 40);
  if (!isPhone(phone)) errors.phone = s.phone;
  const email = field('email', 200);
  if (email && !isEmail(email)) errors.email = s.email;

  let attachments;
  if (file && typeof file === 'object' && file.size) {
    if (file.size > MAX_CV) errors.cv = s.file;
    else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = sniffCv(bytes);
      if (!type) errors.cv = s.file;
      else {
        const safeName = cleanLine(file.name, 150).replace(/[^\p{L}\p{N}._ -]/gu, '_') || `cv.${type.ext}`;
        attachments = [{ filename: safeName, content: toBase64(bytes) }];
      }
    }
  }
  if (Object.keys(errors).length) return respond(422, { ok: false, errors, error: s.error });

  const vacancyTitle = cleanLine(b.vacancy_title, 200) || (b.vacancy ? `Вакансія #${cleanLine(b.vacancy, 20)}` : 'Загальна анкета');
  const message = cleanText(b.message, 3000);
  const res = await sendMail(env, {
    to: list(env.MAIL_TO_HR, DEFAULTS.hr),
    subject: `Відгук на вакансію: ${vacancyTitle} — ${name}`,
    title: `Новий відгук: ${vacancyTitle}`,
    rows: [['Вакансія', vacancyTitle], ['Імʼя', name], ['Телефон', phone], ['Email', email], ['Коментар', message], ['Резюме', attachments ? 'у вкладенні' : 'не додано']],
    replyTo: email || undefined,
    footer: `Надіслано з ${url.host}`,
    attachments,
  });
  if (!res.ok) return respond(502, { ok: false, error: s.unavailable });
  return respond(200, { ok: true, message: s.okApply });
}

// anything but POST
export const onRequest = () => new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
