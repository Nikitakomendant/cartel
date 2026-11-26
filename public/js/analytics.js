/* Analytics with Google Consent Mode v2: nothing that sets cookies runs before the visitor agrees.
   GTM / GA4 load in "denied" mode (cookieless pings); Meta Pixel loads only after consent. */
(function () {
  'use strict';
  var el = document.getElementById('analytics-config');
  if (!el) return;
  var c = {}; try { c = JSON.parse(el.textContent); } catch (e) { return; }
  var nonce = el.nonce || '';
  var KEY = 'cartel_consent';
  var stored = null; try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  var granted = stored === 'granted' || (c.banner === false);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 500 });
  if (granted) gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });

  function add(src) { var s = document.createElement('script'); s.async = true; s.src = src; s.nonce = nonce; document.head.appendChild(s); }
  var idOk = function (v, re) { return typeof v === 'string' && re.test(v); };
  if (idOk(c.gtm, /^GTM-[A-Z0-9]{4,12}$/)) {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    add('https://www.googletagmanager.com/gtm.js?id=' + c.gtm);
  } else if (idOk(c.ga4, /^G-[A-Z0-9]{4,14}$/)) {
    add('https://www.googletagmanager.com/gtag/js?id=' + c.ga4);
    gtag('js', new Date()); gtag('config', c.ga4, { anonymize_ip: true });
  }
  function loadPixel() {
    if (!idOk(c.pixel, /^\d{8,20}$/) || window.fbq) return;
    var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!window._fbq) window._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    add('https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', c.pixel); window.fbq('track', 'PageView');
  }
  if (granted) loadPixel();

  function decide(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* noop */ }
    var g = v === 'granted' ? 'granted' : 'denied';
    gtag('consent', 'update', { ad_storage: g, ad_user_data: g, ad_personalization: g, analytics_storage: g });
    if (v === 'granted') loadPixel();
    var b = document.querySelector('[data-cookie]'); if (b) b.hidden = true;
  }
  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.querySelector('[data-cookie]');
    if (!banner) return;
    if (!stored && c.banner !== false) banner.hidden = false;
    banner.addEventListener('click', function (e) { var v = e.target.getAttribute('data-consent'); if (v) decide(v); });
    var s = document.querySelector('[data-cookie-settings]');
    if (s) s.addEventListener('click', function () { banner.hidden = false; });
  });
})();
