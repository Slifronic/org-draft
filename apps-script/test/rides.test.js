/* Runs Code.gs + Sync.gs under Node against an in-memory spreadsheet and
   checks the carpool actions: seats are respected, a driver who stops frees
   their riders, and a member sees phone numbers only inside their own car.
   node apps-script/test/rides.test.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

/* ---- a small in-memory Sheets (as in sync.test.js) ---- */
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, {sh, r, c, nr: nr || 1, nc: nc || 1}); }
  cells(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r - 1 + i, this.c - 1 + j, i, j); }
  getValues() { const o = []; for (let i = 0; i < this.nr; i++) { o.push([]); for (let j = 0; j < this.nc; j++) o[i].push(this.sh.get(this.r - 1 + i, this.c - 1 + j)); } return o; }
  getDisplayValues() { return this.getValues().map((r) => r.map((v) => String(v))); }
  setValues(v) { this.cells((r, c, i, j) => this.sh.set(r, c, v[i][j])); return this; }
  setValue(v) { this.cells((r, c) => this.sh.set(r, c, v)); return this; }
  clearContent() { this.cells((r, c) => this.sh.set(r, c, '')); return this; }
  setFontWeight() { return this; }
}
class Sheet {
  constructor(ss, name, rows) { this.ss = ss; this.name = name; this.v = (rows || []).map((r) => r.slice()); }
  get(r, c) { return (this.v[r] && this.v[r][c] !== undefined) ? this.v[r][c] : ''; }
  set(r, c, x) { while (this.v.length <= r) this.v.push([]); this.v[r][c] = x; this.ss.writes++; }
  getName() { return this.name; }
  getLastRow() { for (let r = this.v.length - 1; r >= 0; r--) if ((this.v[r] || []).some((x) => x !== '' && x != null)) return r + 1; return 0; }
  getLastColumn() { let m = 0; this.v.forEach((r) => { for (let c = r.length - 1; c >= 0; c--) if (r[c] !== '' && r[c] != null) { m = Math.max(m, c + 1); break; } }); return m; }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(row) { const r = this.getLastRow(); row.forEach((x, c) => this.set(r, c, x)); }
  deleteRows(at, n) { this.v.splice(at - 1, n); }
  setFrozenRows() {}
}
class Book {
  constructor(id, tabs) { this.id = id; this.writes = 0; this.sheets = Object.keys(tabs).map((n) => new Sheet(this, n, tabs[n])); }
  getId() { return this.id; }
  getName() { return this.id; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(this, n, []); this.sheets.push(s); return s; }
  getSpreadsheetTimeZone() { return 'America/Los_Angeles'; }
}


const AFF = 'deanza-pbl';
const org = new Book('ORG', {
  Config: [['Key', 'Value'], ['club:' + AFF, JSON.stringify({clubName: 'De Anza PBL'})]],
  Teams: [['MemberName', 'Org', 'Track', 'Year', 'MBTI', 'LeadInterest', 'IsLead', 'Notes', 'Affiliation', 'Availability', 'Focus'],
    ['Ann Lee', 'Org 1', 'k', '', '', '', '', '', AFF], ['Bo Diaz', 'Org 1', 'k', '', '', '', '', '', AFF],
    ['Cy Park', 'Org 2', 'k', '', '', '', '', '', AFF], ['Dee Vu', 'Org 2', 'k', '', '', '', '', '', AFF]]
});
const ctx = {
  console, Logger: {log() {}},
  SpreadsheetApp: {openById: () => org, getActive: () => org},
  LockService: {getScriptLock: () => ({hasLock: () => true, tryLock: () => true, waitLock() {}, releaseLock() {}})},
  PropertiesService: {getScriptProperties: () => ({getProperty: () => null, setProperty() {}, deleteProperty() {}})},
  ScriptApp: {getProjectTriggers: () => [], deleteTrigger() {}},
  DriveApp: {getFileById: () => ({getLastUpdated: () => new Date()})},
  Session: {getScriptTimeZone: () => 'America/Los_Angeles'},
  Utilities: {formatDate: (d) => new Date(d).toISOString(), getUuid: () => require('crypto').randomUUID()},
  CacheService: {getScriptCache: () => ({get: () => null, put() {}, remove() {}, getAll: () => ({}), putAll() {}})}
};
vm.createContext(ctx);
const dir = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8') + '\n' + fs.readFileSync(path.join(dir, 'Sync.gs'), 'utf8'), ctx);

const fresh = () => { ctx.TABS_ = {}; ctx.ROWS_ = {}; ctx.BOOK_ = null; };
/* The caller as doPost hands them to dispatch: the role from the Roles tab, the name from their account. */
const as = (name, role) => (action, payload) => { fresh(); return ctx.dispatch(action, payload, name.toLowerCase().replace(/ /g, '.') + '@x.com', role || 'member', {aff: AFF, name: name, who: name}); };
const rides = () => { fresh(); return ctx.dashRow_('rides:' + AFF, []); };
const ride = (who) => rides().find((x) => x.who === who);
const ann = as('Ann Lee'), bo = as('Bo Diaz'), cy = as('Cy Park'), dee = as('Dee Vu'), off = as('Officer Kim', 'admin');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

test('members save their own entry; listing is a read, saving is a write', () => {
  assert.equal(ctx.NEEDS.rideSave, 'member');
  assert.equal(ctx.NEEDS.rideAssign, 'admin');
  assert.ok(ctx.READ_ONLY.rideList && !ctx.READ_ONLY.rideSave);
  const r = ann('rideSave', {role: 'driver', seats: 2, from: 'deanza', leave: '13:00', back: true, phone: '408 555 0101', note: '<b>Sedan</b>'});
  assert.ok(r.ok, r.error);
  assert.deepEqual([ride('annlee').role, ride('annlee').seats, ride('annlee').note], ['driver', 2, 'bSedan/b']);
  assert.equal(ann('rideSave', {role: 'driver', seats: 9}).ok, false);
  assert.equal(ann('rideSave', {role: 'pilot'}).ok, false);
});

test('riders join while there are seats, and a full car refuses', () => {
  assert.ok(bo('rideSave', {role: 'rider', car: 'annlee', phone: '408 555 0102'}).ok);
  assert.ok(cy('rideSave', {role: 'rider', car: 'annlee'}).ok);
  const r = dee('rideSave', {role: 'rider', car: 'annlee'});
  assert.equal(r.ok, false);
  assert.match(r.error, /full/);
  assert.ok(dee('rideSave', {role: 'rider'}).ok, 'waiting without a car is fine');
  assert.equal(ride('deevu').car, '');
  assert.match(dee('rideSave', {role: 'rider', car: 'nobody'}).error, /no longer offered/);
  /* Saving again without naming a car keeps the one you are in. */
  assert.ok(bo('rideSave', {role: 'rider', note: 'Bringing snacks'}).ok);
  assert.equal(ride('bodiaz').car, 'annlee');
});

test('a driver cannot cut seats below their riders', () => {
  assert.match(ann('rideSave', {role: 'driver', seats: 1}).error, /2 riders/);
  assert.equal(ride('annlee').seats, 2);
});

test('members see phones only inside their own car; officers see all', () => {
  const ph = (list, who) => (list.find((x) => x.who === who) || {}).phone;
  const forBo = bo('rideList').rides, forDee = dee('rideList').rides, forOff = off('rideList').rides;
  assert.equal(ph(forBo, 'annlee'), '408 555 0101');
  assert.equal(ph(forDee, 'annlee'), undefined);
  assert.equal(ph(forDee, 'bodiaz'), undefined);
  assert.equal(forDee.length, 4, 'everyone is listed, just without numbers');
  assert.equal(ph(forOff, 'bodiaz'), '408 555 0102');
});

test('officers move and remove riders, with the same seat check', () => {
  assert.match(off('rideAssign', {who: 'deevu', car: 'annlee'}).error, /full/);
  assert.ok(off('rideAssign', {who: 'cypark', car: ''}).ok);
  assert.ok(off('rideAssign', {who: 'deevu', car: 'annlee'}).ok);
  assert.equal(ride('deevu').car, 'annlee');
  assert.equal(off('rideAssign', {who: 'annlee', car: 'annlee'}).ok, false, 'a driver is not a rider');
  assert.equal(dee('rideAssign', {who: 'cypark', car: 'annlee'}).ok, false, 'members cannot assign');
});

test('a driver who stops driving sends their riders back to waiting', () => {
  assert.ok(ann('rideSave', {role: 'own'}).ok);
  assert.deepEqual([ride('bodiaz').car, ride('deevu').car], ['', '']);
  assert.ok(off('rideAssign', {who: 'bodiaz', remove: true}).ok);
  assert.equal(ride('bodiaz'), undefined);
  assert.ok(ann('rideSave', {role: 'none'}).ok);
  assert.equal(ride('annlee'), undefined);
});

console.log('\n' + passed + ' passed');
