/* The dashboard's shell: loading, routing, the side and bottom navigation,
   the sheet (drawer) and every click. */
'use strict';

var ROUTE = {view: 'overview', sub: '', q: {}};
var PREV_STATS = {};

/* ---------- loading ---------- */
function loadAll() {
  return call('getAll').then(function (all) {
    if (!all || !all.ok || all.needsAff) return {err: all && all.error ? all.error : (creds() || DEMO ? 'The backend did not answer.' : 'signin')};
    var officer = RANK[all.role] >= RANK.admin;
    return Promise.all([
      officer ? call('clubRoster') : null, officer ? call('listSubmissions') : null,
      officer ? call('msgList') : null, call('myInbox'), call('myProfile')
    ]).then(function (r) { return {all: all, roster: r[0], subs: r[1], msgs: r[2], inbox: r[3], profile: r[4]}; });
  });
}
function boot() {
  applyTheme();
  $('view').innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';
  loadAll().then(function (raw) {
    if (raw.err) return signedOut(raw.err);
    RAW = raw;
    BASE = JSON.parse(JSON.stringify(raw.all.config || {}));
    raw.all.config = JSON.parse(JSON.stringify(BASE));
    build(RAW);
    document.body.classList.toggle('officer', M.officer);
    route();
    loadLinked();
    if (M.officer) call('extList').then(function (r) { if (r && r.ok) { STAND.ext = r.ext || []; render(); } });
  });
}
function rebuild() { RAW.all.config = M.cfg; build(RAW); }
function signedOut(err) {
  document.body.classList.add('out');
  $('view').innerHTML = '<section class="signin card"><h2>Sign in to the Org System first</h2>' +
    '<p>The dashboard uses the same account as the classic Org System. Sign in there, then come back to this page.</p>' +
    (err && err !== 'signin' ? '<p class="note warn">' + esc(err) + '</p>' : '') +
    '<div class="sheetacts"><a class="btn" href="/">Open the Org System</a><a class="btn ghost" href="/dash?demo">Try the demo</a></div></section>';
}

/* ---------- routing ---------- */
function parseHash() {
  var h = location.hash.replace(/^#/, ''), qi = h.indexOf('?'), q = {};
  if (qi > -1) { h.slice(qi + 1).split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }); h = h.slice(0, qi); }
  var parts = h.split('/'), v = parts[0] || 'overview';
  if (v === 'inbox') v = 'messages';
  if (!NAV.some(function (n) { return n.id === v && (!n.officer || !M || M.officer); })) v = 'overview';
  return {view: v, sub: parts[1] || '', q: q};
}
function route() {
  if (!M) return;
  ROUTE = parseHash();
  if (!$('drawer').hidden) closeSheet();
  if (ROUTE.view === 'members' && ROUTE.q.tag) { MEM.tags = [ROUTE.q.tag]; MEM.open = false; }
  render(true);
}
function render(fresh) {
  if (!M) return;
  var v = ROUTE.view;
  var body = VIEWS[v] ? VIEWS[v](ROUTE.sub) : renderOverview();
  if (v === 'messages' && !M.officer) markSeen();
  var title = NAV.filter(function (n) { return n.id === v; })[0];
  $('vtitle').textContent = !M.officer && title.member ? title.member : title.label;
  $('veyebrow').textContent = String(navFor().indexOf(title) + 1).padStart(2, '0') + ' / ' + title.group;
  document.title = (title.label === 'Overview' ? '' : title.label + ' · ') + 'Dashboard · ' + M.club;
  var view = $('view');
  view.innerHTML = body;
  drawNav();
  tickStats();
  if (fresh) { window.scrollTo(0, 0); revealCards(); }
}
function drawNav() {
  var unread = unreadCount(), sched = M.officer ? M.msgs.filter(function (m) { return m.status === 'scheduled'; }).length : 0;
  var g = M.officer ? gaps().filter(function (x) { return x.sev === 'high'; }).length : 0;
  var badge = function (id) {
    if (id === 'messages' && unread) return '<b class="nb">' + unread + '</b>';
    if (id === 'overview' && g) return '<b class="nb bad">' + g + '</b>';
    if (id === 'messages' && sched) return '<b class="nb soft">' + sched + '</b>';
    return '';
  };
  var link = function (n, short) {
    return '<a href="#' + n.id + '" class="' + (ROUTE.view === n.id ? 'on' : '') + '"' + (ROUTE.view === n.id ? ' aria-current="page"' : '') + '>' + icon(n.id) +
      '<span>' + esc(short ? (!M.officer && n.memberShort ? n.memberShort : n.short) : (!M.officer && n.member ? n.member : n.label)) + '</span>' + badge(n.id) + '</a>';
  };
  var groups = [], side = '';
  navFor().forEach(function (n) { if (groups.indexOf(n.group) < 0) groups.push(n.group); });
  groups.forEach(function (g) {
    side += '<p class="navg">' + esc(g) + '</p>' + navFor().filter(function (n) { return n.group === g; }).map(function (n) { return link(n, false); }).join('');
  });
  $('sidenav').innerHTML = side;
  var tabs = navFor().filter(function (n) { return n.tab; }).sort(function (a, b) { return a.tab - b.tab; });
  var inMore = tabs.every(function (n) { return n.id !== ROUTE.view; });
  $('tabbar').innerHTML = tabs.map(function (n) { return link(n, true); }).join('') +
    '<button class="' + (inMore ? 'on' : '') + '" data-act="more">' + icon('more') + '<span>More</span></button>';
  $('club').textContent = M.club;
  $('who').innerHTML = avatar(M.me) + '<span><span class="pn">' + esc(M.me.name) + '</span><span class="pe">' + esc(M.officer ? (M.master ? 'Master' : 'Officer') : 'Member') + (M.demo ? ' · demo' : '') + '</span></span>';
  var db = $('demobar');
  db.hidden = !M.demo;
  if (M.demo) db.innerHTML = 'Demo club: nothing is saved or sent. <a href="/dash?demo&amp;as=officer' + location.hash + '"' + (Demo.as !== 'member' ? ' class="on"' : '') + '>Officer view</a>' +
    '<a href="/dash?demo&amp;as=member' + location.hash + '"' + (Demo.as === 'member' ? ' class="on"' : '') + '>Member view</a><button class="link" data-act="resetDemo">Reset</button>';
}
function unreadCount() {
  if (M.officer) return 0;
  var seen = lsGet(KEYS.seen) || '';
  return M.inbox.filter(function (m) { return String(m.at) > seen; }).length;
}
function markSeen() { if (M.inbox[0]) lsSet(KEYS.seen, String(M.inbox[0].at)); }

/* ---------- motion: counted changes, and cards below the fold rising in ---------- */
function reduced() { return document.documentElement.getAttribute('data-motion') === 'calm' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
function setComfort(k, v) {
  lsSet(k === 'size' ? KEYS.size : KEYS.motion, v);
  var d = document.documentElement;
  if (k === 'size') { if (v === 'm') d.removeAttribute('data-size'); else d.setAttribute('data-size', v); }
  else d.setAttribute('data-motion', v);
}
/* A figure is only ever animated from the value it truly had a moment ago
   to the value it has now, so the screen never shows a number that was not
   real (snippets/ticker.md). */
function tickStats() {
  document.querySelectorAll('.stat').forEach(function (s) {
    var el = s.querySelector('.sv'), key = ROUTE.view + '|' + s.querySelector('.sl').textContent, to = parseFloat(el.getAttribute('data-to'));
    if (isNaN(to)) return;
    var from = PREV_STATS[key];
    PREV_STATS[key] = to;
    if (from == null || from === to || reduced()) return;
    var t0 = performance.now(), dur = 600;
    el.textContent = from;
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k < 1 ? Math.round(from + (to - from) * e) : to;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  });
}
/* The hiding class is only added from here, and only to cards that start
   below the fold (snippets/reveal.md). */
function revealCards() {
  if (reduced() || !('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, {rootMargin: '0px 0px -8% 0px'});
  document.querySelectorAll('#view .card, #view .evcol').forEach(function (c) {
    if (c.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    c.classList.add('reveal'); io.observe(c);
  });
}

/* ---------- theme ---------- */
/* The dashboard keeps its own choice (the classic page's stays the classic
   page's). Unless someone picks otherwise it wears deanzapbl.com: Φ PBL. */
var THEMES = {phi: 'Φ PBL', 'phi-light': 'PBL light', dark: 'Org dark', light: 'Org light'};
function applyTheme() {
  var t = lsGet(KEYS.dtheme) || 'phi';
  if (!THEMES[t]) t = 'phi';
  document.documentElement.setAttribute('data-theme', t);
}
function setTheme(t) { lsSet(KEYS.dtheme, t); applyTheme(); }
function cycleTheme() {
  var order = Object.keys(THEMES), cur = document.documentElement.getAttribute('data-theme') || 'phi';
  var next = order[(order.indexOf(cur) + 1) % order.length];
  setTheme(next); toast('Theme: ' + THEMES[next]);
  if (ROUTE.view === 'profile') render();
}

/* ---------- the sheet ---------- */
var SHEET_RENDER = null;
function openSheet(html, rerender) {
  SHEET_RENDER = rerender || null;
  var d = $('drawer');
  $('sheetbody').innerHTML = html;
  d.hidden = false;
  document.body.classList.add('sheeted');
  requestAnimationFrame(function () { d.classList.add('open'); var f = d.querySelector('input:not([type=checkbox]),select,textarea,button.btn'); if (f) f.focus({preventScroll: true}); });
}
function refreshSheet() { if (SHEET_RENDER && !$('drawer').hidden) $('sheetbody').innerHTML = SHEET_RENDER(); }
function closeSheet() {
  var d = $('drawer');
  d.classList.remove('open'); document.body.classList.remove('sheeted');
  setTimeout(function () { d.hidden = true; $('sheetbody').innerHTML = ''; }, reduced() ? 0 : 220);
  SHEET_RENDER = null; EDIT = null;
}
function confirmSheet(title, body, label, fn) {
  CONFIRM_FN = fn;
  openSheet('<header class="sh"><h3>' + esc(title) + '</h3></header><p>' + esc(body) + '</p><div class="sheetacts"><button class="btn" data-act="confirmYes">' + esc(label) + '</button><button class="btn ghost" data-act="closeSheet">Cancel</button></div>');
}
var CONFIRM_FN = null;
function toast(msg, bad) {
  var t = $('toast');
  t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = ''; }, 3200);
}

/* ---------- saving the club record ---------- */
function saveCfg(changes, okMsg) {
  if (!M.officer) return Promise.resolve(false);
  Object.keys(changes).forEach(function (k) { M.cfg[k] = changes[k]; });
  var patch = cfgPatch(M.cfg, BASE || {});
  rebuild(); render(); refreshSheet();
  if (!patch) return Promise.resolve(true);
  return call('setConfig', patch).then(function (r) {
    if (r && r.ok && r.cfg) {
      BASE = JSON.parse(JSON.stringify(r.cfg));
      M.cfg = JSON.parse(JSON.stringify(r.cfg));
      rebuild(); render(); refreshSheet();
      if (okMsg) toast(okMsg);
      return true;
    }
    toast((r && r.error) || 'Not saved: the backend did not answer. Try again.', true);
    M.cfg = JSON.parse(JSON.stringify(BASE)); rebuild(); render();
    return false;
  });
}
function reloadMsgs() {
  return Promise.all([M.officer ? call('msgList') : null, call('myInbox')]).then(function (r) {
    if (r[0]) RAW.msgs = r[0];
    if (r[1]) RAW.inbox = r[1];
    rebuild(); render();
  });
}
function cloneTeams() { return JSON.parse(JSON.stringify(M.cfg.teams || [])); }
function findTeam(list, id) { return list.filter(function (t) { return t.id === id; })[0]; }
function offFlc(list, name) {
  list.forEach(function (t) { if (t.kind === 'flc') t.members = (t.members || []).filter(function (m) { return flat(m) !== flat(name); }); });
}

/* ---------- compose helpers ---------- */
function syncCompose() {
  var f = $('cmp'); if (!f) return;
  CMP.title = f.title.value; CMP.body = f.body.value; CMP.url = f.url.value; CMP.email = f.email.checked;
  if (f.at) CMP.at = f.at.value;
}
function compose(o) {
  CMP = Object.assign({title: '', body: '', url: '/dash#inbox', target: {tags: [], names: [], every: false}, email: false, when: 'now', at: ''}, o || {});
  if (location.hash === '#messages/compose') render(true); else location.hash = '#messages/compose';
}
function syncEdit() {
  var f = document.querySelector('#sheetbody form[data-act="saveItem"]'); if (!f || !EDIT) return;
  ['title', 'topic', 'label', 'date', 'start', 'end', 'where', 'coach', 'link', 'due', 'detail', 'kind', 'event'].forEach(function (k) { if (f[k]) EDIT.item[k] = f[k].value; });
  ['tentative', 'remind'].forEach(function (k) { if (f[k]) EDIT.item[k] = f[k].checked; });
}
function openEditor(kind, item, isNew) {
  EDIT = {kind: kind, item: JSON.parse(JSON.stringify(item)), isNew: isNew};
  if (!EDIT.item['for']) EDIT.item['for'] = {tags: ['sfblc'], names: []};
  openSheet(editorSheet(), editorSheet);
}
function targetOf(act) { return act.indexOf('cmp') === 0 ? CMP.target : EDIT.item['for']; }
function afterTarget(act) {
  if (act.indexOf('cmp') === 0) render(); else refreshSheet();
}

/* ---------- actions ---------- */
var RUN = {
  starter: function () {
    var st = SFBLC.starter(), ch = {};
    Object.keys(st).forEach(function (k) {
      var cur = M.cfg[k];
      if (Array.isArray(st[k]) ? !(cur && cur.length) : !cur) ch[k] = st[k];
    });
    if (!Object.keys(ch).length) return toast('The SFBLC schedule and checklist are already set up.');
    saveCfg(ch, 'SFBLC 2026 starter loaded. Add times as CAPBL sends them.');
  },
  fixEvents: function () {
    var off = M.events.filter(function (e) { return SFBLC.events.indexOf(e) < 0; });
    confirmSheet('Use the SFBLC 2026 event list?', 'Events become ' + SFBLC.events.join(', ') + '. ' +
      (off.length ? off.join(' and ') + ' go away; members who ranked ' + (off.length === 1 ? 'it' : 'them') + ' keep their other choices. ' : '') +
      'The classic Teams tab uses the same list.', 'Update the events', function () {
      saveCfg({flcEvents: SFBLC.events.slice()}, 'Events updated for SFBLC 2026.');
    });
  },
  composeReg: function () { var t = TEMPLATES[0]; compose({title: t[1], body: t[2], target: JSON.parse(JSON.stringify(t[3])), url: t[4], email: true}); },
  importTeams: function () { IMPORT.teams().catch(function (e) { toast(e.message, true); }); },
  importRooms: function () { IMPORT.rooms().catch(function (e) { toast(e.message, true); }); },
  composePush: function () {
    var ppl = M.people.filter(function (p) { return p.going && p.reach === false; });
    compose({title: 'Turn on phone notifications for SFBLC', body: 'Schedule changes and reminders go out as notifications. Open the Org System from its home-screen icon, then Homework → Phone notifications → Turn on.',
             target: {tags: [], names: ppl.map(function (p) { return p.name; }), every: false}, email: true, url: '/homework'});
  }
};
function act(el, ev) {
  var a = el.getAttribute('data-act'), d = el.dataset;
  switch (a) {
    case 'run':
      if (d.run.indexOf('addCoaching:') === 0) { var e = d.run.slice(12); return openEditor('sfCoaching', {id: uid('k'), event: e, topic: e + ' coaching', date: today(), start: '18:00', end: '19:00', 'for': {tags: ['ev:' + e], names: []}}, true); }
      return RUN[d.run] && RUN[d.run]();
    case 'closeSheet': return closeSheet();
    case 'more':
      return openSheet('<header class="sh"><h3>Everything</h3></header><div class="morenav">' + navFor().map(function (n, i) {
        return '<a href="#' + n.id + '" data-close class="' + (ROUTE.view === n.id ? 'on' : '') + '"><span class="nn">' + String(i + 1).padStart(2, '0') + '</span>' + icon(n.id) +
          '<span class="nl">' + esc(!M.officer && n.member ? n.member : n.label) + '</span></a>';
      }).join('') + '</div><a class="classic" href="/">Open the classic view</a>');
    case 'confirmYes': { var fn = CONFIRM_FN; CONFIRM_FN = null; closeSheet(); return fn && fn(); }
    case 'theme': return cycleTheme();
    case 'resetDemo': Demo.reset(); location.reload(); return;

    /* members */
    case 'toggleFilters': MEM.open = !MEM.open; return render();
    case 'untag': MEM.tags = MEM.tags.filter(function (g) { return g !== d.tag; }); return render();
    case 'clearTags': MEM.tags = []; return render();
    case 'every': MEM.every = !MEM.every; return render();
    case 'sel': MEM.sel[d.key] = el.checked; return render();
    case 'profile': { var p = M.byKey[d.key]; if (p) openSheet(profileSheet(p), function () { return profileSheet(M.byKey[d.key]); }); return; }
    case 'messageList': {
      var keys = Object.keys(MEM.sel).filter(function (k) { return MEM.sel[k]; });
      var list = keys.length ? keys.map(function (k) { return M.byKey[k]; }).filter(Boolean) : filteredPeople();
      var all = list.length === M.people.length;
      var tgt = all ? {tags: ['all'], names: []} : !keys.length && MEM.tags.length && !MEM.q ? {tags: MEM.tags.slice(), names: [], every: MEM.every} : {tags: [], names: list.map(function (p) { return p.name; })};
      return compose({target: tgt});
    }
    case 'messageOne': { var p1 = M.byKey[d.key]; closeSheet(); return compose({target: {tags: [], names: [p1.name]}}); }
    case 'tagSel':
      return openSheet('<form class="form" data-act="tagSelSave"><header class="sh"><h3>Tag ' + plural(Object.keys(MEM.sel).filter(function (k) { return MEM.sel[k]; }).length, 'person', 'people') + '</h3></header>' +
        '<label class="fld"><span>Tag</span><input name="t" maxlength="30" required list="taglist2" placeholder="e.g. Needs a ride, Captain, Registered"></label><datalist id="taglist2">' +
        Object.keys(allCustom()).map(function (k) { return '<option value="' + esc(k) + '">'; }).join('') + '</datalist>' +
        '<p class="meta">Officer tags are only shown to officers. Messages can be sent to everyone with a tag.</p><div class="sheetacts"><button class="btn">Add tag</button></div></form>');
    case 'rmTag': {
      var mt = JSON.parse(JSON.stringify(M.cfg.memberTags || {}));
      mt[d.key] = (mt[d.key] || []).filter(function (t) { return t !== d.tag; });
      if (!mt[d.key].length) delete mt[d.key];
      return saveCfg({memberTags: mt}, 'Tag removed.');
    }
    case 'csv': {
      var rows = [['Name', 'Email', 'Year', 'Track', 'Org', 'SFBLC events', 'Tags']].concat(filteredPeople().map(function (p) {
        return [p.name, p.email, p.year ? p.year + '' : '', p.track, p.org, p.events.join('; '), (p.tags || []).map(function (t) { return t.label; }).join('; ')];
      }));
      var csv = rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); if (/^[=+\-@]/.test(c)) c = "'" + c; return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
      var a2 = document.createElement('a');
      a2.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a2.download = 'members' + (MEM.tags.length ? '-' + MEM.tags.map(tagLabel).join('-').replace(/[^A-Za-z0-9-]+/g, '') : '') + '.csv';
      document.body.appendChild(a2); a2.click(); a2.remove();
      return;
    }

    /* SFBLC */
    case 'mine': SFV.mine = d.v === '1'; return render();
    case 'new': {
      var base = {sfSchedule: {date: sfInfo().start, start: '', end: '', title: '', where: '', kind: 'general'}, sfCoaching: {date: today(), start: '18:00', end: '19:00', topic: '', coach: ''}, sfChecklist: {label: '', due: '', detail: ''}}[d.kind];
      return openEditor(d.kind, Object.assign({id: uid(d.kind === 'sfCoaching' ? 'k' : d.kind === 'sfChecklist' ? 'c' : 's')}, base), true);
    }
    case 'edit': { var it = sf(d.kind).filter(function (x) { return x.id === d.id; })[0]; if (it) openEditor(d.kind, it, false); return; }
    case 'delItem':
      return confirmSheet('Delete this?', 'It disappears for everyone, and no reminders go out for it.', 'Delete', (function (k, id) {
        return function () { saveCfg(Object.fromEntries([[k, sf(k).filter(function (x) { return x.id !== id; })]]), 'Deleted.'); };
      })(EDIT.kind, EDIT.item.id));
    case 'tick': {
      var on = el.checked, id2 = d.id;
      M.myDone[id2] = on; if (!on) delete M.myDone[id2];
      if (RAW.inbox) RAW.inbox.done = M.myDone;
      return call('sfCheck', {id: id2, done: on}).then(function (r) {
        if (!(r && r.ok)) { toast('Not saved. Try again.', true); delete M.myDone[id2]; rebuild(); render(); }
        else { render(); if (on) toast('Ticked off.'); }
      });
    }
    case 'nudge': {
      var c = sf('sfChecklist').filter(function (x) { return x.id === d.id; })[0], done = {};
      (M.done[c.id] || []).forEach(function (k) { done[k] = 1; });
      var left = resolve(c['for']).filter(function (p) { return !done[p.key]; });
      return compose({title: 'Reminder: ' + c.label, body: (c.due ? 'Due ' + fmtDay(c.due) + '. ' : '') + (c.detail || '') + ' Tick it off on your dashboard once it is done.',
                      target: {tags: [], names: left.map(function (p) { return p.name; })}, url: '/dash#sfblc/checklist'});
    }

    /* teams */
    case 'newTeam': {
      var evs = boardEvents();
      return openSheet('<form class="form" data-act="newTeamSave"><header class="sh"><h3>New SFBLC team</h3></header>' +
        '<label class="fld"><span>Event</span><select name="ev">' + evs.map(function (x) { return '<option' + (x === d.ev ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label>' +
        '<label class="fld"><span>Team name</span><input name="nm" maxlength="40" placeholder="Leave empty for “' + esc((d.ev || evs[0]) + ' ' + (M.teams.filter(function (t) { return t.kind === 'flc' && t.event === (d.ev || evs[0]); }).length + 1)) + '”"></label>' +
        '<div class="sheetacts"><button class="btn">Create team</button></div></form>');
    }
    case 'renameTeam': {
      var t0 = findTeam(M.teams, d.id);
      return openSheet('<form class="form" data-act="renameSave" data-id="' + esc(d.id) + '"><header class="sh"><h3>Rename team</h3></header>' +
        '<label class="fld"><span>Name</span><input name="nm" maxlength="40" value="' + esc(t0.name || '') + '" required></label><div class="sheetacts"><button class="btn">Save</button></div></form>');
    }
    case 'dropTeam': {
      var tl = cloneTeams().filter(function (t) { return t.id !== d.id; });
      return saveCfg({teams: tl}, 'Team deleted.');
    }
    case 'autofill': {
      var tl2 = cloneTeams(), placed = 0;
      var count = function (e) { return tl2.filter(function (t) { return t.kind === 'flc' && t.event === e; }); };
      M.people.filter(function (p) { return p.going && !p.events.length; }).forEach(function (p) {
        var choices = (p.prefs.flc || []).filter(function (e) { return boardEvents().indexOf(e) > -1; });
        for (var i = 0; i < choices.length; i++) {
          var e = choices[i], cap = capFor(M.cfg, e).max, ts = count(e);
          var t = ts.filter(function (x) { return (x.members || []).length < cap; })[0];
          if (!t && ts.length < 3) { t = {id: uid('flc'), kind: 'flc', event: e, name: e + ' ' + (ts.length + 1), members: [], track: 'k', client: '', pms: [], initiatives: [], assign: {}}; tl2.push(t); }
          if (t) { t.members.push(p.name); placed++; return; }
        }
      });
      if (!placed) return toast('No one could be placed: their ranked events are full.', true);
      return saveCfg({teams: tl2}, plural(placed, 'member') + ' placed by their highest choice with room.');
    }
    case 'cancelMsg':
      return call('msgCancel', {id: d.id}).then(function (r) { toast(r && r.ok ? 'Cancelled.' : (r && r.error) || 'Not cancelled.', !(r && r.ok)); reloadMsgs(); });
    case 'when': syncCompose(); CMP.when = d.v; return render();
    case 'tpl': {
      var tp = TEMPLATES[+d.i];
      syncCompose();
      CMP.title = tp[1]; CMP.body = tp[2]; CMP.url = tp[4];
      if (!CMP.target.tags.length && !CMP.target.names.length) CMP.target = JSON.parse(JSON.stringify(tp[3]));
      return render();
    }
  }
  if (ACT_EXT[a]) return ACT_EXT[a](el, d, ev);
  /* audience pickers: cmp* for the composer, ed* for the item editor */
  var m = /^(cmp|ed)(Rm|RmName)$/.exec(a);
  if (m) {
    if (m[1] === 'cmp') syncCompose(); else syncEdit();
    var tg = targetOf(a);
    if (m[2] === 'Rm') tg.tags = tg.tags.filter(function (g) { return g !== d.tag; });
    else tg.names = (tg.names || []).filter(function (n) { return n !== d.name; });
    return afterTarget(a);
  }
}
function change(el) {
  var a = el.getAttribute('data-act'), d = el.dataset, v = el.value;
  var m = /^(cmp|ed)(Add|Name|Every)$/.exec(a || '');
  if (m) {
    if (m[1] === 'cmp') syncCompose(); else syncEdit();
    var tg = targetOf(a);
    tg.tags = tg.tags || []; tg.names = tg.names || [];
    if (m[2] === 'Add' && v) {
      if (v === 'all') tg.tags = ['all'];
      else {
        /* Picking something narrower than "Everyone" or "Going to SFBLC" replaces it; the union would still be everyone. */
        var broad = tg.tags.length === 1 && (tg.tags[0] === 'all' || (tg.tags[0] === 'sfblc' && v !== 'sfblc'));
        tg.tags = broad ? [] : tg.tags.filter(function (g) { return g !== 'all'; });
        if (tg.tags.indexOf(v) < 0) tg.tags.push(v);
      }
    }
    if (m[2] === 'Name') { var p = M.byKey[flat(v)]; if (!p) return; if (tg.names.indexOf(p.name) < 0) tg.names.push(p.name); }
    if (m[2] === 'Every') tg.every = el.checked;
    return afterTarget(a);
  }
  if (CHANGE_EXT[a]) return CHANGE_EXT[a](el, d, v);
  switch (a) {
    case 'move': {
      if (!v) return;
      var tl = cloneTeams(), from = findTeam(tl, d.team);
      from.members = from.members.filter(function (x) { return x !== d.name; });
      if (v !== '-') { offFlc(tl, d.name); findTeam(tl, v).members.push(d.name); }
      return saveCfg({teams: tl}, v === '-' ? d.name + ' taken off ' + teamName(from) + '.' : d.name + ' moved to ' + teamName(findTeam(tl, v)) + '.');
    }
    case 'addTo': case 'place': {
      if (!v) return;
      var key = a === 'place' ? d.key : v, tid = a === 'place' ? v : d.team, p2 = M.byKey[key];
      var tl3 = cloneTeams(); offFlc(tl3, p2.name);
      var t = findTeam(tl3, tid); t.members = (t.members || []).concat([p2.name]);
      return saveCfg({teams: tl3}, p2.name + ' is on ' + teamName(t) + '.');
    }
    case 'cap': {
      var info = JSON.parse(JSON.stringify(M.cfg.sfInfo || {})), caps = info.caps || JSON.parse(JSON.stringify(SFBLC.caps));
      caps[d.ev] = [1, Math.max(1, Math.min(6, +v || 1))]; info.caps = caps;
      return saveCfg({sfInfo: info}, d.ev + ': up to ' + caps[d.ev][1] + ' per team.');
    }
    case 'auto': {
      var au = sfAuto(); au[d.k] = el.checked;
      return saveCfg({sfAuto: au}, d.k === 'on' ? (el.checked ? 'Automatic messages on.' : 'Automatic messages off.') : 'Saved.');
    }
  }
}
function submit(form, e) {
  e.preventDefault();
  var a = form.getAttribute('data-act');
  if (a === 'send') {
    syncCompose();
    var who = resolve(CMP.target);
    if (!CMP.title.trim() || !who.length) return toast('Add a title and at least one person.', true);
    var later = CMP.when === 'later' && CMP.at;
    if (later && new Date(CMP.at).getTime() < Date.now() + 60000) return toast('Pick a time in the future.', true);
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    return call('msgSend', {title: CMP.title.trim(), body: CMP.body.trim(), url: CMP.url, target: wireTarget(CMP.target), email: CMP.email,
                            at: later ? new Date(CMP.at).toISOString() : null}).then(function (r) {
      if (!(r && r.ok)) { btn.disabled = false; return toast((r && r.error) || 'Not sent: the backend did not answer.', true); }
      toast(later ? 'Scheduled for ' + new Date(CMP.at).toLocaleString(undefined, {weekday: 'short', hour: 'numeric', minute: '2-digit'}) + '.' : 'Sending to ' + plural(who.length, 'person', 'people') + '.');
      CMP = {title: '', body: '', url: '/dash#inbox', target: {tags: [], names: [], every: false}, email: false, when: 'now', at: ''};
      location.hash = '#messages/log';
      reloadMsgs();
    });
  }
  if (a === 'saveItem') {
    syncEdit();
    var it = EDIT.item, k = EDIT.kind;
    ['title', 'topic', 'label', 'where', 'coach', 'detail'].forEach(function (f) { if (it[f] != null) it[f] = clean(it[f], f === 'detail' ? 240 : 80); });
    if (it.link) it.link = safeUrl(it.link);
    var list = sf(k).slice(), i = list.map(function (x) { return x.id; }).indexOf(it.id);
    if (i > -1) list[i] = it; else list.push(it);
    var ch = {}; ch[k] = list;
    closeSheet();
    return saveCfg(ch, 'Saved.' + (k !== 'sfChecklist' && it.start && it.remind !== false && sfAuto().on ? ' Reminders will go out.' : ''));
  }
  if (a === 'addTag' || a === 'tagSelSave') {
    var t = clean(form.t.value, 30).trim(); if (!t) return;
    var keys = a === 'addTag' ? [form.getAttribute('data-key')] : Object.keys(MEM.sel).filter(function (x) { return MEM.sel[x]; });
    var mt = JSON.parse(JSON.stringify(M.cfg.memberTags || {}));
    keys.forEach(function (kk) { mt[kk] = mt[kk] || []; if (mt[kk].indexOf(t) < 0) mt[kk].push(t); });
    if (a === 'tagSelSave') { closeSheet(); MEM.sel = {}; }
    return saveCfg({memberTags: mt}, '“' + t + '” added to ' + plural(keys.length, 'person', 'people') + '.');
  }
  if (a === 'newTeamSave') {
    var ev = form.ev.value, tl = cloneTeams(), n = tl.filter(function (x) { return x.kind === 'flc' && x.event === ev; }).length;
    tl.push({id: uid('flc'), kind: 'flc', event: ev, name: clean(form.nm.value, 40).trim() || ev + ' ' + (n + 1), members: [], track: 'k', client: '', pms: [], initiatives: [], assign: {}});
    closeSheet();
    return saveCfg({teams: tl}, 'Team created.');
  }
  if (SUBMIT_EXT[a]) return SUBMIT_EXT[a](form);
  if (a === 'renameSave') {
    var tl4 = cloneTeams(), tt = findTeam(tl4, form.getAttribute('data-id'));
    tt.name = clean(form.nm.value, 40).trim() || tt.name;
    closeSheet();
    return saveCfg({teams: tl4}, 'Renamed.');
  }
}

/* ---------- wiring ---------- */
document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-act]');
  if (el && el.tagName !== 'SELECT' && el.tagName !== 'FORM' && !(el.tagName === 'INPUT' && el.type !== 'checkbox')) {
    if (el.tagName === 'INPUT' && el.type === 'checkbox') { if (el.getAttribute('data-act') === 'sel' || el.getAttribute('data-act') === 'tick') return act(el, e); return; }
    e.preventDefault(); return act(el, e);
  }
  /* A tag anywhere filters the members list by it. */
  var c = e.target.closest('.chip[data-tag]');
  if (c && !c.closest('.aud') && !c.closest('#sheetbody .tpls')) {
    var id = c.getAttribute('data-tag');
    if (c.closest('.filters')) { MEM.tags = MEM.tags.indexOf(id) > -1 ? MEM.tags.filter(function (g) { return g !== id; }) : MEM.tags.concat([id]); return render(); }
    MEM.tags = [id]; MEM.q = ''; closeSheet(); location.hash = '#members';
    if (ROUTE.view === 'members') render();
    return;
  }
  if (e.target.closest('.scrim') || e.target.closest('[data-close]')) closeSheet();
});
document.addEventListener('change', function (e) {
  var el = e.target;
  if (el.matches('select[data-act], input[type=number][data-act], input[data-act="auto"], input[data-act$="Every"]')) return change(el);
  if (el.matches('input[data-act$="Name"]')) return change(el);
});
document.addEventListener('submit', function (e) { var f = e.target.closest('form[data-act]'); if (f) submit(f, e); });
document.addEventListener('input', function (e) {
  var el = e.target;
  if (el.id === 'mq') {
    MEM.q = el.value;
    clearTimeout(document.mqT);
    document.mqT = setTimeout(function () {
      render();
      var i = $('mq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }, 160);
  }
  var f = el.closest('#cmp');
  if (f && (el.name === 'title' || el.name === 'body')) {
    syncCompose();
    var n = document.querySelector('.notif');
    if (n) { n.querySelector('b').textContent = CMP.title || 'Title'; n.querySelector('span:last-child').textContent = (CMP.body || 'Message').slice(0, 240); }
    var cc = f.querySelector('.cc'); if (cc) cc.textContent = CMP.body.length + '/600 · notifications show the first 240';
  }
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('drawer').hidden) closeSheet(); });
window.addEventListener('hashchange', route);
$('themebtn').addEventListener('click', cycleTheme);
boot();
