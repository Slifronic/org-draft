/* The dashboard's data layer (/dash). It talks to the same Apps Script
   backend as the classic page, with the same sign-in (the session the classic
   page keeps in this browser), and turns what comes back into people with
   tags. Nothing here decides what anyone may see: the backend already trims
   what a member's browser gets, and re-checks every write. */
'use strict';

var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycby1mYJ3PlDt2YlCnGGRLZqQSrW5o1sBvB4xjpjJBgyo4Rhmk7VegwAiSw2WRKBpcDyfXQ/exec';
var KEYS = {session: 'orgsystem.session', gtok: 'orgsystem.gtok', aff: 'orgsystem.aff', theme: 'orgsystem.theme',
            seen: 'orgsystem.dash.seen', nav: 'orgsystem.dash.nav', dtheme: 'orgsystem.dash.theme', size: 'orgsystem.dash.size', motion: 'orgsystem.dash.motion',
            boot: 'orgsystem.dash.boot', linked: 'orgsystem.dash.linked'};
var RANK = {none: 0, member: 1, admin: 2, master: 3};
var DEMO = /(^|[?&])demo(=|&|$)/.test(location.search) || /^\/demo\/?$/.test(location.pathname);

/* ---------- small helpers ---------- */
function $(id) { return document.getElementById(id); }
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
  });
}
function flat(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function safeUrl(v) { var u = String(v == null ? '' : v).trim(); return /^https?:\/\//i.test(u) ? u : ''; }
function clean(v, n) { return String(v == null ? '' : v).replace(/[<>]/g, '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').slice(0, n || 200); }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function isoDay(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function parseDay(s) { var p = String(s || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
function at(day, time) {
  var d = parseDay(day); if (!d) return null;
  var t = String(time || '').split(':');
  if (t.length === 2) d.setHours(+t[0], +t[1]);
  return d;
}
function fmtDay(s, long) {
  var d = parseDay(s); if (!d) return '';
  return d.toLocaleDateString(undefined, long ? {weekday: 'long', month: 'long', day: 'numeric'} : {weekday: 'short', month: 'short', day: 'numeric'});
}
function fmtTime(t) {
  if (!t) return '';
  var p = t.split(':'), h = +p[0], m = p[1];
  return ((h % 12) || 12) + (m === '00' ? '' : ':' + m) + (h < 12 ? ' am' : ' pm');
}
function fmtSpan(it) {
  if (!it.start) return 'Time to be set';
  return fmtTime(it.start) + (it.end ? '–' + fmtTime(it.end) : '');
}
function ago(iso) {
  var t = new Date(iso).getTime(); if (isNaN(t)) return '';
  var s = (Date.now() - t) / 1000;
  if (s < 0) { var a = -s; return a < 3600 ? 'in ' + Math.round(a / 60) + ' min' : a < 86400 ? 'in ' + Math.round(a / 3600) + ' h' : 'in ' + Math.round(a / 86400) + ' d'; }
  return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago';
}
function plural(n, w, ws) { return n + ' ' + (n === 1 ? w : (ws || w + 's')); }
function today() { return isoDay(new Date()); }

/* ---------- SFBLC 2026: what is known for certain ----------
   From CAPBL's "SFBLC 2026 General Conference Info". The programs packet
   (schedule, workshops, socials), the competition agenda and the case prompts
   were still to come, so the starter schedule is days without times, marked
   tentative, for EBOD to fill in. */
var SFBLC = {
  info: {name: 'SFBLC 2026', full: 'State Fall Business Leadership Conference', start: '2026-11-13', end: '2026-11-15',
         venue: 'Hilton Garden Inn San Francisco/Oakland Bay Bridge', city: 'Emeryville, CA', site: 'https://capbl.org',
         note: 'Each event’s guidelines and rating sheet are linked under Events. For anything CAPBL changes, check capbl.org.'},
  /* Event names as the classic page's FLC preferences already use them, so
     members' ranked choices keep matching. "Marketing" is Marketing, Sales &
     Communication. Accounting and Business Ethics are not offered this year. */
  events: ['Finance', 'Marketing', 'Management', 'Entrepreneurship Pitch', 'Impromptu Speaking', 'STRIIVE'],
  caps: {'Finance': [1, 4], 'Marketing': [1, 4], 'Management': [1, 4], 'Entrepreneurship Pitch': [1, 4],
         'Impromptu Speaking': [1, 1], 'STRIIVE': [1, 2]},
  eventNote: {'Marketing': 'Marketing, Sales & Communication case', 'STRIIVE': 'TEDx-style talk, 8–10 min, solo or duo',
              'Impromptu Speaking': 'Individual', 'Entrepreneurship Pitch': 'Presentation event'},
  /* Each event's guidelines from CAPBL (Oct 9), which end with the rating sheet judges use; kept in the club's Drive. */
  rubrics: {'Finance': 'https://drive.google.com/file/d/1T241fHZgMAQ1ze6Q_P-Do0UDlK_Z1-_d/view',
            'Marketing': 'https://drive.google.com/file/d/1Hg7QXq-8PjTcdGTWszziCV0IL1Uh17_R/view',
            'Management': 'https://drive.google.com/file/d/1aucGjgs6Gd5zohRDUwKLd7WKoO7rtGW6/view',
            'Entrepreneurship Pitch': 'https://drive.google.com/file/d/1oXcLTv6tKqWERk2RXQ35KZQQRARICcT0/view',
            'Impromptu Speaking': 'https://drive.google.com/file/d/1wPGNWLejpfmfa2uCpeVuqmtOdr3488_8/view'},
  starter: function () {
    var all = {tags: ['sfblc']};
    return {
      sfSchedule: [
        {id: 's-fri', date: '2026-11-13', start: '', end: '', title: 'Arrive, check in and opening session', where: 'Hilton Garden Inn, Emeryville', kind: 'general', tentative: true, 'for': all},
        {id: 's-sat', date: '2026-11-14', start: '', end: '', title: 'Competition day (agenda to come)', where: 'Hilton Garden Inn, Emeryville', kind: 'comp', tentative: true, 'for': all},
        {id: 's-sun', date: '2026-11-15', start: '', end: '', title: 'Awards and closing, then home', where: 'Hilton Garden Inn, Emeryville', kind: 'general', tentative: true, 'for': all}
      ],
      sfChecklist: [
        {id: 'c-reg', label: 'Registered on CAPBL', due: '2026-10-30', detail: 'Late registration closes Fri Oct 30 at 5 pm, and only while housing lasts.', 'for': all},
        {id: 'c-push', label: 'Phone notifications on', due: '', detail: 'Open the Org System from its home-screen icon, then Profile → Phone notifications.', 'for': all},
        {id: 'c-prompt', label: 'Read your case prompt and rubric', due: '', detail: 'Once CAPBL releases them.', 'for': all},
        {id: 'c-attire', label: 'Business professional outfit ready', due: '2026-11-12', detail: '', 'for': all}
      ],
      sfCoaching: [],
      sfInfo: {caps: SFBLC.caps},
      sfAuto: {on: false, dayBefore: true, hourBefore: true, checklist: true, teams: true}
    };
  }
};

/* ---------- talking to the backend ---------- */
function creds() {
  var s = lsGet(KEYS.session);
  if (s) return {session: s};
  try {
    var v = JSON.parse(lsGet(KEYS.gtok) || 'null');
    if (v && v.t && v.exp && v.exp * 1000 - Date.now() > 60000) return {token: v.t};
  } catch (e) {}
  return null;
}
var NET = 0;
function call(action, payload, tries) {
  if (DEMO) return Promise.resolve(Demo.answer(action, payload || {}));
  var c = creds();
  if (!c) return Promise.resolve(null);
  var body = Object.assign({action: action, payload: payload || null}, c);
  var aff = lsGet(KEYS.aff); if (aff) body.aff = aff;
  NET++; document.body.classList.add('busy');
  return fetch(WEBAPP_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(body)})
    .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    .then(function (v) {
      NET = Math.max(0, NET - 1); if (!NET) document.body.classList.remove('busy');
      var busy = v && v.ok === false && /\bbusy\b/i.test(String(v.error || ''));
      if ((busy || !v) && (tries || 0) < 2)
        return new Promise(function (res) { setTimeout(res, 700 + Math.random() * 900); }).then(function () { return call(action, payload, (tries || 0) + 1); });
      return v;
    });
}
/* Several read-only actions in one request (Code.gs batch): each web-app call
   costs two to three seconds before it does anything. Resolves to one answer
   per call, in order. A backend without batch gets them sent one by one. */
var BATCH_OFF = false;
function callBatch(list) {
  var each = function () { return Promise.all(list.map(function (c) { return call(c.action, c.payload); })); };
  if (DEMO || BATCH_OFF) return each();
  return call('batch', list).then(function (r) {
    if (r && r.ok && Array.isArray(r.results)) return r.results;
    if (r && /unknown action/i.test(String(r.error || ''))) BATCH_OFF = true;
    return null;
  });
}
/* A short fingerprint of who is signed in on this device, so a copy kept for
   one account is never shown to another. */
function whoKey() {
  var s = lsGet(KEYS.session) || '', g = '';
  if (!s) try { var v = JSON.parse(lsGet(KEYS.gtok) || 'null'); g = v && v.t && typeof jwtPeek === 'function' ? String(jwtPeek(v.t).email || '') : ''; } catch (e) {}
  var t = (s ? 's:' + s : g ? 'g:' + g : '') + '|' + (lsGet(KEYS.aff) || ''), h = 5381;
  if (t.length < 3) return '';
  for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/* The same item-by-item save the classic page sends, so two officers editing
   at once keep each other's changes (see setConfig in Code.gs). */
function cfgPatch(cur, base) {
  var set = {}, was = {}, del = [], items = {}, any = false;
  var idList = function (v) { return Array.isArray(v) && v.every(function (x) { return x && typeof x === 'object' && x.id !== undefined && x.id !== ''; }); };
  Object.keys(cur).forEach(function (k) {
    var a = cur[k], b = base[k];
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    any = true;
    if (idList(a) && idList(b)) {
      var bm = {}, bo = {}; b.forEach(function (x) { bm[String(x.id)] = JSON.stringify(x); bo[String(x.id)] = x; });
      var am = {}; a.forEach(function (x) { am[String(x.id)] = 1; });
      var up = a.filter(function (x) { return bm[String(x.id)] !== JSON.stringify(x); }), w = {};
      up.forEach(function (x) { if (bo[String(x.id)]) w[String(x.id)] = bo[String(x.id)]; });
      items[k] = {up: up, was: w, rm: b.filter(function (x) { return !am[String(x.id)]; }).map(function (x) { return x.id; }),
                  order: a.map(function (x) { return x.id; })};
    } else { set[k] = a; if (k in base) was[k] = b; }
  });
  Object.keys(base).forEach(function (k) { if (!(k in cur)) { del.push(k); any = true; } });
  return any ? {__patch: 1, set: set, was: was, del: del, items: items} : null;
}

/* ---------- the model ---------- */
var M = null;          // what the screens draw from
var RAW = null;        // what the backend last said
var BASE = null;       // the club record as last read or saved

function yearOf(v) { return /2/.test(String(v || '')) ? 2 : (String(v || '').trim() ? 1 : 0); }
function trackLabel(cfg, v) {
  var s = String(v || ''), t = ((cfg && cfg.tracks) || []).filter(function (x) { return x && (x.id === s || x.label === s); })[0];
  return t ? t.label : s;
}
function parsePrefs(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v) || {}; } catch (e) { return {}; }
}
function eventList(cfg) {
  return (cfg.flcEvents && cfg.flcEvents.length) ? cfg.flcEvents.slice() : SFBLC.events.slice();
}
function capFor(cfg, ev) {
  var c = ((cfg.sfInfo || {}).caps || {})[ev] || SFBLC.caps[ev] || [1, 4];
  return {min: +c[0] || 1, max: +c[1] || 4};
}

function build(raw) {
  var all = raw.all || {}, cfg = all.config || {};
  var officer = RANK[all.role] >= RANK.admin;
  var byKey = {};
  var person = function (name) {
    var k = flat(name); if (!k) return null;
    return byKey[k] || (byKey[k] = {key: k, name: String(name).trim(), email: '', role: 'member', year: 0, track: '', mbti: '',
      avail: [], lead: false, org: '', prefs: {}, notes: '', teams: [], events: [], clients: [], answered: null,
      hw: {missing: [], late: []}, absent: 0, meetings: 0, reach: null, custom: [], room: null});
  };
  if (raw.roster && raw.roster.roster) raw.roster.roster.forEach(function (u) {
    if (u.isMaster) return;
    var p = person(((u.first || '') + ' ' + (u.last || '')).trim()); if (!p) return;
    p.email = String(u.email || '').toLowerCase(); p.role = u.role || 'member';
    p.year = yearOf(u.year); p.track = trackLabel(cfg, u.track); p.mbti = u.mbti || '';
    p.avail = String(u.avail || '').split(/\s*[,;]\s*/).filter(Boolean);
    p.prefs = parsePrefs(u.prefs); p.notes = u.notes || '';
    p.answered = !!(u.year || u.track);
  });
  (all.memberNames || []).forEach(function (n) { person(n); });
  (all.teams || []).forEach(function (r) {
    var p = person(r.MemberName); if (!p) return;
    p.org = String(r.Org || '');
    if (!p.year) p.year = yearOf(r.Year);
    if (!p.track) p.track = trackLabel(cfg, r.Track);
    if (!p.mbti && r.MBTI) p.mbti = String(r.MBTI);
    if (r.Availability && !p.avail.length) p.avail = String(r.Availability).split(/\s*[,;]\s*/).filter(Boolean);
    p.lead = /^(y|yes|true|1)/i.test(String(r.LeadInterest || ''));
  });
  var me = person(all.name || all.email || 'You');
  if (all.me && all.me.prefs) me.prefs = parsePrefs(all.me.prefs);
  if (all.me) me.answered = !!all.me.formSent;

  var teams = (cfg.teams || []).filter(function (t) { return t && t.id; });
  teams.forEach(function (t) {
    (t.members || []).forEach(function (m) {
      var p = byKey[flat(m)] || person(m); if (!p) return;
      p.teams.push(t);
      if (t.kind === 'flc' && t.event) p.events.push(t.event);
      if (t.client) p.clients.push(t.client);
    });
  });
  (cfg.rooms || []).forEach(function (r) {
    (r.members || []).forEach(function (m) { var p = byKey[flat(m)]; if (p) p.room = r; });
  });
  var tagsMap = cfg.memberTags || {};
  Object.keys(byKey).forEach(function (k) { byKey[k].custom = (tagsMap[k] || []).slice(); });

  /* Homework: what was due before today for each person and is not in, or came in late. */
  if (raw.subs && raw.subs.submissions) {
    var first = {};
    raw.subs.submissions.forEach(function (s) { first[s.workId + '|' + flat(s.name)] = new Date(s.first || s.at).getTime(); });
    var t0 = today();
    (cfg.work || []).filter(function (w) { return w && w.id && w.due && w.due < t0; }).forEach(function (w) {
      var end = at(w.due, '23:59').getTime();
      Object.keys(byKey).forEach(function (k) {
        var p = byKey[k];
        if (p.role !== 'member') return;
        /* Teams are attached further down, so the team rule is checked against cfg.teams here. */
        if (w.team && w.team !== 'all') { var tm = teams.filter(function (t) { return t.id === w.team; })[0]; if (!tm || !(tm.members || []).some(function (m) { return flat(m) === k; })) return; }
        else if (w.orgName && p.org !== w.orgName) return;
        if (w.focus && FOCUS[w.focus] && focusOf(p) && focusOf(p) !== w.focus) return;
        var got = first[w.id + '|' + k];
        if (!got) p.hw.missing.push(w.title); else if (got > end) p.hw.late.push(w.title);
      });
    });
  }
  /* Meetings: an event counts as a club meeting once a quarter of the club
     was checked in to it, so a small committee session does not mark
     everybody else absent. */
  if (officer && all.attendance && all.attendance.length) {
    var ev = {};
    all.attendance.forEach(function (r) { var e = String(r.EventLabel || ''); (ev[e] = ev[e] || {})[flat(r.MemberName)] = 1; });
    var size = Object.keys(byKey).length || 1;
    var meetings = Object.keys(ev).filter(function (e) { return Object.keys(ev[e]).length >= size * 0.25; });
    Object.keys(byKey).forEach(function (k) {
      var p = byKey[k];
      p.meetings = meetings.length;
      p.absent = meetings.filter(function (e) { return !ev[e][k]; }).length;
    });
  }
  if (raw.msgs && raw.msgs.reach) Object.keys(byKey).forEach(function (k) { byKey[k].reach = !!raw.msgs.reach[k]; });

  var people = Object.keys(byKey).map(function (k) { return byKey[k]; })
    /* An officer who is not on the roster themselves (the club account) is not a member. */
    .filter(function (p) { return p === me ? !officer || !!(p.email || p.org || p.teams.length) : p.role !== 'master'; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  people.forEach(function (p) {
    p.going = p.events.length > 0 || p.prefs.attend === true;
    p.tags = tagsOf(p, cfg, officer);
  });

  /* Orgs, in the order the sheet lists them: the Org Cup's hand-awarded cups
     name an Org by that position (cups[].org), as on the classic page. */
  var orgNames = [];
  (all.teams || []).forEach(function (r) { var o = String(r.Org || ''); if (o && orgNames.indexOf(o) < 0) orgNames.push(o); });
  (all.orgBoard || []).forEach(function (b) { if (b.org && orgNames.indexOf(b.org) < 0) orgNames.push(b.org); });
  var orgs = orgNames.map(function (name, i) {
    var board = (all.orgBoard || []).filter(function (b) { return b.org === name; })[0] || {works: []};
    var earned = board.works.filter(function (w) { return w.of && w.got / w.of >= 0.8; });
    var hand = (cfg.cups || []).filter(function (c) { return +c.org === i; });
    var members = people.filter(function (p) { return p.org === name; });
    return {i: i, name: name, members: members, ebod: (cfg.orgEbod || [])[i] || '', works: board.works, earned: earned, hand: hand,
            cups: earned.length + hand.length, rate: board.works.length ? board.works.reduce(function (a, w) { return a + (w.of ? w.got / w.of : 0); }, 0) / board.works.length : null};
  });

  M = {officer: officer, master: all.role === 'master', role: all.role, me: me, cfg: cfg, people: people, byKey: byKey, teams: teams,
       orgs: orgs, gcal: (all.gcal && all.gcal.events) || [], calSynced: all.gcal ? all.gcal.syncedAt : 0, calFeedKey: all.calFeedKey || '',
       subs: (raw.subs && raw.subs.submissions) || [], profile: raw.profile || null, aff: all.aff || '', email: all.email || '',
       club: all.affName || cfg.clubName || 'The Org System', events: eventList(cfg),
       msgs: (raw.msgs && raw.msgs.msgs) || [], msgsReady: !!(raw.msgs && raw.msgs.ok), pushOn: raw.msgs ? !!raw.msgs.pushOn : null,
       mailLeft: raw.msgs ? raw.msgs.mailLeft : null, done: (raw.msgs && raw.msgs.done) || {},
       inbox: (raw.inbox && raw.inbox.msgs) || [], inboxReady: !!(raw.inbox && raw.inbox.ok), myDone: (raw.inbox && raw.inbox.done) || {},
       demo: DEMO};
  return M;
}

/* ---------- tags ----------
   Every tag has an id. The ones the backend can work out for itself (all,
   sfblc, yr, tr, org, team, ev, client, tag, name) are sent as they are, so a
   message scheduled for "ev:Finance" reaches whoever is on a Finance team
   when it goes out. The rest -- the gaps, availability, type -- are
   turned into names here, at the moment of sending. */
var SERVER_TAGS = {all: 1, sfblc: 1, yr: 1, tr: 1, org: 1, team: 1, ev: 1, client: 1, tag: 1, name: 1};
var GROUPS = {
  sfblc:  {label: 'SFBLC', tone: 'gold'},
  year:   {label: 'Year', tone: 'ink'},
  track:  {label: 'Track', tone: 'blue'},
  org:    {label: 'Org', tone: 'green'},
  client: {label: 'Consulting', tone: 'blue'},
  custom: {label: 'Officer tags', tone: 'plum'},
  avail:  {label: 'Available', tone: 'ink', officer: true},
  type:   {label: 'Type', tone: 'ink', officer: true},
  room:   {label: 'Rooming', tone: 'ink', officer: true},
  gap:    {label: 'Needs attention', tone: 'red', officer: true},
  linked: {label: 'From Drive & Discord', tone: 'plum', officer: true}
};
function tag(id, label, group, extra) { var t = {id: id, label: label, group: group}; if (extra) Object.assign(t, extra); return t; }
function tagsOf(p, cfg, officer) {
  var out = [];
  p.events.forEach(function (e) { out.push(tag('ev:' + e, e, 'sfblc')); });
  if (p.going) out.push(tag('sfblc', 'Going to SFBLC', 'sfblc', {quiet: true}));
  if (p.going && !p.events.length) out.push(tag('gap:unplaced', 'SFBLC · no team yet', 'gap'));
  if (p.year) out.push(tag('yr:' + p.year, p.year === 2 ? '2nd year' : '1st year', 'year'));
  if (p.track) out.push(tag('tr:' + p.track, p.track, 'track'));
  if (p.org) out.push(tag('org:' + p.org, p.org, 'org'));
  p.clients.forEach(function (c) { out.push(tag('client:' + c, c, 'client')); });
  p.custom.forEach(function (c) { out.push(tag('tag:' + c, c, 'custom')); });
  if (!officer) return out;
  if (p.lead) out.push(tag('lead', 'Wants to lead', 'custom'));
  if (p.mbti) out.push(tag('mbti:' + p.mbti.toUpperCase(), p.mbti.toUpperCase(), 'type'));
  p.avail.forEach(function (a) { out.push(tag('av:' + a, a, 'avail')); });
  if (p.prefs.group) out.push(tag('room:' + p.prefs.group, {w: "Women's room", m: "Men's room", x: 'All-gender room'}[p.prefs.group] || 'Room', 'room'));
  if (p.answered === false) out.push(tag('gap:form', 'No sign-up answers', 'gap'));
  if (p.hw.missing.length) out.push(tag('gap:hw', 'Missing homework', 'gap', {count: p.hw.missing.length}));
  if (p.hw.late.length) out.push(tag('gap:late', 'Late homework', 'gap', {count: p.hw.late.length}));
  if (p.absent >= 2) out.push(tag('gap:absent', 'Missed 2+ meetings', 'gap', {count: p.absent}));
  if (p.going && p.reach === false) out.push(tag('gap:push', 'No phone notifications', 'gap'));
  if (p.going && (cfg.rooms || []).length && !p.room) out.push(tag('gap:room', 'No hotel room', 'gap'));
  /* From the linked sheets (sources.js), once they have been read. */
  if (typeof LINKED !== 'undefined') (LINKED.tags[p.key] || []).forEach(function (t) { out.push(tag('ln:' + t.replace(/ ×\d+$/, ''), t, 'linked')); });
  /* Whether a verified Discord profile is linked to them (sources.js, read once from discordList). */
  if (typeof SYNC !== 'undefined' && SYNC.profiles && p.role === 'member') out.push(SYNC.linked[p.key] ? tag('dc:linked', 'Discord linked', 'linked') : tag('dc:none', 'No Discord link', 'linked'));
  return out;
}
function hasTag(p, id) {
  if (id === 'all') return true;
  if (id.indexOf('name:') === 0) return flat(id.slice(5)) === p.key;
  if (id.indexOf('team:') === 0) return p.teams.some(function (t) { return t.id === id.slice(5); });
  if (id === 'sfblc') return !!p.going;
  var f = flat(id);
  return (p.tags || []).some(function (t) { return flat(t.id) === f; });
}
/* target: {tags, names, every} -> people */
function resolve(target, people) {
  var t = target || {}, tags = t.tags || [], names = {};
  (t.names || []).forEach(function (n) { names[flat(n)] = 1; });
  if (!tags.length && !Object.keys(names).length) tags = ['all'];
  return (people || M.people).filter(function (p) {
    if (names[p.key]) return true;
    if (!tags.length) return false;
    return t.every ? tags.every(function (g) { return hasTag(p, g); }) : tags.some(function (g) { return hasTag(p, g); });
  });
}
/* What goes to the backend: tags it can resolve itself stay tags; the rest become names. */
function wireTarget(target) {
  var t = target || {}, keep = [], local = [];
  (t.tags || []).forEach(function (g) { (SERVER_TAGS[g.split(':')[0]] ? keep : local).push(g); });
  if (!local.length) return {tags: keep, names: t.names || [], every: !!t.every};
  /* A mix that needs names is sent as the names it means now. */
  return {tags: [], names: resolve(t).map(function (p) { return p.name; }), every: false};
}
function isForMe(item) {
  if (!item || !item['for']) return true;
  return resolve(item['for'], [M.me]).length > 0;
}
/* Every tag in use, grouped, with how many people carry it. */
function tagIndex(people) {
  var idx = {};
  (people || M.people).forEach(function (p) {
    (p.tags || []).forEach(function (t) {
      var x = idx[t.id] || (idx[t.id] = {id: t.id, label: t.label, group: t.group, n: 0});
      x.n++;
    });
  });
  var groups = {};
  Object.keys(idx).forEach(function (k) { var t = idx[k]; (groups[t.group] = groups[t.group] || []).push(t); });
  Object.keys(groups).forEach(function (g) { groups[g].sort(function (a, b) { return b.n - a.n || a.label.localeCompare(b.label); }); });
  return groups;
}
function tagLabel(id) {
  if (id === 'all') return 'Everyone';
  if (id === 'sfblc') return 'Going to SFBLC';
  if (id.indexOf('team:') === 0) { var t = M.teams.filter(function (x) { return x.id === id.slice(5); })[0]; return t ? teamName(t) : 'A team'; }
  if (id.indexOf('name:') === 0) return id.slice(5);
  for (var i = 0; i < M.people.length; i++) {
    var hit = (M.people[i].tags || []).filter(function (t) { return t.id === id; })[0];
    if (hit) return hit.label;
  }
  var p = id.split(':');
  return p[1] || p[0];
}
function teamName(t) { return t.kind === 'flc' ? (t.name || t.event) : (t.name || t.client || 'Team'); }

/* ---------- SFBLC data on the club record ---------- */
/* Members never see what officers keep to themselves: coaching slots (or a
   whole event's) that are hidden, and schedule rows marked for the board only. */
function sf(k) {
  var off = k === 'sfCoaching' && !M.officer ? (M.cfg.sfCoachOff || []) : null, board = k === 'sfSchedule' && !M.officer;
  return (M.cfg[k] || []).filter(function (x) { return x && x.id && !(off && (x.hidden || off.indexOf(x.event) > -1)) && !(board && x.board); });
}
function sfInfo() { return Object.assign({}, SFBLC.info, M.cfg.sfInfo || {}); }
function sfAuto() { return Object.assign({on: false, dayBefore: true, hourBefore: true, checklist: true, teams: true}, M.cfg.sfAuto || {}); }
function upcoming(mineOnly) {
  var now = Date.now();
  var items = sf('sfSchedule').map(function (x) { return {it: x, kind: 'schedule'}; })
    .concat(sf('sfCoaching').map(function (x) { return {it: x, kind: 'coaching'}; }));
  return items.filter(function (o) {
    var d = at(o.it.date, o.it.end || o.it.start || '23:59');
    return d && d.getTime() >= now && (!mineOnly || isForMe(o.it));
  }).sort(function (a, b) { return String(a.it.date + (a.it.start || '99')).localeCompare(String(b.it.date + (b.it.start || '99'))); });
}
function daysTo(day) { var d = parseDay(day); if (!d) return null; var t = parseDay(today()); return Math.round((d - t) / 864e5); }

/* ---------- gaps: what is missing before SFBLC ---------- */
function gaps() {
  var cfg = M.cfg, out = [], ppl = M.people;
  var going = ppl.filter(function (p) { return p.going; });
  var flcTeams = M.teams.filter(function (t) { return t.kind === 'flc'; });
  var add = function (sev, title, detail, action) { out.push({sev: sev, title: title, detail: detail, action: action}); };

  var evs = M.events, off = evs.filter(function (e) { return SFBLC.events.indexOf(e) < 0; });
  var miss = SFBLC.events.filter(function (e) { return evs.indexOf(e) < 0; });
  if (off.length || miss.length)
    add('high', 'The event list does not match SFBLC 2026',
        (off.length ? off.join(', ') + (off.length === 1 ? ' is' : ' are') + ' not offered this year. ' : '') +
        (miss.length ? miss.join(', ') + (miss.length === 1 ? ' is' : ' are') + ' missing, so nobody can rank or be placed in ' + (miss.length === 1 ? 'it' : 'them') + '.' : ''),
        {label: 'Use the SFBLC 2026 events', run: 'fixEvents'});

  var reg = sf('sfChecklist').filter(function (c) { return /regist/i.test(c.label); })[0];
  var dl = reg && reg.due ? daysTo(reg.due) : daysTo('2026-10-30');
  if (dl !== null && dl >= 0 && dl <= 7) {
    var doneN = reg ? (M.done[reg.id] || []).length : 0;
    add('high', 'Late registration closes ' + (dl === 0 ? 'today' : dl === 1 ? 'tomorrow' : 'in ' + dl + ' days') + ' (Fri Oct 30, 5 pm)',
        going.length + ' members plan to go' + (reg ? ', ' + doneN + ' have ticked "Registered"' : '') + '. Housing is only while it lasts.',
        {label: 'Remind them', run: 'composeReg'});
  }
  var unplaced = going.filter(function (p) { return !p.events.length; });
  if (unplaced.length) add('high', plural(unplaced.length, 'member') + ' going with no SFBLC team',
    unplaced.slice(0, 6).map(function (p) { return p.name; }).join(', ') + (unplaced.length > 6 ? '…' : ''), {label: 'Place them', go: 'teams'});
  evs.forEach(function (e) {
    var ts = flcTeams.filter(function (t) { return t.event === e; }), cap = capFor(cfg, e);
    var wants = ppl.filter(function (p) { return (p.prefs.flc || [])[0] === e; }).length;
    if (!ts.length && wants) add('mid', 'No ' + e + ' team yet', plural(wants, 'member') + ' ranked it first.', {label: 'Form teams', go: 'teams'});
    ts.forEach(function (t) {
      var n = (t.members || []).filter(Boolean).length;
      if (n > cap.max) add('high', teamName(t) + ' has ' + n + ' people', e + ' allows ' + cap.max + '.', {label: 'Fix team', go: 'teams'});
      else if (n < cap.min) add('mid', teamName(t) + ' is empty', '', {label: 'Fill team', go: 'teams'});
    });
    if (ts.length && (cfg.sfCoachOff || []).indexOf(e) < 0 && !sf('sfCoaching').some(function (c) { return (c['for'] && (c['for'].tags || []).indexOf('ev:' + e) > -1) || c.event === e; }))
      add('mid', 'No coaching session for ' + e, plural(ts.length, 'team') + ' and nothing on the coaching schedule.', {label: 'Add a session', run: 'addCoaching:' + e});
  });
  /* The SFBLC master sheet in Drive is where EBOD actually forms teams. */
  if (typeof LINKED !== 'undefined' && LINKED.data['sf-teams']) {
    var tab = LINKED.data['sf-teams'].tabs[0], n = tab ? tab.rows.filter(function (r) { return r.slice(2).some(function (x) { return String(x).trim(); }); }).length : 0;
    if (n && n !== flcTeams.length) add('high', 'The SFBLC master sheet has ' + plural(n, 'team') + '; the dashboard has ' + flcTeams.length, 'Import them so tags, messages and reminders follow the real teams.', {label: 'Import teams', run: 'importTeams'});
    var rtab = LINKED.data['sf-rooms'] && LINKED.data['sf-rooms'].tabs[0];
    if (rtab && rtab.rows.length && !(cfg.rooms || []).length) add('mid', 'Rooms are on the master sheet, not here', plural(rtab.rows.length, 'room') + ' to import.', {label: 'Import rooms', run: 'importRooms'});
  }
  if (!sf('sfSchedule').length) add('mid', 'No SFBLC schedule yet', 'Start from the known days and fill in times when CAPBL sends the programs packet.', {label: 'Load starter', run: 'starter'});
  else {
    var tent = sf('sfSchedule').filter(function (s) { return !s.start; }).length;
    if (tent) add('low', plural(tent, 'schedule item') + ' still without a time', 'Reminders only go out for items with a start time.', {go: 'sfblc'});
  }
  if (!sfAuto().on) add('mid', 'Automatic reminders are off', 'Turn them on and members hear about schedule items, coaching and checklist deadlines without anyone pressing send.', {label: 'Set up', go: 'messages/auto'});
  if (M.officer && !M.msgsReady) add('high', 'Messages need the backend update', 'Paste the new Code.gs into Apps Script and deploy a new version (docs/SETUP.md → Dashboard).', null);
  if (M.pushOn === false) add('mid', 'Phone notifications are not set up on the backend', 'Messages will only reach people by email until PUSH_SECRET is set.', null);
  var noPush = going.filter(function (p) { return p.reach === false; });
  if (M.pushOn && noPush.length) add('low', plural(noPush.length, 'SFBLC member') + ' cannot get phone notifications',
    'They have not turned them on. Email reaches them; so does a nudge.', {label: 'Nudge them', run: 'composePush'});
  if ((cfg.rooms || []).length) {
    var roomless = going.filter(function (p) { return !p.room; });
    if (roomless.length) add('mid', plural(roomless.length, 'member') + ' going without a hotel room', 'Place them on Teams → Hotel rooms.', {label: 'Open rooms', href: '/teams'});
  } else if (going.length && !(typeof LINKED !== 'undefined' && LINKED.data['sf-rooms'])) add('mid', 'No hotel rooms formed yet', plural(going.length, 'member') + ' need a bed. Form them on Teams → Hotel rooms.', {label: 'Open rooms', href: '/teams'});
  /* The member contract (pbl.js): who is up for a meeting or removal, and extensions waiting. */
  if (M.officer && typeof standingOf === 'function' && RAW) {
    var ms = meetingsInOrder(), st = ppl.filter(function (p) { return p.role === 'member'; }).map(function (p) { return standingOf(p, ms); });
    var rem = st.filter(function (x) { return x.level === 'removal'; }).length, meet = st.filter(function (x) { return x.level === 'meeting'; }).length;
    if (rem) add('high', plural(rem, 'member') + ' up for removal review', 'Under the member contract. Check their Discord attendance tickets before deciding.', {label: 'Review', go: 'standing'});
    if (meet) add('mid', plural(meet, 'member') + ' due a meeting with the President or VP', 'A second late assignment, or two unexcused meetings in a row.', {label: 'See who', go: 'standing'});
    var wx = STAND.ext.filter(function (x) { return x.status === 'waiting'; }).length;
    if (wx) add('mid', plural(wx, 'extension request') + ' waiting', '', {label: 'Answer', go: 'standing'});
  }
  /* Attendance tickets from the Discord bot (sources.js) that no officer has decided. */
  if (M.officer && typeof SYNC !== 'undefined' && SYNC.tickets) {
    var tw = SYNC.tickets.filter(ticketOpen).length;
    if (tw) add('mid', plural(tw, 'attendance ticket') + ' to decide', 'From the Discord bot. Each decision goes on the attendance sheet.', {label: 'Decide', go: 'attendance/absent'});
  }
  var noForm = ppl.filter(function (p) { return p.answered === false; });
  if (noForm.length) add('low', plural(noForm.length, 'member') + ' never sent the sign-up form', '', {label: 'See them', go: 'members?tag=gap:form'});
  var sz = JSON.stringify(cfg).length;
  if (sz > 40000) add('high', 'The club record is ' + Math.round(sz / 1000) + ' KB of 50', 'Google Sheets stops one cell at 50,000 characters. Trim old notices or schedule items.', null);
  var order = {high: 0, mid: 1, low: 2};
  return out.sort(function (a, b) { return order[a.sev] - order[b.sev]; });
}

/* ---------- homework ----------
   Who an assignment is for, the same rule as the classic page's hwMine and
   the backend's pushTargets_: one team, else one Org, else everyone, and
   then only members on its homework track (focus 'c' consulting, 'k' case
   competition) when it has one. */
var FOCUS = {c: 'Consulting', k: 'Case competition'};
function focusOf(p) {
  var t = flat(p && p.track);
  if (/consult/.test(t)) return 'c';
  if (/case|flc|compet/.test(t)) return 'k';
  return '';
}
function workFor(w, p) {
  if (!w || !p) return false;
  if (w.focus && FOCUS[w.focus] && focusOf(p) && focusOf(p) !== w.focus) return false;
  if (w.team && w.team !== 'all') return p.teams.some(function (t) { return t.id === w.team; });
  if (w.orgName) return p.org === w.orgName;
  return true;
}
function works() {
  return (M.cfg.work || []).filter(function (w) { return w && w.id && w.title; })
    .sort(function (a, b) { return String(a.due || '9999').localeCompare(String(b.due || '9999')); });
}
function workFor_(w) {
  if (w.team && w.team !== 'all') { var t = M.teams.filter(function (x) { return x.id === w.team; })[0]; return t ? teamName(t) : 'One team'; }
  if (w.orgName) return w.orgName;
  return w.focus && FOCUS[w.focus] ? FOCUS[w.focus] + ' track' : 'Everyone';
}
/* A member cannot list hand-ins, so this browser remembers what it sent (as
   the classic page does); officers see the real list. */
function handedKey(id) { return 'orgsystem.hw.' + (M.aff || 'demo') + '.' + id; }
function myHandIn(id) { return lsGet(handedKey(id)); }
function dueEnd(w) { return w.due ? at(w.due, '23:59') : null; }

/* ---------- calendar ----------
   Everything a member can see, in one list: the connected Google Calendar,
   events officers added here, the season's built-in dates (unless hidden),
   and the SFBLC schedule and coaching that are for them. */
var SEASON = [
  {id: 'f26-orient', title: 'IM orientation', date: '2026-10-15', cat: 'meet'},
  {id: 'f26-boot1', title: 'Bootcamp 1 + team formation', date: '2026-10-20', cat: 'meet'},
  {id: 'f26-boot2', title: 'Bootcamp 2: FLC / consulting split rooms', date: '2026-10-22', cat: 'meet'},
  {id: 'f26-mock', title: 'Mock case stations (week of Oct 27)', date: '2026-10-27', cat: 'comp'},
  {id: 'f26-flc1', title: 'SFBLC, Emeryville (day 1)', date: '2026-11-13', cat: 'comp', where: 'Emeryville'},
  {id: 'f26-flc2', title: 'SFBLC, Emeryville (day 2)', date: '2026-11-14', cat: 'comp', where: 'Emeryville'},
  {id: 'f26-flc3', title: 'SFBLC, Emeryville (day 3)', date: '2026-11-15', cat: 'comp', where: 'Emeryville'},
  {id: 'f26-final', title: 'Consulting finals', date: '2026-11-19', cat: 'comp'}
];
function calEvents(mineOnly) {
  var off = {};
  (M.cfg.seasonOff || []).forEach(function (id) { off[id] = 1; });
  var out = [];
  M.gcal.forEach(function (e) { out.push({id: e.id, gid: e.gid, title: e.title, date: e.date, end: e.end, time: e.time, where: e.where, src: 'gcal', hidden: !!e.hidden, rec: !!e.rec}); });
  (M.cfg.events || []).forEach(function (e) {
    if (!e || !e.date || (e.ebod && !M.officer)) return;
    if (out.some(function (x) { return x.gid && x.gid === e.gid; })) return;
    out.push({id: e.id, title: e.title, date: e.date, time: e.time || '', where: e.where || '', src: 'club', cat: e.cat, ebod: !!e.ebod});
  });
  SEASON.forEach(function (e) {
    /* A hidden season date stays on officers' calendars (marked), so they can show it again from there. */
    if ((off[e.id] && !M.officer) || out.some(function (x) { return x.date === e.date && flat(x.title).indexOf(flat(e.title).slice(0, 8)) > -1; })) return;
    out.push(Object.assign({src: 'season', hidden: !!off[e.id]}, e));
  });
  sf('sfSchedule').concat(sf('sfCoaching')).forEach(function (it) {
    if (mineOnly && !isForMe(it)) return;
    out.push({id: it.id, title: it.title || it.topic, date: it.date, time: it.start ? fmtTime(it.start) : '', where: it.where || '', src: it.topic ? 'coaching' : 'sfblc'});
  });
  (M.cfg.work || []).forEach(function (w) {
    if (w && w.due && (!mineOnly || workFor(w, M.me) || M.officer)) out.push({id: 'due-' + w.id, title: 'Due: ' + w.title, date: w.due, time: '11:59 pm', src: 'due'});
  });
  out.forEach(function (e) { e.min = tmin(e.time); if (e.min >= 0) e.time = fmtTime(pad2(Math.floor(e.min / 60)) + ':' + pad2(e.min % 60)); });
  return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.min - b.min; });
}
/* Minutes after midnight from "6:30 pm", "7 PM" or "18:30"; -1 for all-day. */
function tmin(t) {
  var m = String(t || '').match(/(\d{1,2})(?::(\d{2}))?\s*([ap])?/i);
  if (!m) return -1;
  var h = +m[1] % (m[3] ? 12 : 24) + (m[3] && /p/i.test(m[3]) ? 12 : 0);
  return h * 60 + (+m[2] || 0);
}
function gcalLink(e) {
  /* All-day, as the page does not know every event's end time. */
  var next = parseDay(e.end || e.date); next.setDate(next.getDate() + 1);
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.title) +
    '&dates=' + String(e.date).replace(/-/g, '') + '/' + isoDay(next).replace(/-/g, '') + (e.where ? '&location=' + encodeURIComponent(e.where) : '');
}
