'use strict';
/**
 * Optional PeopleForce integration: every application is mirrored as a candidate
 * (POST /recruitment/candidates). Enabled when PEOPLEFORCE_API_KEY is set and the
 * toggle in CMS → Налаштування → HR is on. Failures never block the application —
 * the status is stored and shown to HR.
 * PeopleForce requires an e-mail for candidates, so applications without e-mail
 * are kept on the site only.
 */
const config = require('./config');
const { getSetting } = require('./db');

async function pushCandidate(app) {
  const hr = getSetting('hr', {}) || {};
  if (!config.peopleforce.apiKey || !hr.peopleforce_enabled) return { status: 'off' };
  if (!app.email) return { status: 'skipped', error: 'немає email' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`${config.peopleforce.baseUrl}/recruitment/candidates`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-KEY': config.peopleforce.apiKey },
      body: JSON.stringify({
        full_name: app.name,
        email: app.email,
        phone_numbers: [app.phone].filter(Boolean),
        position: app.vacancy_title || undefined,
        cover_letter: app.message || undefined,
        consented_at: Math.floor(app.consent_at / 1000),
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return { status: 'error', error: `HTTP ${res.status}` };
    return { status: 'sent' };
  } catch (e) {
    return { status: 'error', error: String(e.message).slice(0, 150) };
  }
}

module.exports = { pushCandidate };
