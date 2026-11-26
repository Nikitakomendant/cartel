/* CARTEL — public site behaviour. No dependencies; Leaflet is loaded only on pages with a map. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cfg = {};
  try { cfg = JSON.parse(($('#i18n') || {}).textContent || '{}'); } catch (e) { /* noop */ }
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nonce = (document.currentScript && document.currentScript.nonce) || ($('script[nonce]') || {}).nonce || '';

  /* ---------- header ---------- */
  var header = $('[data-header]');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-solid', window.scrollY > 40); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- mobile menu ---------- */
  var menuBtn = $('[data-menu-btn]'), mobileNav = $('[data-mobile-nav]');
  if (menuBtn && mobileNav) {
    var label = $('.menu-btn__label', menuBtn);
    var setMenu = function (open) {
      menuBtn.setAttribute('aria-expanded', String(open));
      mobileNav.hidden = !open;
      document.body.classList.toggle('menu-open', open);
      if (label) label.textContent = open ? cfg.close : cfg.menu;
      if (open) { var first = $('a', mobileNav); if (first) first.focus(); }
    };
    menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !mobileNav.hidden) { setMenu(false); menuBtn.focus(); } });
    window.addEventListener('resize', function () { if (window.innerWidth >= 1100 && !mobileNav.hidden) setMenu(false); });
  }

  /* ---------- hero video ---------- */
  $$('video[data-autoplay]').forEach(function (v) {
    if (reduced) { v.removeAttribute('autoplay'); v.pause(); }
    var p = v.play && v.play(); if (p && p.catch) p.catch(function () { /* autoplay blocked: poster stays */ });
  });
  $$('[data-video-toggle]').forEach(function (btn) {
    var v = $('video', btn.closest('section'));
    if (!v) return;
    var sync = function () {
      btn.classList.toggle('is-paused', v.paused);
      btn.setAttribute('aria-label', v.paused ? btn.dataset.labelPlay : btn.dataset.labelPause);
    };
    btn.addEventListener('click', function () { if (v.paused) v.play(); else v.pause(); sync(); });
    v.addEventListener('play', sync); v.addEventListener('pause', sync); sync();
  });
  $$('[data-embed-play]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var box = btn.closest('[data-embed]');
      var f = document.createElement('iframe');
      f.src = box.dataset.embed + (box.dataset.embed.indexOf('?') > -1 ? '&' : '?') + 'autoplay=1';
      f.allow = 'autoplay; fullscreen; picture-in-picture';
      f.allowFullscreen = true; f.title = 'Video'; f.loading = 'lazy';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      box.innerHTML = ''; box.appendChild(f);
    });
  });

  /* ---------- brand index: photo follows the hovered name ---------- */
  $$('[data-brand-index]').forEach(function (root) {
    var frames = $$('[data-frame]', root), links = $$('[data-preview]', root);
    var show = function (i) {
      frames.forEach(function (f) { f.classList.toggle('is-active', f.dataset.frame === String(i)); });
      links.forEach(function (l) { l.classList.toggle('is-active', l.dataset.preview === String(i)); });
    };
    links.forEach(function (l) {
      l.addEventListener('mouseenter', function () { show(l.dataset.preview); });
      l.addEventListener('focus', function () { show(l.dataset.preview); });
    });
    show(0);
  });

  /* ---------- catalog tabs ---------- */
  $$('[data-catalog]').forEach(function (root) {
    var tabs = $$('[data-cat]', $('.tabs', root)), cards = $$('.brand-card', root), empty = $('.catalog__empty', root);
    var select = function (cat, push) {
      var n = 0;
      tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.cat === cat)); t.tabIndex = t.dataset.cat === cat ? 0 : -1; });
      cards.forEach(function (c) { var ok = cat === 'all' || c.dataset.cat === cat; c.hidden = !ok; if (ok) n++; });
      if (empty) empty.hidden = n > 0;
      if (push && history.replaceState) {
        var u = new URL(location.href);
        if (cat === 'all') u.searchParams.delete('c'); else u.searchParams.set('c', cat);
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      }
      document.dispatchEvent(new CustomEvent('catalog:filter', { detail: cat }));
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t.dataset.cat, true); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        var nx = tabs[(i + d + tabs.length) % tabs.length]; nx.focus(); nx.click();
      });
    });
    var initial = new URLSearchParams(location.search).get('c');
    if (initial && tabs.some(function (t) { return t.dataset.cat === initial; })) select(initial, false);
  });

  /* ---------- maps (Leaflet, loaded on demand) ---------- */
  var maps = $$('[data-map]');
  if (maps.length) {
    var loadLeaflet = function (cb) {
      if (window.L) return cb();
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/static/vendor/leaflet/leaflet.css'; document.head.appendChild(css);
      var s = document.createElement('script'); s.src = '/static/vendor/leaflet/leaflet.js'; s.nonce = nonce; s.onload = cb; document.head.appendChild(s);
    };
    var init = function (el) {
      var points = []; var labels = {};
      try { points = JSON.parse(el.dataset.points || '[]'); labels = JSON.parse(el.dataset.labels || '{}'); } catch (e) { return; }
      if (!points.length) return;
      var map = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      L.tileLayer(cfg.tiles || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: cfg.tilesAttribution || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      var markers = points.map(function (p) {
        var icon = L.divIcon({ className: '', html: '<span class="map-pin map-pin--' + p.cat + '"></span>', iconSize: [16, 16], iconAnchor: [8, 8] });
        var m = L.marker([p.lat, p.lng], { icon: icon, title: p.name, keyboard: true });
        var box = document.createElement('div');
        var strong = document.createElement('strong'); strong.textContent = p.name; box.appendChild(strong);
        if (labels[p.cat]) { var c = document.createElement('span'); c.textContent = labels[p.cat]; box.appendChild(c); }
        if (p.address) { var a = document.createElement('div'); a.textContent = p.address; box.appendChild(a); }
        if (p.url) { var l = document.createElement('a'); l.href = p.url; l.textContent = labels.more || '→'; box.appendChild(document.createElement('br')); box.appendChild(l); }
        m.bindPopup(box); m._cat = p.cat; m.addTo(map); return m;
      });
      var fit = function (list) {
        if (!list.length) return;
        if (list.length === 1) map.setView(list[0].getLatLng(), parseInt(el.dataset.zoom || '14', 10));
        else map.fitBounds(L.featureGroup(list).getBounds().pad(0.2), { maxZoom: 15 });
      };
      fit(markers);
      document.addEventListener('catalog:filter', function (e) {
        var cat = e.detail;
        var vis = [];
        markers.forEach(function (m) { var ok = cat === 'all' || m._cat === cat; if (ok) { m.addTo(map); vis.push(m); } else map.removeLayer(m); });
        fit(vis);
      });
      map.once('focus', function () { map.scrollWheelZoom.enable(); });
    };
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); loadLeaflet(function () { init(en.target); }); } });
    }, { rootMargin: '300px' }) : null;
    maps.forEach(function (m) { if (io) io.observe(m); else loadLeaflet(function () { init(m); }); });
  }

  /* ---------- lightbox ---------- */
  var groups = $$('[data-gallery]');
  if (groups.length && window.HTMLDialogElement) {
    var dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.innerHTML = '<div class="lightbox__img"><img alt=""></div><button type="button" class="lightbox__btn lightbox__close"></button><button type="button" class="lightbox__btn lightbox__prev">‹</button><button type="button" class="lightbox__btn lightbox__next">›</button>';
    document.body.appendChild(dlg);
    var im = $('img', dlg), list = [], idx = 0;
    $('.lightbox__close', dlg).textContent = cfg.close || '×';
    $('.lightbox__prev', dlg).setAttribute('aria-label', cfg.prev || 'Prev');
    $('.lightbox__next', dlg).setAttribute('aria-label', cfg.next || 'Next');
    var show = function () { im.src = list[idx].dataset.full; im.alt = list[idx].getAttribute('aria-label') || ''; var multi = list.length > 1; $('.lightbox__prev', dlg).hidden = !multi; $('.lightbox__next', dlg).hidden = !multi; };
    var go = function (d) { idx = (idx + d + list.length) % list.length; show(); };
    groups.forEach(function (g) {
      var items = $$('[data-full]', g);
      items.forEach(function (it, i) {
        it.addEventListener('click', function () { list = items; idx = i; show(); dlg.showModal(); });
      });
    });
    $('.lightbox__close', dlg).addEventListener('click', function () { dlg.close(); });
    $('.lightbox__prev', dlg).addEventListener('click', function () { go(-1); });
    $('.lightbox__next', dlg).addEventListener('click', function () { go(1); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.classList.contains('lightbox__img')) dlg.close(); });
    dlg.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); });
    var sx = null;
    dlg.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener('touchend', function (e) { if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); sx = null; }, { passive: true });
  }

  /* ---------- quotes ---------- */
  $$('[data-quotes]').forEach(function (root) {
    var items = $$('.quote', root), count = $('[data-quote-count]', root), i = 0;
    if (items.length < 2) return;
    var show = function (n) { i = (n + items.length) % items.length; items.forEach(function (q, k) { q.hidden = k !== i; }); if (count) count.textContent = (i + 1) + ' / ' + items.length; };
    $('[data-quote-prev]', root).addEventListener('click', function () { show(i - 1); });
    $('[data-quote-next]', root).addEventListener('click', function () { show(i + 1); });
  });

  /* ---------- forms ---------- */
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var phoneOk = function (v) { return /^[+()\d\s-]{7,22}$/.test(v) && v.replace(/\D/g, '').length >= 9; };
  function setError(form, name, msg) {
    var f = $('[data-field="' + name + '"]', form); if (!f) return;
    var e = $('.field__error', f);
    f.classList.toggle('is-invalid', !!msg);
    if (e) { e.textContent = msg || ''; e.hidden = !msg; }
    var inp = $('input, textarea, select', f);
    if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
  }
  function validate(form) {
    var errs = {};
    $$('[required]', form).forEach(function (el) {
      if (el.type === 'radio') { if (!$('input[name="' + el.name + '"]:checked', form)) errs[el.name] = cfg.required; return; }
      if (el.type === 'checkbox') { if (!el.checked) errs[el.name] = cfg.consent; return; }
      if (!el.value.trim()) errs[el.name] = cfg.required;
    });
    $$('[data-validate]', form).forEach(function (el) {
      var v = el.value.trim(); if (!v || errs[el.name]) return;
      var t = el.dataset.validate;
      if (t === 'email' && !emailRe.test(v)) errs[el.name] = cfg.email;
      if (t === 'phone' && !phoneOk(v)) errs[el.name] = cfg.phone;
      if (t === 'contact' && !emailRe.test(v) && !phoneOk(v)) errs[el.name] = cfg.contact;
    });
    $$('input[type=file]', form).forEach(function (el) {
      var f = el.files && el.files[0]; if (!f) return;
      if (f.size > parseInt(el.dataset.max || '10485760', 10) || !/\.(pdf|docx?|jpe?g|png)$/i.test(f.name)) errs[el.name] = cfg.file;
    });
    return errs;
  }
  $$('[data-form]').forEach(function (form) {
    var btn = $('button[type=submit]', form), result = $('.form-result', form), gen = $('.form-error', form);
    var btnText = btn ? btn.textContent : '';
    $$('input, textarea, select', form).forEach(function (el) {
      el.addEventListener('input', function () { setError(form, el.name, ''); });
      el.addEventListener('change', function () { setError(form, el.name, ''); });
    });
    // result marker from the no-JS fallback
    if (/[?&]form=sent/.test(location.search) && location.hash === '#form' && result) { form.classList.add('is-sent'); result.hidden = false; }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      $$('.field', form).forEach(function (f) { if (f.dataset.field) setError(form, f.dataset.field, ''); });
      if (gen) gen.hidden = true;
      var errs = validate(form), keys = Object.keys(errs);
      if (keys.length) {
        keys.forEach(function (k) { setError(form, k, errs[k]); });
        var first = $('[aria-invalid="true"]', form); if (first) first.focus();
        return;
      }
      btn.disabled = true; btn.textContent = cfg.sending;
      fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, credentials: 'same-origin' })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (d) {
          if (d.ok) {
            $('.form-result__text', result).textContent = d.message || '';
            form.classList.add('is-sent'); result.hidden = false; result.focus();
            if (window.dataLayer) window.dataLayer.push({ event: 'form_submit', form: form.action.split('/').pop() });
            if (window.fbq) window.fbq('track', 'Lead');
            return;
          }
          if (d.errors) Object.keys(d.errors).forEach(function (k) { setError(form, k, d.errors[k]); });
          if (gen) { gen.textContent = d.error || cfg.error; gen.hidden = false; }
          if (d.reload) setTimeout(function () { location.reload(); }, 2500);
        })
        .catch(function () { if (gen) { gen.textContent = cfg.error; gen.hidden = false; } })
        .then(function () { btn.disabled = false; btn.textContent = btnText; });
    });
  });

  /* ---------- turnstile (only when enabled in CMS) ---------- */
  if ($('.cf-turnstile')) {
    var ts = document.createElement('script'); ts.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; ts.async = true; ts.nonce = nonce; document.head.appendChild(ts);
  }
})();
