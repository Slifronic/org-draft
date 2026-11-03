/* Runs Code.gs + Sync.gs under Node against in-memory spreadsheets and checks
   the two-way sync end to end. No Google services are touched.
   node apps-script/test/sync.test.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

/* ---- a small in-memory Sheets ---- */
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, {sh, r, c, nr: nr || 1, nc: nc || 1}); }
  cells(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r - 1 + i, this.c - 1 + j, i, j); }
  getValues() { const o = []; for (let i = 0; i < this.nr; i++) { o.push([]); for (let j = 0; j < this.nc; j++) o[i].push(this.sh.get(this.r - 1 + i, this.c - 1 + j)); } return o; }
  getDisplayValues() { return this.getValues().map((r) => r.map((v) => String(v))); }
  setValues(v) { this.cells((r, c, i, j) => this.sh.set(r, c, v[i][j])); return this; }
  setValue(v) { this.cells((r, c) => this.sh.set(r, c, v)); return this; }
  clearContent() { this.cells((r, c) => this.sh.set(r, c, '')); return this; }
  getNote() { return this.sh.notes[(this.r - 1) + ':' + (this.c - 1)] || ''; }
  setNote(n) { this.cells((r, c) => { this.sh.notes[r + ':' + c] = n; }); return this; }
  clearNote() { return this.setNote(''); }
  setBackground(b) { this.cells((r, c) => { this.sh.bg[r + ':' + c] = b; }); return this; }
  getBackground() { return this.sh.bg[(this.r - 1) + ':' + (this.c - 1)] || null; }
  setFontWeight() { return this; }
}
class Sheet {
  constructor(ss, name, rows) { this.ss = ss; this.name = name; this.v = (rows || []).map((r) => r.slice()); this.notes = {}; this.bg = {}; }
  get(r, c) { return (this.v[r] && this.v[r][c] !== undefined) ? this.v[r][c] : ''; }
  set(r, c, x) { while (this.v.length <= r) this.v.push([]); this.v[r][c] = x; this.ss.touched = true; }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() { for (let r = this.v.length - 1; r >= 0; r--) if ((this.v[r] || []).some((x) => x !== '' && x != null)) return r + 1; return 0; }
  getLastColumn() { let m = 0; this.v.forEach((r) => { for (let c = r.length - 1; c >= 0; c--) if (r[c] !== '' && r[c] != null) { m = Math.max(m, c + 1); break; } }); return m; }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(row) { const r = this.getLastRow(); row.forEach((x, c) => this.set(r, c, x)); }
  deleteRows(at, n) { this.v.splice(at - 1, n); }
  setFrozenRows() {}
  copyTo(ss) { const s = new Sheet(ss, 'Copy of ' + this.name, this.v); s.notes = Object.assign({}, this.notes); s.bg = Object.assign({}, this.bg); ss.sheets.push(s); return s; }
}
class Book {
  constructor(id, tabs) { this.id = id; this.sheets = Object.keys(tabs).map((n) => new Sheet(this, n, tabs[n])); this.touched = false; }
  getId() { return this.id; }
  getName() { return this.id; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n, at) { const s = new Sheet(this, n, []); if (at === 0) this.sheets.unshift(s); else this.sheets.push(s); return s; }
  setActiveSheet(s) { this.active = s; }
  moveActiveSheet(i) { this.sheets = this.sheets.filter((s) => s !== this.active); this.sheets.splice(i - 1, 0, this.active); }
  getNumSheets() { return this.sheets.length; }
  getSpreadsheetTimeZone() { return 'America/Los_Angeles'; }
}

/* ---- fixtures, shaped like the real sheets' headers ---- */
const AFF = 'deanza-pbl';
const ATT_ID = '11epr7XrJQbhJwWWnVH9pUsHlMZAx3XoUzjmYjVr5p3A', MST_ID = '1oKlEes6653hEO8pJj2sExZzAI1daXZLVRCMaDWQtVJY', REC_ID = '19xazg1JCkQl-JJADMmgZqKfx0l35u1uNPct33MPcq8E';
const head = ['First Name', 'Last Name', 'Attendance', 'No Bus Casual', 'Gmail', 'Phone Number', 'Instagram'];
function world() {
  const org = new Book('ORG', {
    Config: [['Key', 'Value'], ['club:' + AFF, JSON.stringify({
      teams: [
        {id: 'mst-finance-1', kind: 'flc', event: 'Finance', name: 'Finance 1', members: ['Ann Lee', 'Bo Chan', 'Cy Park', 'Di Vo'], track: 'k'},
        {id: 'mine-1', kind: 'flc', event: 'Marketing', name: 'Marketing 1', members: ['Ed Wu'], track: 'k'},
        {id: 'c1', kind: 'consulting', client: 'Orkizz', members: ['Fay Ho']}],
      rooms: [], sfSchedule: [{id: 's-own', date: '2026-11-14', start: '09:00', title: 'Team breakfast', src: 'dash'}],
      sfInfo: {start: '2026-11-13', end: '2026-11-15'}})]],
    Teams: [['MemberName', 'Org', 'Track', 'Year', 'MBTI', 'LeadInterest', 'IsLead', 'Notes', 'Affiliation', 'Availability', 'Focus'],
      ['Ann Lee', 'Org 1', 'k', '', '', '', '', '', AFF], ['Bo Chan', 'Org 1', 'k', '', '', '', '', '', AFF], ['Cy Park', 'Org 2', 'c', '', '', '', '', '', AFF],
      ['Di Vo', 'Org 2', 'k', '', '', '', '', '', AFF], ['Ed Wu', 'Org 3', 'k', '', '', '', '', '', AFF], ['Gus Ray', 'Org 3', 'c', '', '', '', '', '', AFF]],
    Attendance: [['Timestamp', 'MemberName', 'EventLabel', 'Track', 'Org', 'Affiliation'], [new Date('2026-10-01'), 'Ann Lee', 'Bootcamp 1', 'k', 'Org 1', AFF]],
    Users: [['Username', 'ClientSalt', 'ServerSalt', 'Hash', 'Iterations', 'Role', 'FailCount', 'LockedUntil', 'CreatedBy', 'CreatedAt', 'Affiliation', 'FirstName', 'LastName', 'Email']]
  });
  const att = new Book(ATT_ID, {
    Tickets: [['Ticket', 'Meeting', 'Name', 'Discord', 'Type', 'Reason', 'Status', 'Opened', 'Decided by', 'Thread'],
      ['tk000001', '10/29', 'Bo Chan', 'bochan', 'Late', 'bus', 'Pending', '10/29 6:00 PM', '', 'https://discord/x']],
    '10/22': [head, ['Ann Lee', 'Ann', 'Present', false, 'ann@x.com', '', 'annlee'], ['Bo Chan', '', 'Unexcused Abscence', false, '', '', 'bochan'], ['Cy Park', '', 'Excused Late', true, '', '', '']],
    '10/29': [head, ['Ann Lee', '', 'Present', false, '', '', 'annlee'], ['Bo Chan', '', '', false, '', '', 'bochan'], ['Cy Park', '', '', false, '', '', ''], ['Gus Ray', '', '', false, '', '', '']]
  });
  att.getSheetByName('10/29').getRange(3, 3).setNote('🎫 Ticket tk000001 pending · Late: bus').setBackground('#fff2cc');
  const mst = new Book(MST_ID, {
    'Rooming Assignments': [['List of Attendees:', 'Column 8', 'Room Type', 'Gender', 'Person 1', 'Person 2', 'Person 3', 'Person 4', '', 'Blue Panda Room'],
      ['Room 1', true, 'Suite', 'Advisor', 'West, Jefferey', '', '', '', '', '105706'], ['Room 2', true, 'Double', 'Female', 'Ann Lee', 'Di Vo', '', '', '', '']],
    Teams: [['', '', 'Person 1', 'Person 2', 'Person 3', 'Person 4', '', 'Notes'],
      [true, 'Finance', 'Ann Lee', 'Bo Chan', 'Cy Park', 'Di Vo', '', 'ok'], [false, 'Management', 'Gus Ray', 'Ed Wu', '', '', '', '']],
    Itinerary: [[], ['Date', 'Time', 'Activity', 'Notes'], ['Friday 13th', '2:00 PM', 'EBOD Arrival', 'on time'], ['', '4:00 PM', 'Hotel Check In', 'bags'],
      ['Saturday 14th', '8:00 AM', 'Competition round 1', '']]
  });
  const rec = new Book(REC_ID, {
    'Verified members': [['Discord ID', 'Username', 'Name', 'Major', 'CWID', 'Verified at'], ['111', 'annlee', 'Ann Lee', 'Econ', '20000001', '2026-10-01'], ['222', 'zz', 'Zed Unknown', 'CS', '20000002', '2026-10-02']],
    'Attendance tickets': [['Ticket ID', 'Discord ID', 'Username', 'Name', 'Meeting', 'Type', 'Label', 'Reason', 'Status', 'Thread ID', 'Created at', 'Decided by', 'Decided at'],
      ['tk000001', '333', 'bochan', 'Bo Chan', '10/29', 'late', 'Late', 'bus', 'open', '999', '2026-10-29T01:00:00Z', '', '']]
  });
  // Code.gs pins its own data sheet by id (SHEET_ID); here that is the in-memory org book.
  return {org, att, mst, rec, books: {ORG: org, '1FSS82LmwaoltYAZzEHLAvWsm9aWtlLDWWXf6cR_Xv30': org, [ATT_ID]: att, [MST_ID]: mst, [REC_ID]: rec}};
}

function load(w) {
  const props = {}, triggers = [];
  let lockHeld = false, clock = Date.parse('2026-11-02T20:00:00Z');
  const fmt = (d, tz, f) => {
    d = new Date(d);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const p2 = (n) => String(n).padStart(2, '0');
    return f.replace('yyyy', d.getFullYear()).replace('MM', p2(d.getMonth() + 1)).replace('dd', p2(d.getDate()))
      .replace('HH', p2(d.getHours())).replace('mm', p2(d.getMinutes())).replace('EEEE', days[d.getDay()]).replace('EEE', days[d.getDay()].slice(0, 3));
  };
  const ctx = {
    console, Logger: {log() {}}, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } },
    SpreadsheetApp: {openById: (id) => { if (!w.books[id]) throw new Error('no ' + id); return w.books[id]; }, getActive: () => w.org},
    LockService: {getScriptLock: () => ({hasLock: () => lockHeld, tryLock: () => (lockHeld = true), waitLock: () => { lockHeld = true; }, releaseLock: () => { lockHeld = false; }})},
    PropertiesService: {getScriptProperties: () => ({getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; }})},
    ScriptApp: {getProjectTriggers: () => triggers.slice(), deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => { const t = {fn, getHandlerFunction: () => fn}; const b = {forSpreadsheet: () => b, onChange: () => b, timeBased: () => b, after: () => b, create: () => { triggers.push(t); return t; }}; return b; }},
    DriveApp: {getFileById: () => ({getLastUpdated: () => new Date(clock)})},
    Session: {getScriptTimeZone: () => 'America/Los_Angeles'},
    Utilities: {formatDate: fmt, getUuid: () => require('crypto').randomUUID()},
    CacheService: {getScriptCache: () => ({get: () => null, put() {}, remove() {}, getAll: () => ({}), putAll() {}})}
  };
  ctx.Date.prototype.constructor = ctx.Date;
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8') + '\n' + fs.readFileSync(path.join(dir, 'Sync.gs'), 'utf8'), ctx);
  ctx.tick = (ms) => { clock += ms; };
  ctx.props = props; ctx.triggers = triggers;
  ctx.as = (fn) => { lockHeld = true; ctx.BOOK_ = null; ctx.TABS_ = {}; ctx.ROWS_ = {}; ctx.SBOOK_ = {}; try { return fn(); } finally { lockHeld = false; } };
  return ctx;
}
const rows = (ctx, key) => ctx.as(() => ctx.readScoped(key, AFF));
const cfg = (ctx) => ctx.as(() => ctx.clubCfg_(AFF));
const cell = (book, tabName, r, c) => book.getSheetByName(tabName).get(r - 1, c - 1);
const logLen = (ctx) => rows(ctx, 'syncLog').length;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

/* ---- scenarios ---- */
const w = world(), g = load(w);
const run = (why) => g.as(() => g.syncRun_(AFF, null, why || 'test'));
const call = (action, payload) => g.as(() => g.dispatch(action, payload, 'officer@x.com', 'admin', {aff: AFF, name: 'Officer Kim', who: 'officer@x.com'}));

test('first run brings every sheet into the Org System', () => {
  const r = run('first');
  assert.ok(r.ok, JSON.stringify(r.errors));
  const att = rows(g, 'attendance').filter((x) => /^Meeting /.test(x.EventLabel));
  const at = (lab, n) => att.find((x) => x.EventLabel === lab && x.MemberName === n);
  assert.equal(at('Meeting 10/22', 'Ann Lee').Status, 'Present');
  assert.equal(at('Meeting 10/22', 'Bo Chan').Status, 'Unexcused Abscence');
  assert.equal(at('Meeting 10/22', 'Cy Park').Status, 'Excused Late');
  assert.equal(at('Meeting 10/22', 'Cy Park').Note, 'Not in business casual');
  assert.equal(at('Meeting 10/22', 'Cy Park').Org, 'Org 2');
  assert.ok(!at('Meeting 10/29', 'Bo Chan'), 'a blank cell is no row');
  assert.ok(!att.some((x) => /Ann Lee Ann/.test(x.MemberName)), 'a last name already in the first-name column is not added twice');
  const c = cfg(g), flc = c.teams.filter((t) => t.kind === 'flc');
  assert.ok(flc.find((t) => t.id === 'mst-finance-1' && t.confirmed === true), 'old import adopted, keeps its id');
  assert.ok(flc.find((t) => t.event === 'Management' && t.members.join() === 'Gus Ray,Ed Wu' && t.confirmed === false));
  assert.ok(flc.find((t) => t.id === 'mine-1' && t.local), 'team made here before the sync stays here only');
  assert.ok(c.teams.find((t) => t.id === 'c1'), 'consulting teams untouched');
  assert.equal(cell(w.mst, 'Teams', 4, 2), '', 'local team not pushed to the sheet');
  assert.equal(c.rooms.length, 2);
  assert.equal(c.rooms.find((r) => r.label === 'Room 2').group, 'w');
  const it = c.sfSchedule.filter((x) => x.src === 'master');
  assert.equal(it.length, 3);
  assert.deepEqual(it.map((x) => x.date + ' ' + x.start), ['2026-11-13 14:00', '2026-11-13 16:00', '2026-11-14 08:00']);
  assert.ok(c.sfSchedule.find((x) => x.id === 's-own'), 'items made here stay');
  const tk = rows(g, 'tickets');
  assert.equal(tk.length, 1); assert.equal(tk[0].Status, 'Pending'); assert.equal(tk[0].Username, 'bochan');
  const dc = rows(g, 'discord');
  assert.equal(dc.find((x) => x.DiscordId === '111').MemberName, 'Ann Lee');
  assert.equal(dc.find((x) => x.DiscordId === '222').MemberName, '', 'unknown name is left for an officer');
});

test('a second run with nothing changed copies nothing', () => {
  const n = logLen(g); run(); assert.equal(logLen(g), n);
});

test('getAll never counts a synced absence as a check-in', () => {
  const all = call('getAll', null);
  const a = (all.attendance || []).filter((x) => x.EventLabel === 'Meeting 10/22').map((x) => x.MemberName).sort();
  assert.deepEqual(a, ['Ann Lee', 'Cy Park']);
});

test('a check-in here lands on the meeting tab', () => {
  g.tick(60000);
  const r = call('addAttendanceBulk', [{MemberName: 'Gus Ray', EventLabel: 'Meeting 10/29', Track: 'c', Org: 'Org 3'}]);
  assert.ok(r.ok);
  assert.equal(cell(w.att, '10/29', 5, 3), 'Present');
});

test('a check-in for a meeting with no tab makes the tab, at the end', () => {
  g.tick(60000);
  call('addAttendanceBulk', [{MemberName: 'Ann Lee', EventLabel: 'Meeting 11/3'}]);
  const sh = w.att.getSheetByName('11/3');
  assert.ok(sh, 'tab made');
  assert.equal(w.att.getSheets().slice(-1)[0].getName(), '11/3');
  assert.equal(sh.get(1, 2), 'Present');
  assert.equal(sh.get(2, 2), '', 'others start empty');
  assert.equal(sh.get(2, 0), 'Bo Chan', 'roster copied from the latest meeting');
});

test('an edit on the sheet reaches the Org System, and nothing echoes back', () => {
  g.tick(60000);
  w.att.getSheetByName('10/22').set(2, 2, 'Excused Abscence');      // Bo Chan
  g.as(() => g.syncStampSheet_(ATT_ID));
  run();
  const bo = rows(g, 'attendance').find((x) => x.EventLabel === 'Meeting 10/22' && x.MemberName === 'Bo Chan');
  assert.equal(bo.Status, 'Excused Abscence');
  const n = logLen(g); run(); assert.equal(logLen(g), n);
});

test('deciding a ticket here updates both sheets, the meeting cell and attendance', () => {
  g.tick(60000);
  const r = call('ticketDecide', {id: 'tk000001', status: 'Excused Late'});
  assert.ok(r.ok, r.error);
  assert.equal(cell(w.att, 'Tickets', 2, 7), 'Excused Late');
  assert.equal(cell(w.att, 'Tickets', 2, 9), 'Officer Kim');
  assert.equal(cell(w.rec, 'Attendance tickets', 2, 9), 'Excused Late');
  const c = w.att.getSheetByName('10/29');
  assert.equal(c.get(2, 2), 'Excused Late');
  assert.equal(c.bg['2:2'], null, 'yellow cleared');
  assert.ok(!/tk000001 pending/.test(c.notes['2:2']), 'pending note removed');
  const bo = rows(g, 'attendance').find((x) => x.EventLabel === 'Meeting 10/29' && x.MemberName === 'Bo Chan');
  assert.equal(bo && bo.Status, 'Excused Late');
});

test('a ticket decided by hand on the Tickets tab comes back here', () => {
  g.tick(60000);
  w.att.getSheetByName('Tickets').set(1, 6, 'Unexcused Late');
  g.as(() => g.syncStampSheet_(ATT_ID));
  run();
  assert.equal(rows(g, 'tickets')[0].Status, 'Unexcused Late');
  assert.equal(cell(w.att, '10/29', 3, 3), 'Unexcused Late', 'the meeting cell follows');
  const bo = rows(g, 'attendance').find((r) => r.EventLabel === 'Meeting 10/29' && r.MemberName === 'Bo Chan');
  assert.equal(bo.Status, 'Unexcused Late', 'and so does attendance here, on the same run');
});

test('editing a team here rewrites its row on the master sheet', () => {
  g.tick(60000);
  const t = cfg(g).teams.find((x) => x.event === 'Management');
  const up = Object.assign({}, t, {members: ['Gus Ray', 'Ed Wu', 'Ann Lee']});
  const r = call('setConfig', {__patch: 1, items: {teams: {up: [up], was: {[t.id]: t}}}});
  assert.ok(r.ok);
  assert.equal(cell(w.mst, 'Teams', 3, 5), 'Ann Lee');
});

test('a team made here after the first sync is added to the sheet', () => {
  g.tick(60000);
  const nt = {id: 'new-1', kind: 'flc', event: 'Entrepreneurship Pitch', name: 'Pitch 1', members: ['Bo Chan', 'Di Vo'], track: 'k'};
  call('setConfig', {__patch: 1, items: {teams: {up: [nt]}}});
  assert.equal(cell(w.mst, 'Teams', 4, 2), 'Entrepreneurship Pitch');
  assert.equal(cell(w.mst, 'Teams', 4, 3), 'Bo Chan');
  assert.equal(cell(w.mst, 'Teams', 4, 1), false);
  const n = logLen(g); run(); assert.equal(logLen(g), n, 'stable afterwards');
});

test('moving someone between rooms on the sheet moves them here', () => {
  g.tick(60000);
  w.mst.getSheetByName('Rooming Assignments').set(2, 5, 'Cy Park');   // Room 2, Person 2
  g.as(() => g.syncStampSheet_(MST_ID));
  run();
  assert.deepEqual(cfg(g).rooms.find((r) => r.label === 'Room 2').members, ['Ann Lee', 'Cy Park']);
});

test('editing an itinerary item here rewrites its row; a new day label only when the day moves', () => {
  g.tick(60000);
  const it = cfg(g).sfSchedule.find((x) => x.title === 'Hotel Check In');
  const up = Object.assign({}, it, {start: '16:30', date: '2026-11-14'});
  call('setConfig', {__patch: 1, items: {sfSchedule: {up: [up], was: {[it.id]: it}}}});
  assert.equal(cell(w.mst, 'Itinerary', 4, 2), '4:30 PM');
  assert.equal(cell(w.mst, 'Itinerary', 4, 1), 'Saturday 14th');
});

test('when both sides changed, the latest edit wins', () => {
  // Officer edits a team here, the write to the sheet fails silently (simulated by editing the base), then someone edits the sheet later.
  g.tick(60000);
  const t = cfg(g).teams.find((x) => x.id === 'mst-finance-1');
  g.as(() => { const c = g.clubCfg_(AFF); c.teams.find((x) => x.id === t.id).members[3] = 'Gus Ray'; g.syncCfgSave_(AFF, c); g.syncStampOrg_(AFF, 'teams'); });
  g.tick(60000);
  w.mst.getSheetByName('Teams').set(1, 5, 'Ed Wu');
  g.as(() => g.syncStampSheet_(MST_ID));
  run();
  assert.equal(cfg(g).teams.find((x) => x.id === t.id).members[3], 'Ed Wu', 'sheet edit was later');
  const last = rows(g, 'syncLog').slice(-1)[0];
  assert.equal(last.Why, 'both changed, latest edit kept');
});

test('an officer can link a Discord profile, and the sync keeps that link', () => {
  const r = call('discordLink', {discordId: '222', member: 'Gus Ray'});
  assert.ok(r.ok);
  run();
  assert.equal(rows(g, 'discord').find((x) => x.DiscordId === '222').MemberName, 'Gus Ray');
});

test('"not a member" sticks through later syncs', () => {
  const r = call('discordLink', {discordId: '222', none: true});
  assert.ok(r.ok && r.by === 'none');
  run();
  const z = rows(g, 'discord').find((x) => x.DiscordId === '222');
  assert.equal(z.MatchedBy, 'none'); assert.equal(z.MemberName, '');
  assert.equal(call('discordList').profiles.find((x) => x.id === '222').by, 'none');
});

test('a sheet tab that goes missing stops the sync instead of emptying the Org System', () => {
  const tabSheet = w.mst.getSheetByName('Teams'); const before = cfg(g).teams.filter((t) => t.kind === 'flc' && !t.local).length;
  tabSheet.setName('Teams (renamed)');
  const r = run();
  assert.ok(!r.ok && /came back empty/.test(r.errors.join(' ')), JSON.stringify(r.errors));
  assert.equal(cfg(g).teams.filter((t) => t.kind === 'flc' && !t.local).length, before, 'teams kept');
  tabSheet.setName('Teams');
  assert.ok(run().ok);
});

test('syncStatus answers for officers', () => {
  const r = call('syncStatus', null);
  assert.ok(r.ok && r.linked && r.log.length && r.counts.attendance > 0);
});

test('an edit to a linked sheet books one sync, not one per keystroke', () => {
  g.as(() => { g.syncOnChange({source: w.att}); g.syncOnChange({source: w.att}); g.syncOnChange({source: w.mst}); });
  assert.equal(g.triggers.filter((t) => t.fn === 'syncDue').length, 1);
  g.as(() => g.syncDue());
  assert.equal(g.triggers.filter((t) => t.fn === 'syncDue').length, 0);
});

test('keepWarm installs the onChange triggers once', () => {
  g.as(() => g.syncKeepWarm_()); g.as(() => g.syncKeepWarm_());
  assert.equal(g.triggers.filter((t) => t.fn === 'syncOnChange').length, 3);
});

console.log('\n' + passed + ' passed');
