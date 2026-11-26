/* CARTEL CMS — common behaviour for all admin pages. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var CSRF = document.body.dataset.csrf;
  var A = document.body.dataset.admin;

  window.CMS = {
    csrf: CSRF, base: A,
    api: function (url, body, method) {
      return fetch(url, {
        method: method || 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF, Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401) { alert('Сесія завершилась. Увійдіть знову — незбережені зміни залишаться в цій вкладці, якщо не закривати її.'); window.open(A + '/login', '_blank'); }
          d._status = r.status; return d;
        });
      });
    },
    toast: function (msg, err) {
      var t = document.createElement('div'); t.className = 'toast' + (err ? ' toast--err' : ''); t.setAttribute('role', 'status'); t.textContent = msg;
      document.body.appendChild(t); setTimeout(function () { t.remove(); }, err ? 5000 : 2500);
    },
  };

  // mobile sidebar
  var side = $('#side'), tg = $('[data-side-toggle]');
  if (side && tg) {
    tg.addEventListener('click', function () { var o = side.classList.toggle('open'); tg.setAttribute('aria-expanded', String(o)); });
    document.addEventListener('click', function (e) { if (side.classList.contains('open') && !side.contains(e.target) && e.target !== tg) side.classList.remove('open'); });
  }

  // confirmations for destructive actions
  $$('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!confirm(f.dataset.confirm)) e.preventDefault(); });
  });
  $$('select[data-autosubmit]').forEach(function (s) { s.addEventListener('change', function () { s.form.submit(); }); });

  // strings filter
  var flt = $('[data-filter-rows]');
  if (flt) flt.addEventListener('input', function () {
    var q = flt.value.trim().toLowerCase();
    $$('tr[data-row]').forEach(function (tr) { tr.hidden = q && tr.dataset.row.toLowerCase().indexOf(q) === -1 && !$$('input', tr).some(function (i) { return i.value.toLowerCase().indexOf(q) > -1; }); });
  });

  // sortable lists (drag & drop + arrow buttons) — order is saved immediately
  $$('[data-sortable]').forEach(function (list) {
    var type = list.dataset.sortable, dragged = null;
    var save = function () {
      var ids = $$('.row', list).map(function (r) { return r.dataset.id; });
      CMS.api(A + '/api/reorder', { type: type, ids: ids }).then(function (d) { CMS.toast(d.ok ? 'Порядок збережено' : (d.error || 'Не вдалося зберегти порядок'), !d.ok); });
    };
    $$('.row', list).forEach(function (row) {
      var h = $('.row__handle', row);
      if (h) { h.addEventListener('mousedown', function () { row.draggable = true; }); h.addEventListener('touchstart', function () { row.draggable = true; }, { passive: true }); }
      row.addEventListener('dragstart', function (e) { dragged = row; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragend', function () { row.classList.remove('dragging'); row.draggable = false; $$('.drop-before', list).forEach(function (x) { x.classList.remove('drop-before'); }); });
      row.addEventListener('dragover', function (e) { if (!dragged || dragged === row) return; e.preventDefault(); $$('.drop-before', list).forEach(function (x) { x.classList.remove('drop-before'); }); row.classList.add('drop-before'); });
      row.addEventListener('drop', function (e) { e.preventDefault(); if (dragged && dragged !== row) { list.insertBefore(dragged, row); save(); } });
      $$('[data-move]', row).forEach(function (b) {
        b.addEventListener('click', function () {
          var d = parseInt(b.dataset.move, 10);
          if (d < 0 && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
          else if (d > 0 && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
          else return;
          b.focus(); save();
        });
      });
    });
    list.addEventListener('dragover', function (e) { if (dragged) e.preventDefault(); });
    list.addEventListener('drop', function (e) { if (dragged && e.target === list) { list.appendChild(dragged); save(); } });
  });
})();
