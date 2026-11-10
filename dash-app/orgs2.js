/* The Org program's officer tools: roster and Draft Orgs, Org moves and names, EBOD contacts, member cards, recognitions and notices, hand-in review, homework tracks and Drive folders, attendance points. */
'use strict';

/* Everything here reads and writes the same records the classic page does:
   the Teams tab through setTeams (patched row by row, so two officers moving
   people at once keep both moves), the club record through saveCfg, and the
   Submissions and PointsLog tabs through their own actions. */
var O2 = {f: {q: '', track: '', org: '', year: ''}, swaps: [], swapMax: 6, cards: {}, cardAsk: {}, hw: '', hwFrom: '', hwRows: [], focusAll: false, notes: null,
          drive: {busy: false, msg: '', url: '', bad: false}, attPts: 1, ab: {from: '', to: '', kind: 'club', min: 1, q: ''}, fRows: null, fMap: {}};

/* ---------------- the club's vocabulary, with the classic page's defaults ---------------- */
var O2_FLEX = 'e';
var O2_COLORS = ['#7aa9dd', '#e8765e', '#4fae8c', '#a98bd0', '#c9a24a', '#4fa3a3'], O2_FLEXCOLOR = '#b6b8af';
var O2_AXES = [['E', 'I'], ['S', 'N'], ['T', 'F'], ['J', 'P']];
function o2club() {
  var c = M.cfg || {}, d = {unit: 'Org', units: 'Orgs', useTracks: true, trackWord: 'Track', flexLabel: 'Not sure yet', useYear: true,
    newWord: '1st year', oldWord: '2nd year', useMbti: true, mbtiRequired: true,
    tracks: [{id: 'c', label: 'Consulting'}, {id: 'k', label: 'Case competition (FLC)'}, {id: 't3', label: 'Polaris'}]};
  var out = {};
  Object.keys(d).forEach(function (k) { out[k] = c[k] === undefined || c[k] === null || c[k] === '' ? d[k] : c[k]; });
  return out;
}
function o2tracks() { var c = o2club(); return c.useTracks ? (c.tracks || []).filter(function (t) { return t && t.id; }) : []; }
function o2buckets() {
  var c = o2club(), out = o2tracks().map(function (t, i) { return {id: t.id, label: t.label, color: O2_COLORS[i % O2_COLORS.length]}; });
  out.push({id: O2_FLEX, label: c.useTracks ? c.flexLabel : 'Member', color: O2_FLEXCOLOR, flex: true});
  return out;
}
/* A Teams row holds a track id ('c'); older rows and the demo hold its label. */
function o2bucket(v) {
  var s = String(v || '').trim().toLowerCase(), b = o2buckets();
  return b.filter(function (x) { return x.id === s || String(x.label).toLowerCase() === s; })[0] || b[b.length - 1];
}
function o2pad(i) { return String(i + 1).padStart(2, '0'); }
function o2low(v) { return String(v || '').toLowerCase(); }
/* The classic page's name key: "Last, First" turned round, letters and spaces only. Recognitions are filed under it. */
function o2normName(s) {
  s = String(s || '').trim();
  if (s.indexOf(',') > -1) { var p = s.split(','); s = p[1] + ' ' + p[0]; }
  return s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}
function o2normMbti(v) { var m = String(v || '').toUpperCase().replace(/[^A-Z]/g, '').match(/([EI])([SN])([TF])([JP])/); return m ? m[0] : null; }
function o2normFocus(v) { v = o2low(v); return v === 'c' || v === 'k' ? v : ''; }
function o2csvText(rows) {
  return rows.map(function (r) {
    return r.map(function (c) { c = String(c == null ? '' : c); if (/^[=+\-@]/.test(c)) c = "'" + c; return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',');
  }).join('\n');
}
function o2download(text, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type: 'text/csv'})); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
function o2ebodList() { return typeof ebod === 'function' ? ebod() : (M.cfg.ebod || []); }
function o2ebodNames() { return o2ebodList().map(function (e) { return e.name; }).filter(Boolean); }
function o2ebodPos(n) { var e = o2ebodList().filter(function (x) { return x.name === n; })[0]; return e ? e.pos : ''; }
/* String.replace treats "$" in a replacement specially; these never want that. */
function o2swap(h, from, to) { var at = h.indexOf(from); return at < 0 ? h : h.slice(0, at) + to + h.slice(at + from.length); }
function o2before(h, marker, add, last) { var at = last ? h.lastIndexOf(marker) : h.indexOf(marker); return at < 0 ? h + add : h.slice(0, at) + add + h.slice(at); }

/* ---------------- the Teams tab ---------------- */
function o2rows() { return ((RAW && RAW.all && RAW.all.teams) || []).filter(function (r) { var n = String(r.MemberName || '').trim(); return n && n !== 'MemberName'; }); }
/* Each Org's people as the draft sees them: track ids, year 1 or 2, a readable type. */
function o2groups() {
  var idx = {}, g = M.orgs.map(function () { return []; });
  M.orgs.forEach(function (o) { idx[o.name] = o.i; });
  o2rows().forEach(function (r) {
    var i = idx[String(r.Org || '')]; if (i == null) return;
    var y = parseInt(r.Year, 10) || 1;
    g[i].push({name: String(r.MemberName).trim(), key: flat(r.MemberName), year: y >= 2 ? 2 : 1, track: o2bucket(r.Track).id, mbti: o2normMbti(r.MBTI),
               avail: String(r.Availability || ''), note: String(r.Notes || ''), focus: o2normFocus(r.Focus), lead: false, org: i});
  });
  return g;
}
/* Send only the rows that changed, each with how it looked when read.
   Orgs are numbered by where they first appear in the rows, and cups and EBOD
   contacts are kept by that number, so an edit that would reorder them (moving
   the row an Org is first listed by into another Org) rewrites the roster
   grouped in the old order instead. ren maps renamed Orgs, old name to new. */
function o2firstOrder(rows) { var o = []; rows.forEach(function (r) { var n = String(r.Org || ''); if (n && o.indexOf(n) < 0) o.push(n); }); return o; }
function o2writeRows(edits, okMsg, ren) {
  var up = [], before = JSON.parse(JSON.stringify(RAW.all.teams || [])), want = M.orgs.map(function (o) { return (ren || {})[o.name] || o.name; });
  (RAW.all.teams || []).forEach(function (r) {
    var e = edits[flat(r.MemberName)]; if (!e) return;
    var was = Object.assign({}, r), row = Object.assign({}, r);
    delete was.Affiliation; delete row.Affiliation;
    Object.keys(e).forEach(function (k) { row[k] = e[k]; r[k] = e[k]; });
    up.push({row: row, was: was});
  });
  if (!up.length) return Promise.resolve(false);
  var now = o2firstOrder(RAW.all.teams), still = want.filter(function (n) { return now.indexOf(n) > -1; }), body = {__patch: 1, up: up, rm: []};
  if (now.slice(0, still.length).join('\n') !== still.join('\n')) {
    var rank = function (r) { var i = still.indexOf(String(r.Org || '')); return i < 0 ? 1e6 : i; };
    RAW.all.teams = RAW.all.teams.map(function (r, i) { return {r: r, i: i}; }).sort(function (a, b) { return rank(a.r) - rank(b.r) || a.i - b.i; }).map(function (x) { return x.r; });
    body = o2rows().map(function (r) { var c = Object.assign({}, r); delete c.Affiliation; return c; });
  }
  O2.fRows = null; rebuild(); render(); refreshSheet();
  return call('setTeams', body).then(function (r) {
    if (r && r.ok) { if (okMsg) toast(okMsg); return true; }
    RAW.all.teams = before; O2.fRows = null; rebuild(); render(); refreshSheet();
    toast((r && r.error) || 'Not saved: the backend did not answer. Try again.', true);
    return false;
  });
}

/* A homework track an officer picked is kept on the Teams row (Focus), as the
   classic page and the backend's focusOf_ read it; before one is picked the
   drafted track decides, which is what core.js already does. */
function o2focusMap() {
  var rows = RAW && RAW.all && RAW.all.teams;
  if (rows !== O2.fRows) {
    O2.fRows = rows; O2.fMap = {};
    (rows || []).forEach(function (r) { var f = o2normFocus(r.Focus); if (f) O2.fMap[flat(r.MemberName)] = f; });
  }
  return O2.fMap;
}
var o2focusBase = focusOf;
focusOf = function (p) { return (p && o2focusMap()[p.key]) || o2focusBase(p); };
function o2usesFocus() { var ids = o2tracks().map(function (t) { return t.id; }); return ids.indexOf('c') > -1 && ids.indexOf('k') > -1; }

/* ================= ORGS ================= */
var o2orgsBase = VIEWS.orgs;
VIEWS.orgs = function (sub) {
  if (!M.officer) return o2orgsBase(sub);
  sub = sub || 'orgs';
  var groups = o2groups();
  if (sub === 'swaps') o2computeSwaps(groups);
  var h = head('People', 'Orgs', sub === 'orgs' && M.orgs.length ? '<div class="toolbar"><button class="btn sm ghost" data-act="o2ebodAuto">Assign EBOD contacts</button><button class="btn sm ghost" data-act="o2csv">' + icon('upload') + 'Download CSV</button></div>' : '') +
    subtabs(sub, [['orgs', 'Orgs'], ['draft', 'Draft Orgs'], ['swaps', 'Recommended swaps', sub === 'swaps' && O2.swaps.length ? O2.swaps.length : '']], 'orgs');
  if (sub === 'draft') return h + o2draftView();
  if (sub === 'swaps') return h + o2swapsView(groups);
  return h + o2board(groups);
};

function o2counts(g) {
  var c = {byTrack: {}, y1: 0, y2: 0, typed: 0};
  o2buckets().forEach(function (b) { c.byTrack[b.id] = 0; });
  g.forEach(function (p) { c.byTrack[p.track] = (c.byTrack[p.track] || 0) + 1; if (p.mbti) c.typed++; if (p.year === 1) c.y1++; else c.y2++; });
  return c;
}
function o2axis(g) {
  var c = {E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0}, typed = 0;
  g.forEach(function (p) { if (!p.mbti) return; typed++; for (var a = 0; a < 4; a++) c[p.mbti[a]]++; });
  return {c: c, typed: typed};
}
function o2flags(g) {
  var club = o2club(), c = o2counts(g), flags = [], ts = o2tracks(), none = ts.filter(function (t) { return !c.byTrack[t.id]; });
  if (ts.length && none.length === ts.length) flags.push('Nobody committed to any ' + o2low(club.trackWord));
  else none.forEach(function (t) { flags.push('No ' + o2low(t.label) + ' members'); });
  if (club.useYear && g.length && c.y1 === 0) flags.push('No ' + club.newWord + 's');
  return flags;
}
function o2match(p) {
  var f = O2.f;
  if (f.q && p.name.toLowerCase().indexOf(f.q.toLowerCase()) < 0) return false;
  if (f.track && p.track !== f.track) return false;
  if (f.year === 'new' && p.year !== 1) return false;
  if (f.year === 'returning' && p.year !== 2) return false;
  return true;
}
function o2board(groups) {
  var club = o2club(), unit = o2low(club.unit), units = o2low(club.units);
  if (!M.orgs.length) return empty('No ' + units + ' yet', 'Bring the roster in and run the draft. ' + club.units + ', the Org Cup and attendance all come from it.', '<a class="btn" href="#orgs/draft">Run the draft</a>');
  var all = [].concat.apply([], groups), sizes = groups.map(function (g) { return g.length; }), flagged = groups.filter(function (g) { return o2flags(g).length; }).length;
  var h = '<section class="kpis o2kpis">' + kpi('Members', all.length, esc('in ' + plural(M.orgs.length, unit, units)), '#orgs') +
    kpi(club.unit + ' size', Math.min.apply(null, sizes) === Math.max.apply(null, sizes) ? sizes[0] : Math.min.apply(null, sizes) + '–' + Math.max.apply(null, sizes), 'EBOD asked for 8–10', '#orgs') +
    kpi('Need a fix', flagged, esc(flagged ? 'missing a track or 1st years' : 'every ' + unit + ' is balanced'), '#orgs', flagged ? 'warn' : '') +
    kpi('No EBOD contact', M.orgs.filter(function (o) { return !o.ebod; }).length, 'one officer per ' + esc(unit), '#orgs') + '</section>';
  if (O2.notes && O2.notes.length) h += '<div class="note warn"><span>' + esc(O2.notes.join('; ')) + '.</span><button class="link" data-act="o2notesOff">Dismiss</button></div>';
  var noted = all.filter(function (p) { return p.note; });
  if (noted.length) h += '<details class="card o2noted"><summary><h3>' + plural(noted.length, 'member') + ' left a note</h3><span class="count">review before finalizing</span></summary><ul class="inbox tight">' +
    noted.map(function (p) { return '<li><span class="tt">' + esc(p.name) + '</span><span class="meta">' + esc(p.note) + '</span></li>'; }).join('') + '</ul></details>';
  /* The same filters as the classic Draft page: a name, a track, one Org, a year. */
  h += '<section class="toolbar o2filt"><label class="search">' + icon('search') + '<input id="o2q" type="search" placeholder="Find a member" value="' + esc(O2.f.q) + '"></label>' +
    (o2tracks().length ? '<select class="mini" data-act="o2filt" data-k="track" aria-label="' + esc(club.trackWord) + '"><option value="">Every ' + esc(o2low(club.trackWord)) + '</option>' +
      o2buckets().map(function (b) { return '<option value="' + esc(b.id) + '"' + (O2.f.track === b.id ? ' selected' : '') + '>' + esc(b.label) + '</option>'; }).join('') + '</select>' : '') +
    '<select class="mini" data-act="o2filt" data-k="org" aria-label="' + esc(club.unit) + '"><option value="">Every ' + esc(unit) + '</option>' +
      M.orgs.map(function (o) { return '<option value="' + o.i + '"' + (O2.f.org === String(o.i) ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('') + '</select>' +
    (club.useYear ? '<select class="mini" data-act="o2filt" data-k="year" aria-label="Year"><option value="">Both years</option><option value="returning"' + (O2.f.year === 'returning' ? ' selected' : '') + '>2nd years</option><option value="new"' + (O2.f.year === 'new' ? ' selected' : '') + '>1st years</option></select>' : '') +
    (O2.f.q || O2.f.track || O2.f.org || O2.f.year ? '<button class="link" data-act="o2filtClear">Clear</button>' : '') + '</section>';
  var names = o2ebodNames();
  h += '<div class="o2orgs">' + groups.map(function (g, i) {
    if (O2.f.org !== '' && String(i) !== O2.f.org) return '';
    var o = M.orgs[i], c = o2counts(g), n = g.length || 1, flags = o2flags(g), ax = o2axis(g), shown = g.filter(o2match);
    return '<article class="card o2org' + (flags.length ? ' flagged' : '') + '"><header><div class="o2oh"><p class="tag">' + esc(club.unit) + ' ' + o2pad(i) + ' · ' + plural(g.length, 'member') +
      (o.cups ? ' · ' + plural(o.cups, 'cup') : '') + '</p><button class="o2name" data-act="o2rename" data-i="' + i + '" title="Rename">' + esc(o.name) + icon('edit') + '</button></div></header>' +
      '<div class="o2mix" aria-hidden="true">' + o2buckets().map(function (b) { return c.byTrack[b.id] ? '<i style="width:' + (c.byTrack[b.id] / n * 100) + '%;background:' + b.color + '"></i>' : ''; }).join('') + '</div>' +
      '<p class="meta">' + o2buckets().filter(function (b) { return c.byTrack[b.id]; }).map(function (b) { return esc(c.byTrack[b.id] + ' ' + b.label); }).join(' · ') +
      (club.useYear ? '<span class="o2grow"></span>' + c.y2 + ' 2nd / ' + c.y1 + ' 1st' : '') + '</p>' +
      '<label class="o2ebod"><span>EBOD contact</span><select class="mini" data-act="o2ebod" data-i="' + i + '"><option value="">Not assigned</option>' +
      names.concat(o.ebod && names.indexOf(o.ebod) < 0 ? [o.ebod] : []).map(function (e) { return '<option value="' + esc(e) + '"' + (e === o.ebod ? ' selected' : '') + '>' + esc(e) + (o2ebodPos(e) ? ' · ' + esc(o2ebodPos(e)) : '') + '</option>'; }).join('') + '</select></label>' +
      (club.useMbti ? '<p class="o2axis">' + O2_AXES.map(function (pr) {
        var a = ax.c[pr[0]], b = ax.c[pr[1]], cls = (a === 0 || b === 0) ? 'void' : (ax.typed && Math.max(a, b) / ax.typed >= 0.75 ? 'skew' : '');
        return '<span class="' + cls + '"><b>' + a + '</b>' + pr[0] + '/<b>' + b + '</b>' + pr[1] + '</span>';
      }).join('') + '</p>' : '') +
      flags.map(function (f) { return '<p class="o2flag">' + esc(f) + '</p>'; }).join('') +
      '<ul class="o2roster">' + (shown.length ? shown.slice().sort(function (x, y) { return y.year - x.year || x.name.localeCompare(y.name); }).map(function (p) {
        return '<li><i class="o2dot" style="background:' + o2bucket(p.track).color + '" title="' + esc(o2bucket(p.track).label) + '"></i>' +
          '<button class="link o2who" data-act="profile" data-key="' + esc(p.key) + '">' + esc(p.name) + '</button>' + (p.note ? '<span class="o2nt" title="' + esc(p.note) + '">●</span>' : '') +
          (club.useMbti ? '<span class="o2mb' + (p.mbti ? '' : ' none') + '">' + esc(p.mbti || '—') + '</span>' : '') +
          (club.useYear ? '<span class="o2yr' + (p.year === 2 ? ' y2' : '') + '">' + (p.year === 2 ? '2nd' : '1st') + '</span>' : '') +
          '<select class="mini o2mv" data-act="o2move" data-key="' + esc(p.key) + '" aria-label="Move ' + esc(p.name) + '">' + M.orgs.map(function (x) { return '<option value="' + x.i + '"' + (x.i === i ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></li>';
      }).join('') : '<li class="meta">' + (g.length ? 'No one matches the filter' : 'Empty') + '</li>') + '</ul>' +
      '<div class="rowacts"><button class="qbtn" data-act="org" data-i="' + i + '">' + icon('arrow') + '<span>Open</span></button><button class="qbtn" data-act="msgOrg" data-org="' + esc(o.name) + '">' + icon('send') + '<span>Message</span></button></div></article>';
  }).join('') + '</div>';
  return h;
}
CHANGE_EXT.o2filt = function (el, d, v) { O2.f[d.k] = v; render(); };
ACT_EXT.o2filtClear = function () { O2.f = {q: '', track: '', org: '', year: ''}; render(); };
ACT_EXT.o2notesOff = function () { O2.notes = null; render(); };
CHANGE_EXT.o2move = function (el, d, v) {
  var o = M.orgs[+v], p = M.byKey[d.key]; if (!o || !p) return;
  var e = {}; e[d.key] = {Org: o.name};
  o2writeRows(e, p.name + ' moved to ' + o.name + '.');
};
CHANGE_EXT.o2ebod = function (el, d, v) {
  var list = (M.cfg.orgEbod || []).slice();
  while (list.length < M.orgs.length) list.push('');
  list[+d.i] = clean(v, 60);
  saveCfg({orgEbod: list}, v ? v + ' is the EBOD contact for ' + M.orgs[+d.i].name + '.' : 'EBOD contact cleared.');
};
/* Round-robin, so nobody on EBOD looks after more than one Org more than anyone else does. */
ACT_EXT.o2ebodAuto = function () {
  var e = o2ebodNames(); if (!e.length || !M.orgs.length) return toast('No EBOD names to assign.', true);
  var go = function () { saveCfg({orgEbod: M.orgs.map(function (o, i) { return e[i % e.length]; })}, 'EBOD contacts assigned round-robin.'); };
  var set = M.orgs.filter(function (o) { return o.ebod; }).length;
  if (!set) return go();
  confirmSheet('Reassign every EBOD contact?', plural(set, o2low(o2club().unit), o2low(o2club().units)) + ' already have a contact. Assigning round-robin replaces them all, including ones picked by hand.', 'Reassign', go);
};
ACT_EXT.o2csv = function () {
  var groups = o2groups(), rows = [['Org', 'EBOD contact', 'Name', 'Year', 'Track', 'MBTI', 'Availability', 'Teams', 'Note']];
  groups.forEach(function (g, i) {
    g.forEach(function (p) {
      var pp = M.byKey[p.key];
      rows.push([M.orgs[i].name, M.orgs[i].ebod, p.name, p.year === 2 ? '2nd year' : '1st year', o2bucket(p.track).label, p.mbti || '', p.avail, pp ? pp.teams.map(teamName).join('; ') : '', p.note]);
    });
  });
  o2download(o2csvText(rows), 'org-roster.csv');
};

/* ---- renaming an Org: officers through setTeams, an Org's lead through setOrgName ---- */
function o2isLead(o) {
  if (M.officer) return true;
  var mine = o2rows().filter(function (r) { return flat(r.MemberName) === M.me.key; })[0];
  return !!(mine && String(mine.Org) === o.name && /^y/i.test(String(mine.IsLead || '')));
}
function o2renameSheet(i) {
  var o = M.orgs[i];
  return '<form class="form" data-act="o2renameSave" data-i="' + i + '"><header class="sh"><h3>Rename ' + esc(o.name) + '</h3></header>' +
    '<label class="fld"><span>Name</span><input name="nm" maxlength="60" required value="' + esc(o.name) + '"></label>' +
    '<p class="meta">Members see the new name straight away. Cups and the EBOD contact stay with the ' + esc(o2low(o2club().unit)) + '.</p><div class="sheetacts"><button class="btn">Rename</button></div></form>';
}
ACT_EXT.o2rename = function (el, d) { openSheet(o2renameSheet(+d.i)); };
function o2renamed(from, to) {
  (RAW.all.teams || []).forEach(function (x) { if (String(x.Org) === from) x.Org = to; });
  /* The on-time board is keyed by name too; without this the old name lingers as an empty Org. */
  (RAW.all.orgBoard || []).forEach(function (b) { if (b.org === from) b.org = to; });
}
SUBMIT_EXT.o2renameSave = function (f) {
  var o = M.orgs[+f.getAttribute('data-i')], to = clean(f.nm.value, 60).trim();
  if (!o) return;
  if (!to || to === o.name) return closeSheet();
  if (M.orgs.some(function (x) { return x.name === to; })) return toast('Another ' + o2low(o2club().unit) + ' already has that name.', true);
  closeSheet();
  var from = o.name;
  if (M.officer) {
    var e = {};
    o2rows().forEach(function (r) { if (String(r.Org) === from) e[flat(r.MemberName)] = {Org: to}; });
    (RAW.all.orgBoard || []).forEach(function (b) { if (b.org === from) b.org = to; });
    var ren = {}; ren[from] = to;
    return o2writeRows(e, from + ' is now ' + to + '.', ren).then(function (ok) {
      if (!ok) { (RAW.all.orgBoard || []).forEach(function (b) { if (b.org === to) b.org = from; }); rebuild(); render(); return; }
      /* Homework set for one Org names it; keep those pointing at it. */
      if ((M.cfg.work || []).some(function (x) { return x.orgName === from; }))
        saveCfg({work: (M.cfg.work || []).map(function (x) { return x.orgName === from ? Object.assign({}, x, {orgName: to}) : x; })});
    });
  }
  call('setOrgName', {from: from, to: to}).then(function (r) {
    if (!(r && r.ok)) return toast((r && r.error) || 'That rename was refused.', true);
    o2renamed(from, to); rebuild(); render(); toast(from + ' is now ' + to + '.');
  });
};
/* The Org sheet gains a rename for whoever may rename it, and the contact picker for officers. */
var o2orgSheetBase = orgSheet;
orgSheet = function (i) {
  var h = o2orgSheetBase(i), o = M.orgs[i], add = '';
  if (!o) return h;
  if (o2isLead(o)) add += '<div class="rowacts"><button class="qbtn" data-act="o2rename" data-i="' + i + '">' + icon('edit') + '<span>Rename this ' + esc(o2low(o2club().unit)) + '</span></button></div>';
  if (M.officer) add += '<label class="fld o2ebod"><span>EBOD contact</span><select data-act="o2ebod" data-i="' + i + '"><option value="">Not assigned</option>' +
    o2ebodNames().map(function (e) { return '<option value="' + esc(e) + '"' + (e === o.ebod ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('') + '</select></label>';
  return o2before(h, '<div class="sheetacts">', add, true);
};

/* ================= ROSTER SOURCE, COLUMN MAPPING AND THE DRAFT ================= */
var O2_FIELDS = [
  {key: 'name', label: 'Name', req: true, exact: ['name', 'full name', 'your name', 'member name', 'student name'],
   pats: [/full name/i, /^name$/i, /your name/i, /name/i], no: [/user\s*name/i, /nick\s*name/i, /file\s*name/i, /name of (your|the)/i]},
  {key: 'email', label: 'Email', req: false, exact: ['email', 'email address', 'e-mail', 'your email', 'school email'], pats: [/e-?mail/i], no: [/verif/i, /confirm/i]},
  {key: 'year', label: 'Year in club', req: true, exact: ['year', 'year in club', 'years in club'],
   pats: [/year.*(club|member|program)/i, /class year/i, /first or second/i, /\byears?\b/i, /returning/i, /new or returning/i]},
  {key: 'track', label: 'Track lean', req: true, exact: ['track', 'side', 'interest', 'focus'],
   pats: [/side of the club/i, /\btracks?\b/i, /consult.*compet|compet.*consult/i, /which.*(side|branch|arm)/i, /interested in\?/i, /interest/i, /focus/i], no: [/personality/i, /mbti/i]},
  {key: 'mbti', label: 'MBTI type', req: false, exact: ['mbti', 'type', 'personality type', '16 personalities'],
   pats: [/mbti/i, /myers.?briggs/i, /16\s*person/i, /personality/i, /\btype\b/i], no: [/what type of/i, /type of work/i]},
  {key: 'avail', label: 'Availability', req: false, exact: ['availability', 'available', 'when are you free'], pats: [/availab/i, /when (are|can) you/i, /free (time|on)/i, /schedule/i]},
  {key: 'note', label: 'Notes (optional)', req: false, exact: ['notes', 'note', 'comments', 'anything else'], pats: [/anything.*(know|else|add)/i, /\bnotes?\b/i, /comment/i, /request/i]}
];
var O2_NOISE = [/^timestamp$/i, /^score$/i, /^last modified/i, /^submitted at/i, /^id$/i];
var DR = {src: 'accts', headers: [], rows: [], map: {}, from: '', msg: '', bad: false, sheetUrl: '', lastSheet: '', paste: '', n: null, touched: false,
          mbti: true, target: '', nc: {code: '', name: '', join: ''}, affs: null, roster: null, busy: false};
function o2normHead(h) { return String(h == null ? '' : h).replace(/[ ​-‍﻿]/g, ' ').replace(/\s+/g, ' ').replace(/[\s*:?.]+$/, '').trim(); }
function o2fieldScore(f, head) {
  var h = o2normHead(head), i; if (!h) return -1;
  for (i = 0; i < O2_NOISE.length; i++) if (O2_NOISE[i].test(h)) return -1;
  if (f.no) for (i = 0; i < f.no.length; i++) if (f.no[i].test(h)) return -1;
  var low = h.toLowerCase();
  if (f.exact) for (i = 0; i < f.exact.length; i++) if (low === f.exact[i]) return 1000 - i;
  for (i = 0; i < f.pats.length; i++) if (f.pats[i].test(h)) return 100 - i;
  return -1;
}
/* Columns go to fields as a whole: the strongest pairing first, then both sides are spent. */
function o2guessCols(headers) {
  var pairs = [];
  O2_FIELDS.forEach(function (f, fi) { headers.forEach(function (hd, ci) { var sc = o2fieldScore(f, hd); if (sc >= 0) pairs.push({f: fi, c: ci, s: sc}); }); });
  pairs.sort(function (a, b) {
    if (b.s !== a.s) return b.s - a.s;
    var ra = O2_FIELDS[a.f].req ? 0 : 1, rb = O2_FIELDS[b.f].req ? 0 : 1;
    return ra !== rb ? ra - rb : a.c - b.c;
  });
  var by = {}, used = {};
  pairs.forEach(function (p) { var k = O2_FIELDS[p.f].key; if (by[k] !== undefined || used[p.c]) return; by[k] = p.c; used[p.c] = 1; });
  var out = {}; O2_FIELDS.forEach(function (f) { out[f.key] = by[f.key] === undefined ? -1 : by[f.key]; });
  return out;
}
function o2parseCSV(text) {
  var rows = [], row = [], cur = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); })
    .map(function (r) { return r.map(function (c) { return String(c).trim(); }); });
}
function o2looksLikeHeader(row) { return row.some(function (c) { return /[a-z]/i.test(c); }) && !row.some(function (c) { return /^[12]$/.test(c); }); }
function o2sheetCsvUrl(url) {
  url = (url || '').trim(); if (!url) return null;
  if (/\/pub/.test(url) && /output=csv/.test(url)) return url;
  if (/\/pub/.test(url)) return url.replace(/([?&])output=[^&]*/, '').replace(/#.*$/, '') + (url.indexOf('?') > -1 ? '&' : '?') + 'output=csv';
  var m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); if (!m) return null;
  var gid = (url.match(/[#&?]gid=([0-9]+)/) || [])[1] || '0';
  return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/gviz/tq?tqx=out:csv&gid=' + gid;
}
function o2say(t, bad) { DR.msg = t; DR.bad = !!bad; render(); }
function o2ingest(rows, from) {
  if (!rows.length) { o2say('That came back empty. Check the sheet has data.', true); return false; }
  if (o2looksLikeHeader(rows[0])) { DR.headers = rows[0]; DR.rows = rows.slice(1); }
  else { DR.headers = rows[0].map(function (x, i) { return 'Column ' + (i + 1); }); DR.rows = rows; }
  if (!DR.rows.length) { DR.headers = []; o2say('Found headers but no member rows.', true); return false; }
  DR.map = o2guessCols(DR.headers); DR.from = from;
  o2say('Loaded ' + plural(DR.rows.length, 'row') + ' from ' + from + '. Check the mapping, then run the draft.');
  return true;
}
function o2normYear(v) {
  v = String(v || '');
  if (/first|1st|new member|freshman|^1$/i.test(v)) return 1;
  if (/second|third|fourth|2nd|3rd|4th|returning|senior|junior|sophomore|^[2-9]$/i.test(v)) return 2;
  return null;
}
/* Exact label or id first, so two tracks sharing a prefix can never be confused; then a distinctive word stem. */
function o2normTrack(v) {
  v = String(v || '').trim();
  if (!o2club().useTracks) return O2_FLEX;
  if (!v) return null;
  var lc = v.toLowerCase(), ts = o2tracks(), i, j;
  for (i = 0; i < ts.length; i++) if (lc === o2low(ts[i].label) || lc === ts[i].id) return ts[i].id;
  if (/either|both|not sure|undecided|neither|no preference|anywhere|wherever|^e$/i.test(v)) return O2_FLEX;
  for (i = 0; i < ts.length; i++) {
    var words = o2low(ts[i].label).split(/[^a-z]+/).filter(function (w) { return w.length > 3; });
    for (j = 0; j < words.length; j++) if (lc.indexOf(words[j].slice(0, 5)) > -1) return ts[i].id;
  }
  return null;
}
function o2capName(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().replace(/(^|[\s\-'’])(\p{Ll})/gu, function (m, a, b) { return a + b.toUpperCase(); }); }
function o2buildPeople() {
  var ci = DR.map, club = o2club();
  var miss = O2_FIELDS.filter(function (f) { return f.req && !(ci[f.key] >= 0); }).map(function (f) { return f.label; });
  if (miss.length) return {err: 'Map these first: ' + miss.join(', ') + '.', people: [], noType: []};
  var people = [], skipped = 0, unknownTrack = 0, unknownYear = 0, noType = [];
  DR.rows.forEach(function (r) {
    var name = o2capName(r[ci.name] || '');
    if (!name) { skipped++; return; }
    var year = o2normYear(r[ci.year]), track = o2normTrack(r[ci.track]), mbti = club.useMbti ? o2normMbti(r[ci.mbti]) : null;
    if (year === null) { year = 1; unknownYear++; }
    if (track === null) { track = O2_FLEX; unknownTrack++; }
    if (!mbti) noType.push(name);
    people.push({name: name, year: year, track: track, mbti: mbti, email: ci.email >= 0 ? String(r[ci.email] || '').trim().toLowerCase() : '',
                 lead: false, avail: ci.avail >= 0 ? String(r[ci.avail] || '').trim().slice(0, 120) : '', note: ci.note >= 0 ? String(r[ci.note] || '').trim() : '', org: 0});
  });
  return {people: people, skipped: skipped, unknownTrack: unknownTrack, unknownYear: unknownYear, noType: noType};
}
/* How many Orgs a roster of n should be drafted into so each lands at 8-10. */
function o2suggest(n) {
  if (n < 16) return Math.max(2, Math.round(n / 8));
  var k = Math.round(n / 9);
  while (k > 2 && n / k < 8) k--;
  while (n / k > 10) k++;
  return Math.max(2, k);
}
function o2sizeHint(n, k) {
  if (!n || !k) return '';
  var lo = Math.floor(n / k), hi = Math.ceil(n / k);
  return n + ' members → ' + k + ' ' + o2low(o2club().units) + ' of ' + (lo === hi ? lo : lo + '–' + hi) + ((lo < 8 || hi > 10) ? ' (EBOD asked for 8–10)' : '');
}

/* ---- the draft itself, as index.html runs it ---- */
function o2shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
/* How much this person's type duplicates what an Org already holds. Only ever
   breaks ties that stratum count and Org size left open. */
function o2mbtiCost(p, group) {
  if (!p.mbti) return 0;
  var cost = 0;
  group.forEach(function (q) { if (!q.mbti) return; for (var a = 0; a < 4; a++) if (q.mbti[a] === p.mbti[a]) cost++; if (q.mbti === p.mbti) cost += 2; });
  return cost;
}
function o2dealStratum(list, groups, taken, useMbti) {
  o2shuffle(list);
  list.forEach(function (p) {
    var best = -1, bestS = Infinity, bestT = Infinity, bestM = Infinity;
    o2shuffle(groups.map(function (_, i) { return i; })).forEach(function (i) {
      var s = taken[i], t = groups[i].length, m = useMbti ? o2mbtiCost(p, groups[i]) : 0;
      if (s < bestS || (s === bestS && t < bestT) || (s === bestS && t === bestT && m < bestM)) { best = i; bestS = s; bestT = t; bestM = m; }
    });
    groups[best].push(p); taken[best]++;
  });
}
/* One stratum per (cohort x bucket), dealt round-robin; leads first. */
function o2draft(people, n, useMbti) {
  var groups = [], i;
  for (i = 0; i < n; i++) groups.push([]);
  var strata = [people.filter(function (p) { return p.lead; })];
  (o2club().useYear ? [2, 1] : [null]).forEach(function (y) {
    o2buckets().forEach(function (b) {
      strata.push(people.filter(function (p) { return !p.lead && (y === null || p.year === y) && p.track === b.id; }));
    });
  });
  strata.forEach(function (st) {
    if (!st.length) return;
    var taken = []; for (var j = 0; j < n; j++) taken.push(0);
    o2dealStratum(st, groups, taken, useMbti);
  });
  return groups;
}

function o2draftView() {
  var club = o2club(), units = o2low(club.units), h = '';
  var seg = [['accts', 'Signed-up members'], ['sheet', 'Google Sheet'], ['file', 'Upload CSV'], ['paste', 'Paste']];
  h += '<section class="card o2src"><header><h3>Roster source</h3></header><div class="seg o2seg" role="group">' + seg.map(function (s) {
    return '<button class="' + (DR.src === s[0] ? 'on' : '') + '" data-act="o2src" data-v="' + s[0] + '" aria-pressed="' + (DR.src === s[0]) + '">' + s[1] + '</button>';
  }).join('') + '</div>';
  if (DR.src === 'accts') h += '<p class="mb">Everyone who signed up and sent the onboarding form. Year, track, type and availability come from their answers. This is the usual way to form ' + esc(units) + ': nothing to export or paste.</p>' +
    '<div class="rowacts"><button class="btn sm" data-act="o2accts">Use signed-up members</button></div>';
  else if (DR.src === 'sheet') h += '<p class="mb">A published-CSV link, or a Google Sheet shared as “Anyone with the link can view”. Refresh picks up late sign-ups. Keep emails off a published tab, and unpublish it when the draft is done.</p>' +
    '<label class="fld"><span>Sheet link</span><input id="o2sheet" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value="' + esc(DR.sheetUrl) + '"></label>' +
    '<div class="rowacts"><button class="btn sm" data-act="o2sheetGo">Connect sheet</button>' + (DR.lastSheet ? '<button class="btn sm ghost" data-act="o2sheetGo" data-v="again">Refresh from sheet</button>' : '') + '</div>';
  else if (DR.src === 'file') h += '<p class="mb">File → Download → Comma-separated values, then choose it here. It is read in this browser and uploaded nowhere.</p>' +
    '<div class="rowacts"><label class="btn sm ghost file">' + icon('upload') + '<span>Choose a roster CSV</span><input id="o2file" type="file" accept=".csv,.tsv,text/csv"></label></div>';
  else h += '<p class="mb">Rows straight from a spreadsheet, such as Name, Year, Track, MBTI. Headers are found by themselves.</p>' +
    '<label class="fld"><span>Rows</span><textarea id="o2paste" rows="6" spellcheck="false">' + esc(DR.paste) + '</textarea></label><div class="rowacts"><button class="btn sm" data-act="o2pasteGo">Read roster</button></div>';
  if (DR.msg) h += '<p class="note' + (DR.bad ? ' warn' : '') + '">' + esc(DR.msg) + '</p>';
  h += '</section>';
  if (!DR.headers.length) return h + (M.orgs.length ? '<p class="meta">' + esc(plural(M.orgs.length, o2low(club.unit), units)) + ' are drafted now. Running the draft again replaces them.</p>' : '');

  var r = o2buildPeople(), ready = !r.err && !(r.noType.length && club.useMbti && club.mbtiRequired);
  h += '<section class="card"><header><h3>Column mapping</h3><span class="count">' + plural(DR.rows.length, 'row') + '</span></header><p class="meta">Matched from the headers in ' + esc(DR.from) + '. Starred fields are required.</p><div class="o2map">' +
    O2_FIELDS.map(function (f) {
      return '<label class="fld"><span>' + esc(f.label) + (f.req ? ' *' : '') + '</span><select data-act="o2map" data-k="' + f.key + '"><option value="-1">Not used</option>' +
        DR.headers.map(function (hd, i) { var t = o2normHead(hd); return '<option value="' + i + '"' + (DR.map[f.key] === i ? ' selected' : '') + '>' + esc((t.length > 70 ? t.slice(0, 70) + '…' : t) || 'Column ' + (i + 1)) + '</option>'; }).join('') + '</select></label>';
    }).join('') + '</div>';
  if (r.err) h += '<p class="note warn">' + esc(r.err) + '</p>';
  else if (r.noType.length && club.useMbti && club.mbtiRequired) h += '<div class="note warn"><span><b>' + plural(r.noType.length, 'member has', 'members have') + ' no readable MBTI type:</b> ' +
    esc(r.noType.slice(0, 10).join(', ')) + (r.noType.length > 10 ? ', and ' + (r.noType.length - 10) + ' more' : '') +
    '. Type is required for this club, so the draft is held until these are filled in. Chase them in the form, or add the type to the sheet and refresh.</span></div>';
  else {
    var warn = [];
    if (r.unknownYear) warn.push(plural(r.unknownYear, 'unreadable year value') + ' will default to 1st year');
    if (r.unknownTrack) warn.push(plural(r.unknownTrack, 'unreadable track value') + ' will default to ' + club.flexLabel);
    h += '<p class="note">' + plural(r.people.length, 'member') + ' ready' + (club.useMbti && !r.noType.length ? ', all typed' : '') + (warn.length ? ': ' + esc(warn.join('; ')) : '') + '.</p>' + o2matchNote(r.people);
  }
  h += '</section>';
  if (!ready) return h;

  if (!DR.touched || !DR.n) DR.n = o2suggest(r.people.length);
  h += '<section class="card"><header><h3>Run the draft</h3></header>';
  if (M.master) {
    h += '<label class="fld"><span>Draft into</span><select data-act="o2target"><option value="">' + esc(M.club) + ': replaces its current ' + esc(units) + '</option>' +
      (DR.affs || []).filter(function (a) { return a.code !== M.aff; }).map(function (a) { return '<option value="c:' + esc(a.code) + '"' + (DR.target === 'c:' + a.code ? ' selected' : '') + '>' + esc(a.name) + ': replaces its current teams</option>'; }).join('') +
      '<option value="__new"' + (DR.target === '__new' ? ' selected' : '') + '>A new club…</option></select></label>';
    if (DR.target === '__new') h += '<div class="row3 o2nc"><label class="fld"><span>Short code</span><input id="o2ncCode" maxlength="32" autocapitalize="none" spellcheck="false" placeholder="deanza-pbl-s26" value="' + esc(DR.nc.code) + '"></label>' +
      '<label class="fld"><span>Display name</span><input id="o2ncName" maxlength="60" placeholder="De Anza PBL, Spring 26" value="' + esc(DR.nc.name) + '"></label>' +
      '<label class="fld"><span>Join code</span><input id="o2ncJoin" maxlength="40" placeholder="at least 6 characters" value="' + esc(DR.nc.join) + '"></label></div>' +
      '<p class="meta">The new club starts empty and copies this club’s setup: track names, whether type is used. Not its form, sheet or accounts. This club is left exactly as it is.</p>';
  }
  h += '<div class="o2run"><label class="fld"><span>Number of ' + esc(units) + '</span><input id="o2n" type="number" min="2" max="30" value="' + DR.n + '"></label>' +
    '<p class="meta" id="o2nhint">' + esc(o2sizeHint(r.people.length, DR.n)) + '</p>' +
    (club.useMbti ? '<label class="tick"><input type="checkbox" id="o2mbti"' + (DR.mbti ? ' checked' : '') + '> Spread MBTI types across ' + esc(units) + '</label>' : '') + '</div>' +
    '<p class="meta">Members are dealt year by year and track by track, so every ' + esc(o2low(club.unit)) + ' gets its share of 2nd years and of each track' + (club.useMbti ? '; type only breaks the ties that leaves' : '') + '.' +
    (M.orgs.length ? ' This replaces the ' + esc(plural(M.orgs.length, o2low(club.unit), units)) + ' there are now, moves made by hand included. Names stay with their position, and homework tracks already picked are kept.' : '') + '</p>' +
    '<div class="sheetacts"><button class="btn" data-act="o2run"' + (DR.busy ? ' disabled' : '') + '>' + icon('orgs') + (DR.busy ? 'Drafting…' : 'Run the draft') + '</button></div></section>';
  return h;
}
/* Email is what ties a sheet row to an account: say how many rows found one. */
function o2matchNote(people) {
  if (!(DR.map.email >= 0)) return '';
  var roster = (DR.roster || (RAW.roster && RAW.roster.roster) || []), have = {};
  roster.forEach(function (u) { var e = String(u.email || u.who || '').toLowerCase(); if (e) have[e] = 1; });
  if (!Object.keys(have).length) return '';
  var withEmail = people.filter(function (p) { return p.email; }), miss = withEmail.filter(function (p) { return !have[p.email]; }).map(function (p) { return p.name; });
  if (!withEmail.length) return '';
  return '<p class="meta">' + (withEmail.length - miss.length) + ' of ' + plural(withEmail.length, 'row') + ' matched to an account on the roster' +
    (miss.length ? '. No account yet for ' + esc(miss.slice(0, 6).join(', ')) + (miss.length > 6 ? ', and ' + (miss.length - 6) + ' more' : '') : '') + '.</p>';
}
ACT_EXT.o2src = function (el, d) { DR.src = d.v; DR.msg = ''; render(); };
CHANGE_EXT.o2map = function (el, d, v) { DR.map[d.k] = +v; render(); };
CHANGE_EXT.o2target = function (el, d, v) { DR.target = v; render(); };
ACT_EXT.o2accts = function (el) {
  el.disabled = true; o2say('Reading the club’s sign-ups…');
  call('clubRoster').then(function (r) {
    if (!(r && r.ok)) return o2say((r && r.error) || 'The club sheet did not answer. Try the Google Sheet tab instead.', true);
    DR.roster = r.roster || [];
    var rows = DR.roster.filter(function (u) { return String(u.role || 'member') === 'member' && !u.isMaster; });
    if (!rows.length) return o2say('Nobody has signed up as a member yet.', true);
    var table = [['Name', 'Email', 'Year', 'Track', 'MBTI', 'Availability', 'Notes']].concat(rows.map(function (u) {
      return [((u.first || '') + ' ' + (u.last || '')).trim() || u.who, u.email || '', u.year || '', u.track || '', u.mbti || '', u.avail || '', u.notes || ''].map(function (c) { return String(c).trim(); });
    }));
    var noAns = rows.filter(function (u) { return !u.year && !u.track; }).length;
    if (o2ingest(table, 'signed-up members') && noAns) o2say('Loaded ' + plural(rows.length, 'signed-up member') + '. ' + noAns + ' have not sent the onboarding form yet, so they default to 1st year and ' + o2low(o2club().flexLabel) + '.');
  });
};
ACT_EXT.o2sheetGo = function (el, d) {
  var url = d.v === 'again' ? DR.lastSheet : (($('o2sheet') || {}).value || DR.sheetUrl).trim(), csv = o2sheetCsvUrl(url);
  if (!csv) return o2say('That does not look like a Google Sheets link. Paste the address bar URL, or a Publish-to-web CSV link.', true);
  DR.lastSheet = url; o2say('Connecting…');
  fetch(csv, {redirect: 'follow'}).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(function (text) {
    if (/^\s*</.test(text)) return o2say('Google returned a sign-in page instead of data. Publish the tab to the web, or use Upload CSV.', true);
    o2ingest(o2parseCSV(text), 'the sheet');
  }).catch(function () { o2say('Could not reach the sheet. File → Download → CSV, then use Upload CSV.', true); });
};
ACT_EXT.o2pasteGo = function () { DR.paste = ($('o2paste') || {}).value || DR.paste; o2ingest(o2parseCSV(DR.paste), 'what was pasted'); };
ACT_EXT.o2run = function () {
  var club = o2club(), units = o2low(club.units), n = parseInt(DR.n, 10), r = o2buildPeople();
  if (!n || n < 2) return toast('Set the number of ' + units + ' to 2 or more.', true);
  if (r.err) return toast(r.err, true);
  if (r.noType.length && club.useMbti && club.mbtiRequired) return toast('Every member needs a type before the draft runs: ' + r.noType.length + ' still missing.', true);
  if (r.people.length < n * 2) return toast('Only ' + r.people.length + ' members for ' + n + ' ' + units + '. Lower the count.', true);
  if (M.master && DR.target === '__new') {
    var nc = DR.nc;
    if (!/^[a-z0-9-]{3,32}$/.test(nc.code)) return toast('The new club needs a short code: 3–32 lowercase letters, digits and dashes.', true);
    if (!nc.name.trim()) return toast('Give the new club a display name.', true);
    if (nc.join.trim().length < 6) return toast('The new club needs a join code of at least 6 characters.', true);
    DR.busy = true; render(); toast('Creating ' + nc.name.trim() + '…');
    return call('forkClub', {code: nc.code, name: nc.name.trim(), joinCode: nc.join.trim()}).then(function (res) {
      if (!(res && res.ok)) { DR.busy = false; render(); return toast((res && res.error) || 'That club could not be created.', true); }
      o2finish(r, n, res.code, res.name);
    });
  }
  if (M.master && DR.target.indexOf('c:') === 0) {
    var code = DR.target.slice(2), row = (DR.affs || []).filter(function (a) { return a.code === code; })[0], label = (row && row.name) || code;
    return confirmSheet('Draft into ' + label + '?', 'This replaces the teams that club has now. Its accounts, points and attendance are not touched. You will be viewing that club afterwards.', 'Draft into it', function () { o2finish(r, n, code, label); });
  }
  if (!M.orgs.length) return o2finish(r, n);
  confirmSheet('Replace the current ' + units + '?', 'Running the draft again replaces all ' + plural(M.orgs.length, o2low(club.unit), units) +
    ', including any moves made by hand. Members see the new ones as soon as it saves.', 'Run the draft', function () { o2finish(r, n); });
};
/* Writes the drafted roster (setTeams replaces this club's rows). Into another
   club, that club becomes the one being viewed, as on the classic page. */
function o2finish(r, n, otherCode, otherName) {
  var club = o2club(), here = !otherCode, kept = {};
  if (here) o2rows().forEach(function (x) { var f = o2normFocus(x.Focus); if (f) kept[o2normName(x.MemberName)] = f; });
  r.people.forEach(function (p) { p.focus = kept[o2normName(p.name)] || ''; });
  var groups = o2draft(r.people, n, !!(DR.mbti && club.useMbti)), used = {};
  /* Names stay with their position, so a redraft keeps the Orgs' names, cups and EBOD contacts. */
  var names = groups.map(function (g, i) {
    var nm = here && M.orgs[i] ? M.orgs[i].name : club.unit + ' ' + o2pad(i);
    while (used[nm]) nm += ' ' + o2pad(i);
    used[nm] = 1; return nm;
  });
  /* Written Org by Org, so the order the sheet lists Orgs in is the draft's (cups and contacts are kept by that position). */
  var rows = [];
  groups.forEach(function (g, i) {
    g.forEach(function (p) {
      rows.push({MemberName: p.name, Org: names[i], Track: p.track, Year: p.year, MBTI: p.mbti || '', LeadInterest: 'no', IsLead: 'no', Notes: p.note || '', Availability: p.avail || '', Focus: p.focus || ''});
    });
  });
  var notes = [];
  if (r.unknownYear) notes.push(plural(r.unknownYear, 'year value') + ' defaulted to 1st year');
  if (r.unknownTrack) notes.push(plural(r.unknownTrack, 'track value') + ' defaulted to ' + club.flexLabel);
  DR.busy = true; render();
  var prevAff = lsGet(KEYS.aff);
  if (otherCode && !DEMO) lsSet(KEYS.aff, otherCode);
  call('setTeams', rows).then(function (res) {
    DR.busy = false;
    if (!(res && res.ok)) { if (otherCode && !DEMO) lsSet(KEYS.aff, prevAff); render(); return toast((res && res.error) || 'The draft did not save. Try again.', true); }
    if (otherCode && !DEMO) { location.hash = '#orgs'; location.reload(); return; }
    O2.notes = notes; DR.headers = []; DR.msg = '';
    toast('Drafted ' + plural(r.people.length, 'member') + ' into ' + n + ' ' + o2low(club.units) + (otherName ? ' in ' + otherName : '') + '.');
    location.hash = '#orgs';
    reloadClub();
  });
}

/* ---- recommended swaps: only two people who match on year and track, so nothing the draft balanced moves ---- */
function o2orgCost(g) {
  var ax = o2axis(g), c = ax.c, n = ax.typed; if (!n) return 0;
  var cost = 0, seen = {};
  O2_AXES.forEach(function (pr) { var a = c[pr[0]], b = c[pr[1]]; cost += Math.pow(Math.abs(a - b) / n, 2) * 10; if (a === 0 || b === 0) cost += 9; });
  g.forEach(function (p) { if (!p.mbti) return; if (seen[p.mbti]) cost += 1.6; seen[p.mbti] = 1; });
  return cost;
}
function o2without(g, p) { return g.filter(function (x) { return x !== p; }); }
function o2swapReason(A, B, p, q) {
  var reasons = [], la = M.orgs[p.org].name, lb = M.orgs[q.org].name;
  var bA = o2axis(A).c, bB = o2axis(B).c, aA = o2axis(o2without(A, p).concat([q])).c, aB = o2axis(o2without(B, q).concat([p])).c;
  O2_AXES.forEach(function (pr) {
    pr.forEach(function (L) {
      if (bA[L] === 0 && aA[L] > 0) reasons.push(la + ' gains its only ' + L);
      if (bB[L] === 0 && aB[L] > 0) reasons.push(lb + ' gains its only ' + L);
      if (bA[L] > 0 && aA[L] === 0) reasons.push(la + ' loses its last ' + L);
      if (bB[L] > 0 && aB[L] === 0) reasons.push(lb + ' loses its last ' + L);
    });
  });
  var dup = function (g) { var s = {}, d = 0; g.forEach(function (x) { if (x.mbti) { if (s[x.mbti]) d++; s[x.mbti] = 1; } }); return d; };
  if (dup(o2without(A, p).concat([q])) < dup(A)) reasons.push('breaks a duplicate-type cluster in ' + la);
  if (dup(o2without(B, q).concat([p])) < dup(B)) reasons.push('breaks a duplicate-type cluster in ' + lb);
  if (!reasons.length) {
    var ev = [];
    O2_AXES.forEach(function (pr) { if (Math.abs(aA[pr[0]] - aA[pr[1]]) < Math.abs(bA[pr[0]] - bA[pr[1]])) ev.push(pr[0] + '/' + pr[1]); });
    reasons.push(ev.length ? 'evens out ' + ev.join(' and ') + ' in ' + la : 'improves the overall spread across both ' + o2low(o2club().units));
  }
  return reasons.slice(0, 3).join('; ') + '.';
}
function o2computeSwaps(groups) {
  O2.swaps = [];
  if (groups.length < 2 || !o2club().useMbti) return;
  var cand = [];
  for (var a = 0; a < groups.length; a++) for (var b = a + 1; b < groups.length; b++) {
    (function (a, b) {
      var A = groups[a], B = groups[b], cA = o2orgCost(A), cB = o2orgCost(B);
      A.forEach(function (p) {
        B.forEach(function (q) {
          if (!p.mbti || !q.mbti || p.mbti === q.mbti || p.year !== q.year || p.track !== q.track || p.lead !== q.lead) return;
          var gain = (cA + cB) - (o2orgCost(o2without(A, p).concat([q])) + o2orgCost(o2without(B, q).concat([p])));
          if (gain > 0.35) cand.push({p: p, q: q, a: a, b: b, gain: gain});
        });
      });
    })(a, b);
  }
  cand.sort(function (x, y) { return y.gain - x.gain; });
  var used = {};
  cand.forEach(function (c) {
    if (O2.swaps.length >= O2.swapMax || used[c.p.name] || used[c.q.name]) return;
    used[c.p.name] = used[c.q.name] = 1;
    c.why = o2swapReason(groups[c.a], groups[c.b], c.p, c.q);
    O2.swaps.push(c);
  });
}
function o2swapsView(groups) {
  var club = o2club();
  if (!club.useMbti) return empty('Types are switched off', 'Swaps balance personality types across ' + o2low(club.units) + ', and this club does not use them. Move people by hand on the Orgs tab.');
  if (!M.orgs.length) return empty('Run a draft first', '', '<a class="btn" href="#orgs/draft">Draft Orgs</a>');
  var all = [].concat.apply([], groups), ax = o2axis(all), seen = {};
  all.forEach(function (p) { if (p.mbti) seen[p.mbti] = 1; });
  var h = '<section class="toolbar"><span class="meta o2grow">Only two people on the same year and track are ever swapped, so nothing else the draft balanced moves.</span><select class="mini" data-act="o2swapMax" aria-label="How many swaps">' +
    [3, 6, 10].map(function (n) { return '<option value="' + n + '"' + (O2.swapMax === n ? ' selected' : '') + '>Up to ' + n + '</option>'; }).join('') + '</select></section>';
  h += '<section class="card"><header><h3>Swaps</h3><span class="count">' + O2.swaps.length + '</span></header>' + (O2.swaps.length ? '<ul class="inbox o2swaps">' + O2.swaps.map(function (c, i) {
    return '<li><div class="mh"><p class="mt">' + esc(c.p.name) + ' <span class="o2mb">' + esc(c.p.mbti) + '</span> ⇄ ' + esc(c.q.name) + ' <span class="o2mb">' + esc(c.q.mbti) + '</span></p><span class="ma">gain ' + c.gain.toFixed(1) + '</span></div>' +
      '<p class="meta">' + esc(M.orgs[c.a].name) + ' ↔ ' + esc(M.orgs[c.b].name) + ': ' + esc(c.why) + ' Both are ' + (club.useYear ? (c.p.year === 2 ? '2nd' : '1st') + ' year ' : '') + esc(o2low(o2bucket(c.p.track).label)) + '.</p>' +
      '<div class="rowacts"><button class="qbtn" data-act="o2swapGo" data-i="' + i + '">' + icon('check') + '<span>Apply swap</span></button></div></li>';
  }).join('') + '</ul>' : '<p class="mb">Nothing worth changing. No swap improves type balance without trading people across years or tracks, which the draft protects. Move people by hand if you want to override that.</p>') + '</section>';
  h += '<section class="card"><header><h3>Across the club</h3><span class="count">' + ax.typed + ' of ' + all.length + ' typed · ' + Object.keys(seen).length + ' of 16 types</span></header><ul class="progress">' +
    O2_AXES.map(function (pr) {
      var a = ax.c[pr[0]], b = ax.c[pr[1]], pct = Math.round(a / (a + b || 1) * 100);
      return '<li><div class="pl"><span>' + pr[0] + ' ' + pct + '% / ' + pr[1] + ' ' + (100 - pct) + '%</span><span class="meta">' + (Math.abs(pct - 50) >= 25 ? 'Leans hard; every Org inherits it. Only recruiting fixes this.' : 'Healthy split') + '</span></div><div class="bar"><i style="width:' + pct + '%"></i></div></li>';
    }).join('') + '</ul><p class="meta">Balance score ' + groups.reduce(function (s, g) { return s + o2orgCost(g); }, 0).toFixed(1) + ', lower is better: missing letters count most, then axis lean, then stacks of one type. ' +
    'Type is a self-report, not a verdict on anyone; where it and an officer’s own read disagree, the officer is right.</p></section>';
  return h;
}
CHANGE_EXT.o2swapMax = function (el, d, v) { O2.swapMax = +v || 6; render(); };
ACT_EXT.o2swapGo = function (el, d) {
  var c = O2.swaps[+d.i]; if (!c) return;
  var e = {}; e[c.p.key] = {Org: M.orgs[c.b].name}; e[c.q.key] = {Org: M.orgs[c.a].name};
  el.disabled = true;
  o2writeRows(e, c.p.name + ' and ' + c.q.name + ' swapped.');
};

/* ================= MEMBER CARD: photo, recognitions, hand-ins, points ================= */
function o2recs(name) {
  return (((M.cfg.recognitions || {})[o2normName(name)]) || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
}
function o2day(ms) { return ms ? new Date(ms).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : ''; }
function o2photo(v) { var s = String(v == null ? '' : v).trim(); return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/.test(s) ? s : ''; }
/* The card is read once per person per visit; the sheet redraws when it lands. */
function o2card(p) {
  var c = O2.cards[p.key];
  if (!c && !O2.cardAsk[p.key]) {
    O2.cardAsk[p.key] = 1;
    call('memberCard', {name: p.name}).then(function (r) { if (r && r.ok) { O2.cards[p.key] = r; refreshSheet(); } });
  }
  return c;
}
function o2memberExtra(p) {
  var card = o2card(p), m = card && card.member, h = '', recs = o2recs(p.name);
  if (card && card.full && m && m.points != null) h += '<div class="fg"><p class="fl">Commitment</p><p><b>' + esc(m.points) + '</b> points from ' + plural(m.entries || 0, 'entry', 'entries') + '. Private to them and EBOD; nothing ranks members.</p></div>';
  if (recs.length || M.officer) h += '<div class="fg"><p class="fl">Recognitions</p>' + (recs.length ? '<div class="chips">' + recs.map(function (r) {
    return '<span class="chip tone-gold o2rec">' + icon('cup') + esc(r.label) + '<i>' + esc(o2day(r.at)) + '</i></span>' +
      (M.officer ? '<button class="x" data-act="o2recDel" data-key="' + esc(p.key) + '" data-id="' + esc(r.id) + '" aria-label="Remove ' + esc(r.label) + '">' + icon('close') + '</button>' : '');
  }).join('') + '</div>' : '<p class="meta">None yet.</p>') +
    (M.officer ? '<form class="addtag" data-act="o2recAdd" data-key="' + esc(p.key) + '"><input name="t" maxlength="80" placeholder="Member of the Month, October" aria-label="Recognition"><button class="btn sm">Recognise</button></form>' : '') + '</div>';
  if (!M.officer) return h;
  if (o2usesFocus() && o2rows().some(function (r) { return flat(r.MemberName) === p.key; })) {
    var f = focusOf(p), picked = o2focusMap()[p.key];
    h += '<div class="fg"><p class="fl">Homework track</p><div class="seg" role="group">' + o2tracks().filter(function (t) { return t.id === 'c' || t.id === 'k'; }).map(function (t) {
      return '<button class="' + (f === t.id ? 'on' : '') + '" data-act="o2focus" data-key="' + esc(p.key) + '" data-f="' + t.id + '" aria-pressed="' + (f === t.id) + '">' + esc(t.label) + '</button>';
    }).join('') + '</div>' + (!picked ? '<p class="meta">' + (f ? 'From the track they were drafted into.' : 'None yet, so they see both kinds of homework.') + '</p>' : '') + '</div>';
  }
  var subs = M.subs.filter(function (s) { return flat(s.name) === p.key; });
  h += '<div class="fg"><p class="fl">Their work</p>' + (subs.length ? '<ul class="inbox tight o2work">' + subs.map(function (s) {
    var u = safeUrl(s.fileUrl);
    return '<li><span class="tt">' + esc(s.workTitle || ((M.cfg.work || []).filter(function (w) { return w.id === s.workId; })[0] || {}).title || 'Assignment') + '</span>' +
      '<span class="meta">' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(s.fileName || 'Open') + '</a> · ' : '') + esc(String(s.at || '').slice(0, 10)) + (s.revision > 1 ? ' · v' + s.revision : '') +
      ' · ' + (s.status === 'checked' ? 'checked' : 'to check') + (s.points ? ' · ' + s.points + ' pts' : '') + '</span></li>';
  }).join('') + '</ul>' : '<p class="meta">Nothing handed in yet.</p>') + '</div>';
  h += '<form class="fg o2give" data-act="o2givePts" data-key="' + esc(p.key) + '"><p class="fl">Give commitment points</p><div class="o2giverow"><input name="label" maxlength="80" placeholder="Ran the tabling shift" aria-label="What for">' +
    '<input name="pts" type="number" min="1" max="50" value="2" aria-label="Points"><button class="btn sm">Give</button></div><p class="meta">Goes in their private commitment log.</p></form>';
  return h;
}
var o2profileBase = profileSheet;
profileSheet = function (p) {
  var h = o2profileBase(p), card = O2.cards[p.key], ph = card && card.member && o2photo(card.member.photo);
  if (ph) h = o2swap(h, avatar(p), '<img class="o2photo" src="' + esc(ph) + '" alt="">');
  return o2before(h, '<div class="sheetacts">', o2memberExtra(p), true);
};
SUBMIT_EXT.o2recAdd = function (f) {
  var p = M.byKey[f.getAttribute('data-key')], t = clean(f.t.value, 80).trim(); if (!p || !t) return;
  var all = JSON.parse(JSON.stringify(M.cfg.recognitions || {})), k = o2normName(p.name);
  all[k] = [{id: 'r' + Date.now().toString(36), label: t, at: Date.now(), by: M.me.name || 'An officer'}].concat(all[k] || []).slice(0, 20);
  saveCfg({recognitions: all}, p.name + ' recognised.');
};
ACT_EXT.o2recDel = function (el, d) {
  var p = M.byKey[d.key]; if (!p) return;
  var all = JSON.parse(JSON.stringify(M.cfg.recognitions || {})), k = o2normName(p.name);
  all[k] = (all[k] || []).filter(function (r) { return r.id !== d.id; });
  if (!all[k].length) delete all[k];
  saveCfg({recognitions: all}, 'Recognition removed.');
};
SUBMIT_EXT.o2givePts = function (f) {
  var p = M.byKey[f.getAttribute('data-key')], label = clean(f.label.value, 80).trim(), pts = Math.max(0, Math.min(50, +f.pts.value || 0));
  if (!p) return;
  if (!label || !pts) return toast('Say what it is for and how many points.', true);
  var btn = f.querySelector('button'); btn.disabled = true;
  call('addPointsBulk', [{MemberName: p.name, ActionId: 'dash', ActionLabel: label, Points: pts, Track: 'x', Org: p.org}]).then(function (r) {
    btn.disabled = false;
    if (!(r && r.ok)) return toast((r && r.error) || 'Not saved.', true);
    delete O2.cards[p.key]; delete O2.cardAsk[p.key];
    toast(plural(pts, 'point') + ' to ' + p.name + '.'); refreshSheet();
  });
};
ACT_EXT.o2focus = function (el, d) {
  var p = M.byKey[d.key]; if (!p) return;
  var e = {}; e[d.key] = {Focus: d.f};
  o2writeRows(e, p.name + ': ' + o2low(d.f === 'c' ? FOCUS.c : FOCUS.k) + ' homework.').then(function (ok) { if (ok) o2driveSoon(); });
};

/* ================= NOTICES: the club's bulletin board, at the top of everyone's home ================= */
function o2notices() { return (M.cfg.board || []).filter(function (n) { return n && n.id && n.text; }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); }); }
function o2noticeCard() {
  var list = o2notices();
  if (!list.length && !M.officer) return '';
  if (!list.length) return '<section class="o2board none"><span class="meta">No notices. Post one and everyone sees it at the top of their home screen.</span><button class="btn sm ghost" data-act="o2noticeNew">' + icon('plus') + 'Post a notice</button></section>';
  return '<section class="card o2board"><header><h3>Notices</h3><span class="count">' + list.length + '</span>' + (M.officer ? '<button class="btn sm ghost" data-act="o2noticeNew">' + icon('plus') + 'Post</button>' : '') + '</header><ul class="inbox">' +
    list.map(function (n) {
      return '<li><div class="mh"><p class="mb">' + esc(n.text) + '</p>' + (M.officer ? '<button class="x" data-act="o2noticeDel" data-id="' + esc(n.id) + '" aria-label="Remove this notice">' + icon('close') + '</button>' : '') + '</div>' +
        '<p class="meta">' + esc(n.by || 'An officer') + ' · ' + esc(o2day(n.at)) + '</p></li>';
    }).join('') + '</ul></section>';
}
var o2overviewBase = VIEWS.overview;
VIEWS.overview = function (sub) {
  var h = o2overviewBase(sub), card = o2noticeCard();
  if (!card) return h;
  var at = h.indexOf('</section>');
  return h.indexOf('<section class="homehead"') === 0 && at > -1 ? h.slice(0, at + 10) + card + h.slice(at + 10) : card + h;
};
ACT_EXT.o2noticeNew = function () {
  openSheet('<form class="form" data-act="o2noticeSave"><header class="sh"><h3>Post a notice</h3></header><label class="fld"><span>Notice</span><textarea name="t" maxlength="400" rows="3" required placeholder="Chapter meeting moved to Thursday 7 pm"></textarea></label>' +
    '<p class="meta">Everyone in the club sees it at the top of their home screen. The newest 12 are kept.</p><div class="sheetacts"><button class="btn">Post</button></div></form>');
};
SUBMIT_EXT.o2noticeSave = function (f) {
  var t = clean(f.t.value, 400).trim(); if (!t) return;
  closeSheet();
  saveCfg({board: [{id: 'n' + Date.now().toString(36), text: t, by: M.me.name || 'An officer', at: Date.now()}].concat(M.cfg.board || []).slice(0, 12)}, 'Posted.');
};
ACT_EXT.o2noticeDel = function (el, d) { saveCfg({board: (M.cfg.board || []).filter(function (n) { return n.id !== d.id; })}, 'Notice removed.'); };

/* ================= ORG CUP: the same screen, plus taking a cup back ================= */
var o2cupBase = VIEWS.cup;
VIEWS.cup = function (sub) {
  var h = o2cupBase(sub);
  if (!M.officer) return h;
  var mark = '<section class="card"><header><h3>Awarded by EBOD', at = h.indexOf(mark);
  if (at < 0) return h;
  var awards = [];
  (M.cfg.cups || []).forEach(function (c) { var o = M.orgs[+c.org]; if (o) awards.push({id: c.id, org: o.name, label: c.label, at: c.at, by: c.by}); });
  awards.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  return h.slice(0, at) + '<section class="card"><header><h3>Awarded by EBOD</h3><span class="count">' + awards.length + '</span></header><ul class="inbox">' + awards.map(function (a) {
    return '<li><div class="mh"><p class="mt">' + esc(a.org) + ': ' + esc(a.label) + '</p><span class="ma">' + esc(a.at ? ago(new Date(a.at).toISOString()) : '') + '</span>' +
      '<button class="x" data-act="o2cupDel" data-id="' + esc(a.id) + '" data-label="' + esc(a.label) + '" aria-label="Remove this cup">' + icon('close') + '</button></div><p class="meta">' + esc(a.by || 'EBOD') + '</p></li>';
  }).join('') + '</ul></section>';
};
ACT_EXT.o2cupDel = function (el, d) {
  confirmSheet('Remove this cup?', '“' + d.label + '” comes off the Org’s shelf for everyone.', 'Remove', function () {
    saveCfg({cups: (M.cfg.cups || []).filter(function (c) { return c.id !== d.id; })}, 'Cup removed.');
  });
};

/* ================= HOMEWORK: hand-in review, tracks, Drive folders, alerts, templates ================= */
var o2hwBase = VIEWS.homework;
VIEWS.homework = function (sub) {
  if (!M.officer) return o2hwBase(sub);
  sub = sub || 'list';
  var toCheck = M.subs.filter(function (s) { return s.status !== 'checked'; }).length;
  var noTrack = o2usesFocus() ? o2trackPeople().filter(function (p) { return !focusOf(p); }).length : 0;
  var tabs = subtabs(sub, [['list', 'Assignments'], ['review', 'Hand-ins', toCheck], ['tracks', 'Homework tracks', noTrack], ['setup', 'Folders and alerts']], 'homework');
  if (sub === 'list') {
    var h = o2hwBase('list').replace(/data-act="hwEdit" data-id="([^"]*)">([\s\S]*?)<\/button><a class="qbtn" href="\/homework">/g, function (m, id, inner) {
      return 'data-act="hwEdit" data-id="' + id + '">' + inner + '</button><a class="qbtn" href="#homework/review?w=' + id + '">';
    });
    var at = h.indexOf('</section>');
    return at > -1 && h.indexOf('<section class="vhead') === 0 ? h.slice(0, at + 10) + tabs + h.slice(at + 10) : tabs + h;
  }
  var hd = head('Develop', 'Homework', '<button class="btn sm" data-act="hwNew">' + icon('plus') + 'Set an assignment</button>') + tabs;
  if (sub === 'review') return hd + o2review();
  if (sub === 'tracks') return hd + o2tracksView();
  return hd + o2setupView();
};
/* Who an assignment is for, as people; then who handed in, on time or late. */
function o2review() {
  var list = works();
  if (!list.length) return empty('No assignments yet', 'Set one and the hand-ins come in here.');
  var want = ROUTE.q.w && list.some(function (w) { return w.id === ROUTE.q.w; }) ? ROUTE.q.w : '';
  if (want && O2.hwFrom !== want) { O2.hw = want; O2.hwFrom = want; }
  if (!list.some(function (w) { return w.id === O2.hw; })) {
    var open = list.filter(function (w) { return M.subs.some(function (s) { return s.workId === w.id && s.status !== 'checked'; }); });
    O2.hw = (open[0] || list[list.length - 1]).id;
  }
  var w = list.filter(function (x) { return x.id === O2.hw; })[0], end = dueEnd(w);
  var forP = M.people.filter(function (p) { return p.role === 'member' && workFor(w, p); }), aud = {};
  forP.forEach(function (p) { aud[p.key] = 1; });
  var rows = M.subs.filter(function (s) { return s.workId === w.id; }), got = {};
  rows.forEach(function (s) { got[flat(s.name)] = s; });
  var lateOf = function (s) { return end && new Date(s.first || s.at).getTime() > end.getTime(); };
  var inAud = rows.filter(function (s) { return aud[flat(s.name)]; }), outside = rows.length - inAud.length;
  var onTime = inAud.filter(function (s) { return !lateOf(s); }).length, missing = forP.filter(function (p) { return !got[p.key]; });
  var unchecked = rows.filter(function (s) { return s.status !== 'checked'; }), bulk = unchecked.filter(function (s) { return !lateOf(s); });
  rows.sort(function (a, b) { return ((a.status === 'checked') - (b.status === 'checked')) || String(a.name).localeCompare(String(b.name)); });
  O2.hwRows = rows;
  var h = '<section class="toolbar"><select class="mini o2pick" data-act="o2hwPick" aria-label="Assignment">' + list.map(function (x) {
    var n = M.subs.filter(function (s) { return s.workId === x.id && s.status !== 'checked'; }).length;
    return '<option value="' + esc(x.id) + '"' + (x.id === w.id ? ' selected' : '') + '>' + esc(x.title) + (n ? ' (' + n + ' to check)' : '') + '</option>';
  }).join('') + '</select><span class="o2grow"></span>' + dueLine(w) + '</section>';
  h += '<section class="card"><header><h3>' + esc(w.title) + '</h3><span class="count">' + (unchecked.length ? unchecked.length + ' to check' : rows.length ? 'all checked' : 'none in') + '</span></header>' +
    '<div class="hwstats"><span><b class="fig">' + inAud.length + ' of ' + forP.length + '</b>handed in</span>' + (w.due ? '<span><b class="fig">' + onTime + '</b>on time</span><span><b class="fig">' + (inAud.length - onTime) + '</b>late</span>' : '') +
    '<span><b class="fig' + (w.due && daysTo(w.due) < 0 && missing.length ? ' bad' : '') + '">' + missing.length + '</b>still to come</span>' + (outside ? '<span><b class="fig">' + outside + '</b>from outside who it is for now</span>' : '') + '</div>';
  if (missing.length) h += '<p class="meta o2miss"><b>Not in yet:</b> ' + esc(missing.slice(0, 24).map(function (p) { return p.name; }).join(', ')) + (missing.length > 24 ? ', and ' + (missing.length - 24) + ' more' : '') + '</p>' +
    '<div class="rowacts"><button class="qbtn" data-act="copy" data-v="' + esc(missing.map(function (p) { return p.name; }).join(', ')) + '">' + icon('link') + '<span>Copy all ' + missing.length + ' names</span></button>' +
    '<button class="qbtn" data-act="hwNudge" data-id="' + esc(w.id) + '">' + icon('bell') + '<span>Remind them</span></button></div>';
  if (bulk.length > 1) h += '<div class="rowacts"><button class="btn sm" data-act="o2checkAll">' + icon('check') + 'Check off all ' + bulk.length + ' on time</button></div>';
  h += rows.length ? '<ul class="o2subs">' + rows.map(function (s, i) {
    var done = s.status === 'checked', u = safeUrl(s.fileUrl);
    return '<li class="' + (done ? 'done' : '') + '"><div class="o2sn"><button class="link" data-act="profile" data-key="' + esc(flat(s.name)) + '">' + esc(s.name) + '</button><span class="meta">' + esc(s.org || '') +
      (aud[flat(s.name)] ? '' : ' · not in the audience now') + '</span></div>' +
      (u ? '<a class="o2file" href="' + esc(u) + '" target="_blank" rel="noopener">' + icon('link') + '<span>' + esc(s.fileName || 'Open') + '</span></a>' : '<span class="o2file meta">No file link</span>') +
      '<span class="meta o2when">' + esc(String(s.at || '').slice(0, 10)) + (s.revision > 1 ? ' · v' + s.revision : '') + (lateOf(s) ? ' · <b class="o2late">late</b>' : '') + '</span>' +
      '<input class="mini o2pts" id="o2p' + i + '" type="number" min="0" max="999" placeholder="pts" aria-label="Commitment points for ' + esc(s.name) + '" value="' + (s.points == null ? '' : esc(s.points)) + '">' +
      '<button class="btn sm o2ok' + (done ? ' ghost' : '') + '" data-act="o2check" data-i="' + i + '" title="' + (done ? 'Mark it not checked again' : 'Mark it checked') + '">' + (done ? icon('check') + 'Checked' : 'Check off') + '</button></li>';
  }).join('') + '</ul>' : '<p class="mb">Nobody has handed this in yet.</p>';
  h += '<p class="meta">Points are optional and land in the member’s private commitment log. Unchecking keeps points already given.</p></section>';
  return h;
}
CHANGE_EXT.o2hwPick = function (el, d, v) { O2.hw = v; O2.hwFrom = ROUTE.q.w || ''; render(); };
function o2reloadSubs() {
  return call('listSubmissions').then(function (r) { if (r && r.ok) { RAW.subs = r; rebuild(); render(); } });
}
ACT_EXT.o2check = function (el, d) {
  var s = O2.hwRows[+d.i]; if (!s) return;
  var undo = s.status === 'checked', pts = ($('o2p' + d.i) || {}).value || '';
  el.disabled = true;
  call('reviewSubmission', {workId: s.workId, name: s.name, status: undo ? 'submitted' : 'checked', points: undo ? '' : pts}).then(function (r) {
    el.disabled = false;
    if (!(r && r.ok)) return toast((r && r.error) || 'That did not save.', true);
    toast(undo ? s.name + ' marked as not checked. Points already given stay in their log.' : 'Checked off' + (r.points ? ': ' + plural(r.points, 'point') + ' to ' + s.name + '.' : '.'));
    o2reloadSubs();
  });
};
ACT_EXT.o2checkAll = function () {
  var w = (M.cfg.work || []).filter(function (x) { return x.id === O2.hw; })[0], end = w && dueEnd(w);
  var names = O2.hwRows.filter(function (s) { return s.status !== 'checked' && !(end && new Date(s.first || s.at).getTime() > end.getTime()); }).map(function (s) { return s.name; });
  confirmSheet('Check off ' + plural(names.length, 'hand-in') + '?', 'Everything handed in on time for this assignment that is not checked yet. No points are given; add those one at a time.', 'Check them off', function () {
    call('reviewSubmissions', {workId: O2.hw, names: names}).then(function (r) {
      if (!(r && r.ok)) return toast((r && r.error) || 'That did not save.', true);
      toast('Checked off ' + r.checked + '.'); o2reloadSubs();
    });
  });
};

/* Members on the Teams tab, the ones a homework track can be set for. */
function o2trackPeople() {
  var on = {};
  o2rows().forEach(function (r) { on[flat(r.MemberName)] = 1; });
  return M.people.filter(function (p) { return p.role === 'member' && on[p.key]; });
}
function o2tracksView() {
  if (!o2usesFocus()) return empty('Homework tracks need both tracks', 'They split homework between the consulting and case competition tracks (ids c and k under club setup). This club does not have both.');
  var ppl = o2trackPeople();
  if (!ppl.length) return empty('Run the draft first', 'Tracks are kept on each member’s row in the drafted roster.', '<a class="btn" href="#orgs/draft">Draft Orgs</a>');
  var missing = ppl.filter(function (p) { return !focusOf(p); }), byName = function (a, b) { return a.name.localeCompare(b.name); };
  var rows = missing.slice().sort(byName);
  if (O2.focusAll) rows = rows.concat(ppl.filter(function (p) { return focusOf(p); }).sort(byName));
  var ts = o2tracks().filter(function (t) { return t.id === 'c' || t.id === 'k'; });
  var h = '<section class="card"><header><h3>Homework tracks</h3><span class="count">' + (missing.length ? missing.length + ' without one' : 'all set') + '</span></header>' +
    '<p class="meta">Each member only sees homework set for their track, or for both. Members drafted into either track start on it; Polaris and undecided members need a pick and see both kinds until then. Their Drive folder follows.</p>';
  h += rows.length ? '<ul class="o2focus">' + rows.map(function (p) {
    var f = focusOf(p);
    return '<li><div class="o2sn"><button class="link" data-act="profile" data-key="' + esc(p.key) + '">' + esc(p.name) + '</button><span class="meta">' + esc([p.org, p.track ? 'drafted ' + p.track : ''].filter(Boolean).join(' · ')) + '</span></div>' +
      '<div class="seg" role="group" aria-label="Homework track for ' + esc(p.name) + '">' + ts.map(function (t) {
        return '<button class="' + (f === t.id ? 'on' : '') + '" data-act="o2focus" data-key="' + esc(p.key) + '" data-f="' + t.id + '" aria-pressed="' + (f === t.id) + '">' + esc(t.label) + '</button>';
      }).join('') + '</div></li>';
  }).join('') + '</ul>' : '<p class="mb">All ' + plural(ppl.length, 'member') + ' have a homework track.</p>';
  if (ppl.length > missing.length) h += '<div class="rowacts"><button class="qbtn" data-act="o2focusAll">' + (O2.focusAll ? 'Show only the ones without a track' : 'Show everyone (' + (ppl.length - missing.length) + ' set)') + '</button></div>';
  return h + '</section>';
}
ACT_EXT.o2focusAll = function () { O2.focusAll = !O2.focusAll; render(); };

function o2setupView() {
  var c = M.cfg, on = c.handinMail !== false, dv = O2.drive;
  return '<div class="o2two"><section class="card"><header><h3>Member Drive folders</h3></header>' +
    '<p class="mb">Every member has a folder in the club’s Drive with a subfolder for each assignment set for them, and what they hand in is filed there. The folders are for officers and are not shared with members. A member’s folder is made the first time they open the app; this does everyone at once. New assignments are added a few seconds after you set them.</p>' +
    '<div class="rowacts"><button class="btn sm" data-act="o2drives"' + (dv.busy ? ' disabled' : '') + '>' + icon('upload') + (dv.busy ? 'Setting up…' : 'Set up folders for everyone') + '</button>' +
    (safeUrl(dv.url) ? '<a class="btn sm ghost" href="' + esc(safeUrl(dv.url)) + '" target="_blank" rel="noopener">' + icon('arrow') + 'Open the member folders</a>' : '') + '</div>' +
    (dv.msg ? '<p class="note' + (dv.bad ? ' warn' : '') + '">' + esc(dv.msg) + '</p>' : '') + '</section>' +
    '<form class="card form" data-act="o2alerts"><header><h3>Homework alerts</h3></header>' +
    '<p class="mb">An email listing what members handed in, at most one every 10 minutes: who, which assignment, on time or late, and a link to the file. Members never see these addresses.</p>' +
    '<label class="tick"><input type="checkbox" name="on"' + (on ? ' checked' : '') + '> Email officers when homework is handed in</label>' +
    '<label class="fld"><span>Send them to</span><input name="to" maxlength="400" autocapitalize="none" spellcheck="false" placeholder="Blank: the club Google account. Separate several with commas." value="' + esc(c.handinTo || '') + '"></label>' +
    '<div class="sendrow"><button class="btn sm">Save</button></div></form></div>';
}
SUBMIT_EXT.o2alerts = function (f) {
  var to = String(f.to.value || '').replace(/[^A-Za-z0-9@._+\-, ;]/g, '').slice(0, 400);
  saveCfg({handinMail: !!f.on.checked, handinTo: to}, f.on.checked ? 'Alerts on' + (to ? ' for ' + to : ', to the club account') + '.' : 'Alerts off.');
};
/* The backend works as long as it safely can per call and says how many are left, so this keeps calling. */
function o2drives(quiet) {
  var dv = O2.drive; if (dv.busy) return;
  dv.busy = true; dv.bad = false; if (!quiet) { dv.msg = 'Setting up member folders…'; render(); }
  var round = 0, made = 0;
  (function step() {
    round++;
    call('syncMemberDrives', {budgetMs: 40000}).then(function (r) {
      if (!(r && r.ok)) { dv.busy = false; if (!quiet) { dv.msg = (r && r.error) || 'The club Drive did not answer. Try again in a minute.'; dv.bad = true; render(); } return; }
      made += r.processed || 0;
      if (r.rootUrl) dv.url = r.rootUrl;
      if (r.remaining && round < 20) { if (!quiet) { dv.msg = 'Set up ' + made + ' so far, ' + r.remaining + ' to go…'; render(); } return step(); }
      dv.busy = false;
      var t = plural(r.folders || 0, 'member has', 'members have') + ' a folder, each with their assignments.';
      if (r.failed && r.failed.length) { t += ' Could not set up: ' + r.failed.slice(0, 5).join('; ') + '.'; dv.bad = true; }
      if (r.remaining) t += ' ' + r.remaining + ' still to do. Press the button again.';
      if (!quiet || dv.bad) dv.msg = t;
      render();
    });
  })();
}
ACT_EXT.o2drives = function () { o2drives(false); };
/* A new homework track changes which assignment folders someone gets. */
function o2driveSoon() { if (DEMO) return; clearTimeout(O2.driveT); O2.driveT = setTimeout(function () { o2drives(true); }, 6000); }

/* Officers write the same few assignments every term, so their shapes are offered. */
var O2_TPL = {
  case: {title: 'Case brief, round one', note: 'One PDF, two pages maximum.', kind: 'file',
         brief: 'Summarise the case, name the decision, and recommend one course of action with the numbers behind it. Two pages. A good one is specific about the tradeoff it is choosing against.'},
  deck: {title: 'Slide deck', note: 'PDF export of your slides.', kind: 'file',
         brief: 'Six to eight slides. One idea per slide, a clear recommendation on the second slide, and the supporting analysis after it. Export to PDF so the fonts survive.'},
  resume: {title: 'Résumé for review', note: 'One page, PDF.', kind: 'file',
           brief: 'One page, PDF, named Firstname-Lastname. Officers will mark it up and hand it back before the career fair.'},
  reflect: {title: 'Event reflection', note: 'A short write-up, any format.', kind: 'either',
            brief: 'Two or three paragraphs: what the event was, one thing you took from it, and one thing you would do differently. This is for you as much as for the chapter.'},
  proof: {title: 'Proof of attendance', note: 'A photo or a screenshot.', kind: 'file',
          brief: 'A photo of you at the event, or a screenshot of the confirmation. Used when an event was not run by the chapter and there was no sign-in sheet.'}
};
var o2hwFormBase = hwForm;
hwForm = function () {
  var h = o2hwFormBase();
  if (HW.edit && HW.edit.id) return h;
  var pick = '<label class="fld"><span>Start from</span><select data-act="o2tpl"><option value="">A blank assignment</option>' +
    [['case', 'Case brief'], ['deck', 'Slide deck'], ['resume', 'Résumé review'], ['reflect', 'Event reflection'], ['proof', 'Proof of attendance']].map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('') + '</select></label>';
  var at = h.indexOf('</header>');
  return at > -1 ? h.slice(0, at + 9) + pick + h.slice(at + 9) : h;
};
CHANGE_EXT.o2tpl = function (el, d, v) {
  var t = O2_TPL[v], f = el.form; if (!t || !f) return;
  f.title.value = t.title; f.note.value = t.note; f.brief.value = t.brief; f.kind.value = t.kind;
};

/* ================= ATTENDANCE: commitment points with each check-in, absences over a date range ================= */
var o2attBase = VIEWS.attendance;
VIEWS.attendance = function (sub) {
  sub = sub || 'take';
  var waiting = (SYNC.tickets || []).filter(ticketOpen).length;
  var old = subtabs(sub, [['take', 'Take attendance'], ['absent', 'Absences and tickets', waiting]], 'attendance');
  var tabs = subtabs(sub, [['take', 'Take attendance'], ['absent', 'Absences and tickets', waiting], ['range', 'Over a date range']], 'attendance');
  if (sub === 'range') return head('People', 'Attendance') + tabs + o2absRange();
  var h = o2swap(o2attBase(sub), old, tabs);
  if (sub === 'take') h = o2before(h, '<div class="attbar">', '<div class="o2attpts"><label class="fld"><span>Commitment points each</span><input id="o2attpts" type="number" min="0" max="20" value="' + O2.attPts + '"></label>' +
    '<p class="meta">Everyone newly marked present or late also gets these in their private commitment log. 0 gives none.</p></div>');
  return h;
};
/* The dashboard's check-in, with the points rows the classic page writes beside it. */
/* Points go only to those newly there (present or late), so re-saving a meeting never pays twice. */
ACT_EXT.attSave = function (el) {
  var pts = Math.max(0, Math.min(20, +O2.attPts || 0));
  attSaveMarks(el, function (ppl, label) {
    if (!pts || !ppl.length) return;
    /* 'a3' is the classic catalog's "General meeting attendance", so the classic absences view reads these as check-ins. */
    call('addPointsBulk', ppl.map(function (p) { return {MemberName: p.name, ActionId: 'a3', ActionLabel: label, Points: pts, Track: 'x', Org: p.org}; })).then(function (q) {
      if (!(q && q.ok)) toast('Saved, but the commitment points did not: ' + ((q && q.error) || 'no answer') + '.', true);
    });
  });
};
function o2dayOf(v) {
  var s = String(v || ''), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m && s.length <= 10) return m[0];
  var t = new Date(s); return isNaN(t.getTime()) ? (m ? m[0] : '') : isoDay(t);
}
/* Every event on the attendance tab, with its day (the earliest check-in) and who came. */
function o2meetings() {
  var ev = {}, size = M.people.length || 1;
  (RAW.all.attendance || []).forEach(function (r) {
    var e = String(r.EventLabel || ''); if (!e) return;
    var d = o2dayOf(r.Timestamp), m = ev[e] || (ev[e] = {label: e, day: d, who: {}});
    if (d && (!m.day || d < m.day)) m.day = d;
    m.who[flat(r.MemberName)] = 1;
  });
  return Object.keys(ev).map(function (k) { var m = ev[k]; m.club = Object.keys(m.who).length >= size * 0.25; return m; })
    .sort(function (a, b) { return String(a.day).localeCompare(String(b.day)); });
}
function o2absRows() {
  var A = O2.ab, ms = o2meetings();
  var days = ms.map(function (m) { return m.day; }).filter(Boolean).sort();
  if (!A.from) A.from = days[0] || today();
  if (!A.to) A.to = days.length && days[days.length - 1] > today() ? days[days.length - 1] : today();
  var pick = ms.filter(function (m) { return (!m.day || (m.day >= A.from && m.day <= A.to)) && (A.kind === 'all' || m.club); });
  var q = flat(A.q), min = Math.max(1, +A.min || 1);
  var rows = M.people.filter(function (p) { return p.role === 'member'; }).map(function (p) {
    var miss = 0, last = '';
    pick.forEach(function (m) { if (m.who[p.key]) { if (m.day > last) last = m.day; } else miss++; });
    return {p: p, missed: miss, of: pick.length, last: last};
  }).filter(function (r) { return r.missed >= min && (!q || r.p.key.indexOf(q) > -1); })
    .sort(function (a, b) { return b.missed - a.missed || a.p.name.localeCompare(b.p.name); });
  return {pick: pick, rows: rows, all: ms};
}
function o2absRange() {
  var A = O2.ab, x = o2absRows(), rows = x.rows;
  if (!x.all.length) return empty('No attendance yet', 'Take attendance at a meeting and absences show up here.');
  var h = '<section class="card form o2abs"><div class="o2absf"><label class="fld"><span>From</span><input id="o2abFrom" type="date" value="' + esc(A.from) + '"></label>' +
    '<label class="fld"><span>To</span><input id="o2abTo" type="date" value="' + esc(A.to) + '"></label>' +
    '<label class="fld"><span>Which events count</span><select data-act="o2abKind"><option value="club">Club meetings</option><option value="all"' + (A.kind === 'all' ? ' selected' : '') + '>Every event</option></select></label>' +
    '<label class="fld"><span>Missed at least</span><input type="number" data-act="o2abMin" min="1" max="99" value="' + esc(A.min) + '"></label></div>' +
    '<label class="search">' + icon('search') + '<input id="o2abQ" type="search" placeholder="Find a member" value="' + esc(A.q) + '"></label></section>';
  if (!x.pick.length) return h + empty('No events in that range', 'Widen the dates, or count every event.');
  h += '<section class="toolbar"><span class="meta o2grow">' + plural(x.pick.length, 'event') + ' from ' + esc(fmtDay(A.from)) + ' to ' + esc(fmtDay(A.to)) + ' · ' + plural(rows.length, 'member') + ' missed at least ' + esc(A.min) + '</span>' +
    (rows.length ? '<button class="btn sm ghost" data-act="copy" data-v="' + esc(rows.map(function (r) { return r.p.name; }).join(', ')) + '">Copy names</button>' +
      '<button class="btn sm ghost" data-act="o2absCsv">' + icon('upload') + 'Download CSV</button><button class="btn sm" data-act="o2absMsg">' + icon('send') + 'Message them</button>' : '') + '</section>';
  if (!rows.length) return h + empty('Nobody missed that many', '');
  var bad = function (r) { return r.missed >= Math.max(2, Math.ceil(r.of / 2)); };
  h += '<section class="card o2tblcard"><div class="o2tbl"><table><thead><tr><th>Member</th><th>' + esc(o2club().unit) + '</th><th class="n">Missed</th><th class="n">Of</th><th>Last checked in</th></tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr><td><button class="link" data-act="profile" data-key="' + esc(r.p.key) + '">' + esc(r.p.name) + '</button></td><td>' + esc(r.p.org) + '</td><td class="n' + (bad(r) ? ' o2bad' : '') + '">' + r.missed + '</td><td class="n">' + r.of + '</td>' +
        '<td>' + (r.last ? esc(fmtDay(r.last)) : '<span class="meta">not in this range</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div><p class="meta">Red marks missing half or more. Excused absences live on the Discord tickets; check them before acting.</p></section>';
  return h;
}
CHANGE_EXT.o2abKind = function (el, d, v) { O2.ab.kind = v; render(); };
CHANGE_EXT.o2abMin = function (el, d, v) { O2.ab.min = Math.max(1, +v || 1); render(); };
ACT_EXT.o2absCsv = function () {
  var x = o2absRows(), rows = [['Name', o2club().unit, 'Missed', 'Of', 'Last checked in']].concat(x.rows.map(function (r) { return [r.p.name, r.p.org, r.missed, r.of, r.last]; }));
  o2download(o2csvText(rows), 'absences-' + O2.ab.from + '-to-' + O2.ab.to + '.csv');
};
ACT_EXT.o2absMsg = function () {
  var x = o2absRows();
  compose({title: 'We have missed you at meetings', body: 'You have missed ' + (O2.ab.min > 1 ? O2.ab.min + ' or more' : 'some') + ' meetings lately. Let your EBOD contact know if something is getting in the way.',
           target: {tags: [], names: x.rows.map(function (r) { return r.p.name; })}});
};

/* ---- typing in the screens' own fields, without losing focus to a redraw ---- */
document.addEventListener('input', function (e) {
  var t = e.target, id = t.id;
  var redraw = function (key) {
    clearTimeout(O2.inT);
    O2.inT = setTimeout(function () { render(); var i = $(key); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (er) {} } }, 160);
  };
  if (id === 'o2q') { O2.f.q = t.value; redraw('o2q'); }
  else if (id === 'o2abQ') { O2.ab.q = t.value; redraw('o2abQ'); }
  else if (id === 'o2sheet') DR.sheetUrl = t.value;
  else if (id === 'o2paste') DR.paste = t.value;
  else if (id === 'o2ncCode') DR.nc.code = t.value.trim().toLowerCase();
  else if (id === 'o2ncName') DR.nc.name = t.value;
  else if (id === 'o2ncJoin') DR.nc.join = t.value;
  else if (id === 'o2attpts') O2.attPts = Math.max(0, Math.min(20, +t.value || 0));
  else if (id === 'o2n') {
    DR.n = parseInt(t.value, 10) || ''; DR.touched = true;
    var r = o2buildPeople(), hint = $('o2nhint'); if (hint) hint.textContent = o2sizeHint(r.people.length, DR.n);
  }
});
document.addEventListener('change', function (e) {
  var t = e.target;
  if (t.id === 'o2mbti') DR.mbti = t.checked;
  else if (t.id === 'o2abFrom' || t.id === 'o2abTo') { O2.ab[t.id === 'o2abFrom' ? 'from' : 'to'] = t.value; render(); }
  else if (t.id === 'o2file' && t.files && t.files[0]) {
    var f = t.files[0], fr = new FileReader();
    fr.onload = function () { o2ingest(o2parseCSV(String(fr.result)), f.name); };
    fr.onerror = function () { o2say('Could not read that file.', true); };
    fr.readAsText(f);
  }
});

/* ---- the Officer tools cards that pointed at the classic page ---- */
TOOLS.forEach(function (t) {
  if (t[0] === 'Draft Orgs') t[2] = '#orgs/draft';
  if (t[0] === 'Hand-in review') t[2] = '#homework/review';
});

/* The master picks which club a draft lands in; the list is read once. */
BOOT_EXT.push(function () {
  if (M && M.master && !DEMO) call('listAffiliations').then(function (r) { if (r && r.ok) DR.affs = r.affiliations || []; });
});

/* ================= DEMO: answers for the actions above, kept in the demo club ================= */
(function () {
  var trackLabelOf = function (s, v) {
    var t = (s.cfg.tracks || []).filter(function (x) { return x.id === v || x.label === v; })[0];
    return t ? t.label : v === O2_FLEX || !v ? 'Not sure yet' : String(v);
  };
  var who = function (s, name) { return s.people.filter(function (p) { return flat(p.name) === flat(name); })[0]; };
  /* The demo's club record grows a notice and a recognition the first time, and each Teams row a Focus and lead flag. */
  var base = DEMO_EXT.getAll;
  DEMO_EXT.getAll = function (pl, s, officer, me, store) {
    if (!s.o2) {
      s.o2 = 1;
      if (!s.cfg.board) s.cfg.board = [{id: 'n1', text: 'Bootcamp 2 photos are up in the chapter Drive. Find yourself and tag your Org.', by: 'Ruirui', at: Date.now() - 2 * 864e5}];
      if (!s.cfg.recognitions) { s.cfg.recognitions = {}; s.cfg.recognitions[o2normName(s.people[2].name)] = [{id: 'r1', label: 'Member of the Month, October', at: Date.now() - 4 * 864e5, by: 'Derick'}]; }
      s.people.forEach(function (p, j) { if (p.track === 'Polaris' && j % 3 === 0) p.focus = 'c'; });
      store();
    }
    var r;
    if (base) r = base(pl, s, officer, me, store);
    else { var cur = DEMO_EXT.getAll; delete DEMO_EXT.getAll; try { r = Demo.answer('getAll', pl); } finally { DEMO_EXT.getAll = cur; } }
    if (r && r.teams) r.teams.forEach(function (row) {
      var p = who(s, row.MemberName); if (!p) return;
      row.Focus = p.focus || ''; row.IsLead = flat(p.name) === flat(s.member) ? 'yes' : '';
      if (officer && p.note) row.Notes = p.note;
    });
    return r;
  };
  DEMO_EXT.setTeams = function (pl, s, officer, me, store) {
    if (!officer) return {ok: false, error: 'Officers only.'};
    var rows = pl && pl.__patch ? (pl.up || []).map(function (u) { return u.row; }) : (pl || []);
    if (!(pl && pl.__patch)) {
      s.people.forEach(function (p) { p.org = ''; });
      var pos = {}; rows.forEach(function (r, i) { if (r && r.MemberName) pos[flat(r.MemberName)] = i; });
      s.people = s.people.map(function (p, i) { return {p: p, i: i}; }).sort(function (a, b) {
        var x = pos[flat(a.p.name)], y = pos[flat(b.p.name)];
        return (x == null ? 1e6 + a.i : x) - (y == null ? 1e6 + b.i : y);
      }).map(function (o) { return o.p; });
    }
    rows.forEach(function (row) {
      if (!row || !row.MemberName) return;
      var p = who(s, row.MemberName);
      if (!p) { p = {name: o2capName(row.MemberName), email: '', year: 1, track: 'Not sure yet', mbti: '', avail: '', org: '', lead: false, answered: true, prefs: null}; s.people.push(p); }
      if (row.Org !== undefined) p.org = String(row.Org);
      if (row.Focus !== undefined) p.focus = o2normFocus(row.Focus);
      if (row.Year !== undefined) p.year = (parseInt(row.Year, 10) || 1) >= 2 ? 2 : 1;
      if (row.Track !== undefined) p.track = trackLabelOf(s, row.Track);
      if (row.MBTI) p.mbti = String(row.MBTI);
      if (row.Notes !== undefined) p.note = String(row.Notes || '');
    });
    store();
    return {ok: true, wrote: rows.length};
  };
  DEMO_EXT.setOrgName = function (pl, s, officer, me, store) {
    var from = String(pl.from || ''), to = clean(pl.to, 60).trim();
    if (!from || !to) return {ok: false, error: 'Both names are required.'};
    if (!officer && !(me === flat(s.member) && (who(s, s.member) || {}).org === from)) return {ok: false, error: 'Only an officer or a lead of that Org can rename it.'};
    var n = 0; s.people.forEach(function (p) { if (p.org === from) { p.org = to; n++; } });
    s.cfg.work.forEach(function (w) { if (w.orgName === from) w.orgName = to; });
    store(); return {ok: true, renamed: to, rows: n};
  };
  DEMO_EXT.forkClub = function () { return {ok: false, error: 'Only the master account can start a new club.'}; };
  DEMO_EXT.listAffiliations = function () { return {ok: true, affiliations: [{code: 'demo', name: 'De Anza PBL (demo)'}]}; };
  DEMO_EXT.listSubmissions = function (pl, s, officer) {
    if (!officer) return {ok: false};
    return {ok: true, submissions: s.subs.map(function (x) {
      var w = s.cfg.work.filter(function (y) { return y.id === x.workId; })[0] || {}, link = w.kind === 'link';
      return Object.assign({workTitle: w.title || '', fileName: link ? 'Google Doc' : (w.title || 'Work') + ' - ' + x.name + '.pdf',
                            fileUrl: link ? 'https://docs.google.com/document/u/0/' : 'https://drive.google.com/drive/my-drive', status: 'submitted', points: null}, x);
    })};
  };
  DEMO_EXT.reviewSubmission = function (pl, s, officer, me, store) {
    if (!officer) return {ok: false, error: 'Officers only.'};
    var x = s.subs.filter(function (u) { return u.workId === pl.workId && flat(u.name) === flat(pl.name); })[0];
    if (!x) return {ok: false, error: 'No submission from that member.'};
    x.status = pl.status || 'checked'; x.reviewedBy = 'Demo Officer';
    var given = pl.points !== '' && pl.points != null, pts = given ? Math.max(0, Math.min(999, +pl.points || 0)) : 0;
    if (given) x.points = pts;
    if (pts) (s.points = s.points || []).push({MemberName: x.name, ActionLabel: 'Assignment', Points: pts});
    store(); return {ok: true, status: x.status, points: pts};
  };
  DEMO_EXT.reviewSubmissions = function (pl, s, officer, me, store) {
    if (!officer) return {ok: false, error: 'Officers only.'};
    var want = {}, n = 0; (pl.names || []).forEach(function (x) { want[flat(x)] = 1; });
    s.subs.forEach(function (u) { if (u.workId === pl.workId && want[flat(u.name)] && u.status !== 'checked') { u.status = 'checked'; n++; } });
    store(); return {ok: true, checked: n};
  };
  DEMO_EXT.addPointsBulk = function (pl, s, officer, me, store) {
    if (!officer) return {ok: false, error: 'Officers only.'};
    (s.points = s.points || []).push.apply(s.points, (pl || []).map(function (r) { return {MemberName: r.MemberName, ActionLabel: r.ActionLabel, Points: +r.Points || 0}; }));
    store(); return {ok: true, wrote: (pl || []).length};
  };
  DEMO_EXT.memberCard = function (pl, s, officer, me) {
    var p = who(s, pl.name); if (!p) return {ok: false, error: 'No such member in this club.'};
    var full = officer || flat(p.name) === me, mine = (s.points || []).filter(function (r) { return flat(r.MemberName) === flat(p.name); });
    var handed = s.subs.filter(function (x) { return flat(x.name) === flat(p.name); }).length;
    return {ok: true, full: full, member: {name: p.name, org: p.org, track: p.track, mbti: full ? p.mbti : '', lead: '', notes: officer ? (p.note || '') : '',
            points: full ? handed * 3 + mine.reduce(function (a, r) { return a + r.Points; }, 0) : null, entries: full ? handed + mine.length : null, photo: null}};
  };
  DEMO_EXT.syncMemberDrives = function (pl, s, officer) {
    if (!officer) return {ok: false, error: 'Officers only.'};
    return {ok: true, processed: s.people.length, remaining: 0, failed: [], total: s.people.length, folders: s.people.length, rootUrl: 'https://drive.google.com/drive/my-drive'};
  };
})();
