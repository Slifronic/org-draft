/* Search everything: ⌘K / Ctrl+K, "/" or the top bar's search button. One
   box for screens, people, teams, tags, schedule items, homework and the
   common actions, so nothing is more than a few keystrokes (or one tap)
   away. Results are worked out from M on every keystroke; nothing is fetched. */
'use strict';

var PAL = {open: false, q: '', sel: 0, items: []};

function palResults(q) {
  var f = flat(q), out = [];
  var hit = function (s) { return !f || flat(s).indexOf(f) > -1; };
  var push = function (group, label, sub, ic, run) { out.push({group: group, label: label, sub: sub, icon: ic, run: run}); };
  var go = function (h) { return function () { location.hash = h; }; };

  var acts = M.officer ? [
    ['New message', 'Messages', 'send', go('#messages/compose')],
    ['Set an assignment', 'Homework', 'homework', function () { location.hash = '#homework'; setTimeout(function () { ACT_EXT.hwNew(); }, 50); }],
    ['Take attendance', 'Attendance', 'attendance', go('#attendance/take')],
    ['Add to the SFBLC schedule', 'SFBLC', 'plus', function () { location.hash = '#sfblc/schedule'; setTimeout(function () { openEditor('sfSchedule', {id: uid('s'), date: sfInfo().start, start: '', end: '', title: '', where: '', kind: 'general'}, true); }, 50); }],
    ['Add a coaching session', 'SFBLC', 'plus', function () { location.hash = '#sfblc/coaching'; setTimeout(function () { openEditor('sfCoaching', {id: uid('k'), date: today(), start: '18:00', end: '19:00', topic: '', coach: ''}, true); }, 50); }],
    ['Award a cup', 'Org Cup', 'cup', function () { location.hash = '#cup'; setTimeout(function () { ACT_EXT.cupNew(); }, 50); }],
    ['Import teams from the master sheet', 'Linked sheets', 'teams', function () { RUN.importTeams(); }],
    ['Gaps to close before SFBLC', 'Overview', 'overview', go('#overview')]
  ] : [
    ['Hand in homework', 'Homework', 'homework', go('#homework')],
    ['My SFBLC team', 'Teams', 'teams', go('#teams')],
    ['My checklist', 'SFBLC', 'sfblc', go('#sfblc/checklist')],
    ['Turn on phone notifications', 'Profile', 'bell', go('#profile')]
  ];
  acts.forEach(function (a) { if (hit(a[0] + ' ' + a[1])) push('Do', a[0], a[1], a[2], a[3]); });
  navFor().forEach(function (n) {
    var label = !M.officer && n.member ? n.member : n.label;
    if (hit(label + ' ' + n.group)) push('Go to', label, n.group, n.id, go('#' + n.id));
  });
  if (f) {
    M.people.filter(function (p) {
      return p.key.indexOf(f) > -1 || (M.officer && flat(p.email).indexOf(f) > -1);
    }).slice(0, 8).forEach(function (p) {
      push('People', p.name, [p.org, p.events.join(', ')].filter(Boolean).join(' · ') || (p.year === 2 ? '2nd year' : p.year ? '1st year' : ''), 'profile', function () {
        openSheet(profileSheet(p), function () { return profileSheet(M.byKey[p.key]); });
      });
    });
    M.teams.filter(function (t) { return hit(teamName(t) + ' ' + (t.event || '') + ' ' + (t.client || '')); }).slice(0, 5).forEach(function (t) {
      push('Teams', teamName(t), (t.kind === 'flc' ? 'SFBLC · ' + t.event : 'Consulting') + ' · ' + plural((t.members || []).length, 'person', 'people'), 'teams', function () {
        if (M.officer) compose({target: {tags: ['team:' + t.id], names: []}}); else location.hash = '#teams';
      });
    });
    var seen = {};
    M.people.forEach(function (p) { (p.tags || []).forEach(function (t) { if (!seen[t.id] && !t.quiet && hit(t.label)) { seen[t.id] = 1; } }); });
    Object.keys(seen).slice(0, 6).forEach(function (id) {
      var n = M.people.filter(function (p) { return hasTag(p, id); }).length;
      push('Tags', tagLabel(id), plural(n, 'member') + ' · filter Members', 'members', function () { MEM.tags = [id]; MEM.q = ''; location.hash = '#members'; render(); });
    });
    sf('sfSchedule').concat(sf('sfCoaching')).filter(function (it) { return hit((it.title || it.topic) + ' ' + (it.where || '') + ' ' + (it.coach || '')) && (M.officer || isForMe(it)); }).slice(0, 5).forEach(function (it) {
      push('Schedule', it.title || it.topic, fmtDay(it.date) + (it.start ? ' · ' + fmtTime(it.start) : '') + (it.where ? ' · ' + it.where : ''), 'calendar', go(it.topic ? '#sfblc/coaching' : '#sfblc/schedule'));
    });
    works().filter(function (w) { return hit(w.title) && (M.officer || workFor(w, M.me)); }).slice(0, 4).forEach(function (w) {
      push('Homework', w.title, w.due ? 'Due ' + fmtDay(w.due) : 'No due date', 'homework', go('#homework'));
    });
  }
  return out;
}
function palDraw() {
  var box = $('palbody'); if (!box) return;
  PAL.items = palResults(PAL.q);
  if (PAL.sel >= PAL.items.length) PAL.sel = Math.max(0, PAL.items.length - 1);
  var group = '', h = '';
  PAL.items.forEach(function (it, i) {
    if (it.group !== group) { group = it.group; h += '<p class="pg">' + esc(group) + '</p>'; }
    h += '<button class="pi' + (i === PAL.sel ? ' on' : '') + '" data-i="' + i + '" role="option" aria-selected="' + (i === PAL.sel) + '" id="pi' + i + '">' + icon(it.icon) +
      '<span><span class="pl1">' + esc(it.label) + '</span>' + (it.sub ? '<span class="pl2">' + esc(it.sub) + '</span>' : '') + '</span></button>';
  });
  box.innerHTML = h || '<p class="pempty">Nothing matches “' + esc(PAL.q) + '”.</p>';
  var on = $('pi' + PAL.sel);
  if (on) { on.scrollIntoView({block: 'nearest'}); $('palq').setAttribute('aria-activedescendant', 'pi' + PAL.sel); }
}
function palOpen() {
  if (!M) return;
  var el = $('palette');
  if (!el) {
    el = document.createElement('div');
    el.id = 'palette'; el.className = 'palette';
    el.innerHTML = '<div class="pscrim" data-pal-close></div><div class="pbox" role="dialog" aria-modal="true" aria-label="Search">' +
      '<label class="pin">' + icon('search') + '<input id="palq" placeholder="Search people, teams, tags, screens…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="palbody"><kbd>esc</kbd></label>' +
      '<div id="palbody" class="pbody" role="listbox"></div><p class="pfoot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>⌘K</kbd> anywhere</span></p></div>';
    document.body.appendChild(el);
    $('palq').addEventListener('input', function (e) { PAL.q = e.target.value; PAL.sel = 0; palDraw(); });
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-pal-close]')) return palClose();
      var b = e.target.closest('.pi'); if (b) palRun(+b.getAttribute('data-i'));
    });
  }
  PAL.open = true; PAL.q = ''; PAL.sel = 0;
  el.hidden = false; $('palq').value = '';
  document.body.classList.add('sheeted');
  palDraw();
  requestAnimationFrame(function () { el.classList.add('open'); $('palq').focus(); });
}
function palClose() {
  var el = $('palette'); if (!el) return;
  PAL.open = false; el.classList.remove('open'); el.hidden = true;
  if ($('drawer').hidden) document.body.classList.remove('sheeted');
}
function palRun(i) {
  var it = PAL.items[i]; if (!it) return;
  palClose(); it.run();
}
document.addEventListener('keydown', function (e) {
  var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '');
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return PAL.open ? palClose() : palOpen(); }
  if (!PAL.open) { if (e.key === '/' && !typing && $('drawer').hidden) { e.preventDefault(); palOpen(); } return; }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); palClose(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); PAL.sel = Math.min(PAL.items.length - 1, PAL.sel + 1); palDraw(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); PAL.sel = Math.max(0, PAL.sel - 1); palDraw(); }
  else if (e.key === 'Enter') { e.preventDefault(); palRun(PAL.sel); }
}, true);
ACT_EXT.palette = function () { palOpen(); };
