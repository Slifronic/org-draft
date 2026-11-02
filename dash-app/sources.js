/* Linked sheets: the chapter's other Google Sheets, read through the backend
   (linkedRead, officers only, named columns only) and turned into tags on
   members, plus imports of the SFBLC master sheet's teams, rooms and
   itinerary. Each preset names a sheet the club account owns; officers turn
   them on and off in Officer tools. Nothing here is ever sent to members. */
'use strict';

var SFMASTER = '1oKlEes6653hEO8pJj2sExZzAI1daXZLVRCMaDWQtVJY';
/* persons: a column family whose every cell is a member (Person 1..4).
   name: the column(s) holding one member's name per row. email: the email column.
   tags: {const} always; {col, when, tag: '… {v}'} from a cell; {top: [cols], when, tag: '… {h}'}
   from whichever column's cell matches; count: add up across rows and tabs. */
var SOURCES = [
  {id: 'sf-teams', label: 'SFBLC Master Sheet · Teams', sheet: SFMASTER, tabs: ['Teams'], cols: ['#0', '#1', 'person'], persons: 'person',
   tags: [{col: '#1', tag: 'Master sheet · {v}'}, {col: '#0', when: /false/i, tag: 'SFBLC team not confirmed'}], imports: 'teams',
   about: 'Confirmed SFBLC teams, matched against Blue Panda'},
  {id: 'sf-rooms', label: 'SFBLC Master Sheet · Rooming', sheet: SFMASTER, tabs: ['Rooming Assignments'], cols: ['room #', 'gender', 'room type', 'person'], persons: 'person',
   tags: [{col: 'room #', tag: 'Room {v}'}], imports: 'rooms', about: 'Hotel rooms and roommates'},
  {id: 'sf-itin', label: 'SFBLC Master Sheet · Itinerary', sheet: SFMASTER, tabs: ['Itinerary'], cols: ['date', 'time', 'activity', 'notes'], imports: 'schedule',
   about: 'The conference itinerary, for the SFBLC schedule'},
  {id: 'discord', label: 'Discord · PBL Verify Records', sheet: '19xazg1JCkQl-JJADMmgZqKfx0l35u1uNPct33MPcq8E', tabs: ['Verified members'], cols: ['name', 'major'], name: 'name',
   tags: [{const: 'Discord verified'}, {col: 'major', tag: 'Major · {v}'}], about: 'Who verified on the Discord server, and their major'},
  {id: 'attendance', label: 'Fall 26’ Attendance', sheet: '11epr7XrJQbhJwWWnVH9pUsHlMZAx3XoUzjmYjVr5p3A', tabs: ['*'], cols: ['first', 'last', 'attendance', 'bus casual'], name: ['first', 'last'],
   tags: [{col: 'attendance', when: /unexcused\s*abs/i, tag: 'Unexcused absence', count: 1}, {col: 'attendance', when: /unexcused\s*late/i, tag: 'Unexcused late', count: 1},
          {col: 'attendance', when: /^\s*excused/i, tag: 'Excused (late or absent)', count: 1}, {col: 'bus casual', when: /^(true|x|yes|y|1)$/i, tag: 'Not in business casual', count: 1}],
   about: 'Meeting-by-meeting attendance the Discord tickets feed'},
  {id: 'signup', label: 'De Anza PBL sign-up (responses)', sheet: '1NTWldqi2UpApSSo7jbZ8wNMBlQ45oU_zPNiEYsnyMgY', tabs: ['#first'], cols: ['full name', 'org lead'], name: 'full name',
   tags: [{col: 'org lead', when: /^\s*y/i, tag: 'Org Lead interest'}], about: 'The fall sign-up form'},
  {id: 'track', label: 'Fall 26 Track Interest Form', sheet: '1pOsiOmbX9yYzhFoMyLbLZD1p05cMoL3jqvvtWu4fNiA', tabs: ['#first'], cols: ['email', 'first', 'last', 'top choice', 'orkizz', 'chroma', 'habitat', 'skycampus', 'ecology'],
   name: ['first', 'last'], email: 'email',
   tags: [{col: 'top choice', tag: 'Prefers {v}'}, {top: ['orkizz', 'chroma', 'habitat', 'skycampus', 'ecology'], when: /^\s*1/, tag: '1st client pick · {h}'}],
   about: 'Track and consulting client rankings'},
  {id: 'reenroll', label: 'Fall 26’ IM Re-enrollment', sheet: '1aejSol5F1hHqUY0WlfK9UrNcaIh_Vp0TSaMwC5KYsB8', tabs: ['#first'], cols: ['email', 'first', 'last', 'consulting or flc'], name: ['first', 'last'], email: 'email',
   tags: [{const: 'Returning IM'}], about: 'Returning members who re-enrolled'},
  {id: 'winter-dues', label: 'Winter IM master sheet · dues', sheet: '1GAULwXMwynTCfAaFv1G5tJo5zdoEqDPTfzRRMg5UTSQ', tabs: ['#first'], cols: ['email', 'first', 'last', 'member dues'], name: ['first', 'last'], email: 'email',
   tags: [{col: 'member dues', when: /not/i, tag: 'Dues not paid (Winter)'}, {col: 'member dues', when: /^\s*paid/i, tag: 'Dues paid (Winter)'}], off: true,
   about: 'The latest sheet with a dues column (Winter 2026)'}
];

var LINKED = {tags: {}, emails: {}, status: {}, data: {}, loading: false};
function sourceOn(s) { var o = (M.cfg.tagSources || {})[s.id]; return o === undefined ? !s.off : !!o; }

/* Which person a name in someone else's sheet means. */
function personByName(raw) {
  var n = String(raw || '').trim();
  if (!n) return null;
  if (n.indexOf(',') > -1) { var p = n.split(','); n = p[1] + ' ' + p[0]; }
  var k = flat(n);
  if (M.byKey[k]) return M.byKey[k];
  var w = n.split(/\s+/).filter(Boolean);
  if (w.length > 2) { var k2 = flat(w[0] + w[w.length - 1]); if (M.byKey[k2]) return M.byKey[k2]; }
  return null;
}
function colOf(tab, key) {
  if (key.charAt(0) === '#') return (tab.idx || []).indexOf(+key.slice(1));
  for (var i = 0; i < tab.headers.length; i++) if (tab.headers[i].toLowerCase().indexOf(key) > -1) return i;
  return -1;
}
function cell(tab, row, key) { var i = colOf(tab, key); return i < 0 ? '' : String(row[i] || '').trim(); }
function personCols(tab, key) { return tab.headers.map(function (h, i) { return h.toLowerCase().indexOf(key) > -1 ? i : -1; }).filter(function (i) { return i > -1; }); }

function deriveTags(src, res) {
  var counts = {}, matched = {}, missed = {};
  var give = function (who, tag, count) {
    var k = who.key, c = counts[k] || (counts[k] = {});
    c[tag] = count ? (c[tag] || 0) + 1 : 1;
    matched[k] = 1;
  };
  (res.tabs || []).forEach(function (tab) {
    if (!tab.headers.length) return;
    tab.rows.forEach(function (row) {
      var whoList = [];
      if (src.persons) personCols(tab, src.persons).forEach(function (i) {
        var raw = String(row[i] || '').trim(); if (!raw) return;
        var p = personByName(raw); if (p) whoList.push(p); else missed[raw] = 1;
      });
      else {
        var p = null, em = src.email ? cell(tab, row, src.email).toLowerCase() : '';
        if (em) p = M.people.filter(function (x) { return x.email && x.email === em; })[0] || null;
        var nm = Array.isArray(src.name) ? src.name.map(function (c) { return cell(tab, row, c); }).join(' ') : src.name ? cell(tab, row, src.name) : '';
        if (!p && nm.trim()) p = personByName(nm);
        if (p) whoList.push(p); else if (nm.trim()) missed[nm.trim()] = 1;
      }
      if (!whoList.length) return;
      (src.tags || []).forEach(function (t) {
        var tg = null;
        if (t['const']) tg = t['const'];
        else if (t.col) { var v = cell(tab, row, t.col); if (v && (!t.when || t.when.test(v))) tg = t.tag.replace('{v}', v.slice(0, 40)); }
        else if (t.top) t.top.some(function (c) {
          var v2 = cell(tab, row, c);
          if (v2 && t.when.test(v2)) { var h = tab.headers[colOf(tab, c)] || c; tg = t.tag.replace('{h}', (h.match(/\[([^\]]+)\]/) || [0, h])[1].slice(0, 40)); return true; }
        });
        if (tg) whoList.forEach(function (p2) { give(p2, tg, t.count); });
      });
    });
  });
  var out = {};
  Object.keys(counts).forEach(function (k) {
    out[k] = Object.keys(counts[k]).map(function (t) { return counts[k][t] > 1 ? t + ' ×' + counts[k][t] : t; });
  });
  return {tags: out, matched: Object.keys(matched).length, missed: Object.keys(missed)};
}

function loadLinked() {
  if (!M || !M.officer) return Promise.resolve();
  var on = SOURCES.filter(sourceOn);
  if (!on.length) { LINKED.tags = {}; return Promise.resolve(); }
  LINKED.loading = true;
  return Promise.all(on.map(function (s) {
    return call('linkedRead', {sheetId: s.sheet, tabs: s.tabs, cols: s.cols}).then(function (r) {
      if (!(r && r.ok)) { LINKED.status[s.id] = {error: (r && r.error) || (M.msgsReady ? 'The backend did not answer.' : 'Needs the backend update.')}; return; }
      LINKED.data[s.id] = r;
      var d = deriveTags(s, r);
      LINKED.status[s.id] = {rows: r.tabs.reduce(function (a, t) { return a + t.rows.length; }, 0), tabs: r.tabs.length, matched: d.matched, missed: d.missed, title: r.title, at: Date.now()};
      Object.keys(d.tags).forEach(function (k) { LINKED.tags[k] = (LINKED.tags[k] || []).concat(d.tags[k]); });
    });
  })).then(function () { LINKED.loading = false; rebuild(); render(); });
}
function reloadLinked() { LINKED.tags = {}; LINKED.status = {}; LINKED.data = {}; return loadLinked(); }

/* ---------- imports from the SFBLC master sheet ---------- */
function eventFor(raw) {
  var f = flat(raw); if (!f) return '';
  var list = M.events.concat(SFBLC.events);
  for (var i = 0; i < list.length; i++) { var e = flat(list[i]); if (e === f || e.indexOf(f) > -1 || f.indexOf(e) > -1) return list[i]; }
  return String(raw).trim();
}
function sheetData(id) {
  var s = SOURCES.filter(function (x) { return x.id === id; })[0];
  if (LINKED.data[id]) return Promise.resolve(LINKED.data[id]);
  return call('linkedRead', {sheetId: s.sheet, tabs: s.tabs, cols: s.cols}).then(function (r) { if (r && r.ok) LINKED.data[id] = r; return r; });
}
var IMPORT = {
  teams: function () {
    return sheetData('sf-teams').then(function (r) {
      if (!(r && r.ok)) throw new Error((r && r.error) || 'Could not read the master sheet.');
      var tab = r.tabs[0], made = [], per = {}, missing = {}, unconfirmed = 0;
      tab.rows.forEach(function (row) {
        var ev = eventFor(cell(tab, row, '#1')); if (!ev) return;
        var mem = personCols(tab, 'person').map(function (i) { var raw = String(row[i] || '').trim(); if (!raw) return ''; var p = personByName(raw); if (!p) missing[raw] = 1; return p ? p.name : raw; }).filter(Boolean);
        if (!mem.length) return;
        per[ev] = (per[ev] || 0) + 1;
        if (/false/i.test(cell(tab, row, '#0'))) unconfirmed++;
        made.push({id: 'mst-' + flat(ev) + '-' + per[ev], kind: 'flc', event: ev, name: ev + ' ' + per[ev], members: mem, track: 'k', client: '', pms: [], initiatives: [], assign: {}});
      });
      return {made: made, missing: Object.keys(missing), unconfirmed: unconfirmed};
    }).then(function (x) {
      var cur = M.teams.filter(function (t) { return t.kind === 'flc'; }).length;
      confirmSheet('Use the master sheet’s SFBLC teams?', plural(x.made.length, 'team') + ' with ' + x.made.reduce(function (a, t) { return a + t.members.length; }, 0) + ' people replace the ' + plural(cur, 'SFBLC team') + ' here (consulting teams are untouched). ' +
        (x.unconfirmed ? x.unconfirmed + ' are not confirmed on the sheet yet. ' : '') + (x.missing.length ? x.missing.length + ' names are not on the Org System roster and are kept as typed: ' + x.missing.slice(0, 8).join(', ') + (x.missing.length > 8 ? '…' : '') + '.' : 'Everyone matched the roster.'),
        'Import ' + plural(x.made.length, 'team'), function () {
          saveCfg({teams: cloneTeams().filter(function (t) { return t.kind !== 'flc'; }).concat(x.made)}, 'SFBLC teams imported from the master sheet.');
        });
    });
  },
  rooms: function () {
    return sheetData('sf-rooms').then(function (r) {
      if (!(r && r.ok)) throw new Error((r && r.error) || 'Could not read the master sheet.');
      var tab = r.tabs[0], rooms = [], missing = {};
      tab.rows.forEach(function (row, i) {
        var no = cell(tab, row, 'room #'), g = cell(tab, row, 'gender');
        var mem = personCols(tab, 'person').map(function (c) { var raw = String(row[c] || '').trim(); if (!raw) return ''; var p = personByName(raw); if (!p) missing[raw] = 1; return p ? p.name : raw; }).filter(Boolean);
        if (!mem.length) return;
        rooms.push({id: 'mst-r' + (i + 1), name: 'Room ' + (no || i + 1) + (cell(tab, row, 'room type') ? ' · ' + cell(tab, row, 'room type') : ''), no: no.slice(0, 12),
                    group: /wom|fem|girl/i.test(g) ? 'w' : /men|male|boy/i.test(g) ? 'm' : 'x', members: mem.slice(0, 8)});
      });
      confirmSheet('Use the master sheet’s rooms?', plural(rooms.length, 'room') + ' replace the ' + plural((M.cfg.rooms || []).length, 'room') + ' set here, and show on the classic Teams tab too.' +
        (Object.keys(missing).length ? ' ' + Object.keys(missing).length + ' names are not on the roster and are kept as typed.' : ''), 'Import ' + plural(rooms.length, 'room'), function () {
          saveCfg({rooms: rooms}, 'Hotel rooms imported.');
        });
    });
  },
  schedule: function () {
    return sheetData('sf-itin').then(function (r) {
      if (!(r && r.ok)) throw new Error((r && r.error) || 'Could not read the master sheet.');
      var tab = r.tabs[0], day = '', items = [], info = sfInfo(), start = parseDay(info.start), end = parseDay(info.end);
      tab.rows.forEach(function (row, i) {
        var d = cell(tab, row, 'date');
        if (d) {
          var n = +(d.match(/\d{1,2}/) || [0])[0];
          for (var x = new Date(start); x <= end; x.setDate(x.getDate() + 1)) if (x.getDate() === n) day = isoDay(x);
          if (!n) { var wd = d.slice(0, 3).toLowerCase(); for (var y = new Date(start); y <= end; y.setDate(y.getDate() + 1)) if (y.toLocaleDateString('en-US', {weekday: 'short'}).toLowerCase() === wd) day = isoDay(y); }
        }
        var what = cell(tab, row, 'activity'); if (!what || !day) return;
        var tm = cell(tab, row, 'time').match(/(\d{1,2})(?::(\d{2}))?\s*([ap])/i), hh = '';
        if (tm) { var h = +tm[1] % 12 + (/p/i.test(tm[3]) ? 12 : 0); hh = pad2(h) + ':' + (tm[2] || '00'); }
        items.push({id: 'it-' + (i + 1), date: day, start: hh, end: '', title: what.slice(0, 80), where: '', note: cell(tab, row, 'notes').slice(0, 160),
                    kind: /check|arriv|depart|carpool|bus|drive/i.test(what) ? 'travel' : /comp|present|round|case/i.test(what) ? 'comp' : /social|dinner|picture|photo|party/i.test(what) ? 'social' : 'general',
                    'for': {tags: ['sfblc'], names: []}, src: 'master'});
      });
      var keep = sf('sfSchedule').filter(function (x) { return x.src !== 'master'; });
      confirmSheet('Use the master sheet’s itinerary?', plural(items.length, 'item') + ' from the Itinerary tab go on the SFBLC schedule (an earlier import is replaced; ' + plural(keep.length, 'item') + ' added here stay). Everyone going sees them, and reminders go out for each one with a time.',
        'Import ' + plural(items.length, 'item'), function () { saveCfg({sfSchedule: keep.concat(items)}, 'Itinerary imported.'); });
    });
  }
};
ACT_EXT.importSheet = function (el, d) { IMPORT[d.what]().catch(function (e) { toast(e.message, true); }); };
CHANGE_EXT.srcToggle = function (el, d) {
  var o = Object.assign({}, M.cfg.tagSources || {}); o[d.id] = el.checked;
  saveCfg({tagSources: o}).then(function () { reloadLinked(); });
};
ACT_EXT.srcReload = function () { toast('Reading the linked sheets…'); reloadLinked(); };

function tagSourcesCard() {
  if (!M.officer) return '';
  var rows = SOURCES.map(function (s) {
    var st = LINKED.status[s.id], on = sourceOn(s);
    var line = !on ? 'Off' : !st ? (LINKED.loading ? 'Reading…' : 'Not read yet') : st.error ? st.error :
      plural(st.rows, 'row') + (st.tabs > 1 ? ' across ' + st.tabs + ' tabs' : '') + (s.tags ? ' · ' + plural(st.matched, 'member') + ' tagged' : '') +
      (st.missed && st.missed.length ? ' · ' + st.missed.length + ' names not on the roster' : '');
    return '<li><label class="switch"><input type="checkbox" data-act="srcToggle" data-id="' + s.id + '"' + (on ? ' checked' : '') + '><i></i></label>' +
      '<div><p class="tt">' + esc(s.label) + '</p><p class="meta">' + esc(s.about) + '</p><p class="meta' + (st && st.error ? ' bad' : '') + '">' + esc(line) + '</p>' +
      '<div class="rowacts">' + (s.imports ? '<button class="btn sm ghost" data-act="importSheet" data-what="' + s.imports + '">Import ' + ({teams: 'teams', rooms: 'rooms', schedule: 'itinerary'})[s.imports] + '</button>' : '') +
      '<a class="btn sm ghost" href="https://docs.google.com/spreadsheets/d/' + esc(s.sheet) + '/edit" target="_blank" rel="noopener">Open sheet</a></div></div></li>';
  }).join('');
  return '<section class="card" id="sources"><header><h3>Linked sheets &amp; Discord</h3><button class="btn sm ghost" data-act="srcReload">Read again</button></header>' +
    '<p class="meta">Tags from the chapter’s other sheets, matched to members by email or name. They appear under “From Drive &amp; Discord” on Members and only officers ever see them. The Discord bot writes its records to the Verify Records and Fall 26’ Attendance sheets.</p>' +
    '<ul class="autos">' + rows + '</ul></section>';
}

/* ---------- the demo's version of those sheets ---------- */
function demoLinked(pl, s) {
  var src = SOURCES.filter(function (x) { return x.sheet === pl.sheetId && JSON.stringify(x.tabs) === JSON.stringify(pl.tabs); })[0];
  if (!src) return {ok: false, error: 'Not in the demo.'};
  var ppl = s.people, going = ppl.filter(function (p) { return p.prefs && p.prefs.attend; });
  var T = function (name, headers, rows, idx) { return {name: name, headers: headers, idx: idx || headers.map(function (h, i) { return i; }), rows: rows}; };
  var tabs;
  if (src.id === 'sf-teams') tabs = [T('Teams', ['#0', '#1', 'Person 1', 'Person 2', 'Person 3', 'Person 4'], s.cfg.teams.filter(function (t) { return t.kind === 'flc'; }).map(function (t, i) {
    return [i % 5 === 3 ? 'FALSE' : 'TRUE', t.event === 'Entrepreneurship Pitch' ? 'Pitch' : t.event].concat(t.members.concat(['', '', '', '']).slice(0, 4)); }), [0, 1, 2, 3, 4, 5])];
  else if (src.id === 'sf-rooms') {
    var rows = [];
    ['w', 'm', 'x'].forEach(function (g) {
      var gs = going.filter(function (p) { return p.prefs.group === g; });
      for (var i = 0; i < gs.length; i += 4) rows.push([String(401 + rows.length), g === 'w' ? 'Women' : g === 'm' ? 'Men' : 'All-gender', gs.length - i >= 4 ? 'Quad' : 'Triple'].concat(gs.slice(i, i + 4).map(function (p) { return p.name; }).concat(['', '', '', '']).slice(0, 4)));
    });
    tabs = [T('Rooming Assignments', ['Room #', 'Gender', 'Room Type', 'Person 1', 'Person 2', 'Person 3', 'Person 4'], rows)];
  } else if (src.id === 'sf-itin') tabs = [T('Itinerary', ['Date', 'Time', 'Activity', 'Notes'], [
    ['Friday 13th', '3:00 PM', 'EBOD arrival', 'Prep before members arrive'], ['', '3:30 PM', 'Everyone arrives', 'Text the group chat when you are picked up'],
    ['', '4:00 PM', 'Hotel check-in', 'Drop bags, change, meet downstairs'], ['', '5:00 PM', 'Lobby pictures', ''], ['', '6:30 PM', 'Opening session', ''],
    ['Saturday 14th', '8:00 AM', 'Competition day', 'Business professional'], ['', '7:00 PM', 'Social night', ''], ['Sunday 15th', '10:00 AM', 'Awards and closing', ''], ['', '12:30 PM', 'Check out and drive home', '']])];
  else if (src.id === 'discord') tabs = [T('Verified members', ['Name', 'Major'], ppl.filter(function (p, i) { return i % 3 !== 1; }).map(function (p, i) { return [p.name, ['Business Administration', 'Economics', 'Computer Science', 'Accounting', 'Marketing'][i % 5]]; }))];
  else if (src.id === 'attendance') tabs = ['10/13', '10/20', '10/27'].map(function (d, k) {
    return T(d, ['First', 'Last', 'Attendance', 'No Bus Casual'], ppl.map(function (p, i) {
      var b = p.name.split(' '), r = (i * 7 + k * 5) % 23;
      return [b[0], b.slice(1).join(' '), r === 3 ? 'Unexcused Absence' : r === 9 ? 'Unexcused Late' : r === 14 ? 'Excused Absence' : 'Present', r === 17 ? 'TRUE' : 'FALSE'];
    }));
  });
  else if (src.id === 'signup') tabs = [T('Form Responses 1', ['Full name', 'Interested in being an Org Lead?'], ppl.map(function (p) { return [p.name, p.lead ? 'Yes' : 'No']; }))];
  else if (src.id === 'track') tabs = [T('Form Responses 1', ['Email', 'First', 'Last', 'Top choice consulting or Case Competitions', 'Rank [Orkizz]', 'Rank [Chroma Aromatics]', 'Rank [Habitat for Humanity]', 'Rank [Skycampus]', 'Rank [Ecology Action]'],
    ppl.filter(function (p) { return p.track === 'Consulting'; }).map(function (p, i) { var b = p.name.split(' '), r = ['5th', '4th', '3rd', '2nd', '1st']; return [p.email, b[0], b.slice(1).join(' '), 'Consulting'].concat([0, 1, 2, 3, 4].map(function (j) { return r[(i + j) % 5]; })); }))];
  else if (src.id === 'reenroll') tabs = [T('Form Responses 1', ['Email', 'First', 'Last', 'Interested in consulting or FLC'], ppl.filter(function (p) { return p.year === 2; }).slice(0, 18).map(function (p, i) { var b = p.name.split(' '); return [p.email, b[0], b.slice(1).join(' '), ['Consulting', 'FLC', 'Open to Both'][i % 3]]; }))];
  else tabs = [T('Sheet1', ['Email', 'First', 'Last', 'Member Dues'], ppl.filter(function (p) { return p.year === 2; }).map(function (p, i) { var b = p.name.split(' '); return [p.email, b[0], b.slice(1).join(' '), i % 4 ? 'Paid' : 'Not Paid']; }))];
  /* Two names the roster does not know, as a real sheet has. */
  if (src.id === 'sf-teams' && tabs[0].rows[0]) tabs[0].rows[0][5] = tabs[0].rows[0][5] || 'Jamie Okoro';
  return {ok: true, title: src.label.split(' · ')[0], tabs: tabs};
}
