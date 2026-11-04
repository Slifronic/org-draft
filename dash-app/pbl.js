/* De Anza PBL, as the chapter actually runs: the Executive Board and its
   Org contacts, the divisions (Org Program, Consulting, Competitions,
   Polaris), the competition season, and member standing under the
   2025–26 Internal Member contract. Everything here reads the same club
   record and backend as the rest of the dashboard. */
'use strict';

/* The board as the classic page has it (F26), used until the club record names its own (cfg.ebod). */
var EBOD_DEFAULT = [
  {name: 'Derick', pos: 'President'}, {name: 'Rameesha', pos: 'Vice President'}, {name: 'Arin', pos: 'VP of Strategy & Development'},
  {name: 'William', pos: 'VP of Finance'}, {name: 'Jayden', pos: 'VP of Operations'}, {name: 'Ruirui', pos: 'VP of Marketing'},
  {name: 'Bryant', pos: 'VP of Communications'}, {name: 'Elena', pos: 'Director'}, {name: 'Angelo', pos: 'Director'},
  {name: 'Lehem', pos: 'Director'}, {name: 'Emmanuel', pos: 'Director'}, {name: 'Timothy', pos: 'Director'}
];
function ebod() { return (M.cfg.ebod && M.cfg.ebod.length) ? M.cfg.ebod : EBOD_DEFAULT; }
var DISCORD = 'https://discord.gg/w7zap3SfUm';

/* The member contract, in its own words where it sets a number. */
var CONTRACT = {
  notice: 'If you can’t make a meeting, tell an officer at least 3 hours before.',
  absences: 'More than 2 unexcused meetings in a row means removal from the membership class.',
  late: 'A late assignment without an extension: the first is a warning, the second a meeting with the President or Vice President, the third a letter of resignation.',
  extension: 'Extensions are asked for at least 3 days before the deadline, from the President or Chapter Adviser.',
  conduct: 'Code of conduct: a first offense is a formal warning; a second, being asked to resign.'
};

/* ---------- standing ----------
   Worked out from what the dashboard already knows: club meetings from
   attendance (a meeting is one a quarter of the club was checked in to),
   late and missing homework, approved extensions, and what officers logged
   (warnings, meetings, conduct). Excused absences recorded only on the
   Discord tickets are not subtracted, so the screen says to check before acting. */
var STAND = {ext: []};
function meetingsInOrder() {
  var ev = {};
  (RAW.all.attendance || []).forEach(function (r) {
    var e = String(r.EventLabel || ''); if (!e) return;
    var m = ev[e] || (ev[e] = {label: e, at: String(r.Timestamp || ''), who: {}});
    if (String(r.Timestamp || '') < m.at) m.at = String(r.Timestamp);
    m.who[flat(r.MemberName)] = 1;
  });
  var size = M.people.length || 1;
  /* Meetings synced from the attendance sheet ("Meeting 10/29") were all copied
     at once, so they are put in order by their date, not by when they arrived. */
  var when = function (m) {
    var d = m.label.match(/^Meeting (\d{1,2})\/(\d{1,2})$/);
    return d ? ((+d[1] < 8 ? 2 : 1) + '-' + ('0' + d[1]).slice(-2) + '-' + ('0' + d[2]).slice(-2)) : '0-' + m.at;
  };
  var ex = {};
  (RAW.all.excused || []).forEach(function (r) { (ex[String(r.EventLabel)] = ex[String(r.EventLabel)] || {})[flat(r.MemberName)] = 1; });
  return Object.keys(ev).map(function (k) { ev[k].excused = ex[k] || {}; return ev[k]; })
    .filter(function (m) { return Object.keys(m.who).length >= size * 0.25; })
    .sort(function (a, b) { return when(a).localeCompare(when(b)); });
}
function standingOf(p, meetings) {
  meetings = meetings || meetingsInOrder();
  var streak = 0;
  /* An excused absence neither counts as missed nor breaks the run. */
  for (var i = meetings.length - 1; i >= 0 && !meetings[i].who[p.key]; i--) if (!(meetings[i].excused || {})[p.key]) streak++;
  var excused = {};
  STAND.ext.forEach(function (x) { if (x.who === p.key && x.status === 'approved') excused[flat(x.work)] = 1; });
  var lateList = p.hw.late.concat(p.hw.missing).filter(function (t) { return !excused[flat(t)]; });
  var log = (M.cfg.standingLog || {})[p.key] || [];
  var conduct = log.filter(function (l) { return l.type === 'conduct'; }).length;
  var level = 'good', why = [], next = '';
  if (streak > 2 || lateList.length >= 3 || conduct >= 2) level = 'removal';
  else if (streak === 2 || lateList.length === 2) level = 'meeting';
  else if (lateList.length === 1 || conduct === 1) level = 'warning';
  if (streak) why.push(streak === 1 ? 'Missed the last meeting' : 'Missed the last ' + streak + ' meetings in a row');
  if (lateList.length) why.push(plural(lateList.length, 'late or missing assignment') + ': ' + lateList.join(', '));
  if (conduct) why.push(plural(conduct, 'conduct offense') + ' logged');
  if (level === 'removal') next = streak > 2 ? 'Contract: removal for more than 2 unexcused meetings in a row. Check for Discord tickets first.' : lateList.length >= 3 ? 'Contract: third late assignment means a letter of resignation.' : 'Contract: second conduct offense means being asked to resign.';
  else if (level === 'meeting') next = streak === 2 ? 'One more unexcused meeting means removal. Reach out before the next one.' : 'Contract: second late assignment means a meeting with the President or Vice President.';
  else if (level === 'warning') next = lateList.length ? 'Contract: first late assignment gets a warning.' : 'Contract: first conduct offense gets a formal warning.';
  /* Already dealt with: the warning or meeting this level calls for has been logged since the last late or absence. */
  var handled = (level === 'warning' && log.some(function (l) { return l.type === 'warning'; })) || (level === 'meeting' && log.some(function (l) { return l.type === 'meeting'; }));
  return {level: level, streak: streak, late: lateList, conduct: conduct, why: why, next: next, log: log, handled: handled};
}
var LEVELS = {good: ['Good standing', 'ok'], warning: ['Warning', 'gold'], meeting: ['Meeting needed', 'gold'], removal: ['Removal review', 'bad']};

VIEWS.standing = function () {
  /* Only Internal Members with an account are judged: a name that is only on a sheet or a team
     (often another spelling of someone) has no record here to judge by. */
  var meetings = meetingsInOrder(), rows = M.people.filter(function (p) { return p.role === 'member' && (p.email || !M.officer); })
    .map(function (p) { return {p: p, s: standingOf(p, meetings)}; });
  var rank = {removal: 0, meeting: 1, warning: 2, good: 3};
  rows.sort(function (a, b) { return rank[a.s.level] - rank[b.s.level] || b.s.late.length - a.s.late.length || a.p.name.localeCompare(b.p.name); });
  rows.sort(function (a, b) { return (a.s.handled ? 1 : 0) - (b.s.handled ? 1 : 0); });
  var count = function (l) { return rows.filter(function (r) { return r.s.level === l; }).length; };
  var open = rows.filter(function (r) { return r.s.level !== 'good' && !r.s.handled; }).length;
  var waiting = STAND.ext.filter(function (x) { return x.status === 'waiting'; });
  var h = '<section class="kpis">' +
    kpi('Good standing', count('good'), 'of ' + rows.length + ' Internal Members', '#standing', 'good', rows.length ? count('good') / rows.length * 100 : 0) +
    kpi('Warnings', count('warning'), rows.filter(function (r) { return r.s.level === 'warning' && r.s.handled; }).length + ' already given', '#standing') +
    kpi('Meetings needed', count('meeting'), 'with the President or VP · ' + rows.filter(function (r) { return r.s.level === 'meeting' && r.s.handled; }).length + ' held', '#standing', rows.some(function (r) { return r.s.level === 'meeting' && !r.s.handled; }) ? 'warn' : '') +
    kpi('Removal review', count('removal'), count('removal') ? '<b>Check tickets, then decide</b>' : 'None', '#standing', count('removal') ? 'bad' : '') + '</section>';
  h += '<div class="bento">';
  h += '<section class="card span2"><header><h3>Members to act on</h3><span class="count">' + open + '</span></header>' +
    (rows.length - count('good') ? '<ul class="stand">' + rows.filter(function (r) { return r.s.level !== 'good'; }).map(function (r) {
      var lv = LEVELS[r.s.level], last = r.s.log[r.s.log.length - 1];
      return '<li class="' + (r.s.handled ? 'handled' : '') + '"><div class="sh2"><button class="who" data-act="profile" data-key="' + esc(r.p.key) + '">' + avatar(r.p) + '<span><span class="pn">' + esc(r.p.name) + '</span><span class="pe">' + esc(r.p.org || '') + '</span></span></button>' +
        '<span class="badge ' + (r.s.handled ? '' : lv[1]) + '">' + (r.s.handled ? (r.s.level === 'meeting' ? 'Meeting held' : 'Warning given') : lv[0]) + '</span></div><p class="mb sm">' + esc(r.s.why.join(' · ')) + '</p><p class="meta">' + esc(r.s.next) +
        (last ? ' · Last logged: ' + esc(last.type) + ' ' + esc(ago(last.at)) + (last.by ? ' by ' + esc(last.by) : '') : '') + '</p>' +
        '<div class="rowacts"><button class="qbtn" data-act="standMsg" data-key="' + esc(r.p.key) + '">' + icon('send') + '<span>Message</span></button>' +
        '<button class="qbtn" data-act="standLog" data-key="' + esc(r.p.key) + '">' + icon('edit') + '<span>Log a warning or meeting</span></button></div></li>';
    }).join('') + '</ul>' : empty('Everyone is in good standing', 'Nobody has a late assignment, an unexcused streak or a logged offense.')) + '</section>';
  h += '<section class="card"><header><h3>Extension requests</h3><span class="count">' + waiting.length + '</span></header>' +
    (STAND.ext.length ? '<ul class="inbox">' + STAND.ext.slice().reverse().slice(0, 20).map(function (x) {
      return '<li><div class="mh"><p class="mt">' + esc(x.name) + '</p><span class="ma">' + esc(ago(x.at)) + '</span></div><p class="mb sm">' + esc(x.work) + (x.until ? ' · until ' + esc(fmtDay(x.until)) : '') + '</p>' +
        (x.reason ? '<p class="meta">“' + esc(x.reason) + '”</p>' : '') +
        (x.status === 'waiting' ? '<div class="rowacts"><button class="qbtn" data-act="extOk" data-id="' + esc(x.id) + '">' + icon('check') + '<span>Approve</span></button><button class="qbtn" data-act="extNo" data-id="' + esc(x.id) + '">' + icon('close') + '<span>Decline</span></button></div>'
          : '<p class="meta"><span class="badge ' + (x.status === 'approved' ? 'ok' : '') + '">' + esc(x.status === 'approved' ? 'Approved' : 'Declined') + '</span> ' + esc(x.by || '') + '</p>') + '</li>';
    }).join('') + '</ul>' : empty('No requests', 'Members ask from the Homework tab, at least 3 days before the due date.')) + '</section>';
  h += '<section class="card"><header><h3>The contract</h3></header><ul class="rules">' + ['absences', 'late', 'extension', 'notice', 'conduct'].map(function (k) { return '<li>' + esc(CONTRACT[k]) + '</li>'; }).join('') + '</ul>' +
    '<p class="meta">Excused absences live on the Discord attendance tickets and the Fall 26’ Attendance sheet; check them before acting on a streak.</p></section>';
  h += '</div>';
  return h;
};
function standLogSheet(key) {
  var p = M.byKey[key], s = standingOf(p);
  return '<form class="form" data-act="standLogSave" data-key="' + esc(key) + '"><header class="sh"><h3>Log for ' + esc(p.name) + '</h3></header>' +
    '<label class="fld"><span>What happened</span><select name="type"><option value="warning">Warning given</option><option value="meeting">Meeting with the President or VP</option><option value="conduct">Code of conduct offense</option><option value="note">Note</option></select></label>' +
    '<label class="fld"><span>Note (officers only)</span><textarea name="note" rows="3" maxlength="300"></textarea></label>' +
    (s.log.length ? '<div class="fg"><p class="fl">Logged so far</p><ul class="inbox">' + s.log.slice().reverse().map(function (l) { return '<li><div class="mh"><p class="mt">' + esc(l.type) + '</p><span class="ma">' + esc(ago(l.at)) + '</span></div>' + (l.note ? '<p class="meta">' + esc(l.note) + '</p>' : '') + '</li>'; }).join('') + '</ul></div>' : '') +
    '<p class="meta">Only officers see this log. The member sees that a warning or meeting was logged, not the note.</p><div class="sheetacts"><button class="btn">Save</button></div></form>';
}
ACT_EXT.standLog = function (el, d) { openSheet(standLogSheet(d.key)); };
SUBMIT_EXT.standLogSave = function (f) {
  var key = f.getAttribute('data-key'), log = JSON.parse(JSON.stringify(M.cfg.standingLog || {}));
  (log[key] = log[key] || []).push({type: f.type.value, note: clean(f.note.value, 300), at: new Date().toISOString(), by: M.me.name});
  closeSheet();
  saveCfg({standingLog: log}, 'Logged.');
};
ACT_EXT.standMsg = function (el, d) {
  var p = M.byKey[d.key], s = standingOf(p);
  compose({title: s.level === 'meeting' ? 'Can we meet this week?' : 'Checking in', body: 'Hi ' + p.name.split(' ')[0] + ', ' + (s.why[0] ? s.why[0].charAt(0).toLowerCase() + s.why[0].slice(1) + '. ' : '') +
    'Let us know if something is getting in the way. ' + (s.late.length ? CONTRACT.extension : CONTRACT.notice), target: {tags: [], names: [p.name]}});
};
function decideExt(id, ok) {
  call('extDecide', {id: id, ok: ok}).then(function (r) {
    if (!(r && r.ok)) return toast((r && r.error) || 'Not saved.', true);
    STAND.ext.forEach(function (x, i) { if (x.id === id) STAND.ext[i] = r.ext; });
    render(); toast(ok ? 'Approved. A late hand-in will not count against them.' : 'Declined.');
  });
}
ACT_EXT.extOk = function (el, d) { decideExt(d.id, true); };
ACT_EXT.extNo = function (el, d) { decideExt(d.id, false); };

/* What a member sees of their own standing. */
function myStandingCard() {
  var log = (RAW.inbox && RAW.inbox.standing) || [], warned = log.filter(function (l) { return l.type === 'warning' || l.type === 'conduct'; }).length;
  var mine = (RAW.inbox && RAW.inbox.ext) || [];
  /* Overdue work this browser has not handed in counts too, unless an extension was approved. */
  var overdue = works().filter(function (w) {
    var x = extFor(w.id);
    return workFor(w, M.me) && w.due && daysTo(w.due) < 0 && !myHandIn(w.id) && !(x && x.status === 'approved');
  });
  var badge = log.length ? '<span class="badge gold">' + plural(log.length, 'entry', 'entries') + ' logged</span>' : overdue.length ? '<span class="badge gold">' + plural(overdue.length, 'late assignment') + '</span>' : '<span class="badge ok">Good standing</span>';
  var h = '<section class="card"><header><h3>Your standing</h3>' + badge + '</header>';
  if (overdue.length) h += '<p class="mb sm">' + esc(overdue.map(function (w) { return w.title; }).join(', ')) + ' ' + (overdue.length === 1 ? 'is' : 'are') + ' past due. Hand ' + (overdue.length === 1 ? 'it' : 'them') + ' in on Homework: under the contract, a first late assignment is a warning.</p>';
  if (log.length) h += '<ul class="inbox">' + log.slice().reverse().map(function (l) { return '<li><div class="mh"><p class="mt">' + esc({warning: 'Warning', meeting: 'Meeting with the President or VP', conduct: 'Code of conduct', note: 'Note'}[l.type] || l.type) + '</p><span class="ma">' + esc(ago(l.at)) + '</span></div></li>'; }).join('') + '</ul>';
  if (mine.length) h += '<div class="fg"><p class="fl">Your extension requests</p>' + mine.slice(-3).reverse().map(function (x) { return '<p>' + esc(x.work) + ' · <span class="badge ' + (x.status === 'approved' ? 'ok' : x.status === 'declined' ? 'bad' : '') + '">' + esc({waiting: 'Waiting', approved: 'Approved', declined: 'Declined'}[x.status]) + '</span></p>'; }).join('') + '</div>';
  h += '<ul class="rules">' + ['notice', 'absences', 'extension'].map(function (k) { return '<li>' + esc(CONTRACT[k]) + '</li>'; }).join('') + '</ul>' +
    '<div class="rowacts"><a class="qbtn" href="' + DISCORD + '" target="_blank" rel="noopener">' + icon('link') + '<span>Open an attendance ticket on Discord</span></a></div></section>';
  return h;
}

/* ---------- extension requests (members, from Homework) ---------- */
ACT_EXT.extAsk = function (el, d) {
  var w = (M.cfg.work || []).filter(function (x) { return x.id === d.id; })[0];
  openSheet('<form class="form" data-act="extSave" data-id="' + esc(w.id) + '"><header class="sh"><h3>Ask for an extension</h3></header><p class="mb">' + esc(w.title) + (w.due ? ' · due ' + esc(fmtDay(w.due, true)) : '') + '</p>' +
    '<label class="fld"><span>New date you need</span><input name="until" type="date" min="' + esc(w.due || today()) + '"></label>' +
    '<label class="fld"><span>Why</span><textarea name="reason" rows="3" maxlength="300" required placeholder="What is getting in the way"></textarea></label>' +
    '<p class="meta">' + esc(CONTRACT.extension) + ' The officers see this request and answer it here.</p><div class="sheetacts"><button class="btn">Send request</button></div></form>');
};
SUBMIT_EXT.extSave = function (f) {
  call('extRequest', {workId: f.getAttribute('data-id'), reason: f.reason.value, until: f.until.value}).then(function (r) {
    if (!(r && r.ok)) return toast((r && r.error) || 'Not sent.', true);
    RAW.inbox = RAW.inbox || {}; RAW.inbox.ext = (RAW.inbox.ext || []).concat([r.ext]);
    closeSheet(); render(); toast('Sent. You will see the answer on Homework and Profile.');
  });
};
function extFor(workId) { return ((RAW.inbox && RAW.inbox.ext) || []).filter(function (x) { return x.workId === workId; }).slice(-1)[0]; }

/* ---------- Consulting division ----------
   Intake & scoping, research & analysis, delivery & impact: the three steps
   on deanzapbl.com/consulting. A team's step is kept beside the teams
   (consultStage), so the classic page's team editor never drops it. */
var STAGES = [['scope', 'Intake & scoping'], ['research', 'Research & analysis'], ['deliver', 'Delivery & impact'], ['done', 'Delivered']];
VIEWS.consulting = function () {
  var teams = M.teams.filter(function (t) { return t.kind === 'consulting'; }), st = M.cfg.consultStage || {};
  var mine = teams.filter(function (t) { return (t.members || []).some(function (m) { return flat(m) === M.me.key; }); });
  var h = '<p class="lede">Student analysts on real Bay Area organizations: each client team has two PMs and splits into initiatives, and presents at the Consulting Division Showcase and the State Consulting Competition.</p>';
  if (!teams.length) return h + empty('No client teams yet', 'Client teams are set up on the classic Teams tab.', M.officer ? '<a class="btn" href="/teams">Set up client teams</a>' : '');
  h += '<div class="bento">' + mine.concat(teams.filter(function (t) { return mine.indexOf(t) < 0; })).map(function (t) {
    var stage = st[t.id] || 'scope', si = STAGES.map(function (x) { return x[0]; }).indexOf(stage);
    var mem = (t.members || []).filter(Boolean), pms = (t.pms || []).filter(Boolean), assign = t.assign || {};
    var byInit = {};
    (t.initiatives || []).forEach(function (i) { byInit[i] = []; });
    var none = [];
    mem.forEach(function (m) { var a = assign[m]; if (a && byInit[a]) byInit[a].push(m); else if (pms.indexOf(m) < 0) none.push(m); });
    var isMine = mine.indexOf(t) > -1;
    return '<section class="card cons' + (isMine ? ' mine' : '') + '"><header><h3>' + esc(t.client || teamName(t)) + (isMine ? ' <span class="badge">Your team</span>' : '') + '</h3><span class="count">' + mem.length + '</span></header>' +
      '<ol class="steps">' + STAGES.slice(0, 3).map(function (x, i) { return '<li class="' + (i < si || stage === 'done' ? 'past' : i === si ? 'now' : '') + '">' + esc(x[1]) + '</li>'; }).join('') + '</ol>' +
      (M.officer ? '<label class="fld inline"><span>Step</span><select class="mini" data-act="stage" data-id="' + esc(t.id) + '">' + STAGES.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === stage ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></label>' : '') +
      '<dl class="facts pf"><dt>PMs</dt><dd>' + esc(pms.join(' & ') || 'To be named') + '</dd>' +
      (isMine && assign[M.me.name] ? '<dt>Your initiative</dt><dd><b>' + esc(assign[M.me.name]) + '</b></dd>' : '') + '</dl>' +
      Object.keys(byInit).map(function (i) { return '<div class="fg"><p class="fl">' + esc(i) + '</p><p class="mb sm">' + esc(byInit[i].join(', ') || 'No one yet') + '</p></div>'; }).join('') +
      (none.length ? '<div class="fg"><p class="fl">' + (Object.keys(byInit).length ? 'No initiative yet' : 'Consultants') + '</p><p class="mb sm">' + esc(none.join(', ')) + '</p></div>' : '') +
      (M.officer ? '<div class="rowacts"><button class="qbtn" data-act="msgTeam" data-id="' + esc(t.id) + '">' + icon('send') + '<span>Message team</span></button><a class="qbtn" href="/teams">' + icon('edit') + '<span>PMs and initiatives</span></a></div>' : '') + '</section>';
  }).join('') + '</div>';
  return h;
};
CHANGE_EXT.stage = function (el, d) {
  var st = Object.assign({}, M.cfg.consultStage || {}); st[d.id] = el.value;
  saveCfg({consultStage: st}, 'Step updated.');
};
ACT_EXT.msgTeam = function (el, d) { compose({target: {tags: ['team:' + d.id], names: []}}); };

/* ---------- the Board ---------- */
VIEWS.board = function () {
  var list = ebod(), execs = list.filter(function (e) { return !/^director/i.test(e.pos); }), dirs = list.filter(function (e) { return /^director/i.test(e.pos); });
  var orgsOf = function (name) { return M.orgs.filter(function (o) { return flat(o.ebod) === flat(name); }).map(function (o) { return o.name; }); };
  var card = function (e) {
    var orgs = orgsOf(e.name), mine = orgs.indexOf(M.me.org) > -1;
    return '<li class="' + (mine ? 'mine' : '') + '">' + avatar({name: e.name}) + '<span><span class="pn">' + esc(e.name) + (mine ? ' <span class="badge">Your Org contact</span>' : '') + '</span><span class="pe">' + esc(e.pos) +
      (orgs.length ? ' · Org contact for ' + esc(orgs.join(', ')) : '') + '</span></span></li>';
  };
  var myContact = M.orgs.filter(function (o) { return o.name === M.me.org; })[0];
  var h = '';
  if (!M.officer && myContact && myContact.ebod) h += '<div class="note">' + icon('profile') + '<span>Your EBOD contact is <b>' + esc(myContact.ebod) + '</b> (' + esc(myContact.name) + '). For an extension or anything under the member contract, it’s the President or Vice President.</span></div>';
  h += '<div class="bento">';
  h += '<section class="card span2"><header><h3>Executive Board</h3><span class="count">' + execs.length + '</span></header><ul class="board2">' + execs.map(card).join('') + '</ul></section>';
  h += '<section class="card"><header><h3>Directors</h3><span class="count">' + dirs.length + '</span></header><ul class="board2 one">' + dirs.map(card).join('') + '</ul></section>';
  h += '<section class="card"><header><h3>Who to ask</h3></header><dl class="facts pf"><dt>Extensions</dt><dd>President or Chapter Adviser, 3+ days before the deadline</dd><dt>Can’t make it</dt><dd>Any officer, 3+ hours before; an attendance ticket on Discord</dd>' +
    '<dt>Your Org</dt><dd>' + esc(myContact && myContact.ebod ? myContact.ebod : 'Your Org’s EBOD contact') + '</dd><dt>Teams</dt><dd>Your PMs, or the EBOD contact for your event</dd></dl>' +
    '<div class="rowacts"><a class="qbtn" href="' + DISCORD + '" target="_blank" rel="noopener">' + icon('link') + '<span>PBL Discord</span></a><a class="qbtn" href="https://deanzapbl.com/leadership" target="_blank" rel="noopener">' + icon('arrow') + '<span>deanzapbl.com</span></a></div></section>';
  h += '<section class="card"><header><h3>Divisions</h3></header><dl class="facts pf"><dt>Org Program</dt><dd>' + plural(M.orgs.length, 'Org') + ', homework and the Org Cup</dd>' +
    '<dt>Consulting</dt><dd>' + plural(M.teams.filter(function (t) { return t.kind === 'consulting'; }).length, 'client team') + '</dd>' +
    '<dt>Competitions</dt><dd>' + plural(M.teams.filter(function (t) { return t.kind === 'flc'; }).length, 'SFBLC team') + ', then SBLC and NLC</dd>' +
    '<dt>Polaris</dt><dd>' + plural(M.people.filter(function (p) { return /polaris/i.test(p.track); }).length, 'member') + ' on the research track</dd></dl></section>';
  return h + '</div>';
};

/* ---------- the competition season ---------- */
var SEASON_COMP = [
  {key: 'sfblc', name: 'SFBLC 2026', full: 'State Fall Business Leadership Conference', when: 'Nov 13–15, 2026', where: 'Emeryville', now: true},
  {key: 'sblc', name: 'SBLC 2027', full: 'State Business Leadership Conference', when: 'Spring 2027 · date from CAPBL', where: 'California', note: 'Includes the State Consulting Competition. Top places qualify for nationals.'},
  {key: 'nlc', name: 'NLC 2027', full: 'National Leadership Conference', when: 'Summer 2027 · date from FBLA', where: 'TBA', note: 'For SBLC qualifiers.'}
];
/* The season as officers keep it (cfg.sfSeason), starting from the list above. */
function sfSeason() {
  return (M.cfg.sfSeason && M.cfg.sfSeason.length) ? M.cfg.sfSeason : SEASON_COMP.map(function (c) { return Object.assign({id: c.key}, c); });
}
function seasonStrip() {
  var list = sfSeason();
  if (M.officer && SFV.edit) return '<section class="card season"><header><h3>The competition season</h3></header><ol class="seasoned">' + list.map(function (c) {
    var k = 'sfSeason', id = c.id;
    return '<li>' + sfIn(k, id, 'name', c.name, {max: 40, label: 'Name', cls: 'b'}) + sfIn(k, id, 'full', c.full, {max: 100, label: 'Full name'}) + sfIn(k, id, 'when', c.when, {max: 60, label: 'When'}) +
      sfIn(k, id, 'where', c.where, {max: 60, label: 'Where'}) + sfTa(k, id, 'note', c.note, {max: 160, rows: 2, label: 'Note', ph: 'Note (optional)'}) +
      '<label class="tick"><input type="checkbox" ' + sfAttrs(k, id, 'now') + (c.now ? ' checked' : '') + '> Happening now</label></li>';
  }).join('') + '</ol></section>';
  return '<section class="card season"><header><h3>The competition season</h3></header><ol class="steps big3">' + list.map(function (c) {
    return '<li class="' + (c.now ? 'now' : '') + '"><b>' + esc(c.name) + '</b><span>' + esc(c.full) + '</span><span>' + esc(c.when) + (c.where ? ' · ' + esc(c.where) : '') + '</span>' + (c.note ? '<small>' + esc(c.note) + '</small>' : '') + '</li>';
  }).join('') + '</ol></section>';
}
