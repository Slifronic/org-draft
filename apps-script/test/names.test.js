/* Runs Code.gs + Sync.gs under Node against an in-memory spreadsheet and
   checks how sheet names find a member: a two-word first name, a
   nickname in brackets, and the PBL Member Master's Aliases tab.
   node apps-script/test/names.test.js */
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

const AFF = 'deanza-pbl', MASTER = '1qovgO_lam_eFknHpWH9lQWRL1m1YVtL8DrbTlmwM5DE';
const org = new Book('ORG', {
  Config: [['Key', 'Value'], ['club:' + AFF, JSON.stringify({clubName: 'De Anza PBL'})]],
  Teams: [['MemberName', 'Org', 'Track', 'Year', 'MBTI', 'LeadInterest', 'IsLead', 'Notes', 'Affiliation', 'Availability', 'Focus'],
    ['Yen Nhi Britcher', '', '', '', '', '', '', '', AFF], ['Koshin Gokhale', '', '', '', '', '', '', '', AFF], ['Isaac Mendoza', '', '', '', '', '', '', '', AFF],
    ['Cindy Nguyen', '', '', '', '', '', '', '', AFF], ['Cindy Tran', '', '', '', '', '', '', '', AFF]],
  Users: [['Username', 'ClientSalt', 'ServerSalt', 'Hash', 'Iterations', 'Role', 'FailCount', 'LockedUntil', 'CreatedBy', 'CreatedAt', 'Affiliation', 'FirstName', 'LastName', 'Email'],
    ['y@x.com', '', '', '', '', 'member', '', '', '', '', AFF, 'Yufeng', 'Li (Felix)', 'y@x.com']]
});
const members = new Book(MASTER, {
  Aliases: [['As Written', 'Member ID', 'Canonical Name', 'Same As Canonical', 'Where'],
    ['Jeremy Mendoza | Isaac Kio', 'PBL-074', 'Isaac Mendoza', 'no', 'Attendance 10/13'], ['Koshin', 'PBL-096', 'Koshin Gokhale', 'no', 'Teams'],
    ['Cindy', 'PBL-052', 'Cindy Nguyen', 'no', 'Attendance'], ['Cindy', 'PBL-053', 'Cindy Tran', 'no', 'Attendance']]
});
const ctx = {
  console, Logger: {log() {}},
  SpreadsheetApp: {openById: (id) => (id === MASTER ? members : org), getActive: () => org},
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
const roster = () => { ctx.TABS_ = {}; ctx.ROWS_ = {}; ctx.BOOK_ = null; ctx.SBOOK_ = {}; vm.runInContext('SYNC_ALIASES_ = {};', ctx); return ctx.syncRoster_(AFF); };
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

test('a two-word first name with the surname beside it is that member', () => {
  const r = roster();
  assert.equal(ctx.attPerson_('Yen Nhi', 'Britcher', r), 'Yen Nhi Britcher');
  assert.equal(ctx.attPerson_('Yen Nhi Britcher', '', r), 'Yen Nhi Britcher', 'the whole name in First Name still works');
});

test('a nickname in brackets on the account does not make a second person', () => {
  const r = roster();
  assert.equal(ctx.attPerson_('Yufeng', 'Li', r), 'Yufeng Li (Felix)');
  assert.equal(ctx.syncMatchName_('Yufeng Li', r), 'Yufeng Li (Felix)');
});

test('the member master resolves spellings the roster has never seen', () => {
  const r = roster();
  assert.equal(ctx.attPerson_('Jeremy Mendoza', 'Isaac Kio', r), 'Isaac Mendoza');
  assert.equal(ctx.syncMatchName_('Koshin', r), 'Koshin Gokhale');
});

test('a spelling the master gives two people is ignored', () => {
  const r = roster();
  assert.equal(ctx.syncMatchName_('Cindy', r), 'Cindy', 'left as typed, not guessed');
});

test('fuzzy matching still finds one member through several spellings of them', () => {
  const r = roster();
  assert.equal(ctx.syncMatchName_('Koshin Gokhal', r), 'Koshin Gokhale');
});

test('no member master: the roster alone, as before', () => {
  vm.runInContext('SYNC_MEMBERS_ = {};', ctx);
  const r = roster();
  assert.equal(ctx.syncMatchName_('Koshin', r), 'Koshin');
  assert.equal(ctx.attPerson_('Yen Nhi', 'Britcher', r), 'Yen Nhi Britcher');
});

console.log('\n' + passed + ' passed');
