/* Runs Code.gs + Sync.gs under Node against in-memory spreadsheets and checks
   the carpool sign-up end to end: pickup addresses stay private, the form and
   its sheet are made once, form answers become rides, and the Carpools tab
   and the Org System stay in step both ways. No Google services are touched.
   node apps-script/test/rides-sync.test.js */
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
  setNumberFormat() { return this; }
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

/* ---- a small in-memory Forms: just what rideFormMake_ calls ---- */
function fakeForms(w) {
  const item = () => { const it = {}; ['setTitle', 'setRequired', 'setChoiceValues', 'setHelpText'].forEach((m) => { it[m] = () => it; }); return it; };
  return {
    DestinationType: {SPREADSHEET: 'SPREADSHEET'},
    create: (title) => {
      const f = {id: 'FORM1', title};
      ['setDescription', 'setCollectEmail', 'setPublished', 'setPublishedAudience', 'setAcceptingResponses', 'setRequireLogin'].forEach((m) => { f[m] = () => f; });
      ['addTextItem', 'addMultipleChoiceItem', 'addListItem', 'addTimeItem', 'addParagraphTextItem'].forEach((m) => { f[m] = item; });
      f.setDestination = (t, id) => { w.books[id].insertSheet('Form Responses 1').appendRow(RESP_HEAD); return f; };
      f.getPublishedUrl = () => 'https://docs.google.com/forms/d/e/FORM1/viewform';
      f.shortenFormUrl = () => 'https://forms.gle/carpool1';
      f.getEditUrl = () => 'https://docs.google.com/forms/d/FORM1/edit';
      f.getId = () => 'FORM1';
      w.forms.push(f);
      return f;
    }
  };
}
const RESP_HEAD = ['Timestamp', 'Email Address', 'Your full name', 'How are you getting there?', 'Drivers: seats for riders',
  'Where should the carpool start or pick you up?', 'Pickup address or cross streets', 'City or neighborhood',
  'Drivers: leaving Friday at', 'Riding or driving back on Sunday too?', 'Phone number', 'Anything else'];

const AFF = 'deanza-pbl';
function world() {
  const org = new Book('ORG', {
    Config: [['Key', 'Value'], ['club:' + AFF, JSON.stringify({clubName: 'De Anza PBL', sfInfo: {start: '2026-11-13'}})]],
    Teams: [['MemberName', 'Org', 'Track', 'Year', 'MBTI', 'LeadInterest', 'IsLead', 'Notes', 'Affiliation', 'Availability', 'Focus'],
      ['Ann Lee', 'Org 1', 'k', '', '', '', '', '', AFF], ['Bo Chan', 'Org 1', 'k', '', '', '', '', '', AFF],
      ['Cy Park', 'Org 2', 'k', '', '', '', '', '', AFF], ['Dee Vu', 'Org 2', 'k', '', '', '', '', '', AFF]],
    Users: [['Username', 'ClientSalt', 'ServerSalt', 'Hash', 'Iterations', 'Role', 'FailCount', 'LockedUntil', 'CreatedBy', 'CreatedAt', 'Affiliation', 'FirstName', 'LastName', 'Email']]
  });
  const w = {org, forms: [], made: 0, books: {ORG: org, '1FSS82LmwaoltYAZzEHLAvWsm9aWtlLDWWXf6cR_Xv30': org}};
  /* The fixed linked sheets exist but are empty; only the carpool sheet matters here. */
  ['11epr7XrJQbhJwWWnVH9pUsHlMZAx3XoUzjmYjVr5p3A', '1oKlEes6653hEO8pJj2sExZzAI1daXZLVRCMaDWQtVJY', '19xazg1JCkQl-JJADMmgZqKfx0l35u1uNPct33MPcq8E']
    .forEach((id) => { w.books[id] = new Book(id, {}); });
  return w;
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
    SpreadsheetApp: {openById: (id) => { if (!w.books[id]) throw new Error('no ' + id); return w.books[id]; }, getActive: () => w.org,
      create: (t) => { const id = 'SHEET' + (++w.made); w.books[id] = new Book(id, {Sheet1: []}); w.books[id].getUrl = () => 'https://docs.google.com/spreadsheets/d/' + id; return w.books[id]; }},
    FormApp: fakeForms(w),
    LockService: {getScriptLock: () => ({hasLock: () => lockHeld, tryLock: () => (lockHeld = true), waitLock: () => { lockHeld = true; }, releaseLock: () => { lockHeld = false; }})},
    PropertiesService: {getScriptProperties: () => ({getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; }})},
    ScriptApp: {getProjectTriggers: () => triggers.slice(), deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => { const t = {fn, getHandlerFunction: () => fn}; const b = {forSpreadsheet: (id) => { t.src = id; return b; }, onChange: () => { t.kind = 'change'; return b; }, onFormSubmit: () => { t.kind = 'submit'; return b; }, timeBased: () => b, after: () => b, create: () => { triggers.push(t); return t; }}; return b; }},
    DriveApp: {getFileById: () => ({getLastUpdated: () => new Date(clock), addEditor() {}, setOwner() {}})},
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
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

const w = world(), g = load(w);
const as = (name, role) => (action, payload) => g.as(() => g.dispatch(action, payload, name.toLowerCase().replace(/ /g, '.') + '@x.com', role || 'member', {aff: AFF, name: name, who: name}));
const ann = as('Ann Lee'), bo = as('Bo Chan'), cy = as('Cy Park'), dee = as('Dee Vu'), off = as('Officer Kim', 'admin');
const rides = () => g.as(() => g.dashRow_('rides:' + AFF, []));
const ride = (who) => rides().find((x) => x.who === who);
const run = (why) => g.as(() => g.syncRun_(AFF, ['rides'], why || 'test'));
const sheet = () => w.books.SHEET1;
const tabRows = () => { const v = sheet().getSheetByName('Carpools').getDataRange().getValues(); const h = v[0]; return v.slice(1).filter((r) => r.join('')).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const tabRow = (name) => tabRows().find((r) => r.Name === name);
const editedSheet = () => { g.tick(60000); g.props['syncSheetAt:SHEET1'] = String(g.Date.now()); };

test('pickup addresses are private like phone numbers; the area is not', () => {
  assert.ok(ann('rideSave', {role: 'driver', seats: 2, from: 'addr', addr: '12 Elm St, Cupertino', area: 'Cupertino', leave: '13:30', back: true, phone: '408 555 0101'}).ok);
  assert.match(bo('rideSave', {role: 'rider', from: 'addr'}).error, /pickup address/);
  assert.ok(bo('rideSave', {role: 'rider', from: 'addr', addr: '9 Oak Ave', area: 'Sunnyvale', car: 'annlee', phone: '408 555 0102'}).ok);
  assert.ok(cy('rideSave', {role: 'rider', from: 'deanza'}).ok);
  const forCy = cy('rideList').rides, forBo = bo('rideList').rides, forOff = off('rideList').rides;
  const f = (list, who) => list.find((x) => x.who === who);
  assert.equal(f(forCy, 'annlee').addr, undefined);
  assert.equal(f(forCy, 'annlee').area, 'Cupertino');
  assert.equal(f(forBo, 'annlee').addr, '12 Elm St, Cupertino');
  assert.equal(f(forOff, 'bochan').addr, '9 Oak Ave');
  assert.match(ann('rideSave', {role: 'driver', from: 'hotel'}).error, /De Anza or an address/);
  assert.equal(ride('annlee').from, 'addr');
});

test('a driver orders their stops, and only their own riders count', () => {
  assert.ok(cy('rideSave', {role: 'rider', car: 'annlee'}).ok);
  assert.ok(ann('rideSave', {role: 'driver', stops: ['cypark', 'deevu', 'bochan', 'cypark']}).ok);
  assert.deepEqual(ride('annlee').stops, ['cypark', 'bochan']);
  assert.equal(ride('annlee').addr, '12 Elm St, Cupertino', 'a partial save keeps the address');
});

test('nothing syncs until the carpool sheet exists; members cannot make it', () => {
  assert.equal(run().ran.length, 0);
  assert.equal(g.NEEDS.rideFormSetup, 'admin', 'doPost refuses members before dispatch');
});

test('an officer makes the form and sheet once; existing rides go onto the Carpools tab', () => {
  const r = off('rideFormSetup');
  assert.ok(r.ok, r.error);
  assert.equal(r.rideForm.formUrl, 'https://forms.gle/carpool1');
  assert.equal(r.rideForm.sheetId, 'SHEET1');
  assert.ok(off('rideFormSetup').existed, 'a second call returns the same form');
  assert.equal(w.forms.length, 1);
  assert.deepEqual(tabRows().map((x) => x.Name).sort(), ['Ann Lee', 'Bo Chan', 'Cy Park']);
  const a = tabRow('Ann Lee'), b = tabRow('Bo Chan');
  assert.deepEqual([a.Role, a.Seats, a.Pickup, a.Address, a['Leave Friday'], a['Back Sunday']], ['Driving', '2', 'Address', '12 Elm St, Cupertino', '1:30 PM', 'Yes']);
  assert.deepEqual([b.Role, b.Car, b.Address], ['Needs a ride', 'Ann Lee', '9 Oak Ave']);
  /* Members get the form link to pass on, never the sheet. */
  const memberCfg = ann('getAll').config.rideForm;
  assert.deepEqual(memberCfg, {formUrl: 'https://forms.gle/carpool1'});
  assert.equal(off('getAll').config.rideForm.sheetId, 'SHEET1');
});

test('a form answer wakes the sync: the carpool sheet gets an onFormSubmit trigger', () => {
  const on = (kind) => g.triggers.filter((t) => t.fn === 'syncOnChange' && t.kind === kind).map((t) => t.src);
  assert.deepEqual(on('submit'), ['SHEET1'], 'form answers never fire onChange, so this is what notices them');
  assert.ok(on('change').includes('SHEET1'), 'typing on the Carpools tab still does');
  const before = g.triggers.length;
  g.as(() => g.syncInstall_());
  assert.equal(g.triggers.length, before, 'installed once, not again on every keep-warm');
  /* The submit event names its sheet through e.range, not e.source. */
  delete g.props['syncDueAt'];
  g.as(() => g.syncOnChange({range: {getSheet: () => ({getParent: () => ({getId: () => 'SHEET1'})})}}));
  assert.ok(g.props['syncSheetAt:SHEET1'], 'the carpool sheet is stamped as edited');
  assert.ok(g.triggers.some((t) => t.fn === 'syncDue'), 'and one sync is booked');
  g.triggers.filter((t) => t.fn === 'syncDue').forEach((t) => g.triggers.splice(g.triggers.indexOf(t), 1));
  delete g.props['syncDueAt'];
});

test('an edit here reaches the sheet in the same request', () => {
  assert.ok(bo('rideSave', {role: 'rider', note: 'Two bags'}).ok);
  assert.equal(tabRow('Bo Chan').Note, 'Two bags');
  assert.ok(off('rideAssign', {who: 'cypark', car: ''}).ok);
  assert.equal(tabRow('Cy Park').Car, '');
});

test('a form answer becomes a ride, matched by email or by name', () => {
  const resp = sheet().getSheetByName('Form Responses 1');
  resp.appendRow([new Date(), 'dee.vu@x.com', 'Deanna Vu', 'I need a ride', '', 'At my address (fill it in below)', '400 Pine St', 'San Jose', '', 'Yes', '408 555 0104', 'Can leave after 2']);
  resp.appendRow([new Date(), 'zed@other.com', 'Zed Newman', 'I can drive', '4', 'De Anza College', '', 'Cupertino', '2:15 PM', 'No', '408 555 0109', '']);
  g.as(() => { g.accountsFor = () => [{email: 'dee.vu@x.com', first: 'Dee', last: 'Vu'}]; });
  const r = run('form');
  assert.ok(r.ok, JSON.stringify(r.errors));
  const d = ride('deevu'), z = ride('zednewman');
  assert.deepEqual([d.name, d.role, d.from, d.addr, d.area, d.back, d.note], ['Dee Vu', 'rider', 'addr', '400 Pine St', 'San Jose', true, 'Can leave after 2']);
  assert.deepEqual([z.role, z.seats, z.leave, z.back, z.from], ['driver', 4, '14:15', false, 'deanza']);
  assert.equal(tabRow('Dee Vu').Role, 'Needs a ride', 'the answer is on the Carpools tab too');
  /* Answering again updates the same person instead of adding a second row. */
  resp.appendRow([new Date(), 'dee.vu@x.com', 'Dee Vu', 'I need a ride', '', 'De Anza College', '', 'San Jose', '', 'Yes', '408 555 0104', '']);
  run('form again');
  assert.equal(ride('deevu').from, 'deanza');
  assert.equal(tabRows().filter((x) => x.Name === 'Dee Vu').length, 1);
  assert.equal(run('nothing new').ran[0].toOrg, 0, 'old answers are not read twice');
});

test('an officer typing on the Carpools tab changes the ride here', () => {
  const t = sheet().getSheetByName('Carpools'), v = t.getDataRange().getValues(), h = v[0];
  const at = v.findIndex((r) => r[0] === 'Zed Newman') + 1;
  t.getRange(at, h.indexOf('Seats') + 1).setValue('3');
  const bo = v.findIndex((r) => r[0] === 'Dee Vu') + 1;
  t.getRange(bo, h.indexOf('Car') + 1).setValue('Zed Newman');
  editedSheet();
  run('sheet edit');
  assert.equal(ride('zednewman').seats, 3);
  assert.equal(ride('deevu').car, 'zednewman');
});

test('when both sides changed, the latest edit wins', () => {
  const t = sheet().getSheetByName('Carpools'), v = t.getDataRange().getValues(), h = v[0];
  t.getRange(v.findIndex((r) => r[0] === 'Ann Lee') + 1, h.indexOf('Note') + 1).setValue('From the sheet');
  editedSheet();
  g.tick(60000);
  assert.ok(ann('rideSave', {role: 'driver', note: 'From the dashboard'}).ok);
  assert.equal(ride('annlee').note, 'From the dashboard');
  assert.equal(tabRow('Ann Lee').Note, 'From the dashboard');
});

test('clearing a driver on the sheet removes them and frees their riders', () => {
  const t = sheet().getSheetByName('Carpools'), v = t.getDataRange().getValues();
  const at = v.findIndex((r) => r[0] === 'Ann Lee') + 1;
  t.getRange(at, 1, 1, v[0].length).clearContent();
  editedSheet();
  run('sheet removal');
  assert.equal(ride('annlee'), undefined);
  assert.equal(ride('bochan').car, '');
  assert.equal(tabRow('Bo Chan').Car, '', 'the freed rider shows as waiting on the sheet too');
});

console.log('\n' + passed + ' passed');
