'use strict';
/**
 * E-mail notifications for form submissions. SMTP credentials come from the
 * environment only. If SMTP is not configured, submissions are still saved in
 * the CMS and the problem is visible in the admin panel.
 */
const nodemailer = require('nodemailer');
const config = require('./config');
const sec = require('./security');

let transport = null;
function getTransport() {
  if (!config.smtp.host) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      pool: true, maxConnections: 2, connectionTimeout: 15000, socketTimeout: 30000,
    });
  }
  return transport;
}
const isConfigured = () => !!config.smtp.host;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** rows: [[label, value], …] → simple, safe HTML e-mail */
function renderHtml(title, rows, footer) {
  const tr = rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) =>
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

/**
 * @returns {Promise<'sent'|'not_configured'|'no_recipients'|string>} status for logging in DB
 */
async function send({ to, subject, title, rows, footer, replyTo, attachments }) {
  const recipients = (Array.isArray(to) ? to : String(to || '').split(/[,;\s]+/)).filter(sec.isEmail);
  if (!recipients.length) return 'no_recipients';
  const t = getTransport();
  if (!t) return 'not_configured';
  try {
    await t.sendMail({
      from: config.smtp.from,
      to: recipients.join(', '),
      subject: sec.cleanLine(subject, 200),
      ...(replyTo && sec.isEmail(replyTo) ? { replyTo } : {}),
      html: renderHtml(title, rows, footer),
      text: renderText(title, rows, footer),
      attachments,
    });
    return 'sent';
  } catch (e) {
    console.error('[mail] send failed:', e.message);
    return 'error: ' + String(e.message).slice(0, 180);
  }
}

module.exports = { send, isConfigured };
