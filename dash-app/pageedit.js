/* The page editor, on every screen. An officer presses Edit page in the top
   bar and the screen's own words (headings, labels, notes, empty states),
   its outside links, the order of its tabs and the order of its cards
   become editable where they are. Changes are kept on the club record per
   screen (pageText, pageLinks, subOrder, cardOrder), so members see them.
   Words are matched by what the screen wrote, so a heading renamed once
   stays renamed; a line with a changing number in it only matches while the
   number is the same. Items people made (members, assignments, schedule
   rows) are edited where they are, not here. */
'use strict';

var PE = {on: false};
/* What counts as the screen's own words. */
var PE_TEXT = 'h2, h3, h4, .lede, .note > span, .empty .et, .empty > p:not(.et), .fl, dt, .hint, .kl, legend, .fld > span, th, .cuehd > span, .rqt, .eyebrow';
var PE_SKIP = 'input, textarea, select, [data-sfin], .pe-bar, .pe-t';

function peMap(k, v) { return ((M.cfg[k] || {})[v]) || {}; }
function peView() { return ROUTE.view; }
function peCardScope() { return ROUTE.view + '/' + (ROUTE.sub || ''); }

/* ---------- tabs: the order officers set, and their names ---------- */
function pageSubOrder(view, list) {
  var o = ((M && M.cfg.subOrder) || {})[view] || (view === 'sfblc' && M && M.cfg.sfOrder) || null, names = M ? peMap('pageText', view) : {};
  var out = list.slice();
  if (o && o.length) {
    var ids = out.map(function (x) { return x[0]; });
    out.sort(function (a, b) {
      var i = o.indexOf(a[0]), j = o.indexOf(b[0]);
      return (i < 0 ? 100 + ids.indexOf(a[0]) : i) - (j < 0 ? 100 + ids.indexOf(b[0]) : j);
    });
  }
  return out.map(function (x) { return names[x[1]] ? [x[0], names[x[1]]].concat(x.slice(2)) : x; });
}
/* With no tab in the address, the screen opens on the tab officers put first. */
function pageFirstSub(view) {
  var o = ((M && M.cfg.subOrder) || {})[view] || (view === 'sfblc' && M && M.cfg.sfOrder);
  return o && o.length ? o[0] : '';
}

/* ---------- after every redraw ---------- */
function pageApply(view) {
  peButton();
  if (!M) return;
  var v = peView(), txt = peMap('pageText', v), lk = peMap('pageLinks', v);
  Array.prototype.forEach.call(view.querySelectorAll(PE_TEXT), function (el) {
    if (el.closest(PE_SKIP)) return;
    var node = Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 3 && n.nodeValue.trim(); })[0];
    if (!node) return;
    var orig = node.nodeValue.trim();
    el.setAttribute('data-pt', orig);
    if (txt[orig] != null) node.nodeValue = node.nodeValue.replace(orig, txt[orig]);
    if (!PE.on || !M.officer) return;
    var s = document.createElement('span');
    s.className = 'pe-t'; s.contentEditable = 'true'; s.spellcheck = true;
    s.setAttribute('data-pt', orig); s.setAttribute('data-fk', 'pt|' + orig); s.setAttribute('data-was', node.nodeValue.trim());
    s.setAttribute('role', 'textbox'); s.setAttribute('aria-label', 'Edit “' + orig + '”');
    s.textContent = node.nodeValue.trim();
    node.parentNode.replaceChild(s, node);
  });
  Array.prototype.forEach.call(view.querySelectorAll('a[href^="http"]'), function (a) {
    if (a.closest(PE_SKIP)) return;
    var orig = a.getAttribute('data-pl') || a.getAttribute('href'), o = lk[orig];
    a.setAttribute('data-pl', orig);
    if (o && safeUrl(o.href)) a.href = o.href;
    if (o && o.label) { var t = peLabelNode(a); if (t) t.nodeValue = o.label; }
    if (PE.on && M.officer) a.insertAdjacentHTML('afterend', '<button class="pe-lk" data-act="peLink" data-pl="' + esc(orig) + '" aria-label="Change this link">' + icon('edit') + '</button>');
  });
  peCards(view);
  if (PE.on && M.officer) view.insertAdjacentHTML('afterbegin', peBar());
}
function peLabelNode(a) {
  var walk = document.createTreeWalker(a, NodeFilter.SHOW_TEXT, null), n;
  while ((n = walk.nextNode())) if (n.nodeValue.trim()) return n;
  return null;
}

/* ---------- cards: officers move them up and down ---------- */
function peCardKey(c) {
  var h = c.querySelector(':scope > header h3, :scope > summary h3');
  return h ? h.getAttribute('data-pt') || h.textContent.trim() : '';
}
function peCards(view) {
  var cards = Array.prototype.filter.call(view.querySelectorAll('section.card, details.card'), function (c) { return !c.closest('.pe-bar') && peCardKey(c); });
  /* Keyed by the heading as the screen wrote it (data-pt), so a renamed card keeps its place. */
  var order = ((M.cfg.cardOrder || {})[peCardScope()]) || [], groups = [];
  cards.forEach(function (c) { var g = groups.filter(function (x) { return x.p === c.parentNode; })[0]; if (!g) groups.push(g = {p: c.parentNode, list: []}); g.list.push(c); });
  groups.forEach(function (g) {
    if (g.list.length < 2) return;
    if (order.length) {
      var marks = g.list.map(function (c) { var m = document.createComment('pe'); g.p.insertBefore(m, c); return m; });
      var sorted = g.list.slice().sort(function (a, b) {
        var i = order.indexOf(peCardKey(a)), j = order.indexOf(peCardKey(b));
        return (i < 0 ? 1000 + g.list.indexOf(a) : i) - (j < 0 ? 1000 + g.list.indexOf(b) : j);
      });
      sorted.forEach(function (c, i) { g.p.insertBefore(c, marks[i]); marks[i].remove(); });
      g.list = sorted;
    }
    if (!PE.on || !M.officer) return;
    g.list.forEach(function (c, i) {
      var hd = c.querySelector(':scope > header, :scope > summary'), k = peCardKey(c);
      hd.insertAdjacentHTML('beforeend', '<span class="pe-mv">' + moveBtns('peCard', 'data-k="' + esc(k) + '"', i, g.list.length, k) + '</span>');
    });
  });
}
ACT_EXT.peCard = function (el, d) {
  var card = el.closest('.card'), sib = +d.dir < 0 ? card.previousElementSibling : card.nextElementSibling;
  while (sib && !(sib.matches('.card') && peCardKey(sib))) sib = +d.dir < 0 ? sib.previousElementSibling : sib.nextElementSibling;
  if (!sib) return;
  if (+d.dir < 0) card.parentNode.insertBefore(card, sib); else card.parentNode.insertBefore(sib, card);
  var keys = Array.prototype.filter.call($('view').querySelectorAll('section.card, details.card'), function (c) { return !c.closest('.pe-bar'); }).map(peCardKey).filter(Boolean);
  var all = Object.assign({}, M.cfg.cardOrder || {}); all[peCardScope()] = keys;
  saveCfg({cardOrder: all}, 'Moved.');
};

/* ---------- the bar at the top while editing ---------- */
function peBar() {
  var v = peView(), tabs = NAVSUB.seen['o:' + v] || [];
  var h = '<section class="pe-bar card"><header><h3>Editing this page</h3><span class="hint">Click any heading, label or note to change its words; the pencil beside a link changes where it goes. Arrows move cards. Everyone sees the changes.</span>' +
    '<button class="qbtn" data-act="peReset">' + icon('back') + '<span>Undo all changes on this page</span></button></header>';
  if (tabs.length > 1) {
    var names = peMap('pageText', v), base = (NAVSUB.raw || {})[v] || {};
    h += '<p class="fl">Tabs, in order</p><ol class="ordlist">' + tabs.map(function (t, i) {
      var orig = base[t[0]] || t[1];
      return '<li><span class="on">' + (i + 1) + '</span><input class="inl b" data-petab="' + esc(orig) + '" data-fk="tab|' + esc(t[0]) + '" value="' + esc(names[orig] || orig) + '" maxlength="30" aria-label="Name of the ' + esc(orig) + ' tab">' +
        moveBtns('peTab', 'data-k="' + esc(t[0]) + '"', i, tabs.length, t[1]) + '</li>';
    }).join('') + '</ol>';
  }
  return h + '</section>';
}
function peButton() {
  var b = $('pebtn');
  if (!b) return;
  b.hidden = !(M && M.officer);
  b.classList.toggle('on', PE.on);
  b.setAttribute('aria-pressed', PE.on);
  b.querySelector('span').textContent = PE.on ? 'Done editing' : 'Edit page';
}
ACT_EXT.pageEdit = function () { PE.on = !PE.on; render(); if (!PE.on) toast('Done. Changes are saved.'); };
ACT_EXT.peTab = function (el, d) {
  var v = peView(), ids = (NAVSUB.seen['o:' + v] || []).map(function (x) { return x[0]; }), i = ids.indexOf(d.k), j = i + (+d.dir);
  if (i < 0 || j < 0 || j >= ids.length) return;
  ids.splice(j, 0, ids.splice(i, 1)[0]);
  var all = Object.assign({}, M.cfg.subOrder || {}); all[v] = ids;
  saveCfg({subOrder: all}, 'Tab order saved.');
};
ACT_EXT.peReset = function () {
  var v = peView();
  confirmSheet('Undo every change on this page?', 'Its words, links, tab order and card order go back to how the Org System writes them. Items people made stay as they are.', 'Undo changes', function () {
    var ch = {};
    ['pageText', 'pageLinks', 'subOrder'].forEach(function (k) { var o = Object.assign({}, M.cfg[k] || {}); delete o[v]; ch[k] = o; });
    var co = Object.assign({}, M.cfg.cardOrder || {});
    Object.keys(co).forEach(function (k) { if (k.split('/')[0] === v) delete co[k]; });
    ch.cardOrder = co;
    if (v === 'sfblc') ch.sfOrder = [];
    saveCfg(ch, 'This page is back to how it was.');
  });
};

/* ---------- saving words ---------- */
function peSaveText(orig, val) {
  var v = peView(), all = JSON.parse(JSON.stringify(M.cfg.pageText || {})), m = all[v] || {};
  val = clean(val, 300).replace(/\s+/g, ' ').trim();
  if (!val || val === orig) { if (!(orig in m)) return; delete m[orig]; } else { if (m[orig] === val) return; m[orig] = val; }
  all[v] = m;
  saveCfg({pageText: all}, 'Saved.');
}
document.addEventListener('focusout', function (e) {
  var s = e.target;
  if (!s.classList || !s.classList.contains('pe-t') || !M || !M.officer) return;
  if (s.textContent.trim() === s.getAttribute('data-was')) return;
  setTimeout(function () { peSaveText(s.getAttribute('data-pt'), s.textContent); }, 0);
});
document.addEventListener('keydown', function (e) {
  var s = e.target;
  if (!s.classList || !s.classList.contains('pe-t')) return;
  if (e.key === 'Enter') { e.preventDefault(); s.blur(); }
  if (e.key === 'Escape') { s.textContent = s.getAttribute('data-was'); s.blur(); }
});
/* Words inside a link or a button are edited, not followed. */
document.addEventListener('click', function (e) {
  if (!PE.on || !e.target.closest) return;
  if (e.target.closest('.pe-t')) { e.preventDefault(); e.stopPropagation(); }
}, true);
document.addEventListener('paste', function (e) {
  var s = e.target.closest && e.target.closest('.pe-t');
  if (!s) return;
  e.preventDefault();
  document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text').replace(/\s+/g, ' '));
});
document.addEventListener('change', function (e) {
  var el = e.target;
  if (!el.hasAttribute || !el.hasAttribute('data-petab') || !M || !M.officer) return;
  setTimeout(function () { peSaveText(el.getAttribute('data-petab'), el.value); }, 0);
});

/* ---------- links ---------- */
ACT_EXT.peLink = function (el, d) {
  var a = el.previousElementSibling, o = peMap('pageLinks', peView())[d.pl] || {}, t = a && peLabelNode(a);
  openSheet('<form class="form" data-act="peLinkSave" data-pl="' + esc(d.pl) + '"><header class="sh"><h3>Change this link</h3></header>' +
    '<label class="fld"><span>Words on the link</span><input name="label" maxlength="80" value="' + esc(o.label || (t ? t.nodeValue.trim() : '')) + '"></label>' +
    '<label class="fld"><span>Where it goes</span><input name="href" type="url" required maxlength="500" value="' + esc(o.href || d.pl) + '"></label>' +
    '<p class="meta">Was: ' + esc(d.pl) + '</p><div class="sheetacts"><button class="btn">Save</button>' + (o.href || o.label ? '<button type="button" class="btn ghost" data-act="peLinkUndo" data-pl="' + esc(d.pl) + '">Put it back</button>' : '') + '</div></form>');
};
function peSetLink(orig, val) {
  var v = peView(), all = JSON.parse(JSON.stringify(M.cfg.pageLinks || {})), m = all[v] || {};
  if (val) m[orig] = val; else delete m[orig];
  all[v] = m;
  closeSheet();
  saveCfg({pageLinks: all}, val ? 'Link saved.' : 'Link put back.');
}
SUBMIT_EXT.peLinkSave = function (f) {
  var href = safeUrl(f.href.value);
  if (!href) return toast('A link starts with https://', true);
  peSetLink(f.getAttribute('data-pl'), {href: href === f.getAttribute('data-pl') ? '' : href, label: clean(f.label.value, 80).trim()});
};
ACT_EXT.peLinkUndo = function (el, d) { peSetLink(d.pl, null); };
