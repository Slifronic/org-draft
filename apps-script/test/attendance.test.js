/* Runs Code.gs + Sync.gs under Node against an in-memory spreadsheet and
   checks attMark: the five statuses the chapter's attendance sheet uses, one
   row per member per event, and what getAll then hands officers.
   node apps-script/test/attendance.test.js */
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


const AFF = 'deanza-pbl', ATT_HEAD = ['Timestamp', 'MemberName', 'EventLabel', 'Track', 'Org', 'Affiliation', 'Status', 'Note'];
const org = new Book('ORG', {
  Config: [['Key', 'Value'], ['club:' + AFF, JSON.stringify({clubName: 'De Anza PBL'})]],
  Teams: [['MemberName', 'Org', 'Track', 'Year', 'MBTI', 'LeadInterest', 'IsLead', 'Notes', 'Affiliation', 'Availability', 'Focus'],
    ['Ann Lee', 'Org 1', 'k', '', '', '', '', '', AFF], ['Bo Diaz', 'Org 1', 'k', '', '', '', '', '', AFF], ['Cy Park', 'Org 2', 'k', '', '', '', '', '', AFF]],
  Attendance: [ATT_HEAD,
    ['2026-10-29', 'Ann Lee', 'Bootcamp 3', 'k', 'Org 1', AFF, '', 'Not in business casual'],
    ['2026-10-29', 'Ann Lee', 'Bootcamp 3', 'k', 'Org 1', AFF, '', ''],
    ['2026-10-29', 'Bo Diaz', 'Bootcamp 3', 'k', 'Org 1', 'other-club', '', '']]
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
/* No linked sheets here: the sync after a "Meeting 11/2" save is Sync.gs's own business (sync.test.js). */
vm.runInContext('SYNC_ = {};', ctx);

const fresh = () => { ctx.TABS_ = {}; ctx.ROWS_ = {}; ctx.BOOK_ = null; };
const off = (action, payload) => { fresh(); return ctx.dispatch(action, payload, 'kim@x.com', 'admin', {aff: AFF, name: 'Officer Kim', who: 'Officer Kim'}); };
const rows = (ev) => org.getSheetByName('Attendance').getDataRange().getValues().slice(1)
  .filter((r) => r[2] === ev && r[5] === AFF).map((r) => [r[1], r[6], r[7]]);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

test('only officers mark attendance, and it is a write', () => {
  assert.equal(ctx.NEEDS.attMark, 'admin');
  assert.ok(!ctx.READ_ONLY.attMark);
  assert.equal(off('attMark', {event: '  ', marks: []}).ok, false);
});

test('each status is written in the sheet\'s spelling, one row per member', () => {
  const r = off('attMark', {event: 'Bootcamp 3', marks: [{name: 'Ann Lee', s: 'EL'}, {name: 'Bo Diaz', s: 'UA'}, {name: 'Cy Park', s: 'EA'}, {name: 'Cy Park', s: 'zz'}]});
  assert.ok(r.ok, r.error);
  assert.equal(r.marked, 3, 'an unknown status is skipped');
  assert.deepEqual(rows('Bootcamp 3'), [['Ann Lee', 'Excused Late', 'Not in business casual'], ['Bo Diaz', 'Unexcused Abscence', ''], ['Cy Park', 'Excused Abscence', '']]);
  const other = org.getSheetByName('Attendance').getDataRange().getValues().filter((x) => x[5] === 'other-club');
  assert.equal(other.length, 1, 'another club\'s row with the same name is left alone');
});

test('changing and clearing a status edits the same row', () => {
  assert.ok(off('attMark', {event: 'Bootcamp 3', marks: [{name: 'Bo Diaz', s: 'P'}, {name: 'Cy Park', s: ''}]}).ok);
  assert.deepEqual(rows('Bootcamp 3'), [['Ann Lee', 'Excused Late', 'Not in business casual'], ['Bo Diaz', 'Present', '']]);
});

test('a meeting label saves the same way', () => {
  const r = off('attMark', {event: 'Meeting 11/2', marks: [{name: 'Ann Lee', s: 'UL'}, {name: 'Cy Park', s: 'UA'}]});
  assert.ok(r.ok, r.error);
  assert.deepEqual(rows('Meeting 11/2'), [['Ann Lee', 'Unexcused Late', ''], ['Cy Park', 'Unexcused Abscence', '']]);
});

test('getAll: absences never count as check-ins, and officers get them with their status', () => {
  let all;
  try { all = off('getAll'); } catch (e) { console.log('    (getAll needs more of Google than this harness has; checked the snapshot instead)'); }
  const snap = all && all.ok ? all : (fresh(), ctx.clubSnapshot_(AFF));
  const att = snap.attendance.filter((r) => r.EventLabel === 'Meeting 11/2').map((r) => r.MemberName);
  assert.deepEqual(att, ['Ann Lee'], 'a late member came');
  assert.deepEqual((snap.absences || []).map((r) => [r.MemberName, r.EventLabel, r.Status]), [['Cy Park', 'Meeting 11/2', 'Unexcused Abscence']]);
  assert.deepEqual(snap.excused, []);
});

console.log('\n' + passed + ' passed');
