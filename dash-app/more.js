/* The rest of the classic Org System, on the dashboard: Orgs, Homework,
   Calendar, Org Cup, Attendance, Profile and the officer tools. Each saves
   through the same backend calls the classic page uses, so either page can
   be used on the same club at the same time. */
'use strict';

/* The top bar already names the screen, so a head only repeats a title that
   says something more (the calendar's month), plus the screen's actions. */
function head(eyebrow, title, right) {
  var nav = NAV.filter(function (n) { return n.id === ROUTE.view; })[0], same = nav && (title === nav.label || title === nav.member);
  if (same && !right) return '';
  return '<section class="vhead' + (same ? ' bare' : '') + '">' + (same ? '<span></span>' : '<div><h2>' + esc(title) + '</h2></div>') + (right || '') + '</section>';
}
function daysWord(n) { return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? 'in ' + n + ' days' : -n + ' days ago'; }

/* ---------------- Orgs ---------------- */
VIEWS.orgs = function () {
  if (!M.orgs.length) return head('People', 'Orgs') + empty('No Orgs yet', 'Orgs are drafted at bootcamp 1 from everyone who signed up.', M.officer ? '<a class="btn" href="/draft">Run the draft</a>' : '');
  var mine = M.me.org;
  var h = head('People', 'Orgs', '<p class="hint">' + plural(M.orgs.length, 'Org') + ' · 8–10 members each · one EBOD contact</p>');
  h += '<div class="orggrid">' + M.orgs.map(function (o) {
    var y2 = o.members.filter(function (p) { return p.year === 2; });
    return '<button class="orgcard' + (o.name === mine ? ' mine' : '') + '" data-act="org" data-i="' + o.i + '">' +
      '<span class="nn">' + String(o.i + 1).padStart(2, '0') + (o.name === mine ? ' · Your Org' : '') + '</span>' +
      '<span class="on">' + esc(o.name) + '</span>' +
      '<span class="ostats"><span><b class="fig">' + o.members.length + '</b>members</span><span><b class="fig">' + o.cups + '</b>' + (o.cups === 1 ? 'cup' : 'cups') + '</span>' +
      (o.rate !== null ? '<span><b class="fig">' + Math.round(o.rate * 100) + '%</b>on time</span>' : '') + '</span>' +
      '<span class="meta">' + (o.ebod ? 'EBOD contact: ' + esc(o.ebod) : 'No EBOD contact yet') + ' · ' + plural(y2.length, '2nd year') + '</span>' + icon('arrow', 'go') + '</button>';
  }).join('') + '</div>';
  return h;
};
function orgSheet(i) {
  var o = M.orgs[i];
  var h = '<header class="sh"><div><p class="tag">Org ' + String(i + 1).padStart(2, '0') + '</p><h3>' + esc(o.name) + '</h3><p class="pe">' +
    (o.ebod ? 'EBOD contact: ' + esc(o.ebod) : 'No EBOD contact yet') + '</p></div></header>';
  h += '<div class="fg"><p class="fl">Members</p><ul class="mates">' + o.members.map(function (p) {
    return '<li><button class="who" data-act="profile" data-key="' + esc(p.key) + '">' + avatar(p) + '<span><span class="pn">' + esc(p.name) + '</span><span class="pe">' +
      (p.year === 2 ? '2nd year' : '1st year') + (p.track ? ' · ' + esc(p.track) : '') + '</span></span></button></li>';
  }).join('') + '</ul></div>';
  if (o.works.length) h += '<div class="fg"><p class="fl">Homework on time</p><ul class="progress">' + o.works.map(function (w) {
    var wk = (M.cfg.work || []).filter(function (x) { return x.id === w.id; })[0] || {title: 'Assignment'};
    var pct = w.of ? Math.round(w.got / w.of * 100) : 0;
    return '<li><div class="pl"><span>' + esc(wk.title) + (pct >= 80 ? ' <span class="badge gold">Cup</span>' : '') + '</span><span class="num">' + w.got + '/' + w.of + '</span></div><div class="bar"><i style="width:' + pct + '%"></i></div></li>';
  }).join('') + '</ul></div>';
  h += '<div class="sheetacts"><button class="btn" data-act="msgOrg" data-org="' + esc(o.name) + '">' + icon('send') + 'Message this Org</button></div>';
  return h;
}
ACT_EXT.org = function (el, d) { openSheet(orgSheet(+d.i), function () { return orgSheet(+d.i); }); };
ACT_EXT.msgOrg = function (el, d) { closeSheet(); compose({target: {tags: ['org:' + d.org], names: []}}); };

/* ---------------- Homework ---------------- */
var HW = {edit: null};
VIEWS.homework = function (sub) {
  return M.officer ? hwOfficer(sub || 'list') : hwMember();
};
function dueLine(w, mine) {
  if (!w.due) return '<span class="due">No due date</span>';
  var n = daysTo(w.due);
  if (n < 0 && mine) return '<span class="due late">Overdue · was due ' + esc(fmtDay(w.due)) + '</span>';
  return '<span class="due' + (n < 0 ? ' past' : n <= 2 ? ' soon' : '') + '">' + (n < 0 ? 'Was due ' : 'Due ') + esc(fmtDay(w.due)) + ' · ' + daysWord(n) + '</span>';
}
function hwMember() {
  /* What still needs doing first, then what is overdue, then what is in. */
  var rank = function (w) { return myHandIn(w.id) ? 2 : (!w.due || daysTo(w.due) >= 0) ? 0 : 1; };
  var list = works().filter(function (w) { return workFor(w, M.me); }).sort(function (a, b) { return rank(a) - rank(b); });
  var open = list.filter(function (w) { return !myHandIn(w.id) && (!w.due || daysTo(w.due) >= 0); });
  var h = head('Develop', 'Homework', '<p class="hint">' + plural(open.length, 'to hand in', 'to hand in') + '</p>');
  if (!list.length) return h + empty('No homework for you yet', 'New assignments show up here, and as a notification once those are on.');
  h += '<div class="hwlist">' + list.map(function (w) {
    var got = myHandIn(w.id), kind = w.kind || 'file';
    return '<article class="card hw' + (got ? ' in' : '') + '"><header><div><p class="tag">' + esc(workFor_(w)) + '</p><h3>' + esc(w.title) + '</h3></div>' +
      (got ? '<span class="badge ok">Handed in ' + esc(ago(got)) + '</span>' : dueLine(w, true)) + '</header>' +
      (w.note ? '<p class="mb">' + esc(w.note) + '</p>' : '') +
      (w.brief ? '<details class="brief"><summary>Brief</summary><p>' + esc(w.brief) + '</p></details>' : '') +
      '<form class="handin" data-act="handIn" data-id="' + esc(w.id) + '">' +
      (kind !== 'file' ? '<input name="link" type="url" placeholder="https:// link to your doc or deck" aria-label="Link to your work">' : '') +
      (kind !== 'link' ? '<label class="btn ghost sm file">' + icon('upload') + '<span>Choose a file</span><input name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.heic,.webp"></label>' : '') +
      '<button class="btn sm">' + (got ? 'Replace' : 'Hand in') + '</button></form>' + extLine(w, got) +
      (got ? '<p class="meta">Handing in again replaces your earlier version; the first on-time hand-in still counts.</p>' : '') + '</article>';
  }).join('') + '</div>';
  return h;
}
function hwOfficer(sub) {
  var h = head('Develop', 'Homework', '<button class="btn sm" data-act="hwNew">' + icon('plus') + 'Set an assignment</button>');
  var list = works();
  if (!list.length) return h + empty('No assignments yet', 'Set one and it lands in the Drive folder of everyone it is for.', '<button class="btn" data-act="hwNew">Set an assignment</button>');
  var byWork = {};
  M.subs.forEach(function (s) { (byWork[s.workId] = byWork[s.workId] || {})[flat(s.name)] = s; });
  h += '<div class="hwlist">' + list.map(function (w) {
    var forP = M.people.filter(function (p) { return p.role === 'member' && workFor(w, p); });
    var got = byWork[w.id] || {}, end = dueEnd(w), on = 0, late = 0;
    var missing = forP.filter(function (p) { var s = got[p.key]; if (s) { if (end && new Date(s.first || s.at) > end) late++; else on++; } return !s; });
    var past = w.due && daysTo(w.due) < 0, pct = forP.length ? Math.round((on + late) / forP.length * 100) : 0;
    return '<article class="card hw"><header><div><p class="tag">' + esc(workFor_(w)) + ' · ' + esc(w.kind === 'link' ? 'Link' : w.kind === 'either' ? 'File or link' : 'File') + '</p><h3>' + esc(w.title) + '</h3></div>' + dueLine(w) + '</header>' +
      '<div class="hwstats"><span><b class="fig">' + (on + late) + ' of ' + forP.length + '</b>handed in</span><span><b class="fig">' + on + '</b>on time</span><span><b class="fig">' + late + '</b>late</span><span><b class="fig' + (past && missing.length ? ' bad' : '') + '">' + missing.length + '</b>' + (past ? 'missing' : 'to come') + '</span></div>' +
      '<div class="bar' + (forP.length && on / forP.length >= .8 ? ' ok' : past ? ' low' : '') + '"><i style="width:' + pct + '%"></i></div>' +
      (missing.length ? '<p class="meta">' + (past ? 'Missing: ' : 'Not in yet: ') + esc(missing.slice(0, 12).map(function (p) { return p.name; }).join(', ')) + (missing.length > 12 ? '…' : '') + '</p>' : '') +
      '<div class="rowacts">' + (missing.length ? '<button class="qbtn" data-act="hwNudge" data-id="' + esc(w.id) + '">' + icon('bell') + '<span>Remind the ' + missing.length + '</span></button>' : '') +
      '<button class="qbtn" data-act="hwEdit" data-id="' + esc(w.id) + '">' + icon('edit') + '<span>Edit</span></button><a class="qbtn" href="/homework">' + icon('arrow') + '<span>Review hand-ins</span></a></div></article>';
  }).join('') + '</div>';
  return h;
}
function hwForm() {
  var w = HW.edit || {};
  var forV = w.team && w.team !== 'all' ? 'team:' + w.team : w.orgName ? 'org:' + w.org : 'all';
  return '<form class="form" data-act="hwSave"><header class="sh"><h3>' + (w.id ? 'Edit assignment' : 'Set an assignment') + '</h3></header>' +
    '<label class="fld"><span>Name</span><input name="title" maxlength="80" required value="' + esc(w.title || '') + '"></label>' +
    '<label class="fld"><span>Due</span><input name="due" type="date" value="' + esc(w.due || '') + '"></label>' +
    '<label class="fld"><span>For</span><select name="for"><option value="all">Everyone</option>' +
    M.orgs.map(function (o) { return '<option value="org:' + o.i + '"' + (forV === 'org:' + o.i ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('') +
    M.teams.map(function (t) { return '<option value="team:' + esc(t.id) + '"' + (forV === 'team:' + t.id ? ' selected' : '') + '>' + esc((t.kind === 'flc' ? t.event + ' · ' : '') + teamName(t)) + '</option>'; }).join('') + '</select></label>' +
    '<label class="fld"><span>Homework track</span><select name="focus"><option value="">Both tracks</option><option value="c"' + (w.focus === 'c' ? ' selected' : '') + '>Consulting only</option><option value="k"' + (w.focus === 'k' ? ' selected' : '') + '>Case competition only</option></select></label>' +
    '<label class="fld"><span>Hand in as</span><select name="kind"><option value="file">A file</option><option value="link"' + (w.kind === 'link' ? ' selected' : '') + '>A link</option><option value="either"' + (w.kind === 'either' ? ' selected' : '') + '>Either</option></select></label>' +
    '<label class="fld"><span>One-line note</span><input name="note" maxlength="160" value="' + esc(w.note || '') + '"></label>' +
    '<label class="fld"><span>Brief</span><textarea name="brief" maxlength="900" rows="4">' + esc(w.brief || '') + '</textarea></label>' +
    '<p class="meta">Members it is for get a notification when it is set and the evening before it is due.</p>' +
    '<div class="sheetacts"><button class="btn">' + (w.id ? 'Save' : 'Set it') + '</button>' + (w.id ? '<button type="button" class="btn ghost danger" data-act="hwDel">Delete</button>' : '') + '</div></form>';
}
ACT_EXT.hwNew = function () { HW.edit = null; openSheet(hwForm()); };
ACT_EXT.hwEdit = function (el, d) { HW.edit = JSON.parse(JSON.stringify((M.cfg.work || []).filter(function (w) { return w.id === d.id; })[0])); openSheet(hwForm()); };
ACT_EXT.hwDel = function () {
  var id = HW.edit.id;
  confirmSheet('Delete this assignment?', 'Hand-ins already in stay in Drive, but the assignment disappears for everyone.', 'Delete', function () {
    saveCfg({work: (M.cfg.work || []).filter(function (w) { return w.id !== id; })}, 'Assignment deleted.');
  });
};
ACT_EXT.hwNudge = function (el, d) {
  var w = (M.cfg.work || []).filter(function (x) { return x.id === d.id; })[0], got = {};
  M.subs.forEach(function (s) { if (s.workId === w.id) got[flat(s.name)] = 1; });
  var missing = M.people.filter(function (p) { return p.role === 'member' && workFor(w, p) && !got[p.key]; });
  compose({title: (w.due && daysTo(w.due) < 0 ? 'Still missing: ' : 'Reminder: ') + w.title, body: (w.due ? 'Due ' + fmtDay(w.due) + '. ' : '') + 'Hand it in on the Homework tab.',
           target: {tags: [], names: missing.map(function (p) { return p.name; })}, url: '/#homework'});
};
SUBMIT_EXT.hwSave = function (f) {
  var forV = f['for'].value, org = forV.indexOf('org:') === 0 ? forV.slice(4) : '', team = forV.indexOf('team:') === 0 ? forV.slice(5) : 'all';
  var fields = {title: clean(f.title.value, 80).trim(), due: f.due.value || '', note: clean(f.note.value, 160), brief: clean(f.brief.value, 900),
                team: team, org: org, orgName: org === '' ? '' : (M.orgs[+org] || {}).name || '', focus: f.focus.value, kind: f.kind.value};
  if (!fields.title) return toast('It needs a name.', true);
  var list = JSON.parse(JSON.stringify(M.cfg.work || []));
  if (HW.edit && HW.edit.id) list.forEach(function (w, i) { if (w.id === HW.edit.id) list[i] = Object.assign(w, fields); });
  else list.push(Object.assign({id: 'w' + Date.now().toString(36)}, fields));
  closeSheet();
  saveCfg({work: list}, HW.edit ? 'Saved.' : 'Set. It is being added to the Drive folder of everyone it is for.');
};
SUBMIT_EXT.handIn = function (f) {
  var id = f.getAttribute('data-id'), link = f.link ? f.link.value.trim() : '', file = f.file && f.file.files[0];
  var btn = f.querySelector('button');
  var done = function (r) {
    btn.disabled = false;
    if (!(r && r.ok)) return toast((r && r.error) || 'Not handed in: the backend did not answer. Try again.', true);
    lsSet(handedKey(id), new Date().toISOString());
    render(); toast(r.replaced ? 'Handed in. It replaces your earlier version.' : 'Handed in.');
  };
  if (link) { if (!/^https:\/\//.test(link)) return toast('Paste the full https:// link.', true); btn.disabled = true; return call('submitWork', {workId: id, link: link}).then(done); }
  if (!file) return toast('Choose a file or paste a link.', true);
  if (file.size > 8 * 1024 * 1024) return toast('That file is over 8 MB.', true);
  btn.disabled = true;
  var fr = new FileReader();
  fr.onload = function () { call('submitWork', {workId: id, name: file.name, mime: file.type || 'application/octet-stream', data: String(fr.result).split(',')[1] || ''}).then(done); };
  fr.onerror = function () { btn.disabled = false; toast('That file could not be read.', true); };
  fr.readAsDataURL(file);
};
CHANGE_EXT.fileName = null;
document.addEventListener('change', function (e) {
  var i = e.target;
  if (i.matches('.handin input[type=file]') && i.files[0]) i.parentNode.querySelector('span').textContent = i.files[0].name.slice(0, 28);
});

/* ---------------- Calendar ---------------- */
var CAL = {month: null, sel: null};
VIEWS.calendar = function () {
  var all = calEvents(!M.officer);
  if (!CAL.month) { var t = new Date(); CAL.month = t.getFullYear() + '-' + pad2(t.getMonth() + 1); }
  var p = CAL.month.split('-'), first = new Date(+p[0], +p[1] - 1, 1), startDow = first.getDay();
  var days = new Date(+p[0], +p[1], 0).getDate(), t0 = today();
  var byDay = {};
  all.forEach(function (e) {
    var d = parseDay(e.date), end = parseDay(e.end || e.date);
    for (var x = new Date(d); x <= end; x.setDate(x.getDate() + 1)) (byDay[isoDay(x)] = byDay[isoDay(x)] || []).push(e);
  });
  var share = safeUrl(M.cfg.calShare), feed = M.calFeedKey && M.aff && !M.demo ? WEBAPP_URL + '?feed=ics&club=' + encodeURIComponent(M.aff) + '&key=' + encodeURIComponent(M.calFeedKey) : '';
  var h = head('Chapter', first.toLocaleDateString(undefined, {month: 'long', year: 'numeric'}),
    '<div class="calnav"><button class="ghost icon" data-act="calMove" data-d="-1" aria-label="Previous month">' + icon('back') + '</button><button class="btn ghost sm" data-act="calMove" data-d="0">Today</button>' +
    '<button class="ghost icon flip" data-act="calMove" data-d="1" aria-label="Next month">' + icon('back') + '</button>' + (M.officer ? '<button class="btn sm" data-act="calNew">' + icon('plus') + 'Event</button>' : '') + '</div>');
  var cells = '';
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(function (d) { cells += '<span class="dow">' + d + '</span>'; });
  for (var b = 0; b < startDow; b++) cells += '<span class="cd0"></span>';
  for (var n = 1; n <= days; n++) {
    var iso = p[0] + '-' + p[1] + '-' + pad2(n), ev = byDay[iso] || [];
    cells += '<button class="cday' + (iso === t0 ? ' today' : '') + (iso === CAL.sel ? ' sel' : '') + (ev.length ? ' has' : '') + '" data-act="calDay" data-d="' + iso + '"><span class="dn">' + n + '</span>' +
      ev.slice(0, 3).map(function (e) { return '<span class="ce src-' + e.src + (e.hidden || e.ebod ? ' hid' : '') + '">' + esc(e.title) + '</span>'; }).join('') + (ev.length > 3 ? '<span class="cmore">+' + (ev.length - 3) + '</span>' : '') +
      '<span class="cdots">' + ev.slice(0, 4).map(function (e) { return '<i class="src-' + e.src + '"></i>'; }).join('') + '</span></button>';
  }
  h += '<div class="cols cal"><section class="card month"><div class="grid7">' + cells + '</div><div class="legend">' +
    [['gcal', 'Chapter calendar'], ['club', 'Added here'], ['season', 'Season'], ['sfblc', 'SFBLC'], ['coaching', 'Coaching'], ['due', 'Homework due']].map(function (l) { return '<span><i class="src-' + l[0] + '"></i>' + l[1] + '</span>'; }).join('') + '</div></section>';
  var list = all.filter(function (e) { return CAL.sel ? (e.date <= CAL.sel && (e.end || e.date) >= CAL.sel) : e.date.slice(0, 7) === CAL.month && (e.end || e.date) >= (CAL.month === t0.slice(0, 7) ? t0 : ''); });
  h += '<section class="card"><header><h3>' + (CAL.sel ? esc(fmtDay(CAL.sel, true)) : 'Coming up this month') + '</h3>' + (CAL.sel ? '<button class="link" data-act="calDay" data-d="">Whole month</button>' : '') + '</header>' +
    (list.length ? '<ul class="items">' + list.map(function (e) {
      var off = e.hidden || e.ebod, canHide = M.officer && (e.src === 'gcal' || e.src === 'club' || e.src === 'season');
      return '<li class="item' + (off ? ' calhid' : '') + '"><div class="when"><span class="d">' + esc(fmtDay(e.date)) + '</span><span class="t">' + esc(e.time || 'All day') + '</span></div><div class="what"><p class="tt">' + esc(e.title) +
        (off ? ' <span class="badge">Hidden from members</span>' : '') + (e.rec ? ' <span class="badge">Repeats</span>' : '') + '</p><p class="meta"><i class="sw src-' + e.src + '"></i>' +
        ({gcal: 'Chapter calendar', club: 'Added here', season: 'Season', sfblc: 'SFBLC', coaching: 'Coaching', due: 'Homework'})[e.src] + (e.where ? ' · ' + esc(e.where) : '') + '</p></div>' +
        /* One switch per event: what members see. A repeating Google event switches as a whole series. */
        '<div class="calacts">' + (canHide ? '<button class="qbtn calvis' + (off ? ' off' : '') + '" data-act="calVis" data-src="' + e.src + '" data-id="' + esc(e.id) + '" aria-pressed="' + !off + '" title="' +
          esc(off ? 'Members cannot see this' + (e.rec ? ' (every time it repeats)' : '') + '. Tap to show it.' : 'Members see this' + (e.rec ? ' (every time it repeats)' : '') + '. Tap to hide it.') + '">' +
          icon(off ? 'close' : 'check') + '<span>' + (off ? 'Hidden' : 'Shown') + '</span></button>' : '') +
        '<a class="ghost icon" href="' + esc(gcalLink(e)) + '" target="_blank" rel="noopener" aria-label="Add ' + esc(e.title) + ' to Google Calendar">' + icon('plus') + '</a></div></li>';
    }).join('') + '</ul>' : empty('Nothing on this ' + (CAL.sel ? 'day' : 'month'), '')) +
    '<div class="rowacts">' + (share ? '<a class="btn sm ghost" href="' + esc(share) + '" target="_blank" rel="noopener">' + icon('calendar') + 'Add the org calendar</a>' : '') +
    (feed ? '<button class="btn sm ghost" data-act="copy" data-v="' + esc(feed) + '">' + icon('link') + 'Copy calendar feed</button>' : '') + '</div>' +
    (M.officer ? '<p class="meta">' + (M.calSynced ? 'Chapter calendar refreshed ' + esc(ago(new Date(M.calSynced).toISOString())) + '. ' : 'No Google Calendar connected. ') + '<a href="/calendar">Connect, hide or show events</a></p>' : '') + '</section></div>';
  return h;
};
ACT_EXT.calMove = function (el, d) {
  var p = CAL.month.split('-'), dt = +d.d === 0 ? new Date() : new Date(+p[0], +p[1] - 1 + (+d.d), 1);
  CAL.month = dt.getFullYear() + '-' + pad2(dt.getMonth() + 1); CAL.sel = +d.d === 0 ? today() : null; render();
};
ACT_EXT.calDay = function (el, d) { CAL.sel = d.d && CAL.sel !== d.d ? d.d : null; render(); };
ACT_EXT.calNew = function () {
  openSheet('<form class="form" data-act="calSave"><header class="sh"><h3>Add an event</h3></header>' +
    '<label class="fld"><span>What</span><input name="title" maxlength="80" required></label><div class="row3"><label class="fld"><span>Date</span><input name="date" type="date" required value="' + esc(CAL.sel || today()) + '"></label>' +
    '<label class="fld"><span>Time</span><input name="time" type="time"></label><label class="fld"><span>Kind</span><select name="cat"><option value="meet">Meeting</option><option value="comp">Competition</option><option value="social">Social</option><option value="service">Service</option></select></label></div>' +
    '<label class="fld"><span>Where</span><input name="where" maxlength="60"></label><label class="tick"><input type="checkbox" name="ebod"> EBOD only</label>' +
    '<p class="meta">It shows here and on the classic calendar. The classic Calendar tab also puts it on the chapter Google Calendar.</p><div class="sheetacts"><button class="btn">Add</button></div></form>');
};
SUBMIT_EXT.calSave = function (f) {
  var e = {id: 'e' + Date.now().toString(36), title: clean(f.title.value, 80).trim(), date: f.date.value, time: f.time.value ? fmtTime(f.time.value) : '', where: clean(f.where.value, 60), cat: f.cat.value, ebod: f.ebod.checked};
  if (!e.title || !e.date) return;
  closeSheet(); CAL.sel = e.date;
  saveCfg({events: (M.cfg.events || []).concat([e])}, 'Added to the calendar.');
};
ACT_EXT.copy = function (el, d) {
  (navigator.clipboard ? navigator.clipboard.writeText(d.v) : Promise.reject()).then(function () { toast('Copied.'); }, function () { toast('Could not copy. Long-press to copy instead.', true); });
};

/* ---------------- Org Cup ---------------- */
VIEWS.cup = function () {
  var ranked = M.orgs.slice().sort(function (a, b) { return b.cups - a.cups || (b.rate || 0) - (a.rate || 0); });
  var h = head('Develop', 'Org Cup', M.officer ? '<button class="btn sm" data-act="cupNew">' + icon('cup') + 'Award a cup</button>' : '');
  h += '<p class="lede">An Org earns a cup each time 80% of its members hand an assignment in on time, or when EBOD awards one. Nothing ranks members; this is the Orgs\' race.</p>';
  if (!ranked.length) return h + empty('No Orgs yet', 'The race starts once Orgs are formed.');
  h += '<ol class="standings">' + ranked.map(function (o, i) {
    return '<li class="' + (o.name === M.me.org ? 'mine' : '') + '"><span class="rk">' + (i + 1) + '</span><div class="sn"><p class="on">' + esc(o.name) + (o.name === M.me.org ? ' <span class="badge">Your Org</span>' : '') + '</p>' +
      '<p class="meta">' + plural(o.earned.length, 'on-time cup') + (o.hand.length ? ' · ' + o.hand.length + ' awarded by EBOD' : '') + (o.rate !== null ? ' · ' + Math.round(o.rate * 100) + '% on time overall' : '') + '</p></div>' +
      '<span class="cups" aria-label="' + plural(o.cups, 'cup') + '">' + new Array(Math.min(o.cups, 8) + 1).join(icon('cup')) + '</span><b class="fig">' + o.cups + '</b></li>';
  }).join('') + '</ol>';
  var awards = [];
  M.orgs.forEach(function (o) { o.hand.forEach(function (c) { awards.push({org: o.name, label: c.label, at: c.at, by: c.by}); }); });
  awards.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  if (awards.length) h += '<section class="card"><header><h3>Awarded by EBOD</h3><span class="count">' + awards.length + '</span></header><ul class="inbox">' + awards.slice(0, 12).map(function (a) {
    return '<li><div class="mh"><p class="mt">' + esc(a.org) + ': ' + esc(a.label) + '</p><span class="ma">' + esc(a.at ? ago(new Date(a.at).toISOString()) : '') + '</span></div><p class="meta">' + esc(a.by || 'EBOD') + '</p></li>';
  }).join('') + '</ul></section>';
  return h;
};
ACT_EXT.cupNew = function () {
  openSheet('<form class="form" data-act="cupSave"><header class="sh"><h3>Award a cup</h3></header><label class="fld"><span>Org</span><select name="org">' +
    M.orgs.map(function (o) { return '<option value="' + o.i + '">' + esc(o.name) + '</option>'; }).join('') + '</select></label>' +
    '<label class="fld"><span>For</span><input name="why" maxlength="60" required placeholder="Best turnout at bootcamp 2"></label><div class="sheetacts"><button class="btn">Award it</button></div></form>');
};
SUBMIT_EXT.cupSave = function (f) {
  var c = {id: 'c' + Date.now().toString(36), org: +f.org.value, label: clean(f.why.value, 60).trim(), at: Date.now(), by: M.me.name || 'EBOD'};
  if (!c.label) return;
  closeSheet();
  saveCfg({cups: (M.cfg.cups || []).concat([c])}, 'Cup awarded to ' + M.orgs[c.org].name + '.');
};

/* ---------------- Attendance (officers) ---------------- */
var ATT = {label: '', q: '', draft: {}, draftFor: '', meeting: '', typed: false, unmarked: false};
/* The label the chapter's attendance sheet syncs: "Meeting 11/2", no leading zeros, one tab per date. */
function meetingLabel(d) { d = d || new Date(); return 'Meeting ' + (d.getMonth() + 1) + '/' + d.getDate(); }
/* The five statuses on the chapter's attendance sheet, in its order and colours. TEXT is the
   sheet's own spelling ("Abscence"), which the Discord bot also looks for. */
var ATT_ST = [{c: 'P', label: 'Present', short: 'Present', tone: 'green'},
              {c: 'EL', label: 'Excused late', short: 'Late (exc.)', tone: 'gold'},
              {c: 'UL', label: 'Unexcused late', short: 'Late (unexc.)', tone: 'red'},
              {c: 'EA', label: 'Excused absence', short: 'Absent (exc.)', tone: 'gold'},
              {c: 'UA', label: 'Unexcused absence', short: 'Absent (unexc.)', tone: 'red'}];
var ATT_TEXT = {P: 'Present', EL: 'Excused Late', UL: 'Unexcused Late', EA: 'Excused Abscence', UA: 'Unexcused Abscence'};
function attStOf(c) { return ATT_ST.filter(function (x) { return x.c === c; })[0]; }
/* A check-in with no Status (taken on the dashboard before statuses) is Present. */
function attCodeOf(t) {
  var s = String(t || '').toLowerCase();
  if (!s || /^present/.test(s)) return 'P';
  var un = /unexcused/.test(s);
  if (/late/.test(s)) return un ? 'UL' : 'EL';
  if (/abs/.test(s)) return un ? 'UA' : 'EA';
  return 'P';
}
/* What is saved for an event: check-ins (any late too) and the marked absences. */
function attSaved(label) {
  var o = {};
  (RAW.all.attendance || []).forEach(function (r) { if (r.EventLabel === label) o[flat(r.MemberName)] = attCodeOf(r.Status); });
  (RAW.all.absences || []).forEach(function (r) { if (r.EventLabel === label) o[flat(r.MemberName)] = attCodeOf(r.Status); });
  return o;
}
function attLabelNow() { return clean(($('attlabel') || {}).value || (ATT.typed ? ATT.label : meetingLabel()), 80).trim(); }
/* Unsaved marks belong to one event; naming another event starts over. */
function attDraft(label) { if (ATT.draftFor !== label) { ATT.draft = {}; ATT.draftFor = label; } return ATT.draft; }
function attChanges(label) {
  var saved = attSaved(label), d = attDraft(label);
  return Object.keys(d).filter(function (k) { return d[k] !== (saved[k] || ''); });
}
VIEWS.attendance = function (sub) {
  sub = sub || 'take';
  var waiting = (SYNC.tickets || []).filter(ticketOpen).length;
  var h = head('People', 'Attendance') + subtabs(sub, [['take', 'Take attendance'], ['absent', 'Absences and tickets', waiting]], 'attendance');
  var rows = (RAW.all.attendance || []);
  var meetings = {};
  rows.forEach(function (r) {
    var e = String(r.EventLabel || ''); if (!e) return;
    var m = meetings[e] || (meetings[e] = {label: e, at: r.Timestamp, n: {}, st: {}});
    m.n[flat(r.MemberName)] = 1; m.st[flat(r.MemberName)] = String(r.Status || '');
  });
  var ml = Object.keys(meetings).map(function (k) { return meetings[k]; }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  var ppl = M.people.filter(function (p) { return p.role === 'member'; });
  if (sub === 'take') {
    var todays = calEvents(false).filter(function (e) { return e.date === today(); }).map(function (e) { return e.title; });
    var def = meetingLabel(), label = ATT.typed ? ATT.label : def;
    var saved = attSaved(label), draft = attDraft(label), cur = function (k) { return draft[k] !== undefined ? draft[k] : (saved[k] || ''); };
    var q = flat(ATT.q), list = ppl.filter(function (p) { return (!q || p.key.indexOf(q) > -1) && (!ATT.unmarked || !cur(p.key)); });
    var n = attChanges(label).length, tally = {};
    ppl.forEach(function (p) { var c = cur(p.key) || 'none'; tally[c] = (tally[c] || 0) + 1; });
    var savedN = Object.keys(saved).length;
    h += '<section class="card form"><label class="fld"><span>Event</span><input id="attlabel" list="attlist" value="' + esc(label) + '" placeholder="' + esc(def) + '" maxlength="80"></label>' +
      '<p class="meta">' + (/^Meeting \d{1,2}\/\d{1,2}$/.test(label) ? 'These statuses go on the chapter’s attendance sheet too, in its ' + esc(label.slice(8)) + ' tab.'
        : '“' + esc(def) + '” would put these statuses on the chapter’s attendance sheet; ' + esc(label || 'this name') + ' stays in the Org System.') +
      (savedN ? ' ' + plural(savedN, 'person', 'people') + ' already marked for ' + esc(label) + '; change anyone below.' : '') + '</p>' +
      '<datalist id="attlist">' + [def].concat(todays, ml.map(function (m) { return m.label; })).filter(function (x, i, a) { return a.indexOf(x) === i; }).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
      '<div class="atttally">' + ATT_ST.map(function (s) { return '<span class="chip tone-' + s.tone + '">' + esc(s.label) + ' <b>' + (tally[s.c] || 0) + '</b></span>'; }).join('') +
      '<button class="chip tone-ink' + (ATT.unmarked ? ' on' : '') + '" data-act="attOnly" aria-pressed="' + ATT.unmarked + '">Not marked <b>' + (tally.none || 0) + '</b></button></div>' +
      '<label class="search">' + icon('search') + '<input id="attq" type="search" placeholder="Find a member" value="' + esc(ATT.q) + '"></label>' +
      (list.length ? '<ul class="attlist">' + list.map(function (p) {
        var c = cur(p.key), changed = draft[p.key] !== undefined && draft[p.key] !== (saved[p.key] || '');
        return '<li class="' + (changed ? 'chg' : '') + '"><span class="an"><b>' + esc(p.name) + '</b><small>' + esc(p.org || '') + (changed ? ' · not saved' : '') + '</small></span>' +
          '<div class="attseg" role="group" aria-label="' + esc(p.name) + '">' + ATT_ST.map(function (s) {
            return '<button type="button" class="tone-' + s.tone + (c === s.c ? ' on' : '') + '" data-act="attMark" data-key="' + esc(p.key) + '" data-s="' + s.c + '" aria-pressed="' + (c === s.c) + '" title="' + esc(s.label) + '">' + esc(s.short) + '</button>';
          }).join('') + '</div>' +
          '<select class="mini attsel tone-' + (c ? attStOf(c).tone : 'ink') + '" data-act="attPick" data-key="' + esc(p.key) + '" aria-label="Status for ' + esc(p.name) + '"><option value="">Not marked</option>' +
          ATT_ST.map(function (s) { return '<option value="' + s.c + '"' + (c === s.c ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('') + '</select></li>';
      }).join('') + '</ul>' : empty(ATT.unmarked ? 'Everyone is marked' : 'Nobody matches', '')) +
      '<div class="attbar"><span class="meta">' + (n ? plural(n, 'change') + ' not saved' : 'Tap a status for each member') + (q || ATT.unmarked ? ' · showing ' + list.length : '') + '</span>' +
      '<button class="qbtn" data-act="attRest" data-s="P">' + icon('check') + '<span>Rest present</span></button>' +
      '<button class="qbtn" data-act="attRest" data-s="UA">' + icon('close') + '<span>Rest absent</span></button>' +
      (n ? '<button class="qbtn" data-act="attNone"><span>Undo changes</span></button>' : '') +
      '<button class="btn" data-act="attSave"' + (n ? '' : ' disabled') + '>' + icon('check') + (n ? 'Save ' + plural(n, 'change') : 'Saved') + '</button></div></section>';
    return h;
  }
  h += ticketsCard();
  if (!ml.length) return h + empty('No attendance yet', 'Take attendance at a meeting and absences show up here.');
  if (!ATT.meeting) ATT.meeting = ml[0].label;
  var m = meetings[ATT.meeting] || ml[0], absent = ppl.filter(function (p) { return !m.n[p.key]; });
  /* A late check-in (from the attendance sheet) came, so it is not an absence. */
  var lateOf = function (x) { return Object.keys(x.st).filter(function (k) { return /late/i.test(x.st[k]); }); };
  var late = ppl.filter(function (p) { return /late/i.test(m.st[p.key] || ''); }), tk = ticketsAt(m.label);
  /* An absence marked on Take attendance (or on the sheet) says excused or not; a ticket only hints at it. */
  var marked = {};
  (RAW.all.absences || []).forEach(function (r) { if (r.EventLabel === m.label) marked[flat(r.MemberName)] = attCodeOf(r.Status); });
  var tkWord = function (t) { return !t ? '' : ticketOpen(t) ? 'ticket pending' : /^excused/i.test(t.status) ? 'excused' : /^unexcused/i.test(t.status) ? 'unexcused' : ''; };
  var absWord = function (p) { return marked[p.key] === 'EA' ? 'excused' : marked[p.key] === 'UA' ? 'unexcused' : tkWord(tk[p.key]); };
  h += '<section class="toolbar"><select class="mini" data-act="attMeeting" aria-label="Meeting">' + ml.map(function (x) {
    var nl = lateOf(x).length;
    return '<option value="' + esc(x.label) + '"' + (x.label === m.label ? ' selected' : '') + '>' + esc(x.label) + ' (' + Object.keys(x.n).length + ' came' + (nl ? ', ' + nl + ' late' : '') + ')</option>';
  }).join('') + '</select><span class="grow"></span>' +
    '<button class="btn sm ghost" data-act="copy" data-v="' + esc(absent.map(function (p) { return p.name; }).join(', ')) + '">Copy names</button>' +
    '<button class="btn sm ghost" data-act="attEdit" data-v="' + esc(m.label) + '">' + icon('edit') + 'Edit statuses</button>' +
    (absent.length ? '<button class="btn sm" data-act="attMsg">' + icon('send') + 'Message the ' + absent.length + '</button>' : '') + '</section>';
  h += '<section class="card"><header><h3>Absent from ' + esc(m.label) + '</h3><span class="count">' + absent.length + ' of ' + ppl.length + '</span></header><div class="chips">' +
    absent.map(function (p) {
      var w = absWord(p);
      return '<button class="chip ' + (w === 'excused' ? 'tone-gold' : w === 'unexcused' ? 'tone-red' : 'tone-ink') + '" data-act="profile" data-key="' + esc(p.key) + '">' + esc(p.name) + (p.absent >= 2 ? ' <b>' + p.absent + '</b>' : '') + (w ? ' <em>' + w + '</em>' : '') + '</button>';
    }).join('') + '</div>' +
    (late.length ? '<div class="fg"><p class="fl">Came late</p><div class="chips">' + late.map(function (p) {
      return '<button class="chip tone-gold" data-act="profile" data-key="' + esc(p.key) + '">' + esc(p.name) + ' <em>' + esc((TICKET_ST[m.st[p.key]] || m.st[p.key]).toLowerCase()) + '</em></button>';
    }).join('') + '</div></div>' : '') +
    '<p class="meta">The number is how many club meetings they have missed in all. Anyone at 2 or more carries the "Missed 2+ meetings" tag on Members. Late check-ins come from the attendance sheet and count as there.</p></section>';
  return h;
};
/* Attendance tickets members open with the Discord bot: the ones waiting first. */
function ticketsCard() {
  var list = SYNC.tickets, e = SYNC.err.tickets;
  var h = '<section class="card" id="tickets"><header><h3>Tickets</h3>';
  if (!list) return h + '</header><p class="meta' + (e ? ' bad' : '') + '">' + esc(e || 'Reading…') + '</p></section>';
  var open = list.filter(ticketOpen).sort(function (a, b) { return String(a.opened).localeCompare(String(b.opened)); });
  var done = list.filter(function (t) { return !ticketOpen(t); }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  h += '<span class="count">' + open.length + ' to decide</span></header>' +
    '<p class="meta">Late, absent and leaving-early tickets from the Discord bot. A decision goes on the attendance sheet and into that meeting’s attendance here.</p>';
  h += open.length ? '<ul class="inbox">' + open.map(function (t) {
    var abs = ticketAbsent(t);
    return '<li><div class="mh"><p class="mt">' + esc(t.name || '@' + t.username) + ' · ' + esc(t.label || t.type) + '</p><span class="ma">' + esc(t.opened ? ago(t.opened) : '') + '</span></div>' +
      '<p class="mb sm">Meeting ' + esc(t.meeting) + (t.username ? ' · @' + esc(t.username) : '') + '</p>' + (t.reason ? '<p class="meta">“' + esc(t.reason) + '”</p>' : '') +
      '<div class="rowacts"><button class="qbtn" data-act="tkDecide" data-id="' + esc(t.id) + '" data-s="' + (abs ? 'Excused Abscence' : 'Excused Late') + '">' + icon('check') + '<span>Excused</span></button>' +
      '<button class="qbtn" data-act="tkDecide" data-id="' + esc(t.id) + '" data-s="' + (abs ? 'Unexcused Abscence' : 'Unexcused Late') + '">' + icon('close') + '<span>Unexcused</span></button></div></li>';
  }).join('') + '</ul>' : '<p class="mb sm">No tickets waiting.</p>';
  if (done.length) h += '<div class="fg"><p class="fl">Decided</p><ul class="inbox tight">' + done.slice(0, 20).map(function (t) {
    return '<li><span class="tt">' + esc(t.name || '@' + t.username) + '</span><span class="meta">Meeting ' + esc(t.meeting) + ' · ' + esc(t.label || t.type) + ' · ' + esc(TICKET_ST[t.status] || t.status) +
      (t.by ? ' by ' + esc(t.by) : '') + (t.at ? ', ' + esc(ago(t.at)) : '') + '</span><button class="link" data-act="tkDecide" data-id="' + esc(t.id) + '" data-s="Pending">Reopen</button></li>';
  }).join('') + '</ul></div>';
  return h + '</section>';
}
ACT_EXT.tkDecide = function (el, d) {
  el.disabled = true;
  call('ticketDecide', {id: d.id, status: d.s}).then(function (r) {
    if (!(r && r.ok)) { el.disabled = false; return toast((r && r.error) || 'Not saved. Try again.', true); }
    (SYNC.tickets || []).forEach(function (t) { if (t.id === d.id) t.status = r.status; });
    render();
    toast(d.s === 'Pending' ? 'Reopened.' : (TICKET_ST[r.status] || r.status) + '. ' + (r.synced ? 'The attendance sheet has it too.' : 'It reaches the attendance sheet on the next sync.'));
    return Promise.all([loadSync(['tickets', 'status']), reloadClub()]);
  });
};
/* Saves the unsaved marks for the event named, then calls after(people now there, label):
   orgs2.js uses that for the commitment points that go with a check-in. */
function attSaveMarks(el, after) {
  var label = attLabelNow();
  if (!label) return toast('Name the event first.', true);
  var saved = attSaved(label), d = attDraft(label), keys = attChanges(label).filter(function (k) { return M.byKey[k]; });
  if (!keys.length) return;
  var marks = keys.map(function (k) { return {name: M.byKey[k].name, s: d[k]}; });
  var came = function (c) { return c === 'P' || c === 'EL' || c === 'UL'; };
  var done = function () {
    var t = new Date().toISOString(), drop = {};
    keys.forEach(function (k) { drop[k] = 1; });
    var keep = function (r) { return !(r.EventLabel === label && drop[flat(r.MemberName)]); };
    RAW.all.attendance = (RAW.all.attendance || []).filter(keep);
    RAW.all.absences = (RAW.all.absences || []).filter(keep);
    RAW.all.excused = (RAW.all.excused || []).filter(keep);
    keys.forEach(function (k) {
      var p = M.byKey[k], c = d[k], row = {MemberName: p.name, EventLabel: label, Status: ATT_TEXT[c] || ''};
      if (came(c)) RAW.all.attendance.push(Object.assign({Timestamp: t, Track: p.track, Org: p.org}, row));
      else if (c) RAW.all.absences.push(row);
      if (c === 'EA') RAW.all.excused.push({MemberName: p.name, EventLabel: label});
    });
    ATT.draft = {}; ATT.meeting = label; rebuild(); render();
    toast(plural(keys.length, 'status', 'statuses') + ' saved for ' + label + '.');
    if (after) after(keys.filter(function (k) { return came(d[k]) && !came(saved[k]); }).map(function (k) { return M.byKey[k]; }), label);
  };
  el.disabled = true;
  call('attMark', {event: label, marks: marks}).then(function (r) {
    if (r && r.ok) return done();
    /* Before the backend has attMark, plain check-ins still save the old way. */
    var onlyIn = keys.every(function (k) { return d[k] === 'P' && !saved[k]; });
    if (r && /unknown action/i.test(r.error || '') && onlyIn) {
      return call('addAttendanceBulk', keys.map(function (k) { var p = M.byKey[k]; return {MemberName: p.name, EventLabel: label, Track: p.track, Org: p.org}; }))
        .then(function (r2) { if (r2 && r2.ok) return done(); el.disabled = false; toast((r2 && r2.error) || 'Not saved. Try again.', true); });
    }
    el.disabled = false;
    toast(r && /unknown action/i.test(r.error || '') ? 'Late and absent statuses save once the backend update is deployed. Present check-ins work now.' : (r && r.error) || 'Not saved. Try again.', true);
  });
}
ACT_EXT.attSave = function (el) { attSaveMarks(el); };
/* Tapping the status a member already has clears it. */
ACT_EXT.attMark = function (el, d) {
  var label = attLabelNow(), dr = attDraft(label), saved = attSaved(label);
  var cur = dr[d.key] !== undefined ? dr[d.key] : (saved[d.key] || '');
  dr[d.key] = cur === d.s ? '' : d.s;
  if (dr[d.key] === (saved[d.key] || '')) delete dr[d.key];
  render();
};
CHANGE_EXT.attPick = function (el, d) {
  var label = attLabelNow(), dr = attDraft(label), saved = attSaved(label);
  dr[d.key] = el.value;
  if (dr[d.key] === (saved[d.key] || '')) delete dr[d.key];
  render();
};
/* Everyone not marked yet (among those the search shows) gets the same status. */
ACT_EXT.attRest = function (el, d) {
  var label = attLabelNow(), dr = attDraft(label), saved = attSaved(label), q = flat(ATT.q);
  M.people.filter(function (p) { return p.role === 'member' && (!q || p.key.indexOf(q) > -1); }).forEach(function (p) {
    var cur = dr[p.key] !== undefined ? dr[p.key] : (saved[p.key] || '');
    if (!cur) dr[p.key] = d.s;
  });
  render();
};
ACT_EXT.attOnly = function () { ATT.unmarked = !ATT.unmarked; render(); };
ACT_EXT.attEdit = function (el, d) { ATT.label = d.v; ATT.typed = true; location.hash = '#attendance/take'; };
CHANGE_EXT.attMeeting = function (el) { ATT.meeting = el.value.replace(/ \(\d+ came\)$/, ''); render(); };
ACT_EXT.attMsg = function () {
  var m = ATT.meeting, came = {};
  (RAW.all.attendance || []).forEach(function (r) { if (r.EventLabel === m) came[flat(r.MemberName)] = 1; });
  var names = M.people.filter(function (p) { return p.role === 'member' && !came[p.key]; }).map(function (p) { return p.name; });
  compose({title: 'We missed you at ' + m, body: 'Catch up on what you missed on the dashboard, and let your EBOD contact know if something is getting in the way.', target: {tags: [], names: names}});
};
document.addEventListener('input', function (e) {
  if (e.target.id === 'attq') {
    ATT.q = e.target.value; ATT.label = ($('attlabel') || {}).value || ATT.label;
    clearTimeout(ATT.t); ATT.t = setTimeout(function () { render(); var i = $('attq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 160);
  }
  if (e.target.id === 'attlabel') { ATT.label = e.target.value; ATT.typed = true; }
});
/* Once the event is named (typed, or picked from the list), show what is already saved for it. */
document.addEventListener('change', function (e) { if (e.target.id === 'attlabel') render(); });

/* ---------------- Profile ---------------- */
VIEWS.profile = function () {
  var p = M.me, pr = (M.profile && M.profile.profile) || {}, b = p.name.split(' ');
  var h = head('You', 'Profile');
  h += '<div class="cols"><div class="stack"><section class="card me"><div class="sh">' + avatar(p) + '<div><h3>' + esc(p.name) + '</h3><p class="pe">' +
    esc([p.year ? (p.year === 2 ? '2nd year' : '1st year') : '', p.track, p.org].filter(Boolean).join(' · ') || (M.officer ? 'Officer' : 'Member')) + '</p><p class="pe">' + esc(M.email) + '</p></div></div>' +
    '<div class="chips">' + (p.tags || []).filter(function (t) { return !t.quiet; }).map(function (t) { return chip(t); }).join('') + '</div>' +
    (p.teams.length ? '<div class="fg"><p class="fl">Teams</p>' + p.teams.map(function (t) { return '<p>' + esc(t.kind === 'flc' ? 'SFBLC · ' + t.event : t.kind === 'consulting' ? 'Consulting · ' + (t.client || '') : 'Team') + ': <b>' + esc(teamName(t)) + '</b></p>'; }).join('') + '</div>' : '') +
    '</section>';
  h += '<form class="card form" data-act="profSave"><header><h3>Your name</h3></header><div class="row2"><label class="fld"><span>First</span><input name="first" maxlength="40" value="' + esc(pr.first || b[0] || '') + '"></label>' +
    '<label class="fld"><span>Last</span><input name="last" maxlength="40" value="' + esc(pr.last || b.slice(1).join(' ')) + '"></label></div><p class="meta">The name teammates, Orgs and officers see. Your photo and sign-up answers are on the classic Profile tab.</p>' +
    '<div class="sendrow"><button class="btn sm">Save</button></div></form></div>';
  var pts = M.profile && M.profile.points, ents = (M.profile && M.profile.entries) || [];
  h += '<div class="stack"><section class="card" id="pushcard"><header><h3>Phone notifications</h3></header>' + pushPanel() + '</section>' +
    '<section class="card"><header><h3>Commitment log</h3>' + (pts != null ? '<b class="fig">' + esc(pts) + '</b>' : '') + '</header>' +
    (ents.length ? '<ul class="inbox">' + ents.slice(-6).reverse().map(function (e) { return '<li><div class="mh"><p class="mt">' + esc(e.label || e.ActionLabel || e.EventLabel || 'Entry') + '</p><span class="ma">' + esc(e.pts || e.Points ? '+' + (e.pts || e.Points) : '') + '</span></div></li>'; }).join('') + '</ul>'
      : '<p class="meta">Private to you: what you have put in this season, for reflection. Nothing ranks members.</p>') + '</section>' +
    myStandingCard() + lookCard() + '</div></div>';
  return h;
};
SUBMIT_EXT.profSave = function (f) {
  var first = clean(f.first.value, 40).trim(), last = clean(f.last.value, 40).trim();
  if (!first) return toast('A first name is needed.', true);
  call('saveProfile', {firstName: first, lastName: last}).then(function (r) {
    if (!(r && r.ok)) return toast((r && r.error) || 'Not saved.', true);
    toast('Saved. It shows everywhere after the next refresh.');
  });
};
var PUSH = {state: null};
function pushPanel() {
  var ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  var perm = ok ? Notification.permission : 'unsupported';
  var on = PUSH.state === 'on' || (M.me.reach === true);
  var h = '<p class="mb">' + (on ? 'On for this device. You hear about homework, SFBLC reminders and messages from EBOD.' :
    'Get homework, SFBLC reminders and messages from EBOD as notifications.') + '</p>';
  if (!ok || (ios && !standalone)) h += '<p class="note warn">' + (ios ? 'On iPhone, notifications only work from the home-screen icon (iOS 16.4 or newer): Share → Add to Home Screen, then open it from there.' : 'This browser cannot show notifications.') + '</p>';
  else if (perm === 'denied') h += '<p class="note warn">Notifications are blocked for this site in your browser settings.</p>';
  h += '<div class="rowacts">' + (on ? '<button class="btn sm ghost" data-act="pushTest">' + icon('bell') + 'Send a test</button>' : '<button class="btn sm" data-act="pushOn"' + (ok && perm !== 'denied' && !(ios && !standalone) || M.demo ? '' : ' disabled') + '>' + icon('bell') + 'Turn on notifications</button>') + '</div>';
  return h;
}
function b64urlBytes(s) {
  var b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), u = new Uint8Array(b.length);
  for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
ACT_EXT.pushOn = function (el) {
  if (M.demo) { PUSH.state = 'on'; render(); return toast('Demo: notifications would turn on here.'); }
  el.disabled = true;
  Promise.all([navigator.serviceWorker.register('/sw.js').then(function () { return navigator.serviceWorker.ready; }), fetch('/api/push', {cache: 'no-store'}).then(function (r) { return r.json(); })])
    .then(function (x) {
      var reg = x[0], key = x[1] && x[1].publicKey;
      if (!key) throw new Error('Phone notifications are not set up on the site yet.');
      return Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') throw new Error('Notifications were not allowed.');
        return reg.pushManager.getSubscription().then(function (old) { return old || reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64urlBytes(key)}); });
      });
    })
    .then(function (sub) { return call('savePush', {sub: sub.toJSON()}); })
    .then(function (r) {
      if (!(r && r.ok)) throw new Error((r && r.error) || 'Not saved.');
      PUSH.state = 'on'; render(); toast('Notifications are on. A test is on its way.');
    })
    .catch(function (e) { el.disabled = false; toast(e.message || 'Could not turn them on.', true); });
};
ACT_EXT.pushTest = function () {
  if (M.demo) return toast('Demo: a test notification would arrive now.');
  call('testPush').then(function (r) { toast(r && r.ok ? 'Sent. It should arrive in a few seconds.' : (r && r.error) || 'Not sent.', !(r && r.ok)); });
};
function curTheme() { return document.documentElement.getAttribute('data-theme') || 'dark'; }
ACT_EXT.setTheme = function (el, d) { setTheme(d.v); render(); };

/* ---------------- Officer tools ---------------- */
var TOOLS = [
  ['Intake', 'Club setup, tracks, roster source and the sign-up form\'s questions', '/intake'],
  ['Roster', 'Everyone who joined, their onboarding answers and roles', '/roster'],
  ['Draft Orgs', 'Form balanced Orgs of 8–10 and assign EBOD contacts', '/draft'],
  ['Sign-up form', 'The onboarding form every new member sends', '/sign-up-form'],
  ['Consulting teams', 'Client teams, PMs and initiatives', '/teams'],
  ['Team requests', 'Teams members formed themselves, to approve or send back', '/teams'],
  ['SFBLC hotel rooms', 'Rooming groups, roommates and room numbers', '/teams'],
  ['Hand-in review', 'Check off hand-ins and see who is late', '#homework/review'],
  ['Calendar connection', 'Link the chapter Google Calendar, hide events', '/calendar'],
  ['Assistant', 'Ask questions about the club\'s data', '/assistant'],
  ['Access', 'Who is an officer, and the master account', '/access'],
  ['Member walkthrough', 'The orientation page and tab-by-tab clips', '/orientation']
];
VIEWS.tools = function () {
  var h = head('You', 'Officer tools', '<a class="btn sm ghost" href="/classic">The old version (a demo)</a>');
  h += '<p class="lede">Setting the club up happens a few times a season, so these stay on the classic page. Each opens straight to its tab.</p>';
  h += '<div class="navcards">' + TOOLS.map(function (t, i) {
    return '<a class="navcard" href="' + t[2] + '"><span class="nn">' + String(i + 1).padStart(2, '0') + '</span><span class="nt">' + esc(t[0]) + '</span><span class="ns">' + esc(t[1]) + '</span>' + icon('arrow', 'go') + '</a>';
  }).join('') + '</div>';
  h += syncCard() + discordCard() + tagSourcesCard();
  var sz = JSON.stringify(M.cfg).length;
  h += '<section class="card"><header><h3>Club record</h3><span class="count">' + Math.round(sz / 1000) + ' / 50 KB</span></header><div class="bar"><i style="width:' + Math.min(100, sz / 500) + '%"></i></div>' +
    '<p class="meta">Everything officers set (teams, homework, SFBLC schedule, tags) is one cell in the Org System Data sheet, which Google caps at 50,000 characters.</p></section>';
  return h;
};
/* Filled in by tagSourcesCard() in sources.js once linked sheets are set up. */
if (typeof tagSourcesCard !== 'function') var tagSourcesCard = function () { return ''; };
if (typeof syncCard !== 'function') var syncCard = function () { return ''; }, discordCard = syncCard;

Object.assign(VIEWS, {orgs: VIEWS.orgs, homework: VIEWS.homework, calendar: VIEWS.calendar, cup: VIEWS.cup, attendance: VIEWS.attendance, profile: VIEWS.profile, tools: VIEWS.tools});

/* Look and comfort: theme, text size and motion, kept for this browser. */
function lookCard() {
  var d = document.documentElement, size = d.getAttribute('data-size') || 'm', motion = d.getAttribute('data-motion') || 'full';
  var seg = function (act, cur, opts) {
    return '<div class="seg" role="group">' + opts.map(function (o) { return '<button class="' + (cur === o[0] ? 'on' : '') + '" data-act="' + act + '" data-v="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
  };
  return '<section class="card look"><header><h3>Look and comfort</h3></header>' +
    '<div class="fld"><span>Theme</span>' + seg('setTheme', curTheme(), [['phi', 'Φ PBL'], ['phi-light', 'PBL light'], ['dark', 'Org dark'], ['light', 'Org light']]) + '</div>' +
    '<div class="fld"><span>Text size</span>' + seg('setSize', size, [['m', 'Standard'], ['l', 'Large'], ['xl', 'Larger']]) + '</div>' +
    '<div class="fld"><span>Motion</span>' + seg('setMotion', motion, [['full', 'Full'], ['calm', 'Calm']]) + '<small class="cc">Calm stops the scrolling band and fades. It is on by default when your device asks for less motion.</small></div></section>';
}
ACT_EXT.setSize = function (el, d) { setComfort('size', d.v); render(); };
ACT_EXT.setMotion = function (el, d) { setComfort('motion', d.v); render(); };

ACT_EXT.allGaps = function () {
  openSheet('<header class="sh"><h3>Needs attention</h3></header>' + gapList(gaps()), function () { return '<header class="sh"><h3>Needs attention</h3></header>' + gapList(gaps()); });
};

ACT_EXT.attNone = function () { ATT.draft = {}; render(); };

/* Under each open assignment: an extension request, or where one stands. */
function extLine(w, got) {
  if (got) return '';
  var x = extFor(w.id);
  if (x) return '<p class="meta">Extension ' + esc({waiting: 'requested, waiting for an officer', approved: 'approved' + (x.until ? ' until ' + fmtDay(x.until) : ''), declined: 'declined'}[x.status] || x.status) + '.</p>';
  if (w.due && daysTo(w.due) >= 3) return '<div class="rowacts"><button class="qbtn" data-act="extAsk" data-id="' + esc(w.id) + '">' + icon('clock') + '<span>Ask for an extension</span></button></div>';
  return '';
}
