/* Runs Code.gs + Sync.gs under Node against an in-memory spreadsheet and
   checks pmSaveTeam: a consulting PM edits their own client team, and nobody
   else (and nothing else) gets through. No Google services are touched.
   node apps-script/test/pm.test.js */
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

/* ---- the club: two client teams, each with two PMs ---- */
const AFF = 'deanza-pbl';
const club = {
  teams: [
    {id: 'c-ork', kind: 'consulting', client: 'Orkizz', name: 'Orkizz', track: 'c', pms: ['Fay Ho', 'Gus Ray'],
     members: ['Fay Ho', 'Gus Ray', 'Cy Park', 'Hal Ng'], initiatives: ['Market research', 'Pricing'], assign: {'cy park': 'Pricing'}},
    {id: 'c-sky', kind: 'consulting', client: 'Sky Campus', name: 'Sky Campus', track: 'c', pms: ['Ivy Lu', 'Jo Kim'],
     members: ['Ivy Lu', 'Jo Kim', 'Kat Oh'], initiatives: ['Outreach'], assign: {}},
    {id: 'f-fin', kind: 'flc', event: 'Finance', name: 'Finance 1', track: 'k', members: ['Ann Lee'], pms: ['Fay Ho']}
  ],
  consultStage: {'c-ork': 'scope', 'c-sky': 'research'},
  clubName: 'De Anza PBL'
};
const org = new Book('ORG', {
  Config: [['Key', 'Value'], ['club:' + AFF, JSON.stringify(club)]],
  Teams: [['MemberName', 'Org', 'Track', 'Year', 'MBTI', 'LeadInterest', 'IsLead', 'Notes', 'Affiliation', 'Availability', 'Focus'],
    ['Fay Ho', 'Org 1', 'c', '', '', '', '', '', AFF], ['Gus Ray', 'Org 1', 'c', '', '', '', '', '', AFF], ['Cy Park', 'Org 2', 'c', '', '', '', '', '', AFF],
    ['Hal Ng', 'Org 2', 'c', '', '', '', '', '', AFF], ['Ivy Lu', 'Org 3', 'c', '', '', '', '', '', AFF], ['Kat Oh', 'Org 3', 'c', '', '', '', '', '', AFF]]
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
const stored = () => { fresh(); return JSON.parse(org.getSheetByName('Config').get(1, 1)); };
const team = (id) => stored().teams.find((t) => t.id === id);
/* The caller as doPost hands them to dispatch: the role from the Roles tab, the name from their account. */
const as = (name, role) => (action, payload) => { fresh(); return ctx.dispatch(action, payload, name.toLowerCase().replace(/ /g, '.') + '@x.com', role || 'member', {aff: AFF, name: name, who: name}); };
const fay = as('Fay Ho'), cy = as('Cy Park'), ivy = as('Ivy Lu');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

test('pmSaveTeam is open to members (the PM check is inside it)', () => {
  assert.equal(ctx.NEEDS.pmSaveTeam, 'member');
  assert.ok(ctx.READ_ONLY.pmSaveTeam === undefined, 'a write must take the write lock');
});

test('a PM edits initiatives, assignments and the stage of their own team', () => {
  const r = fay('pmSaveTeam', {teamId: 'c-ork', initiatives: ['Market research', 'Pricing', 'Brand'], assign: {'Cy Park': 'Brand', 'Hal Ng': 'Market research'}, stage: 'research'});
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.team.initiatives, ['Market research', 'Pricing', 'Brand']);
  const t = team('c-ork');
  assert.deepEqual(t.initiatives, ['Market research', 'Pricing', 'Brand']);
  assert.deepEqual(t.assign, {'cy park': 'Brand', 'hal ng': 'Market research'});
  assert.equal(stored().consultStage['c-ork'], 'research');
  /* Nothing else on the team or the club moved. */
  assert.deepEqual(t.pms, ['Fay Ho', 'Gus Ray']);
  assert.deepEqual(t.members, ['Fay Ho', 'Gus Ray', 'Cy Park', 'Hal Ng']);
  assert.equal(stored().consultStage['c-sky'], 'research');
  assert.deepEqual(team('c-sky'), club.teams[1]);
  assert.equal(stored().clubName, 'De Anza PBL');
});

test('the second PM can edit too, and dropping an initiative clears who was on it', () => {
  const r = as('Gus Ray')('pmSaveTeam', {teamId: 'c-ork', initiatives: ['Market research']});
  assert.ok(r.ok, r.error);
  assert.deepEqual(team('c-ork').assign, {'hal ng': 'Market research'});
});

test('a member of the team who is not a PM is refused', () => {
  const before = JSON.stringify(stored());
  const r = cy('pmSaveTeam', {teamId: 'c-ork', initiatives: ['Mine now'], stage: 'done'});
  assert.equal(r.ok, false);
  assert.match(r.error, /project manager/);
  assert.equal(JSON.stringify(stored()), before);
});

test('a PM cannot edit another client team', () => {
  const before = JSON.stringify(stored());
  const r = fay('pmSaveTeam', {teamId: 'c-sky', stage: 'done', initiatives: ['Hijacked']});
  assert.equal(r.ok, false);
  assert.match(r.error, /Sky Campus/);
  assert.equal(JSON.stringify(stored()), before);
  /* ...nor a competition team that happens to list them. */
  const f = fay('pmSaveTeam', {teamId: 'f-fin', stage: 'done'});
  assert.equal(f.ok, false);
  assert.equal(JSON.stringify(stored()), before);
});

test('a PM cannot change other fields: members, PMs, name, client', () => {
  const before = JSON.stringify(stored());
  [{teamId: 'c-ork', pms: ['Fay Ho', 'Cy Park']}, {teamId: 'c-ork', members: ['Fay Ho']}, {teamId: 'c-ork', name: 'Fay’s team', stage: 'done'},
   {teamId: 'c-ork', client: 'Other'}, {teamId: 'c-ork', teams: []}].forEach((pl) => {
    const r = fay('pmSaveTeam', pl);
    assert.equal(r.ok, false, JSON.stringify(pl));
    assert.match(r.error, /initiatives, assignments and the stage only/);
  });
  assert.equal(JSON.stringify(stored()), before);
});

test('assignments must name team members and existing initiatives; sizes are capped', () => {
  const before = JSON.stringify(stored());
  assert.match(fay('pmSaveTeam', {teamId: 'c-ork', assign: {'Kat Oh': 'Market research'}}).error, /not on this team/);
  assert.match(fay('pmSaveTeam', {teamId: 'c-ork', assign: {'Cy Park': 'Made up'}}).error, /not one of this team/);
  assert.match(fay('pmSaveTeam', {teamId: 'c-ork', initiatives: 'a,b'}).error, /list/);
  assert.match(fay('pmSaveTeam', {teamId: 'c-ork', initiatives: ['1', '2', '3', '4', '5', '6', '7', '8', '9']}).error, /up to 8/);
  assert.match(fay('pmSaveTeam', {teamId: 'c-ork', stage: 'launched'}).error, /stage/);
  assert.match(fay('pmSaveTeam', {teamId: 'c-ork', initiatives: ['x'.repeat(9000)]}).error, /too much/);
  assert.equal(JSON.stringify(stored()), before);
  const r = fay('pmSaveTeam', {teamId: 'c-ork', initiatives: ['  Brand <b>  ', 'brand b', 'Pricing'.repeat(20)]});
  assert.ok(r.ok);
  assert.deepEqual(team('c-ork').initiatives, ['Brand b', 'Pricing'.repeat(20).slice(0, 60)]);
});

test('a PM of the other team edits only theirs; an officer may edit any', () => {
  assert.ok(ivy('pmSaveTeam', {teamId: 'c-sky', stage: 'deliver'}).ok);
  assert.equal(stored().consultStage['c-sky'], 'deliver');
  assert.equal(ivy('pmSaveTeam', {teamId: 'c-ork', stage: 'done'}).ok, false);
  assert.ok(as('Officer Kim', 'admin')('pmSaveTeam', {teamId: 'c-ork', stage: 'deliver'}).ok);
  assert.equal(stored().consultStage['c-ork'], 'deliver');
});

console.log('\n' + passed + ' passed');
