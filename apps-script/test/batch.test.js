/* Runs Code.gs + Sync.gs under Node against an in-memory spreadsheet and
   checks the batch action: several reads in one request, each refused or
   answered exactly as it would be on its own.
   node apps-script/test/batch.test.js */
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
    ['Ann Lee', 'Org 1', 'k', '', '', '', '', '', AFF]]
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
  CacheService: {getScriptCache: () => ({get: () => null, put() {}, remove() {}, getAll: () => ({}), putAll() {}})},
  ContentService: {MimeType: {JSON: 'json'}, createTextOutput: (s) => ({setMimeType: () => ({body: JSON.parse(s)})})}
};
vm.createContext(ctx);
const dir = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8') + '\n' + fs.readFileSync(path.join(dir, 'Sync.gs'), 'utf8'), ctx);
let who = {ok: true, who: 'ann.lee@x.com', role: 'member', aff: AFF, name: 'Ann Lee'};
vm.runInContext('identify = function () { return __who(); };', Object.assign(ctx, {__who: () => who}));
const post = (action, payload) => { ctx.TABS_ = {}; ctx.ROWS_ = {}; ctx.BOOK_ = null; return ctx.doPost({postData: {contents: JSON.stringify({action, payload})}}).body; };
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

test('batch is a read anyone signed in may send', () => {
  assert.equal(ctx.NEEDS.batch, 'member');
  assert.ok(ctx.READ_ONLY.batch);
});

test('each call is answered in order, as if sent alone', () => {
  const r = post('batch', [{action: 'rideList'}, {action: 'myInbox'}]);
  assert.ok(r.ok, r.error);
  assert.equal(r.results.length, 2);
  assert.ok(r.results[0].ok && Array.isArray(r.results[0].rides));
  assert.deepEqual(r.results[1], post('myInbox'));
});

test('a member is refused the officer reads inside a batch, and keeps the rest', () => {
  const r = post('batch', [{action: 'clubRoster'}, {action: 'rideList'}]);
  assert.equal(r.results[0].ok, false);
  assert.match(r.results[0].error, /needs admin/);
  assert.ok(r.results[1].ok);
});

test('writes, unknown actions and nested batches never ride along', () => {
  const r = post('batch', [{action: 'rideSave', payload: {role: 'own'}}, {action: 'nope'}, {action: 'batch', payload: []}]);
  assert.deepEqual(r.results.map((x) => x.error), ['Unknown action.', 'Unknown action.', 'Unknown action.']);
  assert.equal(post('rideList').rides.length, 0, 'the write inside the batch did nothing');
});

test('an officer gets the officer reads', () => {
  who = {ok: true, who: 'kim@x.com', role: 'admin', aff: AFF, name: 'Officer Kim'};
  const r = post('batch', [{action: 'clubRoster'}, {action: 'extList'}]);
  assert.ok(r.results[0].ok, r.results[0].error);
  assert.ok(r.results[1].ok && Array.isArray(r.results[1].ext));
});

test('an account that has not joined a club is turned away', () => {
  who = {ok: true, who: 'new@x.com', role: 'member', aff: '', name: 'New', needsAff: true};
  const r = post('batch', [{action: 'getAll'}]);
  assert.equal(r.ok, false);
  assert.ok(r.needsAff);
});

console.log('\n' + passed + ' passed');
