/* The dashboard's demo (/dash?demo, /dash?demo&as=member). A made-up club two
   weeks before SFBLC, answering every backend call in memory. Nothing is sent
   or saved anywhere; it lasts for this browser tab. */
'use strict';

var Demo = (function () {
  var KEY = 'orgsystem.dash.demo.v1';
  var AS = (location.search.match(/[?&]as=([a-z]+)/) || [])[1] || 'officer';
  var S = null;

  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function day(offset) { var d = new Date(); d.setDate(d.getDate() + offset); return isoDay(d); }

  function seed() {
    var r = rng(20261113);
    var pick = function (a) { return a[Math.floor(r() * a.length)]; };
    var first = 'Alex,Priya,Marcus,Jenna,Diego,Amara,Kevin,Sofia,Tuan,Rachel,Omar,Lila,Ethan,Nina,Carlos,Maya,Ravi,Grace,Malik,Leah,Jonah,Ivy,Andre,Bella,Hugo,Zara,Felix,Nora,Kai,Rosa,Simon,Talia,Victor,Wren,Yara,Zane,Anya,Cleo,Dev,Esme,Finn,Gia,Hana,Juno,Kira,Leo,Mila,Nash,Opal,Quinn,Sage,Theo,Uma,Vera,Wes,Yuki,Zoe,Abel,Brie,Cyrus'.split(',');
    var last = 'Nguyen,Shah,Lee,Alvarez,Kim,Patel,Okafor,Torres,Vu,Brooks,Haddad,Chen,Romero,Silva,Mendez,Osei,Park,Diaz,Kaur,Wolfe,Ali,Novak,Reyes,Sato,Kelly,Ibarra,Duarte,Tran'.split(',');
    var tracks = ['Consulting', 'Consulting', 'Consulting', 'Case competition (FLC)', 'Case competition (FLC)', 'Polaris', 'Not sure yet'];
    var avail = ['Mon/Wed evenings', 'Tue/Thu afternoons', 'Tue/Thu evenings', 'Fri afternoons', 'Weekends'];
    var orgs = ['Redwood', 'Cypress', 'Juniper', 'Sequoia', 'Aspen', 'Willow'];
    var evs = SFBLC.events;
    var people = [];
    for (var i = 0; i < 60; i++) {
      var nm = first[i] + ' ' + pick(last);
      var tr = tracks[Math.floor(r() * tracks.length)];
      var p = {name: nm, email: nm.toLowerCase().replace(/\s+/g, '.') + '@demo.example', year: i < 24 ? 2 : 1, track: tr,
               mbti: (r() < .6 ? 'E' : 'I') + (r() < .58 ? 'N' : 'S') + (r() < .56 ? 'T' : 'F') + (r() < .62 ? 'J' : 'P'),
               avail: [avail[i % 5], r() < .4 ? avail[(i + 2) % 5] : ''].filter(Boolean).join(', '),
               org: orgs[i % orgs.length], lead: i < 24 && r() < .3, answered: i !== 41 && i !== 52, prefs: null};
      if (tr === 'Case competition (FLC)' || (tr !== 'Consulting' && r() < .5) || (tr === 'Consulting' && r() < .25)) {
        var ranked = evs.slice().sort(function () { return r() - .5; });
        if (i % 7 === 0) ranked.unshift(ranked.splice(ranked.indexOf('Finance'), 1)[0]);
        p.prefs = {flc: ranked.slice(0, 3), attend: r() > .05, group: r() < .5 ? 'w' : (r() < .9 ? 'm' : 'x'), roomies: []};
      }
      people.push(p);
    }
    var going = people.filter(function (p) { return p.prefs && p.prefs.attend; });
    /* SFBLC teams from first choices, leaving a few unplaced and STRIIVE empty on purpose. */
    var teams = [], tn = 0;
    var cap = {'Finance': 4, 'Marketing': 4, 'Management': 4, 'Entrepreneurship Pitch': 3, 'Impromptu Speaking': 1, 'STRIIVE': 0};
    var made = {};
    going.forEach(function (p, j) {
      if (j % 9 === 4) return;                       // left for the officer to place
      var e = p.prefs.flc.filter(function (x) { return cap[x]; })[0];
      if (!e) return;
      var list = teams.filter(function (t) { return t.event === e && t.members.length < cap[e]; });
      var t = list[0];
      if (!t) {
        if ((made[e] || 0) >= (e === 'Impromptu Speaking' ? 2 : 2)) return;
        made[e] = (made[e] || 0) + 1;
        t = {id: 'demo-flc-' + (++tn), kind: 'flc', event: e, name: e + ' ' + made[e], members: [], track: 'k', client: '', pms: [], initiatives: [], assign: {}};
        teams.push(t);
      }
      t.members.push(p.name);
    });
    /* One team over the limit, so the gaps panel has something to say. */
    var fin = teams.filter(function (t) { return t.event === 'Marketing'; })[0];
    var spare = going.filter(function (p) { return !teams.some(function (t) { return t.members.indexOf(p.name) > -1; }); })[0];
    if (fin && spare) fin.members.push(spare.name);
    var inits = [['Market research', 'Brand strategy', 'Fundraising'], ['Grant research', 'Volunteer pipeline'], ['Social media', 'Retail partnerships', 'Pricing'],
                 ['Go-to-market', 'Pitch deck'], ['Student outreach', 'Product feedback', 'Partnerships']];
    ['Ecology Action', 'Habitat for Humanity', 'Chroma Aromatics', 'Orkizz', 'Sky Campus'].forEach(function (c, k) {
      var mem = people.filter(function (p, j) { return p.track === 'Consulting' && j % 5 === k; }).map(function (p) { return p.name; });
      var pms = mem.filter(function (n) { return people.filter(function (p) { return p.name === n; })[0].year === 2; }).slice(0, 2), assign = {};
      mem.forEach(function (n, j) { if (pms.indexOf(n) < 0 && j % 4 !== 3) assign[n] = inits[k][j % inits[k].length]; });
      teams.push({id: 'demo-c-' + k, kind: 'consulting', client: c, name: c, track: 'c', event: '', pms: pms, initiatives: inits[k], assign: assign, members: mem});
    });
    var work = [
      {id: 'w1', title: 'Case framework drill', due: day(-12), kind: 'file', note: 'One page: issue tree for the practice prompt.', team: 'all', org: '', orgName: '', focus: ''},
      {id: 'w2', title: 'Client research brief', due: day(-6), kind: 'link', note: 'A shared Google Doc on your client.', team: 'all', org: '', orgName: '', focus: 'c'},
      {id: 'w3', title: 'Mock case slide deck', due: day(-2), kind: 'either', note: 'Five slides max.', team: 'all', org: '', orgName: '', focus: ''},
      {id: 'w4', title: 'SFBLC prep: read the prompt', due: day(9), kind: 'link', note: 'Annotate the prompt and share the doc with your team.', brief: 'Read the case prompt and rubric twice. Mark every number the judges will check, list three questions you expect in Q&A, and share the doc with your team before the full mock.', team: 'all', org: '', orgName: '', focus: 'k'},
      {id: 'w5', title: 'Org bonding: one-slide intro', due: day(3), kind: 'file', note: 'Who you are, in one slide, for your Org.', team: 'all', org: '1', orgName: 'Cypress', focus: ''}
    ];
    var subs = [];
    people.forEach(function (p, j) {
      work.slice(0, 3).forEach(function (w, k) {
        if ((j * 3 + k * 7) % 23 === 4) return;
        var late = (j * 5 + k) % 29 === 6;
        var t = at(w.due, late ? '23:59' : '20:00').getTime() + (late ? 36e5 * 5 : 0);
        subs.push({workId: w.id, workTitle: w.title, name: p.name, org: p.org, at: new Date(t).toISOString(), first: new Date(t).toISOString(), revision: 1, status: 'submitted'});
      });
    });
    /* Two members with late work the officers have already acted on (see standingLog below). */
    subs = subs.filter(function (x) { return !(x.name === people[5].name && x.workId === 'w1') && !(x.name === people[13].name && (x.workId === 'w1' || x.workId === 'w3')); });
    var attendance = [];
    ['General meeting 1', 'General meeting 2', 'Bootcamp 1', 'Bootcamp 2', 'Mock case stations'].forEach(function (e, k) {
      people.forEach(function (p, j) { if ((j * 7 + k * 3) % 10 > 1 || j < 10) attendance.push({MemberName: p.name, EventLabel: e, Timestamp: day(-20 + k * 4)}); });
    });
    var reach = {};
    people.forEach(function (p, j) { if (j % 4 !== 2) reach[flat(p.name)] = 1; });
    var ebod = ['Derick', 'Rameesha', 'Arin', 'William', 'Jayden', 'Ruirui', 'Bryant'];
    var ev = function (e) { return {tags: ['ev:' + e]}; };
    var st = SFBLC.starter();
    var t0w = Date.now();
    var cfg = {
      clubName: 'De Anza PBL (demo)', unit: 'Org', units: 'Orgs',
      tracks: [{id: 'c', label: 'Consulting'}, {id: 'k', label: 'Case competition (FLC)'}, {id: 't3', label: 'Polaris'}],
      flcEvents: ['Finance', 'Marketing', 'Management', 'Accounting', 'Business Ethics'],
      teams: teams, work: work, rooms: [],
      memberTags: {},
      sfInfo: {caps: SFBLC.caps},
      sfAuto: {on: true, dayBefore: true, hourBefore: true, checklist: true, teams: true},
      sfSchedule: [
        {id: 's1', date: '2026-11-13', start: '13:00', end: '', title: 'Carpools leave De Anza', where: 'Parking Lot B', kind: 'travel', 'for': {tags: ['sfblc']}},
        {id: 's2', date: '2026-11-13', start: '16:00', end: '17:30', title: 'Hotel check-in and registration', where: 'Hilton Garden Inn lobby', kind: 'general', 'for': {tags: ['sfblc']}},
        {id: 's3', date: '2026-11-13', start: '18:30', end: '20:00', title: 'Opening session', where: 'Ballroom', kind: 'general', tentative: true, 'for': {tags: ['sfblc']}},
        {id: 's4', date: '2026-11-13', start: '21:00', end: '22:00', title: 'Chapter huddle: final run-throughs', where: 'Room 412', kind: 'general', 'for': {tags: ['sfblc']}},
        {id: 's5', date: '2026-11-14', start: '08:00', end: '12:00', title: 'Case prep and presentations (Finance, Marketing)', where: 'Breakout rooms', kind: 'comp', tentative: true, 'for': {tags: ['ev:Finance', 'ev:Marketing']}},
        {id: 's6', date: '2026-11-14', start: '13:00', end: '17:00', title: 'Management case and Entrepreneurship Pitch', where: 'Breakout rooms', kind: 'comp', tentative: true, 'for': {tags: ['ev:Management', 'ev:Entrepreneurship Pitch']}},
        {id: 's7', date: '2026-11-14', start: '14:00', end: '15:30', title: 'Impromptu Speaking', where: 'Room 2', kind: 'comp', tentative: true, 'for': {tags: ['ev:Impromptu Speaking']}},
        {id: 's8', date: '2026-11-14', start: '19:00', end: '21:00', title: 'Social night', where: 'Ballroom', kind: 'social', tentative: true, 'for': {tags: ['sfblc']}},
        {id: 's9', date: '2026-11-15', start: '10:00', end: '12:00', title: 'Awards and closing', where: 'Ballroom', kind: 'general', tentative: true, 'for': {tags: ['sfblc']}},
        {id: 's10', date: '2026-11-15', start: '12:30', end: '', title: 'Check out, carpools home', where: 'Lobby', kind: 'travel', 'for': {tags: ['sfblc']}}
      ],
      sfCoaching: [
        {id: 'k1', date: day(1), start: '18:00', end: '19:30', topic: 'Finance: TVM and the capital plan', coach: ebod[3], where: 'ATC 203', event: 'Finance', 'for': ev('Finance')},
        {id: 'k2', date: day(2), start: '17:00', end: '18:00', topic: 'Marketing: positioning drill', coach: ebod[5], where: 'Zoom', link: 'https://zoom.us', event: 'Marketing', 'for': ev('Marketing')},
        {id: 'k3', date: day(3), start: '18:00', end: '19:30', topic: 'Management: decision rights and KPIs', coach: ebod[2], where: 'ATC 203', event: 'Management', 'for': ev('Management')},
        {id: 'k4', date: day(5), start: '16:00', end: '17:00', topic: 'Pitch: run-through with judges', coach: ebod[6], where: 'Hinson Campus Center', event: 'Entrepreneurship Pitch', 'for': ev('Entrepreneurship Pitch')},
        {id: 'k5', date: day(8), start: '18:00', end: '20:00', topic: 'Full mock: every case team', coach: ebod[0], where: 'ATC 120', 'for': {tags: ['sfblc']}}
      ],
      sfChecklist: st.sfChecklist,
      orgEbod: ['Derick', 'Rameesha', 'Arin', 'William', 'Jayden', 'Ruirui'],
      cups: [{id: 'cu1', org: 2, label: 'Best turnout at bootcamp 2', at: Date.now() - 6 * 864e5, by: 'Derick'},
             {id: 'cu2', org: 0, label: 'Won the mock case stations', at: Date.now() - 864e5, by: 'Arin'}],
      events: [{id: 'e1', title: 'Coffee chat with alumni', date: day(4), time: '5:00 pm', where: 'Hinson Campus Center', cat: 'social'},
               {id: 'e2', title: 'EBOD meeting', date: day(2), time: '7:00 pm', where: 'Online', cat: 'meet', ebod: true}],
      calShare: 'https://calendar.google.com/calendar/u/0?cid=demo',
      consultStage: {'demo-c-0': 'research', 'demo-c-1': 'research', 'demo-c-2': 'deliver', 'demo-c-3': 'scope', 'demo-c-4': 'research'},
      standingLog: {}
    };
    /* Two members the officers already spoke to, under the contract. */
    cfg.standingLog[flat(people[5].name)] = [{type: 'warning', note: 'Late on the case framework drill; agreed to hand in by Friday.', at: new Date(t0w - 7 * 864e5).toISOString(), by: 'Derick'}];
    cfg.standingLog[flat(people[13].name)] = [{type: 'warning', note: 'First late assignment.', at: new Date(t0w - 10 * 864e5).toISOString(), by: 'Rameesha'},
                                              {type: 'meeting', note: 'Met with the VP after the second late assignment.', at: new Date(t0w - 3 * 864e5).toISOString(), by: 'Rameesha'}];
    var gcal = [];
    for (var wk = -3; wk < 8; wk++) {
      var tue = new Date(); tue.setDate(tue.getDate() - tue.getDay() + 2 + wk * 7);
      gcal.push({id: 'g' + wk, gid: 'gm', title: 'General meeting', date: isoDay(tue), time: '6:00 pm', where: 'ATC 120', rec: 1});
    }
    gcal.push({id: 'gx', title: 'Thanksgiving break', date: '2026-11-26', end: '2026-11-29'});
    var t0 = Date.now();
    var msgs = [
      {id: 'dm1', title: 'SFBLC teams are out', body: 'Check the dashboard for your team and your first coaching session.', target: {tags: ['sfblc']}, status: 'sent',
       created: new Date(t0 - 864e5 * 2).toISOString(), sentAt: new Date(t0 - 864e5 * 2).toISOString(), by: 'deanzacapbl@gmail.com', pushed: 21, reach: 21, mailed: 0},
      {id: 'dm2', title: 'Your SFBLC team: Finance · Finance 1', body: 'Team: ' + ((teams[0] || {}).members || []).join(', ') + '.', target: {tags: ['team:demo-flc-1']}, status: 'sent', auto: true,
       created: new Date(t0 - 864e5 * 2 + 6e5).toISOString(), sentAt: new Date(t0 - 864e5 * 2 + 6e5).toISOString(), by: 'automation', pushed: 3, reach: 3, mailed: 0},
      {id: 'dm3', title: 'Bring a laptop to the full mock', body: 'Case teams present twice. Slides on a USB stick too.', target: {tags: ['sfblc']}, status: 'scheduled',
       at: at(day(7), '12:00').toISOString(), created: new Date(t0 - 36e5).toISOString(), by: 'deanzacapbl@gmail.com'}
    ];
    msgs.forEach(function (m) { if (m.status === 'sent') m.to = resolveDemo(m.target, people, teams, cfg).map(function (p) { return flat(p.name); }); });
    var done = {'c-reg': going.filter(function (p, j) { return j % 3 !== 0; }).map(function (p) { return flat(p.name); }),
                'c-push': Object.keys(reach)};
    /* One club for both views, so a message sent as an officer shows up in the member's inbox. */
    var member = (teams[0] && teams[0].members[0]) || people[0].name;
    var ext = [{id: 'x1', workId: 'w4', work: 'SFBLC prep: read the prompt', who: flat(people[8].name), name: people[8].name, reason: 'Two midterms the same week; can I have until Sunday?', until: day(11), status: 'waiting', at: new Date(t0w - 5 * 36e5).toISOString()},
               {id: 'x2', workId: 'w3', work: 'Mock case slide deck', who: flat(people[21].name), name: people[21].name, reason: 'Family emergency.', until: day(-1), status: 'approved', by: 'Derick', at: new Date(t0w - 6 * 864e5).toISOString()}];
    return {people: people, cfg: cfg, subs: subs, attendance: attendance, reach: reach, msgs: msgs, done: done, member: member, gcal: gcal, ext: ext};
  }

  /* The same rule the backend uses, for the demo's messages. */
  function resolveDemo(target, people, teams, cfg) {
    var t = target || {}, tags = t.tags || [], names = {};
    (t.names || []).forEach(function (n) { names[flat(n)] = 1; });
    if (!tags.length && !Object.keys(names).length) tags = ['all'];
    var mm = function (p, g) {
      var i = g.indexOf(':'), k = i > 0 ? g.slice(0, i) : g, v = i > 0 ? g.slice(i + 1) : '';
      var on = teams.filter(function (x) { return (x.members || []).some(function (m) { return flat(m) === flat(p.name); }); });
      if (k === 'all') return true;
      if (k === 'sfblc') return on.some(function (x) { return x.kind === 'flc'; }) || !!(p.prefs && p.prefs.attend);
      if (k === 'ev') return on.some(function (x) { return x.kind === 'flc' && flat(x.event) === flat(v); });
      if (k === 'team') return on.some(function (x) { return x.id === v; });
      if (k === 'yr') return p.year === +v;
      if (k === 'tr') return flat(p.track) === flat(v);
      if (k === 'org') return flat(p.org) === flat(v);
      if (k === 'client') return on.some(function (x) { return flat(x.client) === flat(v); });
      if (k === 'tag') return ((cfg.memberTags || {})[flat(p.name)] || []).some(function (x) { return flat(x) === flat(v); });
      if (k === 'name') return flat(v) === flat(p.name);
      return false;
    };
    return people.filter(function (p) {
      if (names[flat(p.name)]) return true;
      return t.every ? tags.every(function (g) { return mm(p, g); }) : tags.some(function (g) { return mm(p, g); });
    });
  }

  /* What the backend's orgBoard_ works out: per Org, per assignment due, how many of
     its members it was for handed in on time. */
  function orgBoard(s) {
    var orgs = [];
    s.people.forEach(function (p) { if (orgs.indexOf(p.org) < 0) orgs.push(p.org); });
    var t0 = isoDay(new Date());
    return orgs.map(function (o) {
      var mem = s.people.filter(function (p) { return p.org === o; });
      return {org: o, works: s.cfg.work.filter(function (w) { return w.due && w.due < t0 && (!w.orgName || w.orgName === o); }).map(function (w) {
        var end = at(w.due, '23:59').getTime(), got = 0;
        mem.forEach(function (p) { var x = s.subs.filter(function (u) { return u.workId === w.id && u.name === p.name; })[0]; if (x && new Date(x.first).getTime() <= end) got++; });
        return {id: w.id, got: got, of: mem.length};
      })};
    });
  }
  function load() {
    if (S) return S;
    try { S = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
    if (!S || !S.member || !S.gcal || !S.ext) S = seed();
    S.me = AS === 'member' ? S.member : 'Demo Officer';
    return S;
  }
  function store() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function reset() { try { sessionStorage.removeItem(KEY); } catch (e) {} S = null; }

  function applyPatch(base, p) {
    var out = JSON.parse(JSON.stringify(base));
    Object.keys(p.set || {}).forEach(function (k) { out[k] = p.set[k]; });
    (p.del || []).forEach(function (k) { delete out[k]; });
    Object.keys(p.items || {}).forEach(function (k) {
      var it = p.items[k], cur = (out[k] || []).slice(), byId = {};
      cur.forEach(function (x) { byId[x.id] = x; });
      (it.up || []).forEach(function (x) { byId[x.id] = x; });
      (it.rm || []).forEach(function (id) { delete byId[id]; });
      var seen = {}, list = [];
      (it.order || []).forEach(function (id) { if (byId[id] && !seen[id]) { list.push(byId[id]); seen[id] = 1; } });
      Object.keys(byId).forEach(function (id) { if (!seen[id]) list.push(byId[id]); });
      out[k] = list;
    });
    return out;
  }

  function answer(action, pl) {
    var s = load(), officer = AS !== 'member', me = flat(s.me);
    var rows = s.people.map(function (p) {
      var mine = flat(p.name) === me;
      return {MemberName: p.name, Org: p.org, Track: p.track, Year: p.year === 2 ? '2nd year' : '1st year',
              MBTI: officer || mine ? p.mbti : '', Availability: officer || mine ? p.avail : '', LeadInterest: officer && p.lead ? 'Yes' : ''};
    });
    var mePerson = s.people.filter(function (p) { return flat(p.name) === me; })[0];
    switch (action) {
      case 'getAll': {
        var cfg = JSON.parse(JSON.stringify(s.cfg));
        if (!officer) { delete cfg.memberTags; delete cfg.standingLog; delete cfg.tagSources; }
        return {ok: true, role: officer ? 'admin' : 'member', name: s.me, email: officer ? 'deanzacapbl@gmail.com' : (mePerson || {}).email,
                affName: 'De Anza PBL (demo)', config: cfg, teams: rows,
                attendance: officer ? s.attendance : s.attendance.filter(function (r) { return flat(r.MemberName) === me; }),
                memberNames: s.people.map(function (p) { return p.name; }),
                me: {formSent: true, prefs: mePerson && mePerson.prefs ? JSON.stringify(mePerson.prefs) : ''},
                aff: 'demo', calFeedKey: '', gcal: {events: s.gcal.filter(function (e) { return officer || !e.hidden; }), syncedAt: Date.now() - 18 * 6e4},
                orgBoard: orgBoard(s)};
      }
      case 'myProfile': {
        var b = String(s.me).split(' ');
        return {ok: true, profile: {first: b[0], last: b.slice(1).join(' ')}, points: officer ? null : 14,
                entries: officer ? [] : [{label: 'Bootcamp 1', pts: 2}, {label: 'Case framework drill, on time', pts: 3}, {label: 'Mock case stations', pts: 4}, {label: 'Helped run tabling', pts: 5}]};
      }
      case 'submitWork': {
        if (!pl.workId) return {ok: false, error: 'No assignment was named.'};
        var had = s.subs.filter(function (x) { return x.workId === pl.workId && flat(x.name) === me; })[0], now = new Date().toISOString();
        if (had) { had.at = now; had.revision++; } else s.subs.push({workId: pl.workId, name: s.me, org: (mePerson || {}).org, at: now, first: now, revision: 1, status: 'submitted'});
        store();
        return {ok: true, revision: had ? had.revision : 1, replaced: !!had};
      }
      case 'addAttendanceBulk':
        (pl || []).forEach(function (r) { s.attendance.push({MemberName: r.MemberName, EventLabel: r.EventLabel, Timestamp: new Date().toISOString()}); }); store();
        return {ok: true, wrote: (pl || []).length};
      case 'saveProfile': return {ok: true};
      case 'extList': return officer ? {ok: true, ext: s.ext} : {ok: false};
      case 'extRequest': {
        var w = s.cfg.work.filter(function (x) { return x.id === pl.workId; })[0];
        if (!w) return {ok: false, error: 'That assignment was not found.'};
        if (w.due && at(w.due, '23:59').getTime() - Date.now() < 3 * 864e5) return {ok: false, error: 'Extensions have to be asked for at least three days before the due date. Talk to the President or Vice President.'};
        var x = {id: uid('x'), workId: w.id, work: w.title, who: me, name: s.me, reason: clean(pl.reason, 300), until: pl.until || '', status: 'waiting', at: new Date().toISOString()};
        s.ext.push(x); store();
        return {ok: true, ext: x};
      }
      case 'extDecide': {
        var hit = null;
        s.ext.forEach(function (x) { if (x.id === pl.id) { x.status = pl.ok ? 'approved' : 'declined'; x.by = 'Demo Officer'; hit = x; } }); store();
        return hit ? {ok: true, ext: hit} : {ok: false, error: 'Not found.'};
      }
      case 'savePush': case 'testPush': return {ok: true};
      case 'linkedRead': return officer && typeof demoLinked === 'function' ? demoLinked(pl, s) : {ok: false, error: 'Officers only.'};
      case 'clubRoster':
        if (!officer) return {ok: false, error: 'Officers only.'};
        return {ok: true, roster: s.people.map(function (p) {
          var b = p.name.split(' ');
          return {first: b[0], last: b.slice(1).join(' '), email: p.email, role: 'member', year: p.answered ? (p.year === 2 ? '2nd year' : '1st year') : '',
                  track: p.answered ? p.track : '', mbti: p.mbti, avail: p.avail, notes: '', prefs: p.prefs ? JSON.stringify(p.prefs) : ''};
        })};
      case 'listSubmissions': return officer ? {ok: true, submissions: s.subs} : {ok: false};
      case 'msgList':
        return officer ? {ok: true, msgs: s.msgs.slice().reverse(), reach: s.reach, done: s.done, pushOn: true, mailLeft: 87} : {ok: false};
      case 'myInbox': {
        var mine = {};
        Object.keys(s.done).forEach(function (k) { if (s.done[k].indexOf(me) > -1) mine[k] = 1; });
        return {ok: true, done: mine, ext: s.ext.filter(function (x) { return x.who === me; }),
                standing: ((s.cfg.standingLog || {})[me] || []).map(function (l) { return {type: l.type, at: l.at}; }), msgs: s.msgs.filter(function (m) { return m.status === 'sent' && (m.to || []).indexOf(me) > -1; }).reverse()
          .map(function (m) { return {id: m.id, title: m.title, body: m.body, url: m.url, at: m.sentAt, auto: !!m.auto}; })};
      }
      case 'setConfig':
        if (!officer) return {ok: false, error: 'Officers only.'};
        s.cfg = pl && pl.__patch ? applyPatch(s.cfg, pl) : pl; store();
        return {ok: true, saved: true, cfg: s.cfg};
      case 'msgSend': {
        if (!officer) return {ok: false};
        var m = {id: uid('dm'), title: clean(pl.title, 80), body: clean(pl.body, 600), url: pl.url || '/dash#inbox', target: pl.target,
                 email: !!pl.email, by: 'deanzacapbl@gmail.com', created: new Date().toISOString()};
        if (pl.at && new Date(pl.at).getTime() > Date.now() + 60000) { m.status = 'scheduled'; m.at = new Date(pl.at).toISOString(); }
        else {
          var to = resolveDemo(pl.target, s.people, s.cfg.teams, s.cfg);
          m.status = 'sent'; m.sentAt = m.created; m.to = to.map(function (p) { return flat(p.name); });
          m.reach = to.filter(function (p) { return s.reach[flat(p.name)]; }).length; m.pushed = m.reach; m.mailed = m.email ? to.length : 0;
        }
        s.msgs.push(m); store();
        return {ok: true, msg: m};
      }
      case 'msgCancel':
        s.msgs.forEach(function (m) { if (m.id === pl.id && m.status === 'scheduled') m.status = 'cancelled'; }); store();
        return {ok: true};
      case 'sfCheck': {
        var l = (s.done[pl.id] || []).filter(function (n) { return n !== me; });
        if (pl.done) l.push(me);
        s.done[pl.id] = l; store();
        return {ok: true};
      }
    }
    return {ok: false, error: 'The demo does not do ' + action + '.'};
  }
  return {answer: answer, reset: reset, as: AS};
})();
