/* CARTEL CMS — content editor.
   Forms are generated from the server schema (src/schema.js), so every content type,
   block and settings page uses the same controls. No dependencies (Leaflet optional). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var A = window.CMS.base;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { n.dataset[d] = v[d]; });
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null && c !== false) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  var uid = (function () { var i = 0; return function (p) { return (p || 'f') + (++i); }; })();
  var rid = function () { return Math.random().toString(36).slice(2, 10); };

  /* =====================================================================
     Media library (standalone page and picker modal)
     ===================================================================== */
  function mediaLibrary(root, opts) {
    opts = opts || {};
    var st = { items: [], page: 1, pages: 1, q: '', sel: opts.selected ? opts.selected.slice() : [], loading: false };
    var kind = opts.kind || '';
    var search = el('input', { type: 'search', placeholder: 'Пошук за назвою або описом', 'aria-label': 'Пошук' });
    var fileInput = el('input', { type: 'file', multiple: true, accept: kind === 'video' ? 'video/mp4,video/webm' : kind === 'image' ? 'image/jpeg,image/png,image/webp,image/avif' : 'image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm', id: uid('up'), hidden: true });
    var drop = el('div', { class: 'drop' }, ['Перетягніть файли сюди або ', el('label', { for: fileInput.id, text: 'оберіть на компʼютері' }), fileInput]);
    var progress = el('div', { class: 'upl', 'aria-live': 'polite' });
    var grid = el('div', { class: 'mgrid' });
    var more = el('button', { type: 'button', class: 'btn', hidden: true, text: 'Показати ще' });
    var detail = el('div');
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'medialib__bar' }, [search]));
    root.appendChild(drop); root.appendChild(progress); root.appendChild(detail); root.appendChild(grid); root.appendChild(more);

    function load(reset) {
      if (reset) { st.page = 1; st.items = []; }
      st.loading = true;
      fetch(A + '/api/media?kind=' + kind + '&q=' + encodeURIComponent(st.q) + '&page=' + st.page, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); }).then(function (d) { st.items = st.items.concat(d.items || []); st.pages = d.pages; render(); });
    }
    function card(m) {
      var selected = st.sel.indexOf(m.id) > -1;
      var b = el('button', { type: 'button', class: 'mcard' + (selected ? ' sel' : ''), 'aria-pressed': String(selected), title: m.name }, [
        el('span', { class: 'mcard__img' }, [m.thumb ? el('img', { src: m.thumb, alt: '', loading: 'lazy' }) : el('span', { text: '▶ відео' })]),
        el('span', { class: 'mcard__name', text: m.name || ('#' + m.id) }),
      ]);
      b.addEventListener('click', function () {
        if (opts.onPick) {
          if (opts.multiple) { var i = st.sel.indexOf(m.id); if (i > -1) st.sel.splice(i, 1); else st.sel.push(m.id); render(); if (opts.onChange) opts.onChange(st.sel, st.items); }
          else { opts.onPick([m]); }
        } else showDetail(m);
      });
      return b;
    }
    function render() {
      grid.innerHTML = '';
      if (!st.items.length) grid.appendChild(el('p', { class: 'muted', text: st.q ? 'Нічого не знайдено.' : 'Ще немає файлів — завантажте перші.' }));
      st.items.forEach(function (m) { grid.appendChild(card(m)); });
      more.hidden = st.page >= st.pages;
    }
    more.addEventListener('click', function () { st.page++; load(false); });
    var tmr; search.addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(function () { st.q = search.value.trim(); load(true); }, 250); });

    function upload(files) {
      files = Array.prototype.slice.call(files || []);
      if (!files.length) return;
      var fd = new FormData();
      files.forEach(function (f) { fd.append('files', f); });
      var line = el('div', { text: 'Завантаження ' + files.length + ' файл(ів)… 0%' });
      progress.appendChild(line);
      var x = new XMLHttpRequest();
      x.open('POST', A + '/api/media');
      x.setRequestHeader('X-CSRF-Token', window.CMS.csrf);
      x.setRequestHeader('Accept', 'application/json');
      x.upload.onprogress = function (e) { if (e.lengthComputable) line.textContent = 'Завантаження… ' + Math.round(e.loaded / e.total * 100) + '% (обробка фото триває кілька секунд)'; };
      x.onload = function () {
        var d = {}; try { d = JSON.parse(x.responseText); } catch (e) { /* noop */ }
        line.textContent = (d.items && d.items.length ? 'Готово: ' + d.items.length + ' файл(ів).' : '') + (d.errors && d.errors.length ? ' Помилки: ' + d.errors.join('; ') : '') + (d.error ? ' ' + d.error : '');
        line.className = d.errors && d.errors.length || d.error ? 'err' : '';
        setTimeout(function () { if (!line.className) line.remove(); }, 4000);
        (d.items || []).forEach(function (m) { st.items.unshift(m); });
        if (opts.onPick && d.items && d.items.length) {
          if (opts.multiple) { d.items.forEach(function (m) { st.sel.push(m.id); }); if (opts.onChange) opts.onChange(st.sel, st.items); }
          else if (d.items.length === 1) { opts.onPick([d.items[0]]); return; }
        }
        render();
      };
      x.onerror = function () { line.textContent = 'Помилка мережі під час завантаження.'; line.className = 'err'; };
      x.send(fd);
    }
    fileInput.addEventListener('change', function () { upload(fileInput.files); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { upload(e.dataTransfer.files); });

    function showDetail(m) {
      detail.innerHTML = '';
      var langs = (window.__langs || [{ code: 'uk', name: 'Українська' }, { code: 'en', name: 'English' }]);
      var alts = {};
      var inputs = langs.map(function (l) {
        var i = el('input', { value: (m.alt && m.alt[l.code]) || '', maxlength: 250 });
        alts[l.code] = i;
        return el('label', { class: 'f' }, ['Опис (alt) — ' + l.name, i]);
      });
      var saveBtn = el('button', { type: 'button', class: 'btn btn--primary btn--sm', text: 'Зберегти опис' });
      saveBtn.addEventListener('click', function () {
        var alt = {}; Object.keys(alts).forEach(function (k) { alt[k] = alts[k].value; });
        window.CMS.api(A + '/api/media/' + m.id, { alt: alt }).then(function (d) { if (d.ok) { m.alt = alt; window.CMS.toast('Збережено'); } });
      });
      var del = el('button', { type: 'button', class: 'btn btn--sm btn--danger', text: 'Видалити файл' });
      del.addEventListener('click', function () {
        window.CMS.api(A + '/api/media/' + m.id + '/delete', {}).then(function (d) {
          if (d._status === 409) {
            var where = d.used.map(function (u) { return '• ' + u.title; }).join('\n');
            if (!confirm('Файл використовується:\n' + where + '\n\nВсе одно видалити? На цих сторінках зникне зображення.')) return;
            return window.CMS.api(A + '/api/media/' + m.id + '/delete', { force: true });
          }
          if (!confirm('Видалити файл?')) return null;
          return window.CMS.api(A + '/api/media/' + m.id + '/delete', { force: true });
        }).then(function (d) { if (d && d.ok) { st.items = st.items.filter(function (x) { return x.id !== m.id; }); detail.innerHTML = ''; render(); window.CMS.toast('Видалено'); } });
      });
      detail.appendChild(el('div', { class: 'mdetail' }, [
        m.kind === 'image' ? el('img', { src: m.thumb, alt: '' }) : el('video', { src: m.url, controls: true, preload: 'metadata' }),
        el('div', { class: 'stack' }, [
          el('strong', { text: m.name || ('#' + m.id) }),
          el('span', { class: 'small muted', text: (m.w ? m.w + '×' + m.h + ' px · ' : '') + Math.ceil(m.size / 1024) + ' КБ' }),
        ].concat(inputs).concat([el('div', { class: 'media-pick__btns' }, [saveBtn, el('a', { class: 'btn btn--sm', href: m.url, target: '_blank', rel: 'noopener', text: 'Відкрити' }), del])])),
      ]));
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    load(true);
    return { get selection() { return st.sel; }, items: function () { return st.items; } };
  }

  function openPicker(opts, cb) {
    var box, lib, chosen = [];
    var close = function () { modal.remove(); document.removeEventListener('keydown', esc); };
    var esc = function (e) { if (e.key === 'Escape') close(); };
    var confirmBtn = el('button', { type: 'button', class: 'btn btn--primary', text: 'Додати вибрані', hidden: !opts.multiple });
    var root = el('div', { class: 'medialib' });
    var modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Медіатека' }, [
      box = el('div', { class: 'modal__box' }, [
        el('div', { class: 'modal__head' }, [el('h2', { text: opts.kind === 'video' ? 'Оберіть відео' : opts.multiple ? 'Оберіть фото (можна кілька)' : 'Оберіть фото' }), el('button', { type: 'button', class: 'btn', text: 'Закрити', onclick: close })]),
        root,
        el('div', { class: 'modal__foot' }, [el('span', { class: 'muted small', text: opts.multiple ? 'Клікніть на фото, щоб вибрати; ще раз — щоб зняти вибір.' : 'Клікніть на файл, щоб вибрати.' }), confirmBtn]),
      ]),
    ]);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', esc);
    document.body.appendChild(modal);
    lib = mediaLibrary(root, {
      kind: opts.kind, multiple: opts.multiple,
      onPick: function (items) { cb(items); close(); },
      onChange: function (sel, items) { chosen = sel.map(function (id) { return items.find(function (m) { return m.id === id; }); }).filter(Boolean); confirmBtn.textContent = 'Додати вибрані (' + sel.length + ')'; },
    });
    confirmBtn.addEventListener('click', function () { cb(chosen); close(); });
  }

  var libRoot = $('#media-library');
  if (libRoot) mediaLibrary(libRoot, {});

  /* =====================================================================
     Editor
     ===================================================================== */
  var bootEl = $('#boot');
  if (!bootEl) return;
  var B = JSON.parse(bootEl.textContent);
  var S = B.schema;
  var langs = B.langs;
  window.__langs = langs;
  var mediaMap = B.refs.mediaMap || {};
  var options = B.refs.options || {};
  var state = B.data || {};
  var editLang = langs[0].code;
  var dirty = false;
  var root = $('#editor');
  document.body.dataset.editLang = editLang;

  function markDirty() {
    if (!dirty) { dirty = true; var s = $('[data-saved]'); if (s) s.textContent = 'Є незбережені зміни'; }
  }
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- language switch ----------
  var sw = $('[data-lang-switch]');
  function refreshLang() {
    document.body.dataset.editLang = editLang;
    $$('.fld__langs > [data-lang]').forEach(function (n) { n.classList.toggle('is-active', n.dataset.lang === editLang); });
    $$('[data-lang-tag]').forEach(function (t) {
      var owner = t.closest('.fld'); var inp = owner && $('[data-lang="' + editLang + '"] input, [data-lang="' + editLang + '"] textarea, [data-lang="' + editLang + '"] .rte__area', owner);
      var empty = inp && !(inp.value || (inp.isContentEditable && inp.textContent.trim()));
      var cur = langs.find(function (l) { return l.code === editLang; }) || {};
      t.textContent = (cur.short || editLang.toUpperCase()) + (empty && editLang !== langs[0].code ? ' · порожньо' : '');
      t.classList.toggle('lang-tag--empty', !!(empty && editLang !== langs[0].code));
    });
    if (sw) $$('button', sw).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.l === editLang)); });
  }
  if (sw && langs.length > 1) {
    langs.forEach(function (l) {
      sw.appendChild(el('button', { type: 'button', 'data-l': l.code, 'aria-pressed': String(l.code === editLang), text: l.short || l.code.toUpperCase(), title: 'Редагувати: ' + l.name, onclick: function () { editLang = l.code; refreshLang(); } }));
    });
  } else if (sw) sw.hidden = true;

  // ---------- defaults ----------
  function emptyT() { var o = {}; langs.forEach(function (l) { o[l.code] = ''; }); return o; }
  function defaultFor(f) {
    if (f.t) return emptyT();
    switch (f.type) {
      case 'items': case 'images': case 'entries': case 'list': return [];
      case 'toggle': return f.default !== undefined ? f.default : false;
      case 'select': return f.default !== undefined ? f.default : (f.options[0] || {}).v;
      case 'image': case 'video': case 'entry': case 'latlng': case 'number': return null;
      default: return '';
    }
  }
  function defaults(fields) { var o = {}; fields.forEach(function (f) { o[f.key] = defaultFor(f); }); return o; }

  // ---------- field renderers ----------
  function fieldWrap(f, control, opts) {
    var id = (opts && opts.id) || null;
    var label = el('label', { class: 'fld__label', for: id }, [f.label, f.required ? el('span', { class: 'fld__req', 'aria-hidden': 'true', text: '*' }) : null, f.t && langs.length > 1 ? el('span', { class: 'lang-tag', 'aria-hidden': 'true', 'data-lang-tag': '', text: editLang.toUpperCase() }) : null]);
    return el('div', { class: 'fld' }, [label, control, f.help ? el('p', { class: 'fld__help', text: f.help }) : null]);
  }
  function inputFor(f, get, set, id) {
    var type = { url: 'url', email: 'email', phone: 'tel', number: 'number', date: 'date' }[f.type] || 'text';
    if (f.type === 'url') type = 'text'; // allow relative paths like /brands
    var i = el(f.type === 'textarea' ? 'textarea' : 'input', { id: id, type: f.type === 'textarea' ? null : type, maxlength: f.max || (f.type === 'textarea' ? 3000 : 300), rows: f.type === 'textarea' ? 3 : null, placeholder: f.type === 'url' ? 'https://… або /шлях' : null });
    i.value = get() == null ? '' : get();
    i.addEventListener('input', function () { set(f.type === 'number' ? (i.value === '' ? null : Number(i.value)) : i.value); markDirty(); });
    i.addEventListener('blur', refreshLang);
    return i;
  }
  function richText(get, set, id) {
    var area = el('div', { class: 'rte__area', contenteditable: 'true', id: id, role: 'textbox', 'aria-multiline': 'true', 'data-placeholder': 'Почніть писати…' });
    area.innerHTML = get() || '';
    var sync = function () { set(area.innerHTML.replace(/<p><br><\/p>/g, '').trim() === '' ? '' : area.innerHTML); markDirty(); };
    var cmd = function (c, v) { area.focus(); document.execCommand(c, false, v); sync(); };
    var bar = el('div', { class: 'rte__bar' }, [
      el('button', { type: 'button', title: 'Жирний (Ctrl+B)', text: 'B', onclick: function () { cmd('bold'); } }),
      el('button', { type: 'button', title: 'Курсив (Ctrl+I)', text: 'I', style: 'font-style:italic', onclick: function () { cmd('italic'); } }),
      el('button', { type: 'button', title: 'Підзаголовок', text: 'H', onclick: function () { cmd('formatBlock', 'h3'); } }),
      el('button', { type: 'button', title: 'Звичайний абзац', text: '¶', onclick: function () { cmd('formatBlock', 'p'); } }),
      el('button', { type: 'button', title: 'Список', text: '•', onclick: function () { cmd('insertUnorderedList'); } }),
      el('button', { type: 'button', title: 'Нумерований список', text: '1.', onclick: function () { cmd('insertOrderedList'); } }),
      el('button', { type: 'button', title: 'Посилання', text: '🔗', onclick: function () { var u = prompt('Адреса посилання (https://…, /сторінка, mailto: або tel:)'); if (u) cmd('createLink', u.trim()); } }),
      el('button', { type: 'button', title: 'Прибрати посилання', text: '⛓̸', onclick: function () { cmd('unlink'); } }),
      el('button', { type: 'button', title: 'Очистити форматування', text: '⌫', onclick: function () { cmd('removeFormat'); } }),
    ]);
    area.addEventListener('input', sync);
    area.addEventListener('blur', refreshLang);
    area.addEventListener('paste', function (e) {
      // paste as clean text — keeps the site design consistent
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
      var esc = function (s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); };
      var html = t.split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
      document.execCommand('insertHTML', false, html);
      sync();
    });
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* noop */ }
    return el('div', { class: 'rte' }, [bar, area]);
  }
  function mediaThumb(id) {
    var m = mediaMap[id];
    if (!m) return id ? el('span', { text: '#' + id }) : el('span', { text: 'немає' });
    return m.thumb ? el('img', { src: m.thumb, alt: '' }) : el('span', { text: '▶ ' + (m.name || 'відео') });
  }
  function rememberMedia(items) { items.forEach(function (m) { mediaMap[m.id] = { id: m.id, kind: m.kind, thumb: m.thumb, name: m.name, url: m.url }; }); }
  function singleMedia(f, get, set) {
    var kind = f.type === 'video' ? 'video' : 'image';
    var thumb = el('div', { class: 'media-pick__thumb' });
    var rm = el('button', { type: 'button', class: 'btn btn--sm btn--quiet', text: 'Прибрати' });
    var pick = el('button', { type: 'button', class: 'btn btn--sm' });
    var draw = function () { thumb.innerHTML = ''; thumb.appendChild(mediaThumb(get())); rm.hidden = !get(); pick.textContent = get() ? 'Замінити' : (kind === 'video' ? 'Обрати відео' : 'Обрати фото'); };
    pick.addEventListener('click', function () { openPicker({ kind: kind }, function (items) { if (!items[0]) return; rememberMedia(items); set(items[0].id); markDirty(); draw(); }); });
    rm.addEventListener('click', function () { set(null); markDirty(); draw(); });
    draw();
    return el('div', { class: 'media-pick' }, [thumb, el('div', { class: 'media-pick__btns' }, [pick, rm])]);
  }
  function multiMedia(f, get, set) {
    var wrap = el('div', { class: 'media-multi' });
    var dragIdx = null;
    var draw = function () {
      wrap.innerHTML = '';
      (get() || []).forEach(function (id, i) {
        var it = el('div', { class: 'media-multi__item', draggable: 'true', title: 'Перетягніть, щоб змінити порядок' }, [mediaThumb(id), el('button', { type: 'button', 'aria-label': 'Прибрати', text: '×', onclick: function () { var a = get().slice(); a.splice(i, 1); set(a); markDirty(); draw(); } })]);
        it.addEventListener('dragstart', function () { dragIdx = i; });
        it.addEventListener('dragover', function (e) { e.preventDefault(); });
        it.addEventListener('drop', function (e) { e.preventDefault(); if (dragIdx === null || dragIdx === i) return; var a = get().slice(); var x = a.splice(dragIdx, 1)[0]; a.splice(i, 0, x); set(a); dragIdx = null; markDirty(); draw(); });
        wrap.appendChild(it);
      });
      wrap.appendChild(el('button', { type: 'button', class: 'media-multi__add', text: '+ Додати фото', onclick: function () {
        openPicker({ kind: 'image', multiple: true }, function (items) { rememberMedia(items); var a = (get() || []).slice(); items.forEach(function (m) { if (a.indexOf(m.id) === -1) a.push(m.id); }); set(a); markDirty(); draw(); });
      } }));
    };
    draw();
    return wrap;
  }
  function entrySelect(f, get, set, id) {
    var s = el('select', { id: id }, [el('option', { value: '', text: '— не обрано —' })].concat((options[f.of] || []).map(function (o) { return el('option', { value: String(o.id), text: o.label }); })));
    s.value = get() ? String(get()) : '';
    s.addEventListener('change', function () { set(s.value ? parseInt(s.value, 10) : null); markDirty(); });
    return s;
  }
  function entryMulti(f, get, set) {
    var list = el('div', { class: 'stack', style: 'gap:4px;max-height:240px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:8px 10px' });
    (options[f.of] || []).forEach(function (o) {
      var cb = el('input', { type: 'checkbox' }); cb.checked = (get() || []).indexOf(o.id) > -1;
      cb.addEventListener('change', function () { var a = (get() || []).filter(function (x) { return x !== o.id; }); if (cb.checked) a.push(o.id); set(a); markDirty(); });
      list.appendChild(el('label', { class: 'toggle', style: 'font-weight:400' }, [cb, o.label]));
    });
    if (!(options[f.of] || []).length) list.appendChild(el('span', { class: 'muted small', text: 'Ще немає записів.' }));
    return list;
  }
  function listInput(f, get, set) {
    var wrap = el('div', { class: 'items' });
    var draw = function () {
      wrap.innerHTML = '';
      (get() || []).forEach(function (v, i) {
        var inp = el('input', { value: v, maxlength: 80 });
        inp.addEventListener('input', function () { var a = get().slice(); a[i] = inp.value; set(a); markDirty(); });
        wrap.appendChild(el('div', { class: 'list-input' }, [inp, el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Видалити', text: '×', onclick: function () { var a = get().slice(); a.splice(i, 1); set(a); markDirty(); draw(); } })]));
      });
      wrap.appendChild(el('button', { type: 'button', class: 'addbtn', text: '+ Додати ' + (f.item || ''), onclick: function () { set((get() || []).concat([''])); markDirty(); draw(); var last = $$('input', wrap).pop(); if (last) last.focus(); } }));
    };
    draw();
    return wrap;
  }
  function latlng(f, get, set) {
    var v = get() || {};
    var lat = el('input', { type: 'number', step: 'any', placeholder: 'Широта', value: v.lat == null ? '' : v.lat, 'aria-label': 'Широта' });
    var lng = el('input', { type: 'number', step: 'any', placeholder: 'Довгота', value: v.lng == null ? '' : v.lng, 'aria-label': 'Довгота' });
    var mapEl = el('div', { class: 'mappick' });
    var marker = null, map = null;
    var upd = function () { if (lat.value === '' || lng.value === '') set(null); else set({ lat: Number(lat.value), lng: Number(lng.value) }); markDirty(); if (map) place(); };
    var place = function () { var g = get(); if (!g) { if (marker) { map.removeLayer(marker); marker = null; } return; } if (!marker) marker = L.marker([g.lat, g.lng], { draggable: true }).addTo(map).on('dragend', function (e) { var p = e.target.getLatLng(); lat.value = p.lat.toFixed(6); lng.value = p.lng.toFixed(6); upd(); }); else marker.setLatLng([g.lat, g.lng]); };
    lat.addEventListener('input', upd); lng.addEventListener('input', upd);
    var clear = el('button', { type: 'button', class: 'btn btn--sm btn--quiet', text: 'Очистити', onclick: function () { lat.value = ''; lng.value = ''; upd(); } });
    setTimeout(function () {
      if (!window.L) { mapEl.textContent = 'Карта недоступна — введіть координати вручну (їх можна скопіювати з Google Maps).'; return; }
      var g = get();
      map = L.map(mapEl).setView(g ? [g.lat, g.lng] : [48.3605, 24.4085], g ? 15 : 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      map.on('click', function (e) { lat.value = e.latlng.lat.toFixed(6); lng.value = e.latlng.lng.toFixed(6); upd(); });
      place();
      new IntersectionObserver(function (en) { if (en[0].isIntersecting) map.invalidateSize(); }).observe(mapEl);
    }, 0);
    return el('div', { class: 'stack' }, [el('div', { class: 'latlng' }, [lat, lng, clear]), mapEl]);
  }
  function items(f, get, set) {
    var wrap = el('div', { class: 'items' });
    var titleOf = function (it, i) {
      var first = f.fields.find(function (x) { return ['text', 'textarea', 'phone', 'email', 'url'].indexOf(x.type) > -1; });
      var v = first ? it[first.key] : '';
      if (v && typeof v === 'object') v = v[editLang] || v[langs[0].code];
      return v ? String(v).slice(0, 80) : ((f.item || 'елемент') + ' ' + (i + 1));
    };
    var draw = function (openIdx) {
      wrap.innerHTML = '';
      var arr = get() || [];
      arr.forEach(function (it, i) {
        var body = el('div', { class: 'item__body' });
        f.fields.forEach(function (sf) { body.appendChild(renderField(sf, function () { return it[sf.key]; }, function (v) { it[sf.key] = v; ttl.textContent = titleOf(it, i); })); });
        var move = function (d) { var a = get().slice(); var j = i + d; if (j < 0 || j >= a.length) return; var x = a[i]; a[i] = a[j]; a[j] = x; set(a); markDirty(); draw(j); };
        var ttl = el('span', { class: 'item__title', text: titleOf(it, i) });
        var node = el('div', { class: 'item' + (openIdx === i ? '' : ' collapsed') }, [
          el('div', { class: 'item__head' }, [ttl,
            el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Вище', text: '↑', onclick: function (e) { e.stopPropagation(); move(-1); } }),
            el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Нижче', text: '↓', onclick: function (e) { e.stopPropagation(); move(1); } }),
            el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Дублювати', title: 'Дублювати', text: '⧉', onclick: function (e) { e.stopPropagation(); var a = get().slice(); a.splice(i + 1, 0, JSON.parse(JSON.stringify(it))); set(a); markDirty(); draw(i + 1); } }),
            el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Видалити', title: 'Видалити', text: '×', onclick: function (e) { e.stopPropagation(); if (!confirm('Видалити ' + (f.item || 'елемент') + '?')) return; var a = get().slice(); a.splice(i, 1); set(a); markDirty(); draw(); } }),
          ]), body]);
        $('.item__head', node).addEventListener('click', function () { node.classList.toggle('collapsed'); });
        wrap.appendChild(node);
      });
      wrap.appendChild(el('button', { type: 'button', class: 'addbtn', text: '+ Додати ' + (f.item || 'елемент'), onclick: function () { set((get() || []).concat([defaults(f.fields)])); markDirty(); draw((get() || []).length - 1); } }));
      refreshLang();
    };
    draw();
    return wrap;
  }

  function renderField(f, get, set) {
    var id = uid();
    if (f.t) {
      if (!get() || typeof get() !== 'object') set(emptyT());
      var box = el('div', { class: 'fld__langs' });
      langs.forEach(function (l) {
        var g = function () { return get()[l.code]; };
        var s = function (v) { var o = get(); o[l.code] = v; set(o); };
        var c = f.type === 'rich' ? richText(g, s, l.code === editLang ? id : null) : inputFor(f, g, s, l.code === editLang ? id : null);
        var ctl = f.type === 'rich' ? $('.rte__area', c) : c;
        ctl.setAttribute('aria-label', l.code === langs[0].code ? f.label : f.label + ' (' + l.code.toUpperCase() + ')');
        box.appendChild(el('div', { 'data-lang': l.code, class: l.code === editLang ? 'is-active' : '', lang: l.code }, [c]));
      });
      return fieldWrap(f, box, { id: id });
    }
    switch (f.type) {
      case 'toggle': {
        var cb = el('input', { type: 'checkbox', id: id }); cb.checked = get() === undefined ? !!f.default : !!get();
        cb.addEventListener('change', function () { set(cb.checked); markDirty(); });
        return el('div', { class: 'fld' }, [el('label', { class: 'toggle', for: id }, [cb, f.label]), f.help ? el('p', { class: 'fld__help', text: f.help }) : null]);
      }
      case 'select': {
        var s = el('select', { id: id }, f.options.map(function (o) { return el('option', { value: o.v, text: o.l }); }));
        s.value = get() == null ? (f.default || f.options[0].v) : get();
        s.addEventListener('change', function () { set(s.value); markDirty(); });
        return fieldWrap(f, s, { id: id });
      }
      case 'rich': return fieldWrap(f, richText(get, set, id), { id: id });
      case 'image': case 'video': return fieldWrap(f, singleMedia(f, get, set));
      case 'images': return fieldWrap(f, multiMedia(f, get, set));
      case 'entry': return fieldWrap(f, entrySelect(f, get, set, id), { id: id });
      case 'entries': return fieldWrap(f, entryMulti(f, get, set));
      case 'list': return fieldWrap(f, listInput(f, get, set));
      case 'latlng': return fieldWrap(f, latlng(f, get, set));
      case 'items': return fieldWrap(f, items(f, get, set));
      default: return fieldWrap(f, inputFor(f, get, set, id), { id: id });
    }
  }
  function renderFields(fields, obj, container) {
    fields.forEach(function (f) {
      if (obj[f.key] === undefined) obj[f.key] = defaultFor(f);
      container.appendChild(renderField(f, function () { return obj[f.key]; }, function (v) { obj[f.key] = v; if (f.key === 'title' || f.key === 'name') updateTitle(); }));
    });
  }
  function updateTitle() {
    var h = $('[data-title]'); if (!h) return;
    var v = state.title || state.name; var t = v && (v[langs[0].code] || '');
    if (t) h.textContent = t;
  }

  // ---------- blocks ----------
  function blockSummary(b) {
    var d = b.data || {};
    var v = d.title || d.eyebrow || d.caption;
    var s = v && typeof v === 'object' ? (v[editLang] || v[langs[0].code]) : v;
    if (b.type === 'project_feature' && d.project) { var o = (options.project || []).find(function (x) { return x.id === d.project; }); s = o ? o.label : s; }
    if (b.type === 'form') s = (s ? s + ' · ' : '') + (d.form === 'cooperation' ? 'Співпраця' : 'Контакти');
    return s || '';
  }
  function blocksEditor(container, title) {
    if (!Array.isArray(state.blocks)) state.blocks = [];
    var list = el('div', { class: 'blocks' });
    var dragIdx = null;
    container.appendChild(el('p', { class: 'blocks__title', text: title || 'Блоки сторінки' }));
    container.appendChild(el('p', { class: 'muted small', text: 'Сторінка складається з блоків. Додавайте, переставляйте (⋮⋮ або стрілки), приховуйте (👁) і дублюйте їх — дизайн підлаштується автоматично.' }));
    container.appendChild(list);
    var addBtn = el('div', { class: 'blk-add' }, [el('button', { type: 'button', class: 'addbtn', text: '+ Додати блок', onclick: function () { palette(state.blocks.length); } })]);
    container.appendChild(addBtn);

    function palette(at) {
      var close = function () { m.remove(); };
      var grid = el('div', { class: 'palette__grid' });
      Object.keys(S.blocks).forEach(function (k) {
        var bd = S.blocks[k];
        grid.appendChild(el('button', { type: 'button', class: 'palette__item', onclick: function () {
          state.blocks.splice(at, 0, { id: rid(), type: k, hidden: false, data: defaults(bd.fields) });
          markDirty(); close(); draw(at);
        } }, [el('strong', { text: bd.icon + '  ' + bd.label }), bd.help ? el('span', { text: bd.help }) : null]));
      });
      var m = el('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Оберіть тип блоку' }, [el('div', { class: 'palette__box' }, [
        el('div', { class: 'head' }, [el('h2', { text: 'Оберіть тип блоку' }), el('button', { type: 'button', class: 'btn', text: 'Скасувати', onclick: close })]), grid])]);
      m.addEventListener('click', function (e) { if (e.target === m) close(); });
      document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
      document.body.appendChild(m);
      var first = $('.palette__item', m); if (first) first.focus();
    }
    function draw(openIdx) {
      list.innerHTML = '';
      if (!state.blocks.length) list.appendChild(el('div', { class: 'empty', text: 'Блоків ще немає. Натисніть «Додати блок».' }));
      state.blocks.forEach(function (b, i) {
        var bd = S.blocks[b.type]; if (!bd) return;
        var body = el('div', { class: 'blk__body' });
        if (bd.help) body.appendChild(el('p', { class: 'blk__help', text: bd.help }));
        renderFields(bd.fields, b.data, body);
        var sum = el('small', { text: blockSummary(b) });
        body.addEventListener('input', function () { sum.textContent = blockSummary(b); });
        var move = function (d) { var j = i + d; if (j < 0 || j >= state.blocks.length) return; var x = state.blocks[i]; state.blocks[i] = state.blocks[j]; state.blocks[j] = x; markDirty(); draw(j); };
        var eye = el('button', { type: 'button', class: 'iconbtn' + (b.hidden ? ' on' : ''), title: b.hidden ? 'Показати блок на сайті' : 'Приховати блок (без видалення)', 'aria-pressed': String(!!b.hidden), text: b.hidden ? '◌' : '👁', onclick: function (e) { e.stopPropagation(); b.hidden = !b.hidden; markDirty(); draw(i); } });
        var node = el('div', { class: 'blk' + (openIdx === i ? '' : ' collapsed') + (b.hidden ? ' is-hidden' : '') }, [
          el('div', { class: 'blk__head' }, [
            el('span', { class: 'blk__handle', title: 'Перетягніть', 'aria-hidden': 'true', text: '⋮⋮' }),
            el('span', { class: 'blk__icon', 'aria-hidden': 'true', text: bd.icon }),
            el('span', { class: 'blk__title' }, [bd.label, sum]),
            el('span', { class: 'blk__tools' }, [
              eye,
              el('button', { type: 'button', class: 'iconbtn', title: 'Вище', 'aria-label': 'Вище', text: '↑', onclick: function (e) { e.stopPropagation(); move(-1); } }),
              el('button', { type: 'button', class: 'iconbtn', title: 'Нижче', 'aria-label': 'Нижче', text: '↓', onclick: function (e) { e.stopPropagation(); move(1); } }),
              el('button', { type: 'button', class: 'iconbtn', title: 'Додати блок нижче', 'aria-label': 'Додати блок нижче', text: '+', onclick: function (e) { e.stopPropagation(); palette(i + 1); } }),
              el('button', { type: 'button', class: 'iconbtn', title: 'Дублювати', 'aria-label': 'Дублювати', text: '⧉', onclick: function (e) { e.stopPropagation(); var c = JSON.parse(JSON.stringify(b)); c.id = rid(); state.blocks.splice(i + 1, 0, c); markDirty(); draw(i + 1); } }),
              el('button', { type: 'button', class: 'iconbtn', title: 'Видалити', 'aria-label': 'Видалити', text: '×', onclick: function (e) { e.stopPropagation(); if (!confirm('Видалити блок «' + bd.label + '»? Якщо передумаєте — до публікації можна скасувати зміни, після — відновити з історії.')) return; state.blocks.splice(i, 1); markDirty(); draw(); } }),
            ]),
          ]), body]);
        var head = $('.blk__head', node);
        head.addEventListener('click', function () { node.classList.toggle('collapsed'); });
        var handle = $('.blk__handle', node);
        handle.addEventListener('mousedown', function () { node.draggable = true; });
        node.addEventListener('dragstart', function (e) { dragIdx = i; e.dataTransfer.effectAllowed = 'move'; });
        node.addEventListener('dragend', function () { node.draggable = false; $$('.drop-before', list).forEach(function (x) { x.classList.remove('drop-before'); }); });
        node.addEventListener('dragover', function (e) { if (dragIdx === null) return; e.preventDefault(); $$('.drop-before', list).forEach(function (x) { x.classList.remove('drop-before'); }); node.classList.add('drop-before'); });
        node.addEventListener('drop', function (e) { e.preventDefault(); if (dragIdx === null || dragIdx === i) return; var x = state.blocks.splice(dragIdx, 1)[0]; state.blocks.splice(dragIdx < i ? i - 1 : i, 0, x); dragIdx = null; markDirty(); draw(); });
        list.appendChild(node);
      });
      refreshLang();
    }
    draw();
  }

  // ---------- build the form ----------
  var groups = B.type ? S.types[B.type].groups : B.groups;
  var slugInput = null;
  if (B.type && S.types[B.type].slug || (B.type === 'page' && !B.system)) {
    var prefix = { page: '/', brand: '/brands/', project: '/investments/', vacancy: '/vacancies/' }[B.type] || '/';
    slugInput = el('input', { value: /^novyi-/.test(B.slug || '') ? '' : (B.slug || ''), maxlength: 70, placeholder: 'створиться з назви', 'aria-label': 'Адреса сторінки' });
    slugInput.addEventListener('input', markDirty);
    var sbox = el('details', { class: 'group', open: true }, [el('summary', { text: 'Адреса на сайті' }), el('div', { class: 'group__body' }, [
      el('div', { class: 'slugrow' }, [el('span', { text: location.host + prefix }), slugInput]),
      el('p', { class: 'fld__help', text: 'Латиницею, через дефіс. Якщо змінюєте адресу опублікованої сторінки — додайте перенаправлення зі старої в «Перенаправлення».' }),
    ])]);
    root.appendChild(sbox);
  }
  var addGroup = function (g, open) {
    var body = el('div', { class: 'group__body' });
    renderFields(g.fields, state, body);
    root.appendChild(el('details', { class: 'group', open: open }, [el('summary', { text: g.label }), body]));
  };
  var hasBlocks = B.type && S.types[B.type].blocks;
  groups.forEach(function (g, gi) { if (!(hasBlocks && g.label === 'SEO')) addGroup(g, g.label !== 'SEO' && (gi < 2 || !B.type)); });
  if (hasBlocks) {
    var bwrap = el('div', { class: 'group', style: 'padding:16px 18px' });
    root.appendChild(bwrap);
    blocksEditor(bwrap, S.types[B.type].blocksLabel);
    groups.forEach(function (g) { if (g.label === 'SEO') addGroup(g, false); });
  }
  refreshLang();

  // ---------- save / publish ----------
  var errBox = $('[data-errors]'), warnBox = $('[data-warnings]'), savedEl = $('[data-saved]');
  var showErrors = function (list) {
    if (!errBox) return;
    if (!list || !list.length) { errBox.hidden = true; return; }
    errBox.innerHTML = ''; errBox.appendChild(el('strong', { text: 'Потрібно виправити:' }));
    errBox.appendChild(el('ul', {}, list.map(function (e) { return el('li', { text: e }); })));
    errBox.hidden = false; errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  var STATUS = { published: 'Опубліковано', draft: 'Чернетка', hidden: 'Приховано', inactive: 'Неактивна', archived: 'В архіві' };
  var busy = false;
  function send(kind) {
    if (busy) return Promise.resolve(null);
    busy = true;
    var btns = $$('[data-save],[data-publish],[data-preview],[data-save-settings]'); btns.forEach(function (b) { b.disabled = true; });
    var url = B.settings ? A + '/api/settings/' + B.settings : A + '/api/c/' + B.type + '/' + B.id + '/' + kind;
    var payload = { data: state };
    if (slugInput) payload.slug = slugInput.value;
    return window.CMS.api(url, payload).then(function (d) {
      busy = false; btns.forEach(function (b) { b.disabled = false; });
      if (d.ok) {
        dirty = false; showErrors(null);
        if (savedEl) savedEl.textContent = (kind === 'publish' ? 'Опубліковано о ' : 'Збережено о ') + new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
        if (d.slug && slugInput) { slugInput.value = d.slug; B.slug = d.slug; }
        if (d.preview) B.preview = d.preview;
        var st = $('[data-status]'); if (st && d.status) { st.textContent = STATUS[d.status]; st.className = 'pill pill--' + d.status; }
        var dt = $('[data-dirty]'); if (dt) dt.hidden = !(d.dirty && (B.hasLive || d.status === 'published'));
        if (kind === 'publish') B.hasLive = true;
        if (warnBox) { if (d.warnings && d.warnings.length) { warnBox.textContent = 'До публікації: ' + d.warnings.join(' '); warnBox.hidden = false; } else warnBox.hidden = true; }
        window.CMS.toast(kind === 'publish' ? 'Опубліковано — зміни вже на сайті' : 'Збережено');
      } else {
        showErrors(d.errors || [d.error || 'Не вдалося зберегти. Перевірте інтернет і спробуйте ще раз.']);
      }
      return d;
    }).catch(function () { busy = false; btns.forEach(function (b) { b.disabled = false; }); window.CMS.toast('Немає звʼязку з сервером', true); });
  }
  var sb = $('[data-save]'); if (sb) sb.addEventListener('click', function () { send('save'); });
  var ss = $('[data-save-settings]'); if (ss) ss.addEventListener('click', function () { send('save'); });
  var pb = $('[data-publish]'); if (pb) pb.addEventListener('click', function () { send('publish'); });
  var pv = $('[data-preview]');
  if (pv) pv.addEventListener('click', function () {
    var w = window.open('about:blank', '_blank');
    send('save').then(function (d) {
      if (!d || !d.ok) { if (w) w.close(); return; }
      var path = (editLang !== langs[0].code ? '/' + editLang + (B.preview === '/' ? '' : B.preview) : B.preview);
      if (w) w.location = path + (path.indexOf('?') > -1 ? '&' : '?') + 'preview=1';
    });
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); send('save'); }
  });
})();
