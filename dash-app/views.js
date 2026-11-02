/* The dashboard's screens. Each render* returns HTML for #view from M (see
   core.js); app.js wires the clicks. Everything typed by a person goes
   through esc() on the way in. */
'use strict';

var ICONS = {
  overview: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z"/>',
  members: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.4.2 4.2 1.8 4.8 4.8"/>',
  sfblc: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/><path d="M8.5 14.5l2 2 4-4"/>',
  teams: '<rect x="3.5" y="4" width="7" height="7" rx="1.5"/><rect x="13.5" y="4" width="7" height="7" rx="1.5"/><rect x="3.5" y="14" width="7" height="6" rx="1.5"/><rect x="13.5" y="14" width="7" height="6" rx="1.5"/>',
  messages: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  pin: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  homework: '<path d="M6 3.5h9l3 3V20.5H6z"/><path d="M14.5 3.5V7H18M9 12h6M9 15.5h6"/>',
  cup: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 3 3.5M17 6h2.5a2.5 2.5 0 0 1-3 3.5M12 14v3.5M8.5 20.5h7M9.5 17.5h5"/>',
  orgs: '<circle cx="12" cy="6.5" r="2.5"/><circle cx="5.5" cy="17" r="2.5"/><circle cx="18.5" cy="17" r="2.5"/><path d="M10.5 8.5l-3.5 6M13.5 8.5l3.5 6M8 17h8"/>',
  attendance: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  profile: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
  tools: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17v3h3l5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  more: '<circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 7M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>', arrow: '<path d="M7 17L17 7M9 7h8v8"/>',
  board: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
  consulting: '<rect x="3.5" y="7" width="17" height="12.5" rx="1.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/>',
  standing: '<path d="M12 3.5l7 3v5.5c0 4.3-3 7.4-7 8.5-4-1.1-7-4.2-7-8.5V6.5z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>'
};
function icon(n, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }

/* group: the sidebar section it sits under. tab: on the phone's bottom bar
   (the rest are under More). officer: officers only. */
/* Grouped the way the chapter is: the Org Program, the Competitions and
   Consulting divisions, and the people side the EBOD runs. */
var NAV = [
  {id: 'overview', label: 'Overview', short: 'Home', group: 'Chapter', tab: 1},
  {id: 'calendar', label: 'Calendar', short: 'Calendar', group: 'Chapter'},
  {id: 'messages', label: 'Messages', short: 'Messages', member: 'Inbox', memberShort: 'Inbox', group: 'Chapter', tab: 4},
  {id: 'board', label: 'EBOD', short: 'EBOD', group: 'Chapter'},
  {id: 'orgs', label: 'Orgs', short: 'Orgs', group: 'Org Program'},
  {id: 'homework', label: 'Homework', short: 'Homework', group: 'Org Program', tab: 3},
  {id: 'cup', label: 'Org Cup', short: 'Org Cup', group: 'Org Program'},
  {id: 'sfblc', label: 'SFBLC', short: 'SFBLC', group: 'Competitions', tab: 2},
  {id: 'teams', label: 'Competition teams', short: 'Teams', group: 'Competitions'},
  {id: 'consulting', label: 'Client teams', short: 'Consulting', group: 'Consulting'},
  {id: 'members', label: 'Internal Members', short: 'Members', group: 'Members'},
  {id: 'standing', label: 'Standing', short: 'Standing', group: 'Members', officer: 1},
  {id: 'attendance', label: 'Attendance', short: 'Attendance', group: 'Members', officer: 1},
  {id: 'profile', label: 'Profile', short: 'Profile', group: 'You'},
  {id: 'tools', label: 'Officer tools', short: 'Tools', group: 'You', officer: 1}
];
function navFor() { return NAV.filter(function (n) { return !n.officer || M.officer; }); }

function chip(t, opts) {
  opts = opts || {};
  var g = GROUPS[t.group] || {tone: 'ink'};
  return '<button type="button" class="chip tone-' + g.tone + (opts.on ? ' on' : '') + (t.quiet ? ' quiet' : '') + '" data-tag="' + esc(t.id) + '"' +
    (opts.title ? ' title="' + esc(opts.title) + '"' : '') + '>' + esc(t.label) +
    (t.count > 1 ? '<b>' + t.count + '</b>' : '') + (opts.n != null ? '<i>' + opts.n + '</i>' : '') + '</button>';
}
function forChips(target) {
  var t = target || {}, tags = t.tags || [], names = t.names || [];
  if (!tags.length && !names.length) return '<span class="for">Everyone</span>';
  var parts = tags.map(function (g) { return esc(tagLabel(g)); });
  if (names.length) parts.push(names.length <= 2 ? names.map(esc).join(', ') : plural(names.length, 'person', 'people'));
  return '<span class="for">' + parts.join(t.every ? ' + ' : ' · ') + '</span>';
}
function empty(title, body, btn) {
  return '<div class="empty"><p class="et">' + esc(title) + '</p>' + (body ? '<p>' + esc(body) + '</p>' : '') + (btn || '') + '</div>';
}
function avatar(p) {
  var b = String(p.name || '?').split(/\s+/);
  return '<span class="av" aria-hidden="true">' + esc((b[0] || '?')[0] + ((b[1] || '')[0] || '')) + '</span>';
}
function stat(label, value, sub, tone) {
  return '<div class="stat' + (tone ? ' ' + tone : '') + '"><span class="sl">' + esc(label) + '</span><span class="sv num" data-to="' + (typeof value === 'number' ? value : '') + '">' +
    esc(value) + '</span>' + (sub ? '<span class="ss">' + sub + '</span>' : '') + '</div>';
}
function subtabs(cur, list, base) {
  return '<div class="subtabs" role="tablist">' + list.map(function (x) {
    return '<a role="tab" href="#' + base + '/' + x[0] + '" class="' + (cur === x[0] ? 'on' : '') + '" aria-selected="' + (cur === x[0]) + '">' + esc(x[1]) +
      (x[2] ? '<b>' + x[2] + '</b>' : '') + '</a>';
  }).join('') + '</div>';
}
function itemRow(o, edit, noDay) {
  var it = o.it, coach = o.kind === 'coaching';
  var title = coach ? (it.topic || 'Coaching session') : it.title;
  return '<li class="item k-' + esc(coach ? 'coach' : (it.kind || 'general')) + '">' +
    '<div class="when">' + (noDay ? '' : '<span class="d">' + esc(fmtDay(it.date)) + '</span>') + '<span class="t">' + esc(fmtSpan(it)) + '</span></div>' +
    '<div class="what"><p class="tt">' + esc(title) + (it.tentative ? ' <span class="badge">Tentative</span>' : '') + '</p>' +
    (it.note ? '<p class="mb sm">' + esc(it.note) + '</p>' : '') +
    '<p class="meta">' + (it.where ? icon('pin') + esc(it.where) : '') + (coach && it.coach ? ' · with ' + esc(it.coach) : '') +
    (safeUrl(it.link) ? ' · <a href="' + esc(safeUrl(it.link)) + '" target="_blank" rel="noopener">Join link</a>' : '') + '</p>' +
    (M.officer ? '<p class="meta">' + forChips(it['for']) + '</p>' : '') + '</div>' +
    (edit && M.officer ? '<button class="qbtn" data-act="edit" data-kind="' + (coach ? 'sfCoaching' : 'sfSchedule') + '" data-id="' + esc(it.id) + '" aria-label="Edit ' + esc(title) + '">' + icon('edit') + '<span>Edit</span></button>' : '') +
    '</li>';
}

/* ---------------- overview ---------------- */
function renderOverview() {
  return M.officer ? overviewOfficer() : overviewMember();
}
/* The home screens. Quiet on purpose: a greeting with the next actions,
   four figures that each say what they mean, then the lists people act on.
   Red marks what needs doing, not decoration. */
function greeting() {
  var h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function homeHead(name, acts) {
  var d = new Date().toLocaleDateString(undefined, {weekday: 'long', month: 'long', day: 'numeric'});
  return '<section class="homehead"><div><p class="hd">' + esc(d) + '</p><h2>' + esc(greeting()) + ', ' + esc(name) + '</h2></div>' +
    (acts ? '<div class="qa">' + acts + '</div>' : '') + '</section>';
}
/* One figure: what it is, the number, a line of context, and where to go. */
function kpi(label, value, ctx, href, tone, pct) {
  return '<a class="kpi' + (tone ? ' ' + tone : '') + '" href="' + href + '"><span class="kl">' + esc(label) + '</span><span class="kv num" data-to="' + (typeof value === 'number' ? value : '') + '">' + esc(value) + '</span>' +
    (pct != null ? '<span class="bar' + (pct >= 99.5 || tone === 'good' ? ' ok' : '') + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></span>' : '') +
    '<span class="kc">' + ctx + '</span></a>';
}
function dayWord(iso) { var n = daysTo(iso); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : fmtDay(iso); }
/* The next seven days from the calendar (chapter calendar, SFBLC, coaching, due dates). */
function weekCard(mineOnly, title) {
  var t0 = today(), end = new Date(); end.setDate(end.getDate() + 7);
  var e7 = isoDay(end);
  var list = calEvents(mineOnly).filter(function (e) { return (e.end || e.date) >= t0 && e.date <= e7 && !e.hidden; }).slice(0, 9);
  var h = '<section class="card"><header><h3>' + esc(title) + '</h3><a href="#calendar">Calendar</a></header>';
  if (!list.length) return h + empty('A quiet week', 'Nothing on the calendar for the next seven days.') + '</section>';
  var day = '';
  h += '<ul class="agenda">';
  list.forEach(function (e) {
    var d = e.date < t0 ? t0 : e.date;
    if (d !== day) { day = d; h += '<li class="ad">' + esc(dayWord(d)) + '</li>'; }
    h += '<li class="ai"><span class="at">' + esc(e.time || 'All day') + '</span><span class="aw"><span class="sw src-' + e.src + '"></span>' + esc(e.title) +
      (e.where ? '<small>' + esc(e.where) + '</small>' : '') + '</span></li>';
  });
  return h + '</ul></section>';
}
function gapList(g, max) {
  if (!g.length) return empty('Nothing missing', 'Every check passes.');
  return '<ul class="gaps">' + g.slice(0, max || 99).map(function (x) {
    var a = x.action, btn = '';
    if (a && a.go) btn = '<a class="btn sm ghost" href="#' + esc(a.go) + '">' + esc(a.label || 'Open') + '</a>';
    else if (a && a.href) btn = '<a class="btn sm ghost" href="' + esc(a.href) + '">' + esc(a.label || 'Open') + '</a>';
    else if (a && a.run) btn = '<button class="btn sm ghost" data-act="run" data-run="' + esc(a.run) + '">' + esc(a.label || 'Fix') + '</button>';
    return '<li class="gap sev-' + x.sev + '"><span class="dot" aria-hidden="true"></span><div><p class="gt">' + esc(x.title) + '</p>' +
      (x.detail ? '<p class="gd">' + esc(x.detail) + '</p>' : '') + '</div>' + btn + '</li>';
  }).join('') + '</ul>';
}
/* Homework in and on time, per assignment, for the ones due most recently or next. */
function homeworkCard() {
  var t0 = today(), list = works().filter(function (w) { return w.due; });
  var recent = list.filter(function (w) { return w.due < t0; }).slice(-2), next = list.filter(function (w) { return w.due >= t0; }).slice(0, 2);
  var show = recent.concat(next), byWork = {};
  M.subs.forEach(function (s) { (byWork[s.workId] = byWork[s.workId] || {})[flat(s.name)] = s; });
  var h = '<section class="card"><header><h3>Homework</h3><a href="#homework">All</a></header>';
  if (!show.length) return h + empty('No assignments yet', '', '<button class="btn sm" data-act="hwNew">Set an assignment</button>') + '</section>';
  return h + '<ul class="progress">' + show.map(function (w) {
    var forP = M.people.filter(function (p) { return p.role === 'member' && workFor(w, p); }), got = 0, end = dueEnd(w).getTime();
    forP.forEach(function (p) { var s = (byWork[w.id] || {})[p.key]; if (s && new Date(s.first || s.at).getTime() <= end) got++; });
    var pct = forP.length ? Math.round(got / forP.length * 100) : 0, past = w.due < t0;
    return '<li><div class="pl"><span>' + esc(w.title) + '<small>' + (past ? 'Was due ' : 'Due ') + esc(dayWord(w.due)) + '</small></span><span class="num">' +
      (past ? pct + '% on time' : got + '/' + forP.length + ' in') + '</span></div><div class="bar' + (pct >= 80 ? ' ok' : past ? ' low' : '') + '"><i style="width:' + pct + '%"></i></div></li>';
  }).join('') + '</ul></section>';
}
function cupCard() {
  var ranked = M.orgs.slice().sort(function (a, b) { return b.cups - a.cups || (b.rate || 0) - (a.rate || 0); });
  var h = '<section class="card"><header><h3>Org Cup</h3><a href="#cup">Standings</a></header>';
  if (!ranked.length) return h + empty('No Orgs yet', '') + '</section>';
  return h + '<ol class="mini">' + ranked.slice(0, 4).map(function (o, i) {
    return '<li class="' + (o.name === M.me.org ? 'mine' : '') + '"><span class="mr">' + (i + 1) + '</span><span class="mn">' + esc(o.name) + (o.name === M.me.org ? ' <span class="badge">Yours</span>' : '') + '</span><span class="mc">' + plural(o.cups, 'cup') + '</span></li>';
  }).join('') + '</ol></section>';
}

function overviewOfficer() {
  var ppl = M.people.filter(function (p) { return p.role === 'member' || p === M.me; });
  var going = ppl.filter(function (p) { return p.going; }), placed = going.filter(function (p) { return p.events.length; });
  var g = gaps(), high = g.filter(function (x) { return x.sev === 'high'; }).length, d = daysTo(sfInfo().start);
  var t0 = today(), recent = works().filter(function (w) { return w.due && w.due < t0; }).slice(-1)[0];
  var rate = null;
  if (recent) {
    var forP = ppl.filter(function (p) { return p.role === 'member' && workFor(recent, p); }), got = 0, end = dueEnd(recent).getTime();
    M.subs.forEach(function (s) { if (s.workId === recent.id && new Date(s.first || s.at).getTime() <= end && forP.some(function (p) { return p.key === flat(s.name); })) got++; });
    rate = forP.length ? Math.round(got / forP.length * 100) : null;
  }
  var h = homeHead(M.me.name.split(' ')[0] === 'Demo' ? 'EBOD' : M.me.name.split(' ')[0],
    '<a class="btn" href="#messages/compose">' + icon('send') + 'New message</a><button class="btn ghost" data-act="hwNew">' + icon('homework') + 'Set homework</button>' +
    '<a class="btn ghost" href="#attendance/take">' + icon('attendance') + 'Take attendance</a>');
  h += '<section class="kpis">' +
    kpi('SFBLC', d > 0 ? d + ' days' : d === 0 ? 'Today' : 'Done', esc(fmtDay(sfInfo().start)) + ' · Emeryville', '#sfblc') +
    kpi('Placed on a team', placed.length + ' of ' + going.length, going.length - placed.length ? '<b>' + (going.length - placed.length) + ' still to place</b>' : 'Everyone going has a team', '#teams', going.length - placed.length ? 'warn' : 'good', going.length ? placed.length / going.length * 100 : 0) +
    kpi('Gaps to close', g.length, high ? '<b>' + plural(high, 'urgent', 'urgent') + '</b>' : 'None urgent', '#overview', high ? 'bad' : '') +
    kpi('Homework on time', rate == null ? '—' : rate + '%', recent ? esc(recent.title) + (rate >= 80 ? ' · earns cups' : '') : 'Nothing due yet', '#homework', rate == null ? '' : rate >= 80 ? 'good' : 'warn', rate) + '</section>';
  h += '<div class="bento">';
  h += '<section class="card span2"><header><h3>Needs attention</h3><span class="count">' + g.length + '</span></header>' + gapList(g) + '</section>';
  h += weekCard(false, 'This week');
  h += homeworkCard() + cupCard();
  var checks = sf('sfChecklist');
  h += '<section class="card"><header><h3>SFBLC checklist</h3><a href="#sfblc/checklist">All</a></header>' +
    (checks.length ? '<ul class="progress">' + checks.map(function (c) {
      /* Only ticks from the people the item is for count toward it. */
      var forP = resolve(c['for']), ticked = {}, want = forP.length, got = 0;
      (M.done[c.id] || []).forEach(function (k) { ticked[k] = 1; });
      forP.forEach(function (p) { if (ticked[p.key]) got++; });
      var pct = want ? Math.round(got / want * 100) : 0;
      return '<li><div class="pl"><span>' + esc(c.label) + (c.due ? '<small>Due ' + esc(dayWord(c.due)) + '</small>' : '') + '</span><span class="num">' + got + '/' + want + '</span></div><div class="bar"><i style="width:' + pct + '%"></i></div></li>';
    }).join('') + '</ul>' : empty('No checklist yet', '', '<button class="btn sm" data-act="run" data-run="starter">Load SFBLC starter</button>')) + '</section>';
  h += '</div>';
  return h;
}
function overviewMember() {
  var me = M.me, info = sfInfo(), d = daysTo(info.start);
  var mine = me.teams.filter(function (t) { return t.kind === 'flc'; });
  var checks = sf('sfChecklist').filter(isForMe), doneN = checks.filter(function (c) { return M.myDone[c.id]; }).length;
  var open = works().filter(function (w) { return workFor(w, me) && !myHandIn(w.id); });
  var dueSoon = open.filter(function (w) { return w.due && daysTo(w.due) >= 0; }), overdue = open.filter(function (w) { return w.due && daysTo(w.due) < 0; });
  var org = M.orgs.filter(function (o) { return o.name === me.org; })[0];
  var rank = org ? M.orgs.slice().sort(function (a, b) { return b.cups - a.cups; }).indexOf(org) + 1 : 0;
  var h = homeHead(me.name.split(' ')[0], '<a class="btn" href="#homework">' + icon('homework') + 'Hand in homework</a>');
  h += '<section class="kpis">' +
    kpi('SFBLC', d > 0 ? d + ' days' : d === 0 ? 'Today' : 'Done', mine.length ? esc(mine[0].event) + ' · ' + esc(teamName(mine[0])) : me.going ? 'Team coming soon' : 'Not signed up', '#sfblc') +
    kpi('Homework', dueSoon.length + overdue.length, overdue.length ? '<b>' + overdue.length + ' overdue</b>' : dueSoon[0] ? 'Next due ' + esc(dayWord(dueSoon[0].due)) : 'All handed in', '#homework', overdue.length ? 'bad' : '') +
    kpi('Checklist', doneN + ' of ' + checks.length, checks.length - doneN ? (checks.length - doneN) + ' left before SFBLC' : 'All done', '#sfblc/checklist', '', checks.length ? doneN / checks.length * 100 : 0) +
    kpi('Inbox', unreadCount(), unreadCount() ? 'New from EBOD' : 'You are caught up', '#messages') + '</section>';
  h += '<div class="bento">';
  h += weekCard(true, 'Your week');
  h += '<section class="card"><header><h3>Your SFBLC team</h3><a href="#teams">Teams</a></header>';
  if (mine.length) h += mine.map(function (t) {
    return '<p class="tn">' + esc(teamName(t)) + '</p><p class="meta">' + esc(SFBLC.eventNote[t.event] || t.event) + '</p>' +
      '<ul class="mates">' + (t.members || []).map(function (m) { return '<li>' + avatar({name: m}) + '<span>' + esc(m) + (flat(m) === me.key ? ' <span class="badge">You</span>' : '') + '</span></li>'; }).join('') + '</ul>';
  }).join('');
  else if (me.going) h += empty('Not on a team yet', 'EBOD places everyone from the events you ranked. You get a notification when it happens.');
  else h += empty('Not signed up for SFBLC', 'Rank your events and confirm you can go.', '<a class="btn sm" href="/teams">Rank my events</a>');
  if (me.room) h += '<p class="room">' + icon('pin') + 'Room' + (me.room.no ? ' ' + esc(me.room.no) : '') + ' with ' + esc((me.room.members || []).filter(function (m) { return flat(m) !== me.key; }).join(', ') || 'no one yet') + '</p>';
  h += '</section>';
  h += '<section class="card"><header><h3>Homework</h3><a href="#homework">All</a></header>' + (open.length ? '<ul class="progress">' + open.slice(0, 4).map(function (w) {
    var n = w.due ? daysTo(w.due) : null;
    return '<li><div class="pl"><span>' + esc(w.title) + '<small class="' + (n !== null && n < 0 ? 'late' : n !== null && n <= 2 ? 'soon' : '') + '">' + (w.due ? (n < 0 ? 'Overdue · was due ' : 'Due ') + esc(dayWord(w.due)) : 'No due date') + '</small></span>' +
      '<a class="btn sm ghost" href="#homework">Hand in</a></div></li>';
  }).join('') + '</ul>' : empty('All handed in', 'Nice. New assignments show up here.')) + '</section>';
  h += checklistCard(true);
  h += '<section class="card"><header><h3>Your Org</h3><a href="#orgs">Orgs</a></header>' + (org ?
    '<p class="tn">' + esc(org.name) + '</p><dl class="facts"><dt>Org Cup</dt><dd>' + plural(org.cups, 'cup') + ' · ' + (rank === 1 ? 'leading' : ordinalWord(rank) + ' of ' + M.orgs.length) + '</dd>' +
    '<dt>Members</dt><dd>' + org.members.length + '</dd><dt>EBOD contact</dt><dd>' + esc(org.ebod || 'Not set yet') + '</dd></dl>' : empty('No Org yet', 'Orgs are formed at bootcamp 1.')) + '</section>';
  h += myStandingCard();
  h += '<section class="card"><header><h3>Messages</h3><a href="#messages">Inbox</a></header>' + inboxList(3) + '</section>';
  h += '</div>';
  return h;
}
function ordinalWord(n) { var t = n % 100; return n + ((t > 10 && t < 14) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th')); }

function checklistCard(compact) {
  var list = sf('sfChecklist').filter(isForMe);
  var h = '<section class="card"><header><h3>Your checklist</h3><span class="count">' + list.filter(function (c) { return M.myDone[c.id]; }).length + '/' + list.length + '</span></header>';
  if (!list.length) return h + empty('Nothing to do yet', '') + '</section>';
  return h + '<ul class="checks">' + list.map(function (c) {
    var on = !!M.myDone[c.id], due = c.due ? daysTo(c.due) : null;
    return '<li class="' + (on ? 'done' : '') + '"><label><input type="checkbox" data-act="tick" data-id="' + esc(c.id) + '"' + (on ? ' checked' : '') + (M.inboxReady ? '' : ' disabled') + '>' +
      '<span class="box">' + icon('check') + '</span><span><span class="cl">' + esc(c.label) + '</span>' +
      (c.due ? '<span class="cd' + (!on && due !== null && due <= 2 ? ' soon' : '') + '">Due ' + esc(fmtDay(c.due)) + '</span>' : '') +
      (!compact && c.detail ? '<span class="cx">' + esc(c.detail) + '</span>' : '') + '</span></label></li>';
  }).join('') + '</ul></section>';
}

/* ---------------- members ---------------- */
var MEM = {q: '', tags: [], every: true, sel: {}, open: false};
function filteredPeople() {
  var q = flat(MEM.q);
  return M.people.filter(function (p) {
    if (q && p.key.indexOf(q) < 0 && flat(p.email).indexOf(q) < 0 && !(p.tags || []).some(function (t) { return flat(t.label).indexOf(q) > -1; })) return false;
    if (!MEM.tags.length) return true;
    return MEM.every ? MEM.tags.every(function (g) { return hasTag(p, g); }) : MEM.tags.some(function (g) { return hasTag(p, g); });
  });
}
function renderMembers() {
  var list = filteredPeople(), groups = tagIndex();
  var nSel = Object.keys(MEM.sel).filter(function (k) { return MEM.sel[k]; }).length;
  var h = '<section class="toolbar"><label class="search">' + icon('search') + '<input id="mq" type="search" placeholder="Search names, emails or tags" value="' + esc(MEM.q) + '" autocomplete="off"></label>' +
    '<button class="btn ghost sm" data-act="toggleFilters" aria-expanded="' + MEM.open + '">' + (MEM.open ? 'Hide tags' : 'Filter by tag') + (MEM.tags.length ? ' <b class="pill">' + MEM.tags.length + '</b>' : '') + '</button></section>';
  if (MEM.tags.length) h += '<div class="active">' + MEM.tags.map(function (g) {
    return '<button class="chip on tone-ink" data-act="untag" data-tag="' + esc(g) + '">' + esc(tagLabel(g)) + ' ' + icon('close') + '</button>';
  }).join('') + (MEM.tags.length > 1 ? '<button class="link" data-act="every">' + (MEM.every ? 'Matching all of these' : 'Matching any of these') + '</button>' : '') +
    '<button class="link" data-act="clearTags">Clear</button></div>';
  h += '<section class="filters' + (MEM.open ? ' open' : '') + '">' + Object.keys(GROUPS).filter(function (g) { return groups[g]; }).map(function (g) {
    return '<div class="fg"><p class="fl">' + esc(GROUPS[g].label) + '</p><div class="chips">' + groups[g].map(function (t) {
      return chip(t, {on: MEM.tags.indexOf(t.id) > -1, n: t.n});
    }).join('') + '</div></div>';
  }).join('') + '</section>';
  h += '<section class="listhead"><p><b>' + list.length + '</b> of ' + M.people.length + (MEM.tags.length || MEM.q ? ' match' : ' members') + '</p>' +
    '<div class="acts">' + (list.length ? '<button class="btn sm" data-act="messageList">' + icon('send') + 'Message ' + (nSel ? nSel + ' selected' : list.length === M.people.length ? 'everyone' : 'these ' + list.length) + '</button>' : '') +
    (M.officer && nSel ? '<button class="btn sm ghost" data-act="tagSel">Tag ' + nSel + '</button>' : '') +
    (M.officer ? '<button class="btn sm ghost" data-act="csv">CSV</button>' : '') + '</div></section>';
  if (!list.length) return h + empty('No one matches', 'Clear a tag or the search.');
  h += '<ul class="people">' + list.slice(0, 400).map(function (p) {
    var on = !!MEM.sel[p.key];
    var sf0 = p.events.length ? p.events.join(', ') : p.going ? 'Going, no team' : '—';
    return '<li class="person' + (on ? ' sel' : '') + '">' +
      (M.officer ? '<label class="pick"><input type="checkbox" data-act="sel" data-key="' + esc(p.key) + '"' + (on ? ' checked' : '') + ' aria-label="Select ' + esc(p.name) + '"></label>' : '') +
      '<button class="who" data-act="profile" data-key="' + esc(p.key) + '">' + avatar(p) + '<span><span class="pn">' + esc(p.name) + (p === M.me ? ' <span class="badge">You</span>' : '') + '</span>' +
      '<span class="pe">' + esc(p.org || (p.email && M.officer ? p.email : '')) + '</span></span></button>' +
      tagRow(p) +
      '<span class="sfc ' + (p.events.length ? 'yes' : p.going ? 'no' : '') + '">' + esc(sf0) + '</span></li>';
  }).join('') + '</ul>';
  return h;
}
function profileSheet(p) {
  var by = {};
  (p.tags || []).forEach(function (t) { (by[t.group] = by[t.group] || []).push(t); });
  var h = '<header class="sh">' + avatar(p) + '<div><h3>' + esc(p.name) + '</h3><p class="pe">' + esc([p.year ? (p.year === 2 ? '2nd year' : '1st year') : '', p.track, p.org].filter(Boolean).join(' · ')) + '</p>' +
    (M.officer && p.email ? '<p class="pe"><a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a></p>' : '') + '</div></header>';
  /* Single facts read as a list; only groups that hold several tags, or that
     need doing something about, are shown as tags. */
  var fact = function (g) { return (by[g] || []).map(function (t) { return t.label; }).join(', '); };
  var facts = [['Year', fact('year')], ['Track', fact('track')], ['Org', fact('org')], ['Consulting', fact('client')],
               ['Available', fact('avail')], ['Type', fact('type')], ['Rooming', fact('room')]].filter(function (f) { return f[1]; });
  if (facts.length) h += '<dl class="facts pf">' + facts.map(function (f) { return '<dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd>'; }).join('') + '</dl>';
  var chipsOf = function (gs) {
    var list = [];
    gs.forEach(function (g) { (by[g] || []).forEach(function (t) { if (!t.quiet) list.push(t); }); });
    return list.map(function (t) {
      return chip(t) + (t.group === 'custom' && t.id.indexOf('tag:') === 0 && M.officer ? '<button class="x" data-act="rmTag" data-key="' + esc(p.key) + '" data-tag="' + esc(t.label) + '" aria-label="Remove tag ' + esc(t.label) + '">' + icon('close') + '</button>' : '');
    }).join('');
  };
  [['Needs attention', ['gap']], ['Tags', ['custom', 'linked']]].forEach(function (sec) {
    var c = chipsOf(sec[1]);
    if (c) h += '<div class="fg"><p class="fl">' + sec[0] + '</p><div class="chips">' + c + '</div></div>';
  });
  if (M.officer) h += '<form class="addtag" data-act="addTag" data-key="' + esc(p.key) + '"><input name="t" maxlength="30" placeholder="Add an officer tag (e.g. Needs a ride)" list="taglist"><button class="btn sm">Add</button></form>' +
    '<datalist id="taglist">' + Object.keys(M.cfg.memberTags ? allCustom() : {}).map(function (k) { return '<option value="' + esc(k) + '">'; }).join('') + '</datalist>';
  var flc = p.teams.filter(function (t) { return t.kind === 'flc'; });
  h += '<div class="fg"><p class="fl">SFBLC</p>' + (flc.length ? flc.map(function (t) { return '<p>' + esc(t.event) + ' · <b>' + esc(teamName(t)) + '</b> with ' + esc((t.members || []).filter(function (m) { return flat(m) !== p.key; }).join(', ') || 'no one yet') + '</p>'; }).join('')
    : '<p>' + (p.going ? 'Going, not on a team.' : 'Not signed up.') + '</p>') +
    ((p.prefs.flc || []).length ? '<p class="pe">Ranked: ' + rankLine(p.prefs.flc) + '</p>' : '') + '</div>';
  if (M.officer && (p.hw.missing.length || p.hw.late.length)) h += '<div class="fg"><p class="fl">Homework</p>' +
    (p.hw.missing.length ? '<p>Missing: ' + p.hw.missing.map(esc).join(', ') + '</p>' : '') + (p.hw.late.length ? '<p>Late: ' + p.hw.late.map(esc).join(', ') + '</p>' : '') + '</div>';
  if (M.officer && p.meetings) h += '<div class="fg"><p class="fl">Meetings</p><p>Came to ' + (p.meetings - p.absent) + ' of ' + p.meetings + '.</p></div>';
  if (M.officer && p.notes) h += '<div class="fg"><p class="fl">Note from the sign-up form</p><p>' + esc(p.notes) + '</p></div>';
  h += '<div class="sheetacts"><button class="btn" data-act="messageOne" data-key="' + esc(p.key) + '">' + icon('send') + 'Message ' + esc(p.name.split(' ')[0]) + '</button>' +
    (M.officer ? '<a class="btn ghost" href="#teams">Teams</a>' : '') + '</div>';
  return h;
}
function allCustom() {
  var o = {};
  Object.keys(M.cfg.memberTags || {}).forEach(function (k) { (M.cfg.memberTags[k] || []).forEach(function (t) { o[t] = 1; }); });
  return o;
}

/* ---------------- SFBLC ---------------- */
var SFV = {mine: null};
function renderSfblc(sub) {
  sub = sub || 'schedule';
  var h = subtabs(sub, [['schedule', 'Schedule'], ['coaching', 'Coaching', sf('sfCoaching').filter(function (c) { return (M.officer || isForMe(c)) && at(c.date, c.end || c.start || '23:59') >= new Date(); }).length || ''],
                        ['checklist', 'Checklist'], ['about', 'About'], ['season', 'Season']], 'sfblc');
  if (sub === 'schedule') h += sfSchedule();
  else if (sub === 'coaching') h += sfCoachingView();
  else if (sub === 'checklist') h += M.officer ? sfChecklistOfficer() : checklistCard(false);
  else if (sub === 'season') h += seasonStrip();
  else h += sfAbout();
  return h;
}
function mineToggle() {
  if (SFV.mine === null) SFV.mine = !M.officer;
  return '<div class="seg" role="group" aria-label="Show"><button class="' + (SFV.mine ? 'on' : '') + '" data-act="mine" data-v="1">' + (M.officer ? 'As a member' : 'Mine') + '</button>' +
    '<button class="' + (!SFV.mine ? 'on' : '') + '" data-act="mine" data-v="0">Everything</button></div>';
}
function sfSchedule() {
  var list = sf('sfSchedule').slice().sort(function (a, b) { return (a.date + (a.start || '99')).localeCompare(b.date + (b.start || '99')); });
  if (SFV.mine === null) SFV.mine = !M.officer;
  var shown = SFV.mine && !M.officer ? list.filter(isForMe) : list;
  var h = '<section class="toolbar">' + (M.officer ? '' : mineToggle()) + '<span class="grow"></span>' +
    (M.officer ? '<button class="btn sm" data-act="new" data-kind="sfSchedule">' + icon('plus') + 'Add item</button>' : '') + '</section>';
  if (!list.length) return h + empty('No schedule yet', 'CAPBL has not sent the programs packet. Start from the three known days and add times as they come.',
    M.officer ? '<button class="btn" data-act="run" data-run="starter">Load SFBLC 2026 starter</button>' : '');
  var days = {};
  shown.forEach(function (it) { (days[it.date] = days[it.date] || []).push(it); });
  h += '<div class="daygrid">' + Object.keys(days).sort().map(function (d) {
    return '<section class="card day"><header><h3>' + esc(fmtDay(d, true)) + '</h3><span class="count">' + days[d].length + '</span></header><ul class="items">' +
      days[d].map(function (it) { return itemRow({it: it, kind: 'schedule'}, true, true); }).join('') + '</ul></section>';
  }).join('') + '</div>';
  if (!shown.length) h += empty('Nothing on the schedule is for you yet', '');
  return h;
}
function sfCoachingView() {
  var list = sf('sfCoaching').slice().sort(function (a, b) { return (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')); });
  if (!M.officer) list = list.filter(isForMe);
  var now = new Date(), next = list.filter(function (c) { return at(c.date, c.end || c.start || '23:59') >= now; }), past = list.filter(function (c) { return next.indexOf(c) < 0; });
  var h = '<section class="toolbar"><span class="grow"></span>' + (M.officer ? '<button class="btn sm" data-act="new" data-kind="sfCoaching">' + icon('plus') + 'Add session</button>' : '') + '</section>';
  if (M.officer) {
    var bare = boardEvents().filter(function (e) {
      return M.teams.some(function (t) { return t.kind === 'flc' && t.event === e; }) && !sf('sfCoaching').some(function (c) { return c.event === e || ((c['for'] || {}).tags || []).indexOf('ev:' + e) > -1; });
    });
    if (bare.length) h += '<div class="note warn">No coaching yet for ' + bare.map(function (e) { return '<button class="link" data-act="run" data-run="addCoaching:' + esc(e) + '">' + esc(e) + '</button>'; }).join(', ') + '.</div>';
  }
  if (!list.length) return h + empty(M.officer ? 'No coaching sessions yet' : 'No coaching sessions for you yet', M.officer ? 'Add one per event, and members on those teams are reminded the day before and an hour before.' : 'Your coaches will add them here.');
  h += '<section class="card"><header><h3>Coming up</h3><span class="count">' + next.length + '</span></header>' + (next.length ? '<ul class="items">' + next.map(function (c) { return itemRow({it: c, kind: 'coaching'}, true); }).join('') + '</ul>' : empty('None coming up', '')) + '</section>';
  if (past.length) h += '<details class="card"><summary><h3>Earlier</h3><span class="count">' + past.length + '</span></summary><ul class="items">' + past.reverse().map(function (c) { return itemRow({it: c, kind: 'coaching'}, true); }).join('') + '</ul></details>';
  return h;
}
function sfChecklistOfficer() {
  var list = sf('sfChecklist');
  var h = '<section class="toolbar"><span class="grow"></span><button class="btn sm" data-act="new" data-kind="sfChecklist">' + icon('plus') + 'Add item</button></section>';
  if (!list.length) return h + empty('No checklist yet', '', '<button class="btn" data-act="run" data-run="starter">Load SFBLC 2026 starter</button>');
  return h + '<section class="card"><ul class="progress wide">' + list.map(function (c) {
    var want = resolve(c['for']), done = {}, got = 0;
    (M.done[c.id] || []).forEach(function (k) { done[k] = 1; });
    want.forEach(function (p) { if (done[p.key]) got++; });
    var pct = want.length ? Math.round(got / want.length * 100) : 0;
    return '<li><div class="pl"><span><b>' + esc(c.label) + '</b>' + (c.due ? '<small>Due ' + esc(dayWord(c.due)) + '</small>' : '') + '</span><span class="num">' + got + ' of ' + want.length + '</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div><p class="meta">' + forChips(c['for']) + (c.detail ? ' · ' + esc(c.detail) : '') + '</p>' +
      '<div class="rowacts">' + (want.length > got ? '<button class="qbtn" data-act="nudge" data-id="' + esc(c.id) + '">' + icon('bell') + '<span>Remind the ' + (want.length - got) + ' not done</span></button>' : '') +
      '<button class="qbtn" data-act="edit" data-kind="sfChecklist" data-id="' + esc(c.id) + '">' + icon('edit') + '<span>Edit</span></button></div></li>';
  }).join('') + '</ul></section>' + (M.msgsReady ? '' : '<p class="note">Ticks are saved once the backend update is deployed.</p>');
}
function sfAbout() {
  var i = sfInfo();
  var h = '<section class="card"><header><h3>' + esc(i.name) + '</h3></header><dl class="facts">' +
    '<dt>What</dt><dd>' + esc(i.full) + '</dd><dt>When</dt><dd>' + esc(fmtDay(i.start, true)) + ' – ' + esc(fmtDay(i.end, true)) + '</dd>' +
    '<dt>Where</dt><dd>' + esc(i.venue) + ', ' + esc(i.city) + '</dd><dt>Fees</dt><dd>' + esc(SFBLC.fees) + '</dd>' +
    '<dt>Updates</dt><dd><a href="' + esc(safeUrl(i.site)) + '" target="_blank" rel="noopener">capbl.org</a></dd></dl>' + (i.note ? '<p class="note">' + esc(i.note) + '</p>' : '') + '</section>';
  h += '<section class="card"><header><h3>Events</h3>' + (M.officer ? '<span class="hint">Team sizes are editable</span>' : '') + '</header><ul class="evlist">' + boardEvents().map(function (e) {
    var c = capFor(M.cfg, e), n = M.teams.filter(function (t) { return t.kind === 'flc' && t.event === e; }).length;
    return '<li><div><p class="tt">' + esc(e) + (SFBLC.events.indexOf(e) < 0 ? ' <span class="badge bad">Not offered in 2026</span>' : '') + '</p><p class="meta">' + esc(SFBLC.eventNote[e] || 'Case competition') + ' · ' + plural(n, 'team') + '</p></div>' +
      (M.officer ? '<label class="cap">Up to <input type="number" min="1" max="6" value="' + c.max + '" data-act="cap" data-ev="' + esc(e) + '"></label>' : '<span class="meta">Up to ' + c.max + '</span>') + '</li>';
  }).join('') + '</ul></section>';
  return h;
}

/* ---------------- teams ---------------- */
function boardEvents() {
  var out = M.events.slice();
  M.teams.forEach(function (t) { if (t.kind === 'flc' && t.event && out.indexOf(t.event) < 0) out.push(t.event); });
  return out;
}
function renderTeams() {
  var flcT = M.teams.filter(function (t) { return t.kind === 'flc'; });
  var going = M.people.filter(function (p) { return p.going; }), unplaced = going.filter(function (p) { return !p.events.length; });
  if (!M.officer) {
    var mine = M.me.teams.filter(function (t) { return t.kind === 'flc'; });
    return '<section class="card"><header><h3>Your team</h3></header>' + (mine.length ? mine.map(function (t) {
      return '<div class="myteam"><p class="eyebrow">' + esc(t.event) + '</p><p class="tn">' + esc(teamName(t)) + '</p><ul class="mates">' + (t.members || []).map(function (m) { return '<li>' + avatar({name: m}) + esc(m) + '</li>'; }).join('') + '</ul></div>';
    }).join('') : empty(M.me.going ? 'Not placed yet' : 'Not signed up', M.me.going ? 'You will be notified when you are placed.' : 'Rank your events on the classic Teams tab.', M.me.going ? '' : '<a class="btn sm" href="/teams">Rank my events</a>')) + '</section>' +
      '<section class="card"><header><h3>Every SFBLC team</h3><span class="count">' + flcT.length + '</span></header><div class="board ro">' + boardEvents().map(function (e) {
        var ts = flcT.filter(function (t) { return t.event === e; });
        return ts.length ? '<div class="evcol"><p class="evh">' + esc(e) + '</p>' + ts.map(function (t) { return '<div class="team"><p class="tn">' + esc(teamName(t)) + '</p><p class="meta">' + esc((t.members || []).join(', ')) + '</p></div>'; }).join('') + '</div>' : '';
      }).join('') + '</div></section>';
  }
  var placedN = going.length - unplaced.length;
  var h = '<section class="kpis">' + kpi('Going to SFBLC', going.length, plural(M.events.length, 'event') + ' offered', '#members?tag=sfblc') +
    kpi('Placed on a team', placedN + ' of ' + going.length, unplaced.length ? '<b>' + unplaced.length + ' still to place</b>' : 'Everyone has a team', '#teams', unplaced.length ? 'warn' : 'good', going.length ? placedN / going.length * 100 : 0) +
    kpi('Teams', flcT.length, flcT.filter(function (t) { return (t.members || []).length > capFor(M.cfg, t.event).max; }).length ? '<b>Some over the limit</b>' : 'All within limits', '#teams') +
    kpi('Events without a team', boardEvents().filter(function (e) { return SFBLC.events.indexOf(e) > -1 && !flcT.some(function (t) { return t.event === e; }); }).length, 'of the SFBLC 2026 events', '#teams') + '</section>';
  h += '<section class="toolbar"><span class="grow"></span><button class="btn sm ghost" data-act="autofill"' + (unplaced.length ? '' : ' disabled') + '>Place by first choice</button>' +
    '<button class="btn sm" data-act="newTeam">' + icon('plus') + 'New team</button></section>';
  if (unplaced.length) h += '<section class="card unplaced"><header><h3>Going, not on a team</h3><span class="count">' + unplaced.length + '</span></header><ul class="ulist">' + unplaced.map(function (p) {
    return '<li><button class="who" data-act="profile" data-key="' + esc(p.key) + '">' + avatar(p) + '<span><span class="pn">' + esc(p.name) + '</span><span class="pe">' +
      ((p.prefs.flc || []).length ? rankLine(p.prefs.flc) : 'No events ranked') + '</span></span></button>' + placeSelect(p) + '</li>';
  }).join('') + '</ul></section>';
  h += '<div class="board">' + boardEvents().map(function (e) {
    var ts = flcT.filter(function (t) { return t.event === e; }), cap = capFor(M.cfg, e);
    var first = M.people.filter(function (p) { return (p.prefs.flc || [])[0] === e; }).length;
    return '<section class="evcol' + (SFBLC.events.indexOf(e) < 0 ? ' off' : '') + '"><header><p class="evh">' + esc(e) + '</p><p class="meta">' + plural(ts.length, 'team') + ' · up to ' + cap.max + ' each · ' + first + ' ranked it first</p></header>' +
      ts.map(function (t) { return teamCard(t, cap); }).join('') +
      '<button class="addteam" data-act="newTeam" data-ev="' + esc(e) + '">' + icon('plus') + 'Add a ' + esc(e) + ' team</button></section>';
  }).join('') + '</div>';
  h += '<p class="note">Saved to the same teams as the classic Teams tab. Members added to a team get a notification on the next automatic run when reminders are on.</p>';
  return h;
}
function placeSelect(p) {
  var flcT = M.teams.filter(function (t) { return t.kind === 'flc'; });
  var rank = function (t) { var i = (p.prefs.flc || []).indexOf(t.event); return i < 0 ? 9 : i; };
  return '<select class="mini" data-act="place" data-key="' + esc(p.key) + '" aria-label="Place ' + esc(p.name) + '"><option value="">Place on…</option>' +
    flcT.slice().sort(function (a, b) { return rank(a) - rank(b); }).map(function (t) {
      var n = (t.members || []).length, cap = capFor(M.cfg, t.event).max;
      return '<option value="' + esc(t.id) + '"' + (n >= cap ? ' disabled' : '') + '>' + esc(t.event + ' · ' + teamName(t)) + ' (' + n + '/' + cap + ')' + (rank(t) < 9 ? ' · choice ' + (rank(t) + 1) : '') + '</option>';
    }).join('') + '</select>';
}
function teamCard(t, cap) {
  var mem = (t.members || []).filter(Boolean), n = mem.length;
  var cand = M.people.filter(function (p) { return p.going && !p.events.length; })
    .sort(function (a, b) { var ia = (a.prefs.flc || []).indexOf(t.event), ib = (b.prefs.flc || []).indexOf(t.event); return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib) || a.name.localeCompare(b.name); });
  var others = M.people.filter(function (p) { return !p.going && mem.every(function (m) { return flat(m) !== p.key; }); });
  return '<div class="team' + (n > cap.max ? ' over' : n === 0 ? ' emptyt' : '') + '"><div class="th"><button class="tn link" data-act="renameTeam" data-id="' + esc(t.id) + '">' + esc(teamName(t)) + '</button>' +
    '<span class="cnt' + (n > cap.max ? ' bad' : n === cap.max ? ' full' : '') + '">' + n + '/' + cap.max + '</span></div>' +
    '<ul class="tm">' + mem.map(function (m) {
      var p = M.byKey[flat(m)], rk = p ? (p.prefs.flc || []).indexOf(t.event) : -1;
      return '<li><span class="mn">' + esc(m) + (rk > -1 ? '<small>choice ' + (rk + 1) + '</small>' : p && p.going ? '<small class="off">not ranked</small>' : '') + '</span>' +
        '<select class="mini" data-act="move" data-team="' + esc(t.id) + '" data-name="' + esc(m) + '" aria-label="Move ' + esc(m) + '"><option value="">Move…</option>' +
        M.teams.filter(function (x) { return x.kind === 'flc' && x.id !== t.id; }).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.event + ' · ' + teamName(x)) + '</option>'; }).join('') +
        '<option value="-">Take off this team</option></select></li>';
    }).join('') + '</ul>' +
    (n < cap.max ? '<select class="mini add" data-act="addTo" data-team="' + esc(t.id) + '" aria-label="Add to ' + esc(teamName(t)) + '"><option value="">+ Add someone</option>' +
      (cand.length ? '<optgroup label="Going, not placed">' + cand.map(function (p) { var i = (p.prefs.flc || []).indexOf(t.event); return '<option value="' + esc(p.key) + '">' + esc(p.name) + (i > -1 ? ' · choice ' + (i + 1) : '') + '</option>'; }).join('') + '</optgroup>' : '') +
      (others.length ? '<optgroup label="Everyone else">' + others.map(function (p) { return '<option value="' + esc(p.key) + '">' + esc(p.name) + '</option>'; }).join('') + '</optgroup>' : '') + '</select>' : '') +
    (n === 0 ? '<button class="link danger" data-act="dropTeam" data-id="' + esc(t.id) + '">Delete empty team</button>' : '') + '</div>';
}

/* ---------------- messages ---------------- */
var CMP = {title: '', body: '', url: '/dash#inbox', target: {tags: [], names: [], every: false}, email: false, when: 'now', at: ''};
function renderMessages(sub) {
  if (!M.officer) return '<section class="card"><header><h3>Inbox</h3></header>' + inboxList(60) + '</section>' + pushHint();
  sub = sub || 'compose';
  var sched = M.msgs.filter(function (m) { return m.status === 'scheduled'; }).length;
  var h = subtabs(sub, [['compose', 'Compose'], ['log', 'Sent & scheduled', sched || ''], ['auto', 'Automations']], 'messages');
  if (!M.msgsReady && !M.demo) h += '<div class="note warn">Messages need the backend update: paste the new <code>Code.gs</code> into Apps Script and deploy a new version. Until then nothing can be sent from here.</div>';
  if (sub === 'compose') h += composeView();
  else if (sub === 'log') h += logView();
  else h += autoView();
  return h;
}
function pushHint() {
  return '<p class="note">' + icon('bell') + '<span>Messages also arrive as phone notifications once you turn them on: open the Org System from its home-screen icon, then Homework → Phone notifications.</span></p>';
}
function inboxList(n) {
  if (!M.inboxReady && !M.demo) return empty('Inbox is not switched on yet', 'EBOD is updating the backend.');
  var seen = lsGet(KEYS.seen) || '';
  var list = M.inbox.slice(0, n);
  if (!list.length) return empty('No messages yet', 'Team news, schedule changes and reminders land here.');
  return '<ul class="inbox">' + list.map(function (m) {
    var url = /^\/[A-Za-z0-9\/#?=&._-]*$/.test(String(m.url || '')) ? m.url : '';
    return '<li class="' + (String(m.at) > seen ? 'new' : '') + '"><div class="mh"><p class="mt">' + esc(m.title) + '</p><span class="ma">' + esc(ago(m.at)) + '</span></div>' +
      (m.body ? '<p class="mb">' + esc(m.body) + '</p>' : '') + '<p class="meta">' + (m.auto ? 'Automatic' : 'From EBOD') +
      (url && url.indexOf('/dash#inbox') < 0 ? ' · <a href="' + esc(url) + '">Open</a>' : '') + '</p></li>';
  }).join('') + '</ul>';
}
function audiencePicker(target, act) {
  var t = target || {tags: [], names: []};
  var opts = [['all', 'Everyone'], ['sfblc', 'Going to SFBLC']];
  var groups = tagIndex();
  var section = function (label, list) {
    return list.length ? '<optgroup label="' + esc(label) + '">' + list.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>'; }).join('') + '</optgroup>' : '';
  };
  var teamOpts = M.teams.filter(function (x) { return x.kind === 'flc'; }).map(function (x) { return ['team:' + x.id, x.event + ' · ' + teamName(x)]; });
  var g = function (k) { return (groups[k] || []).map(function (x) { return [x.id, x.label + ' (' + x.n + ')']; }); };
  return '<div class="aud"><div class="chips">' + (t.tags || []).map(function (id) {
    return '<button type="button" class="chip on tone-ink" data-act="' + act + 'Rm" data-tag="' + esc(id) + '">' + esc(tagLabel(id)) + ' ' + icon('close') + '</button>';
  }).join('') + (t.names || []).map(function (n) {
    return '<button type="button" class="chip on tone-plum" data-act="' + act + 'RmName" data-name="' + esc(n) + '">' + esc(n) + ' ' + icon('close') + '</button>';
  }).join('') + '</div>' +
    '<div class="audrow"><select class="mini" data-act="' + act + 'Add" aria-label="Add a group"><option value="">+ Add a group…</option>' + section('Common', opts) +
    section('SFBLC events', g('sfblc').filter(function (x) { return x[0].indexOf('ev:') === 0; })) + section('SFBLC teams', teamOpts) +
    section('Years', g('year')) + section('Tracks', g('track')) + section('Orgs', g('org')) + section('Consulting clients', g('client')) +
    section('Officer tags', g('custom')) + (M.officer ? section('Available', g('avail')) + section('Needs attention', g('gap')) : '') + '</select>' +
    '<input class="mini" list="namelist" data-act="' + act + 'Name" placeholder="+ Add a person" aria-label="Add a person">' +
    ((t.tags || []).length > 1 ? '<label class="tick"><input type="checkbox" data-act="' + act + 'Every"' + (t.every ? ' checked' : '') + '> Only people in all of these</label>' : '') + '</div>' +
    '<datalist id="namelist">' + M.people.map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join('') + '</datalist></div>';
}
var TEMPLATES = [
  ['Registration', 'Register for SFBLC by Fri 5 pm', 'Late registration on CAPBL closes Friday Oct 30 at 5 pm, and only while housing lasts. Tick "Registered" on your dashboard checklist once you are in.', {tags: ['sfblc']}, '/dash#sfblc/checklist'],
  ['Team announcement', 'SFBLC teams are set', 'Your team, teammates and coaching sessions are on the dashboard. Reach out to your team today.', {tags: ['sfblc']}, '/dash#teams'],
  ['Coaching', 'Coaching this week', 'Your event has a coaching session on the schedule. Bring your notes and a laptop.', {tags: ['sfblc']}, '/dash#sfblc/coaching'],
  ['Travel', 'SFBLC travel plan', 'Carpools leave De Anza on Fri Nov 13. Check the schedule for the time and the meeting spot.', {tags: ['sfblc']}, '/dash#sfblc/schedule']
];
function composeView() {
  var who = resolve(CMP.target), reach = who.filter(function (p) { return p.reach; }).length;
  var h = '<div class="cols compose"><form class="card form" id="cmp" data-act="send"><header><h3>New message</h3></header>' +
    '<div class="tpls">' + TEMPLATES.map(function (t, i) { return '<button type="button" class="chip tone-ink" data-act="tpl" data-i="' + i + '">' + esc(t[0]) + '</button>'; }).join('') + '</div>' +
    '<label class="fld"><span>To</span>' + audiencePicker(CMP.target, 'cmp') + '</label>' +
    '<label class="fld"><span>Title</span><input name="title" maxlength="80" required value="' + esc(CMP.title) + '" placeholder="Shows as the notification\'s first line"></label>' +
    '<label class="fld"><span>Message</span><textarea name="body" maxlength="600" rows="4" placeholder="What they need to know or do">' + esc(CMP.body) + '</textarea><small class="cc">' + CMP.body.length + '/600 · notifications show the first 240</small></label>' +
    '<label class="fld"><span>Tapping it opens</span><select name="url">' + [['/dash#inbox', 'Their inbox'], ['/dash#sfblc/schedule', 'SFBLC schedule'], ['/dash#sfblc/coaching', 'Coaching'], ['/dash#sfblc/checklist', 'Checklist'], ['/dash#teams', 'Their team'], ['/homework', 'Homework (classic)']]
      .map(function (o) { return '<option value="' + o[0] + '"' + (CMP.url === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
    '<div class="fld"><span>When</span><div class="seg"><button type="button" class="' + (CMP.when === 'now' ? 'on' : '') + '" data-act="when" data-v="now">Send now</button><button type="button" class="' + (CMP.when === 'later' ? 'on' : '') + '" data-act="when" data-v="later">Schedule</button></div>' +
    (CMP.when === 'later' ? '<input type="datetime-local" name="at" value="' + esc(CMP.at) + '" required>' : '') + '</div>' +
    '<label class="tick"><input type="checkbox" name="email"' + (CMP.email ? ' checked' : '') + '> Also email them' + (M.mailLeft != null ? ' <small>(' + M.mailLeft + ' emails left today)</small>' : '') + '</label>' +
    '<div class="sendrow"><button class="btn" type="submit"' + (who.length ? '' : ' disabled') + '>' + icon('send') + (CMP.when === 'later' ? 'Schedule' : 'Send') + ' to ' + plural(who.length, 'person', 'people') + '</button></div></form>';
  h += '<aside class="card preview"><header><h3>Who gets it</h3><span class="count">' + who.length + '</span></header>' +
    '<p class="meta">' + (M.pushOn === false ? 'Phone notifications are not set up on the backend, so only email reaches people.' : reach + ' of ' + who.length + ' have phone notifications on' + (who.length - reach ? '; turn on email to reach the other ' + (who.length - reach) + '.' : '.')) + '</p>' +
    '<div class="phone"><div class="notif"><span class="app">' + esc(M.club) + '</span><b>' + esc(CMP.title || 'Title') + '</b><span>' + esc((CMP.body || 'Message').slice(0, 240)) + '</span></div></div>' +
    '<ul class="wholist">' + who.slice(0, 80).map(function (p) { return '<li>' + esc(p.name) + (p.reach ? '' : ' <small>no phone</small>') + '</li>'; }).join('') + (who.length > 80 ? '<li>…and ' + (who.length - 80) + ' more</li>' : '') + '</ul></aside></div>';
  return h;
}
function logView() {
  if (!M.msgs.length) return empty('Nothing sent yet', '');
  return '<section class="card"><ul class="log">' + M.msgs.map(function (m) {
    var n = (m.to || []).length;
    return '<li class="st-' + esc(m.status) + '"><div class="mh"><p class="mt">' + esc(m.title) + '</p><span class="badge ' + (m.status === 'scheduled' ? 'gold' : m.status === 'cancelled' ? '' : 'ok') + '">' +
      esc(m.status === 'scheduled' ? 'Goes ' + ago(m.at) : m.status === 'cancelled' ? 'Cancelled' : m.status === 'sending' ? 'Sending' : (m.auto ? 'Automatic · ' : '') + ago(m.sentAt || m.created)) + '</span></div>' +
      (m.body ? '<p class="mb">' + esc(m.body) + '</p>' : '') +
      '<p class="meta">' + ((m.target && (m.target.tags || []).length) || m.status !== 'sent' ? forChips(m.target) + ' · ' : '') + (m.status === 'sent' ? plural(n, 'person', 'people') + ' · ' + (m.pushed || 0) + ' notifications' + (m.mailed ? ' · ' + m.mailed + ' emails' : '') : '') +
      ((m.notes || []).length ? ' · ' + esc(m.notes.join(' ')) : '') + '</p>' +
      (m.status === 'scheduled' ? '<button class="link danger" data-act="cancelMsg" data-id="' + esc(m.id) + '">Cancel</button>' : '') + '</li>';
  }).join('') + '</ul></section>';
}
function autoView() {
  var a = sfAuto();
  var row = function (k, title, body, master) {
    return '<li><label class="switch"><input type="checkbox" data-act="auto" data-k="' + k + '"' + (a[k] ? ' checked' : '') + (master || a.on ? '' : ' disabled') + '><i></i></label><div><p class="tt">' + esc(title) + '</p><p class="meta">' + esc(body) + '</p></div></li>';
  };
  var soon = upcoming(false).filter(function (o) { return o.it.start && at(o.it.date, o.it.start) - Date.now() < 2 * 864e5; });
  return '<section class="card"><ul class="autos">' +
    row('on', 'Automatic messages', 'Checked every 10 minutes by the backend. Nothing goes out while this is off.', true) +
    row('dayBefore', 'The day before', 'Everyone a schedule item or coaching session is for hears about it 24 hours ahead.') +
    row('hourBefore', 'An hour before', 'A second nudge shortly before it starts.') +
    row('checklist', 'Checklist deadlines', 'At 6 pm the evening before an item is due, to the people who have not ticked it.') +
    row('teams', 'Team placements', 'When someone is added to an SFBLC team, they hear which team and who is on it.') +
    '</ul></section>' +
    '<section class="card"><header><h3>Going out in the next two days</h3><span class="count">' + soon.length + '</span></header>' + (soon.length ? '<ul class="items">' + soon.map(function (o) {
      return '<li class="item"><div class="when"><span class="d">' + esc(fmtDay(o.it.date)) + '</span><span class="t">' + esc(fmtSpan(o.it)) + '</span></div><div class="what"><p class="tt">' + esc(o.it.title || o.it.topic) + '</p><p class="meta">' +
        plural(resolve(o.it['for']).length, 'person', 'people') + ' · ' + (a.on ? 'reminded' : 'not reminded: automations are off') + '</p></div></li>';
    }).join('') + '</ul>' : empty('Nothing in the next two days', 'Items without a start time are never reminded about.')) + '</section>';
}

/* ---------------- the item editor (schedule, coaching, checklist) ---------------- */
var EDIT = null;
function editorSheet() {
  var e = EDIT, it = e.item, k = e.kind;
  var f = function (name, label, type, extra) {
    return '<label class="fld"><span>' + esc(label) + '</span><input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(it[name] || '') + '"' + (extra || '') + '></label>';
  };
  var h = '<form class="form" data-act="saveItem"><header class="sh"><h3>' + (e.isNew ? 'New ' : 'Edit ') + ({sfSchedule: 'schedule item', sfCoaching: 'coaching session', sfChecklist: 'checklist item'})[k] + '</h3></header>';
  if (k === 'sfChecklist') h += f('label', 'What', 'text', ' maxlength="80" required') + f('due', 'Due', 'date') + '<label class="fld"><span>Details</span><textarea name="detail" rows="2" maxlength="240">' + esc(it.detail || '') + '</textarea></label>';
  else {
    h += k === 'sfCoaching' ? f('topic', 'Topic', 'text', ' maxlength="80" required') : f('title', 'What', 'text', ' maxlength="80" required');
    h += '<div class="row3">' + f('date', 'Date', 'date', ' required') + f('start', 'Starts', 'time') + f('end', 'Ends', 'time') + '</div>';
    h += f('where', 'Where', 'text', ' maxlength="80"');
    if (k === 'sfCoaching') h += f('coach', 'Coach', 'text', ' maxlength="60" list="namelist2"') + f('link', 'Video link (optional)', 'url', ' placeholder="https://"') +
      '<label class="fld"><span>Event</span><select name="event"><option value="">Any</option>' + boardEvents().map(function (x) { return '<option' + (it.event === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label>' +
      '<datalist id="namelist2">' + (M.cfg.ebod || []).map(function (x) { return '<option value="' + esc(x.name) + '">'; }).join('') + '</datalist>';
    else h += '<label class="fld"><span>Kind</span><select name="kind">' + [['general', 'General'], ['comp', 'Competition'], ['travel', 'Travel'], ['social', 'Social']].map(function (o) { return '<option value="' + o[0] + '"' + (it.kind === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="tick"><input type="checkbox" name="tentative"' + (it.tentative ? ' checked' : '') + '> Tentative</label>';
    h += '<label class="tick"><input type="checkbox" name="remind"' + (it.remind !== false ? ' checked' : '') + '> Remind them automatically</label>';
  }
  h += '<div class="fld"><span>For</span>' + audiencePicker(it['for'], 'ed') + '<small class="cc">' + plural(resolve(it['for']).length, 'person', 'people') + '</small></div>';
  h += '<div class="sheetacts"><button class="btn" type="submit">Save</button>' + (e.isNew ? '' : '<button class="btn ghost danger" type="button" data-act="delItem">Delete</button>') + '</div></form>';
  return h;
}

/* Every screen, by the id in the address (#homework). more.js adds the rest. */
var VIEWS = {overview: renderOverview, members: renderMembers, sfblc: renderSfblc, teams: renderTeams, messages: renderMessages};
var ACT_EXT = {}, CHANGE_EXT = {}, SUBMIT_EXT = {};


/* A ranked list of events, compact: "1 Finance · 2 Marketing". */
function rankLine(list) { return list.map(function (e, i) { return '<span class="rk1">' + (i + 1) + '</span>' + esc(e); }).join('<span class="sep">·</span>'); }
/* A member's row shows their most useful tags, gaps and SFBLC first, and how many more there are. */
function tagRow(p) {
  var order = {gap: 0, sfblc: 1, linked: 2, custom: 3, client: 4, track: 5, year: 6, room: 7};
  var list = (p.tags || []).filter(function (t) { return !t.quiet && t.group !== 'avail' && t.group !== 'type' && t.group !== 'org'; })
    .sort(function (a, b) { return (order[a.group] == null ? 9 : order[a.group]) - (order[b.group] == null ? 9 : order[b.group]); });
  var shown = list.slice(0, 5), more = list.length - shown.length;
  return '<div class="tags">' + shown.map(function (t) { return chip(t); }).join('') +
    (more > 0 ? '<button class="chip tone-ink moretags" data-act="profile" data-key="' + esc(p.key) + '">+' + more + '</button>' : '') + '</div>';
}
