/**
 * The Org System — backend
 * ------------------------------------------------------------------
 * Deploy: Extensions > Apps Script from your club Sheet, paste this in,
 * then Deploy > New deployment > Web app,
 *   Execute as:      Me
 *   Who has access:  Anyone
 * "Anyone" is correct and is not a hole. It means Google will run this
 * script for an anonymous request; it does not mean the script trusts one.
 * Every request below must carry an ID token that Google signed, and the
 * role is looked up here from the Roles tab — never taken from the page.
 * Deploying "execute as user accessing" instead would break the plain
 * cross-origin fetch the page relies on, for no security gain.
 */

var CLIENT_ID    = '60468094639-p10c21qva7269q2p6lqhucg488g98caa.apps.googleusercontent.com';                        // <-- same OAuth Web client ID as index.html
var MASTER_EMAIL = 'bryguy.vo@gmail.com';     // <-- cannot be demoted or removed
var SHEET_ID     = '';                        // leave '' if this script is bound to the Sheet

var RANK  = {none: 0, member: 1, admin: 2, master: 3};
var NEEDS = {
  whoami: 'member',      getAll: 'member',
  setTeams: 'admin',     addPointsBulk: 'admin',  addAttendanceBulk: 'admin',
  setConfig: 'admin',
  changePassword: 'member',
  listRoles: 'master',   setRole: 'master',       removeRole: 'master',
  listUsers: 'master',   createUser: 'master',    deleteUser: 'master',
  resetPassword: 'master', setUserRole: 'master',
  myProfile: 'member',   joinAffiliation: 'member',
  createAffiliation: 'master', updateAffiliation: 'master', deleteAffiliation: 'master',
  getProfile: 'member', saveProfile: 'member', setMyPassword: 'member',
  memberCard: 'member', formSchema: 'member', submitForm: 'member',
  listSignups: 'admin', deleteSignup: 'admin', setOrgName: 'member',
  myFormAnswers: 'member', submitWork: 'member', calendarSync: 'admin',
  listSubmissions: 'admin', reviewSubmission: 'admin',
  formItems: 'admin', saveFormItems: 'admin',
  purgeClub: 'admin',
  clubRoster: 'admin', cloneForm: 'admin', republishForm: 'admin',
  forkClub: 'admin',
  submitTeamRequest: 'member', withdrawTeamRequest: 'member', listTeamRequests: 'member',
  reviewTeamRequest: 'admin', editTeamRequest: 'admin', reviewSubmissions: 'admin', deleteTeamRequest: 'admin',
  syncMemberDrives: 'admin', ensureMyDrive: 'member'
};
/* The script runs as its owner, so anything it creates is owned by the master
   account and the officer who asked for it cannot open the form or read a
   single response. Sharing is what closes that, and it is done as editor
   rather than by transferring ownership on purpose: the club keeps its form
   and its answers when an officer graduates or is removed. */
function shareWithOfficers(fileIds, who) {
  var ok = [], failed = [];
  if (!who) return {shared: ok, failed: failed};
  fileIds.forEach(function (id) {
    if (!id) return;
    try { DriveApp.getFileById(id).addEditor(who); ok.push(id); }
    catch (e) { failed.push(String(e.message || e)); }
  });
  return {shared: ok, failed: failed};
}

/* Hand a file to the club's own Google account. The script's account is added
   as an editor before the transfer, because after it the script is no longer
   the owner and would otherwise lose the access it needs to publish the form
   and read the answers. Consumer accounts can refuse or defer a transfer, so a
   failure is reported rather than swallowed -- the file still exists and is
   still shared, it just did not change hands. */
function handOwnership(fileIds, newOwner) {
  var moved = [], failed = [];
  newOwner = String(newOwner || '').trim();
  if (!newOwner) return {moved: moved, failed: failed, skipped: true};
  if (newOwner.toLowerCase() === String(MASTER_EMAIL).toLowerCase())
    return {moved: moved, failed: failed, skipped: true};
  fileIds.forEach(function (fid) {
    if (!fid) return;
    try {
      var f = DriveApp.getFileById(fid);
      try { f.addEditor(MASTER_EMAIL); } catch (e) {}
      f.setOwner(newOwner);
      moved.push(fid);
    } catch (e) {
      failed.push(String(e.message || e));
    }
  });
  return {moved: moved, failed: failed, skipped: false};
}

/* A form copied through Drive arrives unpublished. Google's newer Forms
   publishing model then serves "This document is not published" on the very
   URL getPublishedUrl() hands back, which is exactly what a club sees when it
   opens its brand new form. The method names differ across Apps Script
   runtimes, so each is feature-detected and each failure is reported rather
   than swallowed -- a form that silently is not accepting answers is worse
   than one that says so. */
function publishForm(form) {
  var did = [], failed = [];
  if (typeof form.setPublished === 'function') {
    try { form.setPublished(true); did.push('published'); }
    catch (e) { failed.push('setPublished: ' + e.message); }
  }
  if (typeof form.setPublishedAudience === 'function') {
    try { form.setPublishedAudience('ANYONE'); did.push('audience=anyone'); }
    catch (e) { failed.push('setPublishedAudience: ' + e.message); }
  }
  try { form.setAcceptingResponses(true); did.push('accepting responses'); }
  catch (e) { failed.push('setAcceptingResponses: ' + e.message); }
  try { form.setRequireLogin(false); did.push('no sign-in required'); }
  catch (e) { /* consumer accounts reject this; not fatal */ }
  return {did: did, failed: failed};
}

/* ---------------- one-time authorisation ----------------
   Run this once from the editor after pasting or changing this file, and
   accept the prompt. Verifying a sign-in means calling Google's tokeninfo
   endpoint, which needs the script.external_request scope; a deployment
   authorised under an older version of this file will not have it, and every
   signed-in request fails with "You do not have permission to call
   UrlFetchApp.fetch" until someone grants it. It is deliberately the first
   function in the file so the editor's Run menu selects it by default. */
function authorize() {
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x',
                            {muteHttpExceptions: true});
  var sheets = book().getSheets().length;
  CacheService.getScriptCache().put('authcheck', '1', 10);
  var l = LockService.getScriptLock(); l.waitLock(2000); l.releaseLock();
  /* Apps Script works out which scopes to ask for from the calls it can see,
     so this has to perform the same writes cloneForm does, not just reads.
     Reading the template only earned drive.readonly, and makeCopy needs
     drive -- which is why the first real attempt still failed. Doing the
     whole sequence here and throwing the results away both requests the
     right scopes and proves the path works before a club depends on it. */
  var tpl  = DriveApp.getFileById(FORM_TEMPLATE_ID).getName();
  var q    = FormApp.openById(FORM_TEMPLATE_ID).getItems().length;
  var copy = DriveApp.getFileById(FORM_TEMPLATE_ID).makeCopy('Scope check \u2014 safe to delete');
  var form = FormApp.openById(copy.getId());
  var ss   = SpreadsheetApp.create('Scope check \u2014 safe to delete');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  var pubres = publishForm(form);
  var pub  = form.getPublishedUrl();
  /* Fetch the published URL before throwing the copy away. Asking Google
     whether the form is reachable is the only check that means anything --
     setPublished can return without error and still leave "This document is
     not published" on the page a club would open. */
  var vis = 'not checked', got = -1;
  try {
    var chk = UrlFetchApp.fetch(pub, {muteHttpExceptions: true, followRedirects: true});
    got = chk.getResponseCode();
    var body = chk.getContentText();
    vis = (got === 200 && body.indexOf('not published') < 0) ? 'REACHABLE'
        : (body.indexOf('not published') > -1 ? 'STILL UNPUBLISHED' : 'HTTP ' + got);
  } catch (e) { vis = 'fetch failed: ' + e.message; }
  Logger.log('Publish step -- did: ' + pubres.did.join(', ') +
             (pubres.failed.length ? ' | FAILED: ' + pubres.failed.join(' ; ') : '') +
             '\nPublished URL: ' + pub +
             '\nRespondent view: ' + vis + ' (HTTP ' + got + ')');
  DriveApp.getFileById(copy.getId()).setTrashed(true);
  DriveApp.getFileById(ss.getId()).setTrashed(true);
  Logger.log('Authorised. tokeninfo reachable (HTTP ' + r.getResponseCode() +
             '), ' + sheets + ' sheets visible, cache and lock OK. ' +
             'Template \"' + tpl + '\" readable with ' + q + ' questions. ' +
             'Copy, response sheet and link all succeeded (' + pub.slice(0, 48) +
             '...) and both test files were trashed.');
}

/* Every account, merged from the two doors people come in through: a password
   row in Users, or a Google address in Roles. Profiles supplies the name and
   photo they set afterwards. Pass an affiliation to get just that club, or
   null for the whole system. Returns nothing credential-shaped -- no hash, no
   salt, no token -- because both callers hand this straight to a browser. */
function accountsFor(only) {
  var affNames = {};
  allAffiliations().forEach(function (a) { affNames[a.code] = a.name; });
  var profs = {};
  readTab('profiles').forEach(function (r) {
    profs[String(r.Email).toLowerCase() + '|' + normAff(r.Affiliation)] =
      {first: r.FirstName, last: r.LastName, photo: r.Photo,
       /* The onboarding answers, so officers can form Orgs straight from the
          people who signed up. Only ever returned to admin-level callers
          (clubRoster, listSignups); memberCard picks its own fields. */
       year: r.Year, track: r.Track, mbti: r.MBTI, avail: r.Availability,
       notes: r.FormNotes, prefs: r.Prefs};
  });
  var out = [];
  function push(who, kind, a, pr, r, joined, how, email) {
    if (only && a !== normAff(only)) return;
    out.push({who: who, kind: kind,
              first: capName_(r.FirstName || pr.first || ''), last: capName_(r.LastName || pr.last || ''),
              email: email, role: String(r.Role || 'member').toLowerCase(),
              aff: a, affName: affNames[a] || a, joined: joined || '',
              how: how || '', photo: pr.photo || '',
              year: String(pr.year || ''), track: String(pr.track || ''), mbti: fmtMbti_(pr.mbti),
              avail: String(pr.avail || ''), notes: String(pr.notes || ''), prefs: String(pr.prefs || '')});
  }
  readTab('users').forEach(function (r) {
    if (!r.Username) return;
    var a = normAff(r.Affiliation || DEFAULT_AFF);
    push(String(r.Username), 'password', a,
         profs[String(r.Username).toLowerCase() + '|' + a] || {}, r,
         r.CreatedAt, r.CreatedBy, r.Email || r.Username);
  });
  readTab('roles').forEach(function (r) {
    if (!r.Email) return;
    var a = normAff(r.Affiliation || DEFAULT_AFF);
    push(String(r.Email), 'google', a,
         profs[String(r.Email).toLowerCase() + '|' + a] || {}, r,
         r.GrantedAt, r.GrantedBy, String(r.Email));
  });

  /* The master holds no row in Roles -- the address is set in the script --
     so they were absent from every club's roster while being the one person
     who belongs to all of them. They show up as a member of the club being
     listed, with whatever name and photo they saved there, and keep the
     master role rather than being shown as an ordinary member. */
  var mE = String(MASTER_EMAIL).toLowerCase();
  if (mE) {
    var mA = only ? normAff(only) : DEFAULT_AFF;
    var mp = profs[mE + '|' + mA] || {};
    out.push({who: mE, kind: 'google', first: mp.first || '', last: mp.last || '',
              email: mE, role: 'master', aff: mA,
              affName: only ? (affNames[mA] || mA) : 'every club',
              joined: '', how: 'script', photo: mp.photo || '', isMaster: true});
  }
  return out;
}

/* 'login' is deliberately absent: it is the one action that runs before any
   identity exists, and it is handled ahead of the permission check. */

/* Password handling. Apps Script has no bcrypt/scrypt/argon2, and its crypto
   calls carry roughly 2ms of fixed overhead each, so an iterated KDF here is
   impractical -- 6000 rounds measured at twelve seconds per login.
   So the stretching happens in the browser instead: it runs PBKDF2-SHA256 at
   PBKDF2_ITERS over the password and sends only the derived key. Two things
   follow. The server never receives the password at all, and the work factor
   is set by a fast native implementation rather than by what Apps Script can
   afford. The server still salts and hashes what it receives, so the sheet
   never holds anything replayable on its own. */
var PBKDF2_ITERS = 210000;
var PW_MIN = 10;
var MAX_FAILS = 8;              // consecutive failures before a lockout
var LOCKOUT_MS = 15 * 60 * 1000;
var SESSION_MS = 7 * 24 * 60 * 60 * 1000;
/* Affiliation is appended to every tab that holds club data, and is always the
   LAST column, so a sheet written by an earlier version can be upgraded by
   adding cells rather than being rebuilt. One spreadsheet now holds several
   clubs side by side; nothing is read or written without a scope. */
var TAB = {
  roles:      {name: 'Roles',      cols: ['Email', 'Role', 'GrantedBy', 'GrantedAt', 'Affiliation']},
  /* Availability (Fall 2026) is appended after Affiliation rather than before
     it: ensureHeader widens a sheet in place only when the old header is a
     prefix of the new one, so inserting would archive the live Teams tab. */
  teams:      {name: 'Teams',      cols: ['MemberName', 'Org', 'Track', 'Year', 'MBTI', 'LeadInterest', 'IsLead', 'Notes', 'Affiliation',
                                          'Availability']},
  pointsLog:  {name: 'PointsLog',  cols: ['Timestamp', 'MemberName', 'ActionId', 'ActionLabel', 'Points', 'Track', 'Org', 'Affiliation']},
  attendance: {name: 'Attendance', cols: ['Timestamp', 'MemberName', 'EventLabel', 'Track', 'Org', 'Affiliation']},
  roster:     {name: 'Form Responses 1', cols: null, readOnly: true},
  config:     {name: 'Config',     cols: ['Key', 'Value']},
  /* New fields are appended, never inserted, so an existing Users sheet is
     widened in place and nobody's account is archived by an upgrade. */
  users:      {name: 'Users',      cols: ['Username', 'ClientSalt', 'ServerSalt', 'Hash', 'Iterations',
                                          'Role', 'FailCount', 'LockedUntil', 'CreatedBy', 'CreatedAt', 'Affiliation',
                                          'FirstName', 'LastName', 'Email']},
  affiliations: {name: 'Affiliations', cols: ['Code', 'Name', 'JoinCode', 'CreatedBy', 'CreatedAt']},
  /* Per-person editable details, separate from credentials so a Google user
     who has no Users row still has somewhere to keep a name and a picture. */
  submissions:{name: 'Submissions', cols: ['Affiliation', 'WorkId', 'WorkTitle', 'MemberName', 'Org',
                                           'FileId', 'FileName', 'FileUrl', 'SubmittedAt', 'Revision',
                                           'Status', 'Points', 'ReviewedBy', 'ReviewedAt', 'Comment',
                                           'FirstAt']},
  profiles:   {name: 'Profiles',   cols: ['Email', 'Affiliation', 'FirstName', 'LastName', 'Photo',
                                          'Year', 'Track', 'MBTI', 'LeadInterest', 'FormNotes', 'FormAt',
                                          'Birthday', 'Availability', 'Prefs']}
};
var DEFAULT_AFF = 'default';
/* The form every club starts from. Copied per club rather than shared, so one
   club editing its questions cannot change another club's form. */
var FORM_TEMPLATE_ID = '1J1Y-GqHHukEvjBSC12yN2rfcRpBxPXWkhY0Ve0JbRZ0';


/* ---------------- plumbing ---------------- */

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
/* Opening the spreadsheet costs a round trip inside Google every time, and one
   request used to open it once per tab it touched. One execution, one open. */
var BOOK_ = null;
function book() {
  if (!BOOK_) BOOK_ = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActive();
  return BOOK_;
}
/* The Users sheet holds credentials, so its column order is load-bearing: read
   it with the wrong layout and every login silently fails against the wrong
   cell. If the header does not match what this version expects, the old sheet
   is renamed and kept rather than deleted -- nobody should lose data to a
   schema change they did not know was happening -- and a clean one is started.
   Accounts on the archived sheet need recreating; that is deliberate, because
   a credential read out of the wrong column is worse than an absent one. */
/* Every tab's header is checked against what this version expects. Columns
   added at the end are filled in place, because that is a widening and loses
   nothing. Anything else is a genuine mismatch: the old sheet is renamed and
   kept -- nobody should lose data to a schema change they did not know was
   happening -- and a clean one started. */
function ensureHeader(sh, cols, name, ss) {
  var width = Math.max(cols.length, sh.getLastColumn() || 0);
  var head = sh.getLastRow() ? sh.getRange(1, 1, 1, width).getValues()[0] : [];
  var blank = true;
  for (var b = 0; b < head.length; b++) if (String(head[b]) !== '') { blank = false; break; }
  if (blank) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
    return sh;
  }
  /* head was read at the NEW width, so it is padded with blanks wherever this
     version added a column. Comparing against those blanks would make every
     append look like a mismatch and archive a perfectly good sheet -- which is
     exactly what happened to the Users tab once. Measure the real header
     first, then compare only that far. */
  var lastReal = 0;
  for (var k = 0; k < head.length; k++) if (String(head[k]) !== '') lastReal = k + 1;

  var isPrefix = true;
  for (var i = 0; i < lastReal && i < cols.length; i++)
    if (String(head[i]) !== cols[i]) { isPrefix = false; break; }
  if (isPrefix && lastReal <= cols.length) {
    for (var j = lastReal; j < cols.length; j++)
      sh.getRange(1, j + 1).setValue(cols[j]);
    return sh;
  }
  if (isPrefix) return sh;   // sheet has extra columns of its own; leave them
  sh.setName(name + ' (old ' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss') + ')');
  var fresh = ss.insertSheet(name);
  fresh.getRange(1, 1, 1, cols.length).setValues([cols]);
  fresh.setFrozenRows(1);
  return fresh;
}

/* Per-execution memo. A request reads 'config' three or four times and each
   read re-checked the header and re-pulled the whole tab. Reads are shared
   for the length of one request; anything that asks for a tab through tab()
   may be about to write to it, so that drops the cached rows for that tab. */
var TABS_ = {}, ROWS_ = {};
function tab(key) {
  delete ROWS_[key];
  return tabRead_(key);
}
function tabRead_(key) {
  if (TABS_.hasOwnProperty(key)) return TABS_[key];
  return (TABS_[key] = tabOpen_(key));
}
function tabOpen_(key) {
  var spec = TAB[key], ss = book(), sh = ss.getSheetByName(spec.name);
  if (!sh) {
    // The Form response tab belongs to the Form; never conjure a fake one.
    if (spec.readOnly) return null;
    sh = ss.insertSheet(spec.name);
    sh.getRange(1, 1, 1, spec.cols.length).setValues([spec.cols]);
    sh.setFrozenRows(1);
    return sh;
  }
  if (!spec.cols) return sh;
  return ensureHeader(sh, spec.cols, spec.name, ss);
}
function usersSheet() { return tab('users'); }

/* Reads a tab and keeps only the rows belonging to one affiliation. Rows
   written before affiliations existed have a blank one and belong to the
   default club, so an existing roster keeps working. */
function readScoped(key, aff) {
  aff = String(aff || DEFAULT_AFF).toLowerCase();
  return readTab(key).filter(function (r) {
    var a = String(r.Affiliation || DEFAULT_AFF).toLowerCase();
    return a === aff;
  });
}
/* Rows are only shared within a read-only request. A write request reads its
   own writes back, and holding stale rows there is how a duplicate slips in. */
var MEMO_ROWS_ = false;
function readTab(key) {
  if (!MEMO_ROWS_) return readTabFresh_(key);
  if (ROWS_.hasOwnProperty(key)) return ROWS_[key].slice();
  var rows = readTabFresh_(key);
  ROWS_[key] = rows;
  return rows.slice();
}
function readTabFresh_(key) {
  var sh = tabRead_(key);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0], rows = [];
  for (var i = 1; i < values.length; i++) {
    var o = {}, blank = true;
    for (var c = 0; c < head.length; c++) {
      var v = values[i][c];
      o[head[c]] = v;
      if (v !== '' && v !== null) blank = false;
    }
    /* A row that simply repeats the header is not a member. */
    var echoesHeader = true;
    for (var d = 0; d < head.length; d++)
      if (String(values[i][d]) !== String(head[d])) { echoesHeader = false; break; }
    if (!blank && !echoesHeader) rows.push(o);
  }
  return rows;
}
function appendRows(key, objs) {
  if (!objs || !objs.length) return 0;
  var sh = tab(key), cols = TAB[key].cols;
  var block = objs.map(function (o) {
    return cols.map(function (c) { return o[c] === undefined ? '' : o[c]; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, block.length, cols.length).setValues(block);
  return block.length;
}

/* ---------------- identity ----------------
   The token is verified by Google, not by us: tokeninfo checks the signature
   against Google's keys and rejects anything expired or altered. We then check
   the audience ourselves, because a validly-signed token minted for somebody
   else's app must not be accepted here. Verified results are cached briefly so
   a burst of writes doesn't mean a round trip each. */

function verifiedEmail(token) {
  var v = verifiedToken_(token);
  return v ? v.email : null;
}
/* The verified address, plus the name on the Google account. The name is
   what a Google member is known by until they put one on their profile;
   without it they were known only by their address, and nothing filed under
   their name -- their Org, teams, hand-ins -- ever matched them. */
function verifiedToken_(token) {
  if (!token) return null;
  if (!CLIENT_ID) return null;

  var cache = CacheService.getScriptCache();
  var key = 'tok2_' + Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    {muteHttpExceptions: true});
  if (res.getResponseCode() !== 200) return null;

  var p;
  try { p = JSON.parse(res.getContentText()); } catch (e) { return null; }

  if (p.aud !== CLIENT_ID) return null;
  if (p.iss !== 'accounts.google.com' && p.iss !== 'https://accounts.google.com') return null;
  if (String(p.email_verified) !== 'true') return null;
  if (!p.email) return null;

  var v = {email: String(p.email).toLowerCase(), name: String(p.name || '').slice(0, 80)};
  cache.put(key, JSON.stringify(v), 300);
  return v;
}

/* ---------------- passwords & sessions ----------------
   Sessions are stateless: a signed string, not a row. The signature is an
   HMAC over "username|expiry" using a secret generated once and kept in Script
   Properties, so the sheet never holds anything that can be replayed and there
   is no session table to prune. Changing the secret logs everyone out. */

function sessionSecret() {
  var props = PropertiesService.getScriptProperties();
  var k = props.getProperty('SESSION_SECRET');
  if (!k) {
    k = Utilities.base64Encode(Utilities.getUuid() + '|' + Utilities.getUuid());
    props.setProperty('SESSION_SECRET', k);
  }
  return k;
}
function b64url(bytesOrString) {
  return Utilities.base64EncodeWebSafe(bytesOrString).replace(/=+$/, '');
}
function signSession(username, expiresAt) {
  var body = b64url(username + '|' + expiresAt);
  var mac = b64url(Utilities.computeHmacSha256Signature(body, sessionSecret()));
  return 'v1.' + body + '.' + mac;
}
/* Returns the username, or null for anything altered, expired or malformed. */
function readSession(tok) {
  if (!tok || String(tok).indexOf('v1.') !== 0) return null;
  var parts = String(tok).split('.');
  if (parts.length !== 3) return null;
  var expect = b64url(Utilities.computeHmacSha256Signature(parts[1], sessionSecret()));
  if (parts[2] !== expect) return null;
  var raw;
  try { raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString(); }
  catch (e) { return null; }
  var i = raw.lastIndexOf('|');
  if (i < 0) return null;
  var user = raw.slice(0, i), exp = Number(raw.slice(i + 1));
  if (!exp || exp < Date.now()) return null;
  return user.toLowerCase();
}

/* One cheap hash: the expensive stretching already happened in the browser. */
function hashDk(dk, serverSalt) {
  return Utilities.base64Encode(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(serverSalt) + '|' + String(dk), Utilities.Charset.UTF_8));
}
/* An unknown username must still get a salt, and the same one every time, or
   the reply becomes an oracle for which accounts exist. Deriving it from the
   session secret makes it stable and unguessable without leaking anything. */
function saltFor(username) {
  var rec = findUser(username);
  if (rec && rec.clientSalt) return {salt: rec.clientSalt, iterations: rec.iters};
  return {salt: b64url(Utilities.computeHmacSha256Signature('salt:' + normUser(username), sessionSecret())),
          iterations: PBKDF2_ITERS};
}
function normUser(u) { return String(u || '').toLowerCase().trim(); }

/* Finds a user row, addressed by column NAME rather than position. This table
   holds credentials, and reading a credential out of the wrong column is the
   kind of bug that fails silently and looks like a wrong password, so the
   layout is never assumed -- reorder or insert a column and this still reads
   the right cells. */
/* ---------------- affiliations ---------------- */
function normAff(a) { return String(a || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'); }
function allAffiliations() {
  return readTab('affiliations').filter(function (r) { return r.Code; }).map(function (r) {
    return {code: normAff(r.Code), name: String(r.Name || r.Code), joinCode: String(r.JoinCode || '')};
  });
}
function findAff(code) {
  var c = normAff(code), all = allAffiliations();
  for (var i = 0; i < all.length; i++) if (all[i].code === c) return all[i];
  return null;
}
/* The affiliation a Google address belongs to, from the Roles tab. Every
   signed-in request asks, so the tab is read once and kept for five minutes;
   any write through the page drops the copy (see doPost). An edit made
   straight in the sheet shows within those five minutes. */
function affForEmail(email) {
  var e = String(email || '').toLowerCase().trim();
  return rolesMap_()[e] || null;
}
function rolesMap_() {
  var c = null, hit = null;
  try { c = CacheService.getScriptCache(); hit = c.get('rolesmap'); } catch (err) {}
  if (hit) { try { return JSON.parse(hit); } catch (err) {} }
  var m = {};
  readTab('roles').forEach(function (r) {
    var e = String(r.Email || '').toLowerCase().trim();
    if (e && !m[e]) m[e] = {aff: normAff(r.Affiliation || DEFAULT_AFF), role: String(r.Role || 'member').toLowerCase()};
  });
  try { var j = JSON.stringify(m); if (c && j.length < 90000) c.put('rolesmap', j, 300); } catch (err) {}
  return m;
}
function dropRoles_() { try { CacheService.getScriptCache().remove('rolesmap'); } catch (err) {} }

function findUser(username) {
  var u = normUser(username);
  if (!u) return null;
  var sh = usersSheet(), vals = sh.getDataRange().getValues();
  if (vals.length < 2) return null;
  var idx = {}, head = vals[0];
  for (var c = 0; c < head.length; c++) idx[String(head[c])] = c;
  if (idx.Username === undefined) return null;
  for (var i = 1; i < vals.length; i++) {
    if (normUser(vals[i][idx.Username]) !== u) continue;
    var g = function (name) {
      var k = idx[name];
      return k === undefined ? '' : vals[i][k];
    };
    return {row: i + 1, username: u, col: idx, sheet: sh,
            clientSalt: g('ClientSalt'), serverSalt: g('ServerSalt'), hash: g('Hash'),
            affiliation: normAff(g('Affiliation') || DEFAULT_AFF),
            iters: Number(g('Iterations')) || PBKDF2_ITERS,
            first: String(g('FirstName') || ''), last: String(g('LastName') || ''),
            email: String(g('Email') || ''),
            role: String(g('Role') || 'member').toLowerCase(),
            fails: Number(g('FailCount')) || 0,
            lockedUntil: Number(g('LockedUntil')) || 0};
  }
  return null;
}
/* Writes by column name too, for the same reason. */
function setUserField(rec, name, value) {
  var k = rec.col[name];
  if (k === undefined) return;
  rec.sheet.getRange(rec.row, k + 1).setValue(value);
}

/* The one place a password is checked. Never logs the password, and reports
   the same message for an unknown user and a wrong password so the endpoint
   cannot be used to enumerate who has an account. */
function doLogin(payload) {
  var u = normUser((payload || {}).username);
  var dk = String((payload || {}).dk || '');
  var generic = {ok: false, error: 'That username and password do not match.'};
  if (!u || !dk) return generic;

  var rec = findUser(u);
  if (!rec) { Utilities.sleep(250); return generic; }

  if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
    return {ok: false, error: 'Too many failed attempts. Try again in ' +
      Math.ceil((rec.lockedUntil - Date.now()) / 60000) + ' minutes.'};
  }
  if (hashDk(dk, rec.serverSalt) !== rec.hash) {
    var fails = rec.fails + 1;
    setUserField(rec, 'FailCount', fails);
    if (fails >= MAX_FAILS) setUserField(rec, 'LockedUntil', Date.now() + LOCKOUT_MS);
    Utilities.sleep(250);
    return generic;
  }
  setUserField(rec, 'FailCount', 0);
  setUserField(rec, 'LockedUntil', '');
  var exp = Date.now() + SESSION_MS;
  var full = (rec.first + ' ' + rec.last).trim();
  return {ok: true, session: signSession(rec.username, exp), role: rec.role,
          username: rec.username, name: full || rec.username,
          email: rec.email || '', aff: rec.affiliation,
          affName: (findAff(rec.affiliation) || {}).name || rec.affiliation,
          expires: exp};
}

/* Self-service sign-up. Anyone may create an account, but only into an
   affiliation whose join code they can produce, and only ever as a member --
   role is not something a stranger gets to choose. */
/* The account is keyed by email address, because that is the thing a member
   already knows and cannot accidentally pick twice. First and last name are
   kept separately so the roster can be matched on a real name rather than a
   login handle. */
function doSignup(payload) {
  var p = payload || {};
  var first = capName_(p.firstName);
  var last  = capName_(p.lastName);
  var email = String(p.email || '').toLowerCase().trim();
  var aff = findAff(p.affiliation);
  var given = String(p.joinCode || '').trim();

  if (!first) return {ok: false, error: 'Enter your first name.'};
  if (!last)  return {ok: false, error: 'Enter your last name.'};
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return {ok: false, error: 'Enter a valid email address.'};
  if (!aff) return {ok: false, error: 'Pick the club you are joining.'};
  if (!p.dk || !p.clientSalt) return {ok: false, error: 'The browser did not send a derived key.'};

  /* Wrong code and unknown club answer the same way, and both pause, so the
     endpoint cannot be used to hunt for valid codes. */
  if (String(aff.joinCode) !== given) {
    Utilities.sleep(400);
    return {ok: false, error: 'That join code does not match this club.'};
  }
  if (findUser(email)) return {ok: false, error: 'There is already an account for that email.'};

  var ssalt = Utilities.getUuid();
  tab('users').appendRow([email, String(p.clientSalt), ssalt, hashDk(p.dk, ssalt),
                          Number(p.iterations) || PBKDF2_ITERS, 'member', 0, '',
                          'self sign-up', new Date(), aff.code, first, last, email]);
  bumpShared_(aff.code);
  var exp = Date.now() + SESSION_MS;
  return {ok: true, session: signSession(email, exp), role: 'member',
          username: email, name: (first + ' ' + last).trim(), email: email,
          aff: aff.code, affName: aff.name, expires: exp};
}

/* ---------------- one identity, two doors ----------------
   A request proves who it is with either a Google ID token or a session from
   a password login. Everything downstream sees the same {who, role} shape and
   does not care which door was used. */
function identify(body) {
  if (body.session) {
    var u = readSession(body.session);
    if (!u) return {ok: false, error: 'Your session expired. Sign in again.'};
    var rec = findUser(u);
    if (!rec) return {ok: false, error: 'That account no longer exists.'};
    return {ok: true, who: rec.username, role: rec.role, via: 'password',
            name: (rec.first + ' ' + rec.last).trim() || rec.username,
            aff: normAff(rec.affiliation || DEFAULT_AFF)};
  }
  var email, gName = '';
  try { var vt = verifiedToken_(body.token); email = vt && vt.email; gName = capName_((vt && vt.name) || ''); }
  catch (err) { return {ok: false, error: 'Token check failed: ' + err}; }
  if (!email) {
    return {ok: false, error: CLIENT_ID
      ? 'Sign-in could not be verified. Sign out and back in.'
      : 'The backend has no CLIENT_ID set, so no sign-in can be verified yet.'};
  }
  /* The global master belongs everywhere and may look at any club by asking
     for one; everyone else is pinned to the affiliation they joined. A Google
     address with no affiliation yet is signed in but unplaced, and the page
     shows them the join screen rather than another club's data. */
  if (email === String(MASTER_EMAIL).toLowerCase()) {
    var mAff = normAff(body.aff || DEFAULT_AFF);
    return {ok: true, who: email, role: 'master', via: 'google', aff: mAff, isRoot: true,
            name: profileName_(mAff, email) || gName};
  }
  var hit = affForEmail(email);
  if (!hit) return {ok: true, who: email, role: 'member', via: 'google', aff: '', needsAff: true, name: gName};
  /* The name on their profile is the one the roster was built from, so it
     wins; the Google account's own name covers anyone who has not saved one. */
  return {ok: true, who: email, role: RANK[hit.role] ? hit.role : 'member', via: 'google', aff: hit.aff,
          name: profileName_(hit.aff, email) || gName};
}

function roleFor(email) {
  if (!email) return 'none';
  if (email === String(MASTER_EMAIL).toLowerCase()) return 'master';
  var hit = affForEmail(email);
  return hit && RANK[hit.role] ? hit.role : 'member';
}

/* ---------------- entry points ---------------- */

function doGet(e) {
  /* The one GET: the members' calendar feed, which calendar apps fetch on
     their own and cannot sign in for. It is opened by a per-club key that
     only reaches signed-in members, and it holds exactly what members see
     on the Calendar tab. The officers' calendar itself stays private. */
  var p = (e && e.parameter) || {};
  if (p.feed === 'ics') {
    try {
      var fAff = normAff(p.club || DEFAULT_AFF);
      if (!findAff(fAff) || !p.key || String(p.key) !== feedKey_(fAff))
        return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);
      /* Kept with the club's other cached reads, so it is rebuilt only after a
         change (or a calendar refresh), not every time a calendar app asks. */
      var ics = shared_('ics', fAff, function () { return {t: memberIcs_(fAff)}; }).t;
      return ContentService.createTextOutput(ics).setMimeType(ContentService.MimeType.ICAL);
    } catch (err) {
      try { console.error('feed: ' + (err && err.stack ? err.stack : err)); } catch (e2) {}
      return ContentService.createTextOutput('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//The Org System//EN\r\nEND:VCALENDAR\r\n')
        .setMimeType(ContentService.MimeType.ICAL);
    }
  }
  // Reads moved to POST so the token travels in the body, never in a URL.
  return out({ok: false, error: 'This endpoint expects a POST carrying a Google ID token.'});
}

/* ---- the members' calendar feed ----
   The season's fixed dates, as the page has them (F26.season in index.html):
   they live in the page, not on any calendar, so the feed needs its own copy.
   Keep the two in step. */
var SEASON_EVENTS_ = [
  {id: 'f26-orient', title: 'IM orientation', date: '2026-10-15'},
  {id: 'f26-boot1', title: 'Bootcamp 1 + team formation', date: '2026-10-20'},
  {id: 'f26-boot2', title: 'Bootcamp 2 \u2014 FLC / consulting split rooms', date: '2026-10-22'},
  {id: 'f26-mock', title: 'Mock case stations (week of Oct 27)', date: '2026-10-27'},
  {id: 'f26-flc1', title: 'FLC \u2014 Emeryville (day 1)', date: '2026-11-13', where: 'Emeryville'},
  {id: 'f26-flc2', title: 'FLC \u2014 Emeryville (day 2)', date: '2026-11-14', where: 'Emeryville'},
  {id: 'f26-flc3', title: 'FLC \u2014 Emeryville (day 3)', date: '2026-11-15', where: 'Emeryville'},
  {id: 'f26-final', title: 'Consulting finals', date: '2026-11-19'}
];
/* A random key per club, made the first time anyone asks. Changing it (delete
   the FEED_ property) cuts off every subscription made with the old one. */
function feedKey_(aff) {
  var props = PropertiesService.getScriptProperties(), k = 'FEED_' + normAff(aff);
  var v = props.getProperty(k);
  if (!v) { v = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); props.setProperty(k, v); }
  return v;
}
/* What a member sees on the Calendar tab: the club's own events that are not
   EBOD-only, the season's dates, and the Google Calendar's events that are
   not hidden from members. */
function memberEvents_(aff) {
  var key = 'club:' + aff, cfg = {};
  readTab('config').forEach(function (r) {
    if (String(r.Key) === key) { try { cfg = JSON.parse(r.Value) || {}; } catch (e) {} }
  });
  var gAll = readGcal_(aff), pulledOk = !!(gAll && gAll.events);
  var off = {}, have = {}, seen = {}, out = [];
  (cfg.seasonOff || []).forEach(function (id) { off[id] = 1; });
  var flat = function (t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var add = function (ev) {
    if (!ev || !ev.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(ev.date))) return;
    var k = flat(ev.title) + '|' + ev.date;
    if (seen[k]) return;
    seen[k] = 1; out.push(ev);
  };
  (cfg.events || []).forEach(function (ev) {
    if (!ev || ev.ebod || off[ev.id]) return;
    if (ev.pulled && pulledOk) return;      /* superseded by the stored Google copy */
    have[ev.id] = 1; add(ev);
  });
  /* Google's copy first: when a season date is also on the calendar, that
     one carries the time and the room. */
  gcalFor_(gAll || {}, cfg, 'member').events.forEach(add);
  SEASON_EVENTS_.forEach(function (ev) { if (!have[ev.id] && !off[ev.id]) add(ev); });
  out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return out;
}
function icsText_(v) {
  return String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/* Lines longer than 75 octets are folded, as the format requires. */
function icsFold_(line) {
  if (line.length <= 37) return line;          /* cannot reach 75 bytes even at 2 per char */
  var out = [], cur = '', n = 0;
  for (var i = 0; i < line.length; i++) {
    var code = line.charCodeAt(i), ch = line.charAt(i), b;
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < line.length) { ch += line.charAt(++i); b = 4; }
    else b = code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
    if (n + b > 74) { out.push(cur); cur = ' '; n = 1; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join('\r\n');
}
/* "5:00 pm", "7pm", "10:30 AM" -> [hours, minutes], or null when there is no
   clock time (an all-day event). */
function icsClock_(t) {
  var m = String(t || '').match(/^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m?\.?/i);
  if (!m) return null;
  var h = Number(m[1]) % 12 + (/p/i.test(m[3]) ? 12 : 0);
  return [h, Number(m[2] || 0)];
}
function memberIcs_(aff) {
  var tz = Session.getScriptTimeZone() || 'America/Los_Angeles';
  var name = (findAff(aff) || {}).name || aff;
  var stamp = Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var ymd = function (d) { return String(d).replace(/-/g, ''); };
  var nextDay = function (d) {
    var p = String(d).split('-'), t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + 1));
    return t.getUTCFullYear() + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate());
  };
  var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Org System//' + icsText_(name) + '//EN',
           'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsText_(name),
           'X-WR-TIMEZONE:' + tz, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H'];
  memberEvents_(aff).forEach(function (ev) {
    var uid = String(ev.gid ? ev.id : ev.id || (ev.title + ev.date)).replace(/[^A-Za-z0-9_.-]/g, '') + '@org.deanzapbl.com';
    var clock = icsClock_(ev.time);
    L.push('BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp);
    if (clock && !ev.end) {
      var s = ymd(ev.date) + 'T' + pad(clock[0]) + pad(clock[1]) + '00';
      var eh = clock[0] + 1, e2 = (eh < 24 ? ymd(ev.date) + 'T' + pad(eh) + pad(clock[1]) + '00' : ymd(ev.date) + 'T235900');
      L.push('DTSTART;TZID=' + tz + ':' + s, 'DTEND;TZID=' + tz + ':' + e2);
    } else {
      L.push('DTSTART;VALUE=DATE:' + ymd(ev.date), 'DTEND;VALUE=DATE:' + nextDay(ev.end || ev.date));
    }
    L.push('SUMMARY:' + icsText_(ev.title));
    if (ev.where) L.push('LOCATION:' + icsText_(ev.where));
    L.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(icsFold_).join('\r\n') + '\r\n';
}

/* Every path returns JSON. An exception escaping this function makes Apps
   Script serve an HTML error page instead, which a fetch() caller can only
   see as an opaque failure -- so nothing here is allowed to throw. */
function doPost(e) {
  try {
    var body;
    try { body = JSON.parse(e.postData.contents); }
    catch (err) { return out({ok: false, error: 'Malformed request.'}); }

    var action = body.action;

    /* Logging in is the one request that cannot already have an identity. */
    /* The browser needs this user's salt before it can derive anything, so it
       is answerable without an identity. It reveals nothing: unknown names get
       a stable salt derived from the server secret. */
    /* Names only. The join code is never sent to the browser -- it is the
       thing being proved, so returning it would defeat the point. */
    if (action === 'listAffiliations') {
      /* The keep-warm ping (every ten minutes) also does the slow work a
         member's first page load used to do: reading the Google Calendar and
         building the club's cached snapshot. Members then find it ready. */
      if ((body.payload || {}).warm) { try { warmClubs_(); } catch (err) {} }
      try {
        return out({ok: true, affiliations: allAffiliations().map(function (a) {
          return {code: a.code, name: a.name};
        })});
      } catch (err) { return out({ok: false, error: 'Could not list affiliations: ' + err}); }
    }

    if (action === 'signup') {
      var lockS = LockService.getScriptLock(), su;
      try { lockS.waitLock(20000); } catch (e) { return out({ok: false, error: 'Busy, try again.'}); }
      try { su = doSignup(body.payload); }
      catch (err) { return out({ok: false, error: 'Sign-up failed: ' + err}); }
      finally { try { lockS.releaseLock(); } catch (e2) {} }
      /* Everything the page would ask for next rides along, so a new account
         opens in one round trip rather than two. Built after the lock is
         released, so it does not hold up anybody else signing up. */
      if (su && su.ok) {
        MEMO_ROWS_ = true;
        try { su.all = dispatch('getAll', null, su.email, 'member',
                                {who: su.email, role: 'member', via: 'password', aff: su.aff, name: su.name}); }
        catch (e3) {}
      }
      return out(su);
    }

    if (action === 'getSalt') {
      try { return out({ok: true, salt: saltFor((body.payload || {}).username).salt,
                        iterations: saltFor((body.payload || {}).username).iterations}); }
      catch (err) { return out({ok: false, error: 'Salt lookup failed: ' + err}); }
    }

    if (action === 'login') {
      var lock0 = LockService.getScriptLock();
      try { lock0.waitLock(20000); } catch (e) { return out({ok: false, error: 'Busy, try again.'}); }
      try { return out(doLogin(body.payload)); }
      catch (err) { return out(failRef_('doLogin', err)); }
      finally { try { lock0.releaseLock(); } catch (e2) {} }
    }

    if (!NEEDS[action]) return out({ok: false, error: 'Unknown action.'});

    MEMO_ROWS_ = !!READ_ONLY[action];
    var id;
    try { id = identify(body); }
    catch (err) { return out(failRef_('identify', err)); }
    if (!id.ok) return out({ok: false, error: id.error});

    var email = id.who, role = id.role;

    if (RANK[role] < RANK[NEEDS[action]]) {
      return out({ok: false, error: 'Your account is ' + role + '. That action needs ' +
        NEEDS[action] + '.', role: role});
    }

    /* A Google account that has not joined a club yet is signed in but
       belongs nowhere. Without this it fell through to the default club and
       could read that club's roster and points with no join code at all. It
       may learn who it is and join; nothing else. */
    if (id.needsAff && action !== 'joinAffiliation' && action !== 'whoami') {
      if (action === 'getAll')
        return out({ok: true, role: role, email: email, name: id.name || email, via: id.via,
                    aff: '', needsAff: true});
      return out({ok: false, error: 'Join your club first.', needsAff: true});
    }

    /* Reads do not queue behind the write lock. At a meeting, forty members
       opening the page at once were served one at a time, each waiting on
       whoever was ahead -- a read cannot corrupt anything, so it skips the
       line. Writes still hold the lock exactly as before. */
    var lock = null;
    if (!READ_ONLY[action]) {
      try { lock = LockService.getScriptLock(); lock.waitLock(20000); }
      catch (err) { return out({ok: false, error: 'Sheet busy, try again.'}); }
    }
    var res, rebuild = false;
    try {
      res = dispatch(action, body.payload, email, role, id);
      /* A member's own folder is not part of what the club sees, and it is
         touched on every visit -- bumping for it would empty the cache for
         everyone each time a member opened the page. */
      if (!READ_ONLY[action] && clubWide_(action, body.payload)) { bumpShared_(id.aff || DEFAULT_AFF); rebuild = true; }
      if (OWN_BITS_[action]) dropMe_(normAff(id.aff || DEFAULT_AFF), email);
      if (!READ_ONLY[action]) dropRoles_();
    } catch (err) {
      return out(failRef_('dispatch:' + action, err));
    } finally {
      try { if (lock) lock.releaseLock(); } catch (err2) {}
    }
    /* The write emptied the club's cached snapshot. Rebuilding it here, after
       the lock is let go, costs the officer's background save a few seconds;
       leaving it cost the next member to open the page the same seconds,
       with a spinner in front of them. */
    if (rebuild && res && res.ok !== false) {
      try { ROWS_ = {}; MEMO_ROWS_ = true; clubSnapshot_(normAff(id.aff || DEFAULT_AFF)); } catch (err3) {}
    }
    return out(res);
  } catch (fatal) {
    return out(failRef_('doPost', fatal));
  }
}

/* Exceptions carry sheet names, row numbers and stack frames. The caller gets a
   generic line and a short reference; the detail stays in the script's own
   execution log, which only the owner can read. */
function failRef_(where, err) {
  var ref = Utilities.getUuid().slice(0, 8);
  try { console.error('[' + ref + '] ' + where + ': ' + (err && err.stack ? err.stack : err)); } catch (e) {}
  return {ok: false, error: 'Something went wrong on the server. Reference ' + ref + '.', ref: ref};
}

var READ_ONLY = {getAll: 1, whoami: 1, myProfile: 1, listUsers: 1, listRoles: 1,
                 listSignups: 1, listSubmissions: 1, getProfile: 1, memberCard: 1,
                 clubRoster: 1, formSchema: 1, formItems: 1};

/* ---- the Team Cup ----
   Computed here because only the server can see everybody's hand-in times,
   and members get the totals, never who handed in what. Each assignment with
   a due date is worth up to 100 to every team it was set for: the share of
   that team's members whose first hand-in landed by the end of the due day. */
function teamBoard_(aff, cfg) {
  cfg = cfg || {};
  var teams = cfg.teams || [], work = (cfg.work || []).filter(function (w) { return w && w.id && w.due; });
  if (!teams.length) return [];
  var flat = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var first = {};
  readTab('submissions').forEach(function (r) {
    if (normAff(r.Affiliation) !== aff) return;
    var at = r.FirstAt || r.SubmittedAt;
    if (at) first[String(r.WorkId) + '|' + flat(r.MemberName)] = new Date(at).getTime();
  });
  return teams.map(function (t) {
    var members = t.members || [], pts = 0, got = 0, of = 0, works = 0;
    work.forEach(function (w) {
      /* An assignment set for one Org is that Org's business, not every
         team's: Fall 2026 posts carry team:'all' plus an org. */
      var target = (w.team && w.team !== 'all') ? w.team
        : ((w.org !== undefined && w.org !== null && w.org !== '' && w.org !== 'all') ? 'org' : 'all');
      if (target !== 'all' && target !== t.id) return;
      if (!members.length) return;
      var p = String(w.due).split('-');
      var end = new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59).getTime();
      var g = 0;
      members.forEach(function (m) {
        var at = first[w.id + '|' + flat(m)];
        if (at && at <= end) g++;
      });
      got += g; of += members.length; works++;
      pts += Math.round(100 * g / members.length);
    });
    return {id: t.id, pts: pts, got: got, of: of, works: works};
  });
}

/* ---- Org Cups (Fall 2026) ----
   EBOD moved the Cup to the Org level. For each assignment with a due date
   that was set for everyone or for one Org, this counts how many of each
   Org's members handed it in by the end of the due day. The page turns that
   into cups (80% or more on time); members see counts, never who. */
function orgBoard_(aff, cfg) {
  cfg = cfg || {};
  var work = (cfg.work || []).filter(function (w) {
    return w && w.id && w.due && (!w.team || w.team === 'all');
  });
  var flat = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var orgs = {}, order = [];
  readScoped('teams', aff).forEach(function (r) {
    var o = String(r.Org || ''); if (!o || !r.MemberName) return;
    if (!orgs[o]) { orgs[o] = []; order.push(o); }
    orgs[o].push(flat(r.MemberName));
  });
  if (!order.length) return [];
  var first = {};
  readTab('submissions').forEach(function (r) {
    if (normAff(r.Affiliation) !== aff) return;
    var at = r.FirstAt || r.SubmittedAt;
    if (at) first[String(r.WorkId) + '|' + flat(r.MemberName)] = new Date(at).getTime();
  });
  return order.map(function (o) {
    return {org: o, works: work.filter(function (w) {
      return w.org === undefined || w.org === null || w.org === '' || w.org === 'all' || String(w.orgName || '') === o;
    }).map(function (w) {
      var p = String(w.due).split('-');
      var end = new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59).getTime();
      var got = 0;
      orgs[o].forEach(function (m) { var at = first[w.id + '|' + m]; if (at && at <= end) got++; });
      return {id: w.id, got: got, of: orgs[o].length};
    })};
  });
}

/* FLC preferences arrive as JSON text from the member's own page. Parsed and
   rebuilt here so only the known shape is stored: up to three ranked
   consulting clients, up to three event names,
   one requested teammate, whether they can attend, and the rooming answers --
   which rooming group, up to three roommates asked for, and a short note only
   officers read. Everyone who attends stays at the conference hotel, so
   "hotel" simply follows "attend"; it is kept for pages still sending it. */
function cleanPrefs_(raw) {
  var o;
  try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
  if (!o || typeof o !== 'object') return null;
  var txt = function (v, n) { return String(v || '').replace(/[<>\u0000-\u001F]/g, '').slice(0, n); };
  var flc = (o.flc || []).slice(0, 3).map(function (v) { return txt(v, 40); }).filter(String);
  var clients = (o.clients || []).slice(0, 3).map(function (v) { return txt(v, 60); }).filter(String);
  var roomies = (o.roomies || []).slice(0, 3).map(function (v) { return txt(v, 60); }).filter(String);
  var group = ['w', 'm', 'x'].indexOf(String(o.group)) > -1 ? String(o.group) : '';
  return JSON.stringify({flc: flc, clients: clients, mate: txt(o.mate, 60), attend: o.attend !== false,
    hotel: o.attend !== false, group: group, roomies: roomies, rnote: txt(o.rnote, 160),
    at: Number(o.at) || Date.now()});
}

/* ---- members forming their own teams ----
   Kept under a key of their own rather than on the club record: officers
   save the club record whole, so a request a member sent while an officer
   had the page open would be written over by that officer's next save. */
var TEAMREQ_KINDS = {consulting: 14, flc: 4, other: 14};
function cfgRow_(key) {
  var sh = tab('config'), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === key) return {sh: sh, row: i + 1, val: v[i][1]};
  return {sh: sh, row: -1, val: ''};
}
function readReqs_(aff) {
  var r = cfgRow_('teamreqs:' + aff);
  try { return JSON.parse(r.val || '[]') || []; } catch (e) { return []; }
}
function writeReqs_(aff, list) {
  var r = cfgRow_('teamreqs:' + aff), j = JSON.stringify(list);
  if (r.row > 0) r.sh.getRange(r.row, 2).setValue(j); else r.sh.appendRow(['teamreqs:' + aff, j]);
}
function withLock_(fn) {
  var l = LockService.getScriptLock();
  if (!l.tryLock(10000)) return {ok: false, error: 'Busy -- try again in a moment.'};
  try { return fn(); } finally { l.releaseLock(); }
}

/* Officers see the whole club record. Members get the same record without
   the events kept for officers, the links to the club's own files (the
   response sheet holds every member's answers), and every hotel room but
   their own -- who rooms with whom, and in which group, is not club news. */
var MEMBER_HIDDEN_CFG_ = ['sheetUrl', 'sheetId', 'formEditUrl', 'formId', 'ownerEmail', 'calHide'];
function memberCfg_(cfg, meName) {
  if (!cfg) return cfg;
  var c = {};
  for (var k in cfg) if (Object.prototype.hasOwnProperty.call(cfg, k)) c[k] = cfg[k];
  MEMBER_HIDDEN_CFG_.forEach(function (k) { delete c[k]; });
  if (cfg.events) c.events = cfg.events.filter(function (e) { return !(e && e.ebod); });
  if (cfg.rooms) {
    var me = flatName_(meName);
    c.rooms = me ? cfg.rooms.filter(function (r) {
      return (r && r.members || []).some(function (m) { return flatName_(m) === me; });
    }) : [];
  }
  return c;
}

/* What a member's browser gets of the club's rows. Everybody's name, Org,
   year and track is ordinary club knowledge -- it is on every Org page. A
   personality type, availability, leadership interest and officer notes are
   not, and neither are anybody else's points or attendance. These used to
   ride along to every member and were only hidden on screen, so anyone could
   read them out of the page or the browser's saved copy. */
function memberRows_(kind, rows, meName) {
  var me = flatName_(meName);
  if (kind === 'pointsLog' || kind === 'attendance')
    return rows.filter(function (r) { return me && flatName_(r.MemberName) === me; });
  return rows.map(function (r) {
    var mine = me && flatName_(r.MemberName) === me, c = {};
    for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) c[k] = r[k];
    c.Notes = '';
    if (!mine) { c.MBTI = ''; c.LeadInterest = ''; c.Availability = ''; }
    return c;
  });
}

/* ---- the chapter's Google Calendar, as members see it ----
   Everything on the connected calendar is shared with members unless an
   officer hides it -- one occurrence, or every occurrence of a repeating
   event. What came back from Google lives under a key of its own rather than
   on the club record: a season of weekly meetings is a few hundred rows, and
   the club record is one spreadsheet cell, which Sheets caps at 50,000
   characters. The hide list is small and stays on the club record
   (cfg.calHide), where officers already save. */
var GCAL_BACK_DAYS = 30, GCAL_AHEAD_DAYS = 240, GCAL_STALE_MS = 30 * 60 * 1000, GCAL_MAX_CHARS = 45000;
var GCAL_LATE_MS = 6 * 60 * 60 * 1000;
function readGcal_(aff) {
  var r = cfgRow_('gcal:' + aff);
  try { return JSON.parse(r.val || '{}') || {}; } catch (e) { return {}; }
}
function writeGcal_(aff, g) {
  /* Kept under the cell limit by dropping the furthest-out events first: the
     next refresh brings them back as they come into range. */
  while (g.events && g.events.length && JSON.stringify(g).length > GCAL_MAX_CHARS) g.events.pop();
  var r = cfgRow_('gcal:' + aff), j = JSON.stringify(g);
  if (r.row > 0) r.sh.getRange(r.row, 2).setValue(j); else r.sh.appendRow(['gcal:' + aff, j]);
}
function gcalHidden_(cfg, ev) {
  var h = (cfg && cfg.calHide) || {};
  return (h.ids || []).indexOf(ev.id) > -1 || (!!ev.gid && (h.series || []).indexOf(ev.gid) > -1);
}
/* Reads the calendar over the window and returns plain rows. Events the page
   itself put there (ownGids) are skipped: the page already shows them. */
function pullGcal_(cal, ownGids) {
  var tz = Session.getScriptTimeZone(), out = [], seen = {};
  var from = new Date(); from.setDate(from.getDate() - GCAL_BACK_DAYS);
  var to = new Date(); to.setDate(to.getDate() + GCAL_AHEAD_DAYS);
  cal.getEvents(from, to).forEach(function (gev) {
    var gid = gev.getId(), st = gev.getStartTime(), all = gev.isAllDayEvent();
    var day = Utilities.formatDate(all ? gev.getAllDayStartDate() : st, tz, 'yyyy-MM-dd');
    if (ownGids[gid + '|' + day] || seen[gid + '|' + day]) return;
    seen[gid + '|' + day] = true;
    /* A meeting link is not a place, and members should not be handed one
       from an officer's calendar. */
    var where = String(gev.getLocation() || '');
    if (/^https?:|teams\.microsoft|zoom\.us|meet\.google/i.test(where)) where = 'Online';
    var row = {
      id: 'g' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(
        Utilities.DigestAlgorithm.MD5, gid + '|' + day)).replace(/[^a-z0-9]/gi, '').slice(0, 14),
      gid: gid, title: String(gev.getTitle() || 'Event').slice(0, 80), date: day,
      time: all ? '' : Utilities.formatDate(st, tz, 'h:mm a').toLowerCase(),
      where: where.slice(0, 60)
    };
    if (all) {
      /* Google's all-day end is the day after; the page wants the last day. */
      var last = new Date(gev.getAllDayEndDate().getTime() - 86400000);
      var lastDay = Utilities.formatDate(last, tz, 'yyyy-MM-dd');
      if (lastDay > day) row.end = lastDay;
    }
    try { if (gev.isRecurringEvent()) row.rec = 1; } catch (e) {}
    out.push(row);
  });
  out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return out;
}
/* Brings the stored copy up to date when it is older than GCAL_STALE_MS.
   Cheap to call: it only talks to Google when the copy is stale, and only
   one request at a time does that -- anyone else is answered from the copy
   already there instead of queueing behind it. */
function refreshGcal_(aff, cfg, force) {
  var g = readGcal_(aff);
  if (!cfg || !cfg.gcalId) return g;
  if (!force && g.syncedAt && (new Date().getTime() - g.syncedAt) < GCAL_STALE_MS && g.calId === cfg.gcalId) return g;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(force ? 10000 : 50)) return g;
  try {
    var cal = null;
    try { cal = CalendarApp.getCalendarById(cfg.gcalId); } catch (e) { cal = null; }
    if (!cal) { g.error = 'The connected calendar cannot be opened.'; return g; }
    var own = {};
    (cfg.events || []).forEach(function (ev) { if (ev && ev.gid && !ev.pulled) own[ev.gid + '|' + ev.date] = true; });
    g = {calId: cfg.gcalId, syncedAt: new Date().getTime(), events: pullGcal_(cal, own)};
    writeGcal_(aff, g);
    return g;
  } catch (e) {
    g.error = String(e.message || e);
    return g;
  } finally { lock.releaseLock(); }
}
/* What the page gets: officers see every event with its hidden state;
   members only ever receive what is shared with them. */
function gcalFor_(g, cfg, role) {
  var isAdmin = RANK[role] >= RANK.admin, list = [];
  (g.events || []).forEach(function (ev) {
    var hid = gcalHidden_(cfg, ev);
    if (hid && !isAdmin) return;
    var c = {}; for (var k in ev) c[k] = ev[k];
    if (hid) c.hidden = 1;
    list.push(c);
  });
  return {events: list, syncedAt: g.syncedAt || 0, calId: g.calId || '', error: isAdmin ? (g.error || '') : ''};
}

/* One club as every page load sees it, before anything is trimmed for the
   caller's role. Cached (see shared_); photos and passwords never go in. */
function clubSnapshot_(aff) {
  return shared_('all', aff, function () {
    /* The club's vocabulary lives in the sheet too, so a second officer
       opening the page sees the same words as the officer who set them. */
    var key = 'club:' + aff, cfg = null;
    readTab('config').forEach(function (r) {
      if (String(r.Key) === key) { try { cfg = JSON.parse(r.Value); } catch (e) {} }
    });
    /* The connected calendar refreshes itself here, at most every half hour,
       so members see what is on it without an officer pressing anything. */
    /* The calendar is refreshed by the keep-warm ping, off the request
       path: reading 270 days of Google Calendar inline added seconds to
       whichever member happened to arrive when it was stale. Only a copy
       much older than that (the ping has stopped) is refreshed here. */
    var gAll = {};
    try {
      gAll = readGcal_(aff);
      if (cfg && cfg.gcalId && (!gAll.syncedAt || new Date().getTime() - gAll.syncedAt > GCAL_LATE_MS))
        gAll = refreshGcal_(aff, cfg, false);
    } catch (e) { gAll = {}; }
    var drive = {};
    var dm = readDrive_(aff).members || {};
    Object.keys(dm).forEach(function (k) { if (dm[k] && dm[k].f) drive[k] = 1; });
    return {cfg: cfg, gcal: gAll, drive: drive, reqs: readReqs_(aff),
            memberNames: memberNames_(aff), affName: (findAff(aff) || {}).name || aff,
            teamBoard: teamBoard_(aff, cfg), orgBoard: orgBoard_(aff, cfg),
            teams: readScoped('teams', aff), pointsLog: readScoped('pointsLog', aff),
            attendance: readScoped('attendance', aff)};
  });
}

/* Called by the keep-warm ping. Refreshes each club's calendar when it is
   stale and makes sure the club's snapshot is cached, so no member is the one
   who waits for either. Quick when there is nothing to do. */
function warmClubs_() {
  allAffiliations().forEach(function (a) {
    var key = 'club:' + a.code, cfg = null;
    readTab('config').forEach(function (r) {
      if (String(r.Key) === key) { try { cfg = JSON.parse(r.Value); } catch (e) {} }
    });
    if (cfg && cfg.gcalId) {
      var before = readGcal_(a.code);
      if (!before.syncedAt || new Date().getTime() - before.syncedAt > GCAL_STALE_MS) {
        var after = refreshGcal_(a.code, cfg, false);
        if (after.syncedAt !== before.syncedAt) bumpShared_(a.code);
      }
    }
    clubSnapshot_(a.code);
  });
}

/* The names members registered under, for picking teammates and roommates.
   Names only: no addresses, no roles, nothing a member could not already
   read off the roster once the Orgs are formed. */
function memberNames_(aff) {
  var seen = {}, out = [];
  accountsFor(aff).forEach(function (u) {
    var nm = String(((u.first || '') + ' ' + (u.last || '')).trim()).replace(/[<>\u0000-\u001F]/g, '').slice(0, 60);
    var k = nm.toLowerCase().replace(/[^a-z]/g, '');
    if (!k || seen[k]) return;
    seen[k] = 1; out.push(nm);
  });
  return out.sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
}

/* A hand-in that is a link rather than a file. Same one-row-per-member rule
   and the same first-hand-in timestamp as a file, so it counts for the Org
   Cup exactly the same way. */
/* A page's changes to the club, merged into what is stored: {set: {key: value},
   del: [key], items: {key: {up: [item], rm: [id], order: [id]}}}. Items that
   another officer added in the meantime are kept, after the ones this page
   ordered. */
/* Several officers -- often several browsers on the one club account -- edit
   at once, each from the copy they last read. A page sends what it changed
   together with what that thing looked like when it read it (`was`), and
   this keeps both people's changes: a field this page did not touch keeps
   what is stored; a list of names gets this page's additions and removals
   applied to the stored list; anything both changed goes to the later save. */
function merge3_(srv, cli, was) {
  var J = function (v) { return JSON.stringify(v === undefined ? null : v); };
  if (was === undefined || srv === undefined) return cli;
  if (J(cli) === J(was)) return srv;           /* this page did not change it */
  if (J(srv) === J(was)) return cli;           /* nobody else did */
  var isSet = function (a) {
    if (!Array.isArray(a)) return false;
    var seen = {};
    for (var i = 0; i < a.length; i++) {
      var v = a[i];
      if ((typeof v !== 'string' && typeof v !== 'number') || v === '' || seen['k' + v]) return false;
      seen['k' + v] = 1;
    }
    return true;
  };
  if (isSet(srv) && isSet(cli) && isSet(was)) {
    var key = function (v) { return 'k' + v; }, inCli = {}, inWas = {}, outSet = {};
    cli.forEach(function (v) { inCli[key(v)] = 1; });
    was.forEach(function (v) { inWas[key(v)] = 1; });
    var res = srv.filter(function (v) { return !(inWas[key(v)] && !inCli[key(v)]); });
    res.forEach(function (v) { outSet[key(v)] = 1; });
    cli.forEach(function (v) { if (!inWas[key(v)] && !outSet[key(v)]) { res.push(v); outSet[key(v)] = 1; } });
    return res;
  }
  var plain = function (o) { return o && typeof o === 'object' && !Array.isArray(o); };
  if (plain(srv) && plain(cli) && plain(was)) {
    var res2 = {}, keys = {};
    [srv, cli, was].forEach(function (o) { Object.keys(o).forEach(function (k) { keys[k] = 1; }); });
    Object.keys(keys).forEach(function (k) {
      var inC = Object.prototype.hasOwnProperty.call(cli, k), inW = Object.prototype.hasOwnProperty.call(was, k),
          inS = Object.prototype.hasOwnProperty.call(srv, k);
      if (!inC && inW) { if (inS && J(srv[k]) !== J(was[k])) res2[k] = srv[k]; return; }  /* removed here; kept if changed there */
      if (!inS) { if (inC) res2[k] = cli[k]; return; }
      res2[k] = inC ? merge3_(srv[k], cli[k], inW ? was[k] : undefined) : srv[k];
    });
    return res2;
  }
  return cli;
}
function applyCfgPatch_(base, p) {
  var out = {};
  for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
  var set = p.set || {}, del = p.del || [], items = p.items || {}, wasSet = p.was || {};
  Object.keys(set).forEach(function (k) {
    if (k === '__patch') return;
    out[k] = Object.prototype.hasOwnProperty.call(wasSet, k) ? merge3_(out[k], set[k], wasSet[k]) : set[k];
  });
  del.forEach(function (k) { delete out[k]; });
  Object.keys(items).forEach(function (k) {
    var ch = items[k] || {}, list = Array.isArray(out[k]) ? out[k].slice() : [];
    var rm = {}; (ch.rm || []).forEach(function (id) { rm[String(id)] = 1; });
    list = list.filter(function (it) { return !(it && rm[String(it.id)]); });
    var wasItems = ch.was || {};
    (ch.up || []).forEach(function (it) {
      if (!it || it.id === undefined) return;
      var at = -1; for (var i = 0; i < list.length; i++) if (list[i] && String(list[i].id) === String(it.id)) { at = i; break; }
      var w = wasItems[String(it.id)];
      if (at > -1) list[at] = w ? merge3_(list[at], it, w) : it; else list.push(it);
    });
    if (Array.isArray(ch.order)) {
      var pos = {}; ch.order.forEach(function (id, i) { pos[String(id)] = i; });
      list.sort(function (a, b) {
        var pa = pos.hasOwnProperty(String(a && a.id)) ? pos[String(a.id)] : 1e9 + list.indexOf(a);
        var pb = pos.hasOwnProperty(String(b && b.id)) ? pos[String(b.id)] : 1e9 + list.indexOf(b);
        return pa - pb;
      });
    }
    out[k] = list;
  });
  return out;
}

/* This club's saved setup. */
function clubCfg_(aff) {
  var key = 'club:' + aff, c = {};
  readTab('config').forEach(function (r) {
    if (String(r.Key) === key) { try { c = JSON.parse(r.Value) || {}; } catch (e) {} }
  });
  return c;
}
/* Where a form's answers are posted, from the link members open. Mirrors the
   address formSchema reads the questions from. */
function formAction_(formUrl) {
  var f = String(formUrl || '');
  if (!/^https:\/\/docs\.google\.com\/forms\//.test(f)) return '';
  var v = f.replace(/\/edit.*$/, '/viewform').replace(/\?.*$/, '');
  if (v.indexOf('/viewform') < 0) v = v.replace(/\/*$/, '') + '/viewform';
  return v.replace(/\/viewform$/, '/formResponse');
}

/* Whether a hand-in's first bytes match what its extension says it is.
   Office files are either the old compound format or a zip; text has to be
   text, and never markup a browser would run. */
function looksLike_(ext, b) {
  var u = function (i) { return (b[i] + 256) % 256; };
  var starts = function (sig) { for (var i = 0; i < sig.length; i++) if (u(i) !== sig[i]) return false; return true; };
  var ole = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], zip = [0x50, 0x4B, 0x03, 0x04];
  switch (ext) {
    case 'pdf':  return starts([0x25, 0x50, 0x44, 0x46]);                       // %PDF
    case 'png':  return starts([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    case 'jpg': case 'jpeg': return starts([0xFF, 0xD8, 0xFF]);
    case 'webp': return starts([0x52, 0x49, 0x46, 0x46]) && u(8) === 0x57 && u(9) === 0x45 && u(10) === 0x42 && u(11) === 0x50;
    case 'heic': return b.length > 12 && u(4) === 0x66 && u(5) === 0x74 && u(6) === 0x79 && u(7) === 0x70; // ....ftyp
    case 'doc': case 'xls': case 'ppt': return starts(ole);
    case 'docx': case 'xlsx': case 'pptx': return starts(zip);
    case 'csv': case 'txt': case 'md': {
      var n = Math.min(b.length, 4096), head = '';
      for (var i = 0; i < n; i++) { if (u(i) === 0) return false; head += String.fromCharCode(u(i)); }
      return !/<\s*(script|html|iframe|svg|object|embed)\b/i.test(head);
    }
  }
  return false;
}

function submitLink_(aff, id, email, swId, link) {
  var flatW = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var myOrg = '', myName = String(id.name || email);
  readScoped('teams', aff).forEach(function (r) {
    if (flatW(r.MemberName) !== flatW(id.name || email)) return;
    myOrg = String(r.Org || ''); myName = String(r.MemberName || myName);
  });
  if (!myOrg) myOrg = 'Not drafted yet';
  var wKey = 'club:' + aff, wCfg = {};
  readTab('config').forEach(function (r) {
    if (String(r.Key) === wKey) { try { wCfg = JSON.parse(r.Value) || {}; } catch (e) {} }
  });
  var task = ((wCfg.work || []).filter(function (w) { return w.id === swId; })[0] || {}).title;
  if (!task) return {ok: false, error: 'That assignment no longer exists.'};
  var sh = tab('submissions'), v = sh.getDataRange().getValues();
  var ix = {}; for (var c = 0; c < v[0].length; c++) ix[String(v[0][c])] = c;
  var mine = -1, prevRev = 0, prevFirst = '';
  for (var r = 1; r < v.length; r++) {
    if (normAff(v[r][ix.Affiliation]) !== aff) continue;
    if (String(v[r][ix.WorkId]) !== swId) continue;
    if (flatW(v[r][ix.MemberName]) !== flatW(myName)) continue;
    mine = r + 1; prevRev = Number(v[r][ix.Revision]) || 1;
    prevFirst = v[r][ix.FirstAt] || v[r][ix.SubmittedAt] || '';
    var last = v[r][ix.SubmittedAt];
    if (last && (new Date().getTime() - new Date(last).getTime()) < 60000)
      return {ok: false, error: 'You handed this in less than a minute ago. Give it a moment before replacing it.'};
    if (prevRev >= 12) return {ok: false, error: 'This has been replaced too many times. Ask an officer to reset it.'};
    break;
  }
  var now = new Date(), rev = prevRev ? prevRev + 1 : 1, row = [];
  for (var k = 0; k < v[0].length; k++) row.push('');
  row[ix.Affiliation] = aff;   row[ix.WorkId] = swId;     row[ix.WorkTitle] = task;
  row[ix.MemberName] = myName; row[ix.Org] = myOrg;       row[ix.FileId] = '';
  row[ix.FileName] = 'Link';   row[ix.FileUrl] = link;    row[ix.SubmittedAt] = now;
  row[ix.Revision] = rev;      row[ix.Status] = 'submitted';
  if (ix.FirstAt !== undefined) row[ix.FirstAt] = prevFirst || now;
  if (mine > 0) sh.getRange(mine, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  return {ok: true, filed: task + ' / ' + myOrg + ' / ' + myName, revision: rev, replaced: rev > 1};
}

function dispatch(action, payload, email, role, id) {
  var aff = normAff((id && id.aff) || DEFAULT_AFF);
  switch (action) {

    case 'whoami':
      return {ok: true, role: role, email: email, name: id.name || email, aff: aff,
              affName: (findAff(aff) || {}).name || aff,
              needsAff: !!id.needsAff, via: id.via};

    /* ---- password accounts ---- */

    case 'listUsers': {
      var rows = [];
      readScoped('users', aff).forEach(function (r) {
        if (!r.Username) return;
        rows.push({username: normUser(r.Username),
                   role: String(r.Role || 'member').toLowerCase(),
                   locked: Number(r.LockedUntil) > Date.now(),
                   createdBy: r.CreatedBy || '', createdAt: r.CreatedAt || ''});
      });
      return {ok: true, users: rows};
    }

    case 'createUser': {
      var nu = normUser((payload || {}).username);
      var ndk = String((payload || {}).dk || '');
      var nsalt = String((payload || {}).clientSalt || '');
      var niters = Number((payload || {}).iterations) || PBKDF2_ITERS;
      var nrole = String((payload || {}).role || 'member').toLowerCase();
      if (!/^[a-z0-9._-]{3,32}$/.test(nu))
        return {ok: false, error: 'Usernames are 3-32 characters: letters, digits, dot, dash, underscore.'};
      if (!ndk || !nsalt) return {ok: false, error: 'The browser did not send a derived key.'};
      if (!RANK[nrole] || nrole === 'none') return {ok: false, error: 'Unknown role.'};
      if (findUser(nu)) return {ok: false, error: 'That username is taken.'};

      var ssalt = Utilities.getUuid();
      tab('users').appendRow([nu, nsalt, ssalt, hashDk(ndk, ssalt), niters,
                              nrole, 0, '', email, new Date(), aff]);
      return {ok: true, created: nu, role: nrole, aff: aff};
    }

    /* A password account's role lives in its Users row, not the email-keyed
       Roles tab, so it needs its own action rather than reusing setRole. */
    case 'setUserRole': {
      var su = normUser((payload || {}).username);
      var srole = String((payload || {}).role || '').toLowerCase();
      if (!RANK[srole] || srole === 'none') return {ok: false, error: 'Unknown role.'};
      var recS = findUser(su);
      if (!recS) return {ok: false, error: 'No such account.'};
      setUserField(recS, 'Role', srole);
      return {ok: true, updated: su, role: srole};
    }

    /* Everything one person is allowed to know about themselves, in one
       reply, so the profile page does not have to pull the whole club. */
    case 'myProfile': {
      /* A username like "jordan.lee" and a roster name like "Jordan Lee" are
         the same person, so both sides are flattened to letters and digits
         before comparing. An officer may pass a name to look up instead. */
      var flat = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      /* Only an officer may look somebody else up. A member is matched on
         who they signed in as -- a name in the payload let any member read
         another's teams row, points and history. */
      var askName = RANK[role] >= RANK.admin ? (payload || {}).name : '';
      var meName = flat(askName || id.name || email);
      var mine = null;
      readScoped('teams', aff).forEach(function (r) {
        if (flat(r.MemberName) === meName) mine = r;
      });
      var pts = 0, evts = 0, hist = [];
      readScoped('pointsLog', aff).forEach(function (r) {
        if (flat(r.MemberName) !== meName) return;
        evts++; pts += Number(r.Points) || 0;
        hist.push({label: r.ActionLabel, points: Number(r.Points) || 0, when: r.Timestamp});
      });
      var prow = null;
      readTab('profiles').forEach(function (r) {
        if (String(r.Email).toLowerCase() !== String(email).toLowerCase()) return;
        if (normAff(r.Affiliation) !== aff) return;
        prow = r;
      });
      return {ok: true, profile: mine, points: pts, entries: evts,
              history: hist.slice(-25), aff: aff, role: role, who: email,
              answers: prow ? {year: prow.Year, track: prow.Track, mbti: prow.MBTI,
                               lead: prow.LeadInterest, notes: prow.FormNotes, avail: prow.Availability || '',
                               bday: prow.Birthday ? Utilities.formatDate(
                                 new Date(prow.Birthday), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
                               at: prow.FormAt} : null};
    }

    /* ---- the member's own form answers ----
       The responses land in the club's spreadsheet under whatever the officer
       titled the questions, and nothing was carrying them back to the account
       that wrote them. This finds the caller's own row -- by the email Google
       collected, or failing that by name -- and files the answers against
       their profile. It reads only the caller's row and writes only the
       caller's profile, so it is safe at member level. */
    case 'myFormAnswers': {
      var fKey = 'club:' + aff, fCfg = {};
      readTab('config').forEach(function (r) {
        if (String(r.Key) === fKey) { try { fCfg = JSON.parse(r.Value) || {}; } catch (e) {} }
      });
      if (!fCfg.sheetUrl && !fCfg.sheetId)
        return {ok: false, error: 'This club has not linked a response spreadsheet yet.'};

      var rss;
      try {
        rss = fCfg.sheetId ? SpreadsheetApp.openById(fCfg.sheetId)
                           : SpreadsheetApp.openByUrl(fCfg.sheetUrl);
      } catch (e) {
        return {ok: false, error: 'Could not open the response spreadsheet: ' + e.message};
      }
      var rsh = rss.getSheets()[0], rv = rsh.getDataRange().getValues();
      if (rv.length < 2) return {ok: false, error: 'No responses in that spreadsheet yet.'};

      var heads = rv[0].map(function (x) { return String(x || '').toLowerCase(); });
      function findCol(res) {
        for (var i = 0; i < heads.length; i++) if (res.test(heads[i])) return i;
        return -1;
      }
      var cEmail = findCol(/e-?mail/),
          cName  = findCol(/full name|your name|^name$|first name|name/),
          cYear  = findCol(/year|tenure|how long/),
          cTrack = findCol(/track|division|which side|lean|interest/),
          cMbti  = findCol(/mbti|personality|16 ?personalities|four letters|type/),
          cLead  = findCol(/lead|officer|leadership/),
          cAvail = findCol(/availab|when are you|free time|schedule/),
          cNote  = findCol(/anything|note|comment|else/);

      var flatF = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      var meEmail = String(email).toLowerCase().trim();
      var meFlat  = flatF(id.name || email);
      var hit = null;
      /* Latest matching response wins -- somebody who filled it in twice meant
         the second one. */
      for (var ri = 1; ri < rv.length; ri++) {
        var byEmail = cEmail > -1 && String(rv[ri][cEmail]).toLowerCase().trim() === meEmail;
        var byName  = cName  > -1 && flatF(rv[ri][cName]) === meFlat && meFlat;
        if (byEmail || byName) hit = rv[ri];
      }
      if (!hit) return {ok: false, error: 'No response in that spreadsheet matches your account yet.'};

      var got = {
        year:  cYear  > -1 ? String(hit[cYear]  || '') : '',
        track: cTrack > -1 ? String(hit[cTrack] || '') : '',
        mbti:  cMbti  > -1 ? fmtMbti_(hit[cMbti]) : '',
        lead:  cLead  > -1 ? String(hit[cLead]  || '') : '',
        avail: cAvail > -1 ? String(hit[cAvail] || '').slice(0, 120) : '',
        notes: cNote  > -1 ? String(hit[cNote]  || '').slice(0, 500) : ''
      };

      var shF = tab('profiles'), vF = shF.getDataRange().getValues();
      var iF = {}; for (var cF = 0; cF < vF[0].length; cF++) iF[String(vF[0][cF])] = cF;
      var when = new Date();
      var wrote = false;
      for (var rf = 1; rf < vF.length && !wrote; rf++) {
        if (String(vF[rf][iF.Email]).toLowerCase() !== meEmail) continue;
        if (normAff(vF[rf][iF.Affiliation]) !== aff) continue;
        shF.getRange(rf + 1, iF.Year + 1).setValue(got.year);
        shF.getRange(rf + 1, iF.Track + 1).setValue(got.track);
        shF.getRange(rf + 1, iF.MBTI + 1).setValue(got.mbti);
        shF.getRange(rf + 1, iF.LeadInterest + 1).setValue(got.lead);
        shF.getRange(rf + 1, iF.FormNotes + 1).setValue(got.notes);
        if (iF.Availability !== undefined) shF.getRange(rf + 1, iF.Availability + 1).setValue(got.avail);
        shF.getRange(rf + 1, iF.FormAt + 1).setValue(when);
        wrote = true;
      }
      if (!wrote) {
        var rowF = [];
        for (var k2 = 0; k2 < vF[0].length; k2++) rowF.push('');
        rowF[iF.Email] = meEmail; rowF[iF.Affiliation] = aff;
        rowF[iF.Year] = got.year; rowF[iF.Track] = got.track; rowF[iF.MBTI] = got.mbti;
        rowF[iF.LeadInterest] = got.lead; rowF[iF.FormNotes] = got.notes; rowF[iF.FormAt] = when;
        if (iF.Availability !== undefined) rowF[iF.Availability] = got.avail;
        shF.appendRow(rowF);
      }
      got.at = when;
      return {ok: true, answers: got, matchedBy: (cEmail > -1 ? 'email' : 'name')};
    }

    /* ---- Google Calendar ----
       Two-way and deliberately additive. The chapter's calendar gains anything
       posted in the page; anything somebody put straight into Google turns up
       in the page. A sync never deletes on either side, because the two sides
       disagree for legitimate reasons all the time -- an officer drafting in
       one, a member being invited to the other -- and the destructive reading
       of that disagreement is always the wrong one. */
    case 'calendarSync': {
      var cKey = 'club:' + aff, cSheet = tab('config'), cVals = cSheet.getDataRange().getValues();
      var cRow = -1, cCfg = {};
      for (var ci = 1; ci < cVals.length; ci++) {
        if (String(cVals[ci][0]) === cKey) {
          cRow = ci + 1;
          try { cCfg = JSON.parse(cVals[ci][1]) || {}; } catch (e) { cCfg = {}; }
          break;
        }
      }
      var clubNm = (findAff(aff) || {}).name || aff;
      var calName = clubNm + ' — chapter calendar';

      /* Writing the config back is its own step, because the calendar id has
         to survive even if the rest of this call does not. The first version
         saved only at the end, so a slow run left no id behind and the next
         attempt made a second calendar, and a third. */
      function saveCfg() {
        var j = JSON.stringify(cCfg);
        if (cRow > 0) cSheet.getRange(cRow, 2).setValue(j);
        else { cSheet.appendRow([cKey, j]); cRow = cSheet.getLastRow(); }
      }

      var incoming = (payload || {}).events || [];
      var cal = null;

      /* Linking the chapter's existing calendar instead of one this script
         makes. Checked before anything is saved: an id this account cannot
         open is refused, and the club keeps the calendar it had. */
      var wantId = String((payload || {}).calendarId || '').trim();
      if (wantId && wantId !== cCfg.gcalId) {
        if (!/^[^\s<>"]{3,200}$/.test(wantId)) return {ok: false, error: 'That does not look like a calendar ID.'};
        try { cal = CalendarApp.getCalendarById(wantId); } catch (e) { cal = null; }
        /* Worded without asking Session who the script runs as: that call
           needs a scope of its own, and a new scope stops the deployed web
           app for everyone until the owner approves it again. */
        if (!cal) return {ok: false, error: 'The Google account that owns this script cannot open ' + wantId +
          '. Share that calendar with it ("Make changes to events") and try again.'};
        /* Ids from the old calendar mean nothing in the new one. The page's
           own events are sent again; ones that only came from the old
           calendar are left behind with it. */
        incoming = incoming.filter(function (ev) { return !ev.pulled && !(ev.gid && /^g/.test(String(ev.id))); })
          .map(function (ev) { var c = {}; for (var k in ev) if (k !== 'gid') c[k] = ev[k]; return c; });
        cCfg.gcalId = cal.getId();
        cCfg.gcalUrl = 'https://calendar.google.com/calendar/u/0/r?cid=' + encodeURIComponent(cCfg.gcalId);
        cCfg.gcalLinked = true;
        saveCfg();
      }
      if (!cal && cCfg.gcalId) { try { cal = CalendarApp.getCalendarById(cCfg.gcalId); } catch (e) { cal = null; } }
      if (!cal && cCfg.gcalLinked)
        return {ok: false, error: 'The linked calendar (' + cCfg.gcalId + ') cannot be opened any more. Check it is still shared with this script, or link another.'};
      /* A calendar this club already made, from a run that did not get to
         record it. Adopt it rather than making another. */
      if (!cal) {
        try {
          var found = CalendarApp.getCalendarsByName(calName);
          if (found && found.length) cal = found[0];
        } catch (e) {}
      }
      if (!cal) {
        try { cal = CalendarApp.createCalendar(calName); }
        catch (e) { return {ok: false, error: 'Could not create a calendar: ' + e.message}; }
      }
      if (cCfg.gcalId !== cal.getId()) {
        cCfg.gcalId = cal.getId();
        cCfg.gcalUrl = 'https://calendar.google.com/calendar/u/0/r?cid=' + encodeURIComponent(cCfg.gcalId);
        saveCfg();          /* banked before anything slow happens */
      }

      /* Only a calendar this script made is handed to the club account. A
         linked one already belongs to the chapter, and its sharing is the
         chapter's business, not something every sync should touch. */
      var calOwner = '', calShareErr = '';
      if (cCfg.ownerEmail && !cCfg.gcalLinked) {
        try { cal.addEditor(cCfg.ownerEmail); calOwner = cCfg.ownerEmail; }
        catch (e) { calShareErr = String(e.message || e); }
      }

      /* Keyed by event and day: every instance of a recurring event shares
         one id, so the id alone brought a weekly meeting back only once. */
      var byGid = {}, pushed = 0, pulled = 0, adopted = 0, remaining = 0;
      incoming.forEach(function (ev) { if (ev.gid) byGid[ev.gid + '|' + ev.date] = true; });
      var flatT = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };

      function whenOf(ev) {
        var p = String(ev.date || '').split('-');
        if (p.length !== 3) return null;
        var t = String(ev.time || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
        if (!t) return {allDay: true, start: new Date(+p[0], +p[1] - 1, +p[2])};
        var h = +t[1], mi = +(t[2] || 0), ap = (t[3] || '').toLowerCase();
        if (ap === 'pm' && h < 12) h += 12;
        if (ap === 'am' && h === 12) h = 0;
        var st = new Date(+p[0], +p[1] - 1, +p[2], h, mi);
        return {allDay: false, start: st, end: new Date(st.getTime() + 3600000)};
      }

      /* Out, but bounded. Creating events is the slow part, and a web app that
         runs past its limit gets killed with nothing saved. Twenty a run, the
         rest next time, and the caller is told how many are left. */
      var PUSH_MAX = 20, started = new Date().getTime();
      /* An officer adding one event sends just that one; the rest wait for
         an explicit Connect & refresh, so nothing is pushed by surprise. */
      var pushOnly = (payload || {}).pushOnly;
      pushOnly = Array.isArray(pushOnly) ? pushOnly.map(String) : null;
      for (var pi = 0; pi < incoming.length; pi++) {
        var ev = incoming[pi];
        if (ev.gid || ev.pulled) continue;
        if (pushOnly && pushOnly.indexOf(String(ev.id)) < 0) continue;
        if (pushed >= PUSH_MAX || (new Date().getTime() - started) > 60000) { remaining++; continue; }
        var w = whenOf(ev);
        if (!w) continue;
        /* Already there under much the same name -- the chapter calendar has
           "IM Orientation MEETING" where the page says "IM orientation".
           Adopt it rather than putting a second one beside it. */
        var twin = null, ft = flatT(ev.title);
        try {
          cal.getEventsForDay(w.start).forEach(function (g) {
            var fg = flatT(g.getTitle());
            if (!twin && ft && fg && (fg.indexOf(ft) > -1 || ft.indexOf(fg) > -1)) twin = g;
          });
        } catch (e) {}
        if (twin) { ev.gid = twin.getId(); byGid[ev.gid + '|' + ev.date] = true; adopted++; continue; }
        try {
          var made = w.allDay
            ? cal.createAllDayEvent(String(ev.title || 'Event'), w.start,
                {location: String(ev.where || ''), description: String(clubNm)})
            : cal.createEvent(String(ev.title || 'Event'), w.start, w.end,
                {location: String(ev.where || ''), description: String(clubNm)});
          ev.gid = made.getId();
          byGid[ev.gid + '|' + ev.date] = true;
          pushed++;
        } catch (e) {}
      }

      /* The club record keeps only the page's own events. Everything else on
         the calendar is read back into its own store (see refreshGcal_), shared
         with members unless an officer has hidden it. Older versions kept
         those on the club record, marked pulled; they are dropped here. */
      var own = incoming.filter(function (ev) { return !ev.pulled; });
      cCfg.events = own;
      saveCfg();
      var gNow = {}, gErr = '';
      try { gNow = refreshGcal_(aff, cCfg, true); gErr = gNow.error || ''; }
      catch (e) { gErr = String(e.message || e); }
      pulled = (gNow.events || []).length;

      return {ok: true, events: own, gcal: gcalFor_(gNow, cCfg, role), pushed: pushed, pulled: pulled, adopted: adopted,
              remaining: remaining, calendarId: cCfg.gcalId, calendarUrl: cCfg.gcalUrl || '', linked: !!cCfg.gcalLinked,
              sharedWith: calOwner, shareError: calShareErr || gErr};
    }

    /* ---- handing in work ----
       One member's own file, filed under the club, then the Org they were
       drafted into, then their name. The browser sends the bytes and nothing
       else -- where it lands is decided here, from the roster, so nobody can
       drop a file into somebody else's folder by relabelling the request. */
    case 'submitWork': {
      var swName = String((payload || {}).name || 'submission');
      var swMime = String((payload || {}).mime || '');
      var swData = String((payload || {}).data || '');
      var swId   = String((payload || {}).workId || '');
      var swLink = String((payload || {}).link || '').trim();
      if (!swId)   return {ok: false, error: 'No assignment was named.'};
      /* A link instead of a file (a Google Doc, a deck). Only https, and
         recorded as the link itself: nothing is fetched or copied. */
      if (swLink) {
        if (!/^https:\/\/[^\s<>"']{4,}$/.test(swLink) || swLink.length > 500)
          return {ok: false, error: 'That does not look like a full https:// link.'};
        return submitLink_(aff, id, email, swId, swLink);
      }
      if (!swData) return {ok: false, error: 'No file arrived.'};

      /* Base64 is about a third larger than the bytes it carries, so this is
         roughly an 8 MB file. */
      if (swData.length > 11000000) return {ok: false, error: 'That file is over 8 MB.'};

      /* What a member may hand in. An allowlist rather than a blocklist: the
         set of things a chapter actually collects is short and known, and a
         blocklist is a promise you cannot keep. Extension and declared type
         must agree, because either one alone is trivially wrong. */
      var ALLOW = {
        pdf:  ['application/pdf'],
        doc:  ['application/msword'],
        docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ppt:  ['application/vnd.ms-powerpoint'],
        pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
        xls:  ['application/vnd.ms-excel'],
        xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        csv:  ['text/csv', 'application/csv', 'text/plain'],
        txt:  ['text/plain'],
        md:   ['text/markdown', 'text/plain'],
        png:  ['image/png'],
        jpg:  ['image/jpeg'],
        jpeg: ['image/jpeg'],
        heic: ['image/heic'],
        webp: ['image/webp']
      };
      /* Only the last extension counts, so "brief.pdf.html" is an html file. */
      var bits = swName.split('.');
      var ext = (bits.length > 1 ? bits.pop() : '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!ALLOW[ext])
        return {ok: false, error: 'That kind of file is not accepted. Use a PDF, a document, a spreadsheet, or an image.'};
      if (swMime && ALLOW[ext].indexOf(swMime.split(';')[0].trim().toLowerCase()) < 0)
        return {ok: false, error: 'That file says it is a ' + swMime + ' but is named .' + ext + '.'};
      /* The name and the declared type are both the sender's say-so. The
         bytes are checked too, so a web page or a program renamed to .pdf is
         refused, and the file is stored with the type its extension implies
         rather than whatever the browser claimed. */
      var swBytes;
      try { swBytes = Utilities.base64Decode(swData); }
      catch (e) { return {ok: false, error: 'That file did not arrive intact. Try again.'}; }
      if (!swBytes.length) return {ok: false, error: 'That file is empty.'};
      if (!looksLike_(ext, swBytes))
        return {ok: false, error: 'That file is not really a .' + ext + ' file. Save it again as one and hand it in.'};
      swMime = ALLOW[ext][0];
      /* Rebuilt from the parts rather than trusting the string: no directory
         separators, no leading dots, no control characters, bounded length. */
      var stem = bits.join('.').replace(/[^A-Za-z0-9 _-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!stem) stem = 'submission';
      var safeName = stem + '.' + ext;

      var flatW = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      var meW = flatW(id.name || email), myOrg = '', myName = String(id.name || email);
      readScoped('teams', aff).forEach(function (r) {
        if (flatW(r.MemberName) !== meW) return;
        myOrg = String(r.Org || ''); myName = String(r.MemberName || myName);
      });
      if (!myOrg) myOrg = 'Not drafted yet';

      var wKey = 'club:' + aff, wCfg = {};
      readTab('config').forEach(function (r) {
        if (String(r.Key) === wKey) { try { wCfg = JSON.parse(r.Value) || {}; } catch (e) {} }
      });
      var task = ((wCfg.work || []).filter(function (w) { return w.id === swId; })[0] || {}).title;
      if (!task) return {ok: false, error: 'That assignment no longer exists.'};
      var taskFolder = String(task).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);

      /* One row per member per assignment. Handing in again replaces the file
         and bumps the revision -- it does not add a second row, so an officer
         always sees exactly one current answer per person. */
      var shS = tab('submissions'), vS = shS.getDataRange().getValues();
      var iS = {}; for (var cS = 0; cS < vS[0].length; cS++) iS[String(vS[0][cS])] = cS;
      var mine = -1, prevRev = 0, prevFile = '', prevFirst = '';
      for (var rS = 1; rS < vS.length; rS++) {
        if (normAff(vS[rS][iS.Affiliation]) !== aff) continue;
        if (String(vS[rS][iS.WorkId]) !== swId) continue;
        if (flatW(vS[rS][iS.MemberName]) !== flatW(myName)) continue;
        mine = rS + 1;
        prevRev = Number(vS[rS][iS.Revision]) || 1;
        prevFile = String(vS[rS][iS.FileId] || '');
        prevFirst = vS[rS][iS.FirstAt] || vS[rS][iS.SubmittedAt] || '';
        /* Not a rate limit for its own sake: a resubmission loop uploading
           megabytes would fill the club's Drive and nothing else stops it. */
        var last = vS[rS][iS.SubmittedAt];
        if (last && (new Date().getTime() - new Date(last).getTime()) < 60000)
          return {ok: false, error: 'You handed this in less than a minute ago. Give it a moment before replacing it.'};
        if (prevRev >= 12)
          return {ok: false, error: 'This has been replaced too many times. Ask an officer to reset it.'};
        break;
      }

      var clubName = (findAff(aff) || {}).name || aff;
      var root = folderUnder(null, clubName + ' — handed in');
      var f3 = folderUnder(folderUnder(folderUnder(root, taskFolder), myOrg), myName);

      /* The file itself goes in the member's own folder, under this
         assignment, where they can open it; the officers' tree gets a
         shortcut to it. If the member folder cannot be reached the file
         still lands in the officers' tree, as it always did. */
      var dest = f3, inMine = false;
      try { dest = workFolderFor_(aff, wCfg, acctFor_(aff, email, id), swId).folder; inMine = true; }
      catch (e) { dest = f3; }

      var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
      var file;
      try {
        var blob = Utilities.newBlob(swBytes, swMime, stamp + ' ' + safeName);
        file = dest.createFile(blob);
      } catch (e) {
        return {ok: false, error: 'That file could not be saved: ' + e.message};
      }
      if (inMine) { try { f3.createShortcut(file.getId()); } catch (e) {} }
      /* The replaced file goes to the bin rather than being erased, so an
         officer can recover a version a member overwrote by accident. Its
         shortcut goes with it, so officers are not left with a dead link. */
      if (prevFile) {
        try { DriveApp.getFileById(prevFile).setTrashed(true); } catch (e) {}
        try {
          var scs = f3.getFilesByType('application/vnd.google-apps.shortcut');
          while (scs.hasNext()) { var sc = scs.next(); if (sc.getTargetId() === prevFile) sc.setTrashed(true); }
        } catch (e) {}
      }
      try { if (wCfg.ownerEmail) root.addEditor(wCfg.ownerEmail); } catch (e) {}

      var now = new Date(), rev = prevRev ? prevRev + 1 : 1;
      var row = [];
      for (var k = 0; k < vS[0].length; k++) row.push('');
      row[iS.Affiliation] = aff;      row[iS.WorkId] = swId;
      row[iS.WorkTitle] = task;       row[iS.MemberName] = myName;
      row[iS.Org] = myOrg;            row[iS.FileId] = file.getId();
      row[iS.FileName] = safeName;    row[iS.FileUrl] = file.getUrl();
      row[iS.SubmittedAt] = now;      row[iS.Revision] = rev;
      /* The Team Cup scores the first hand-in, so replacing a file after the
         deadline does not cost the on-time credit it already earned. */
      if (iS.FirstAt !== undefined) row[iS.FirstAt] = prevFirst || now;
      row[iS.Status] = 'submitted';   row[iS.Points] = '';
      row[iS.ReviewedBy] = '';        row[iS.ReviewedAt] = ''; row[iS.Comment] = '';
      if (mine > 0) shS.getRange(mine, 1, 1, row.length).setValues([row]);
      else shS.appendRow(row);

      return {ok: true, filed: inMine ? 'the club Drive, under ' + myName + ' / ' + task : task + ' / ' + myOrg + ' / ' + myName,
              fileId: file.getId(), revision: rev, replaced: rev > 1};
    }

    /* What has been handed in, for the officers who have to read it. */
    case 'listSubmissions': {
      var lsW = String((payload || {}).workId || '');
      var out = [];
      readTab('submissions').forEach(function (r) {
        if (normAff(r.Affiliation) !== aff) return;
        if (lsW && String(r.WorkId) !== lsW) return;
        out.push({workId: String(r.WorkId), workTitle: String(r.WorkTitle || ''),
                  name: String(r.MemberName || ''), org: String(r.Org || ''),
                  fileName: String(r.FileName || ''), fileUrl: String(r.FileUrl || ''),
                  at: r.SubmittedAt, first: r.FirstAt || r.SubmittedAt, revision: Number(r.Revision) || 1,
                  status: String(r.Status || 'submitted'),
                  points: r.Points === '' ? null : Number(r.Points),
                  reviewedBy: String(r.ReviewedBy || ''), comment: String(r.Comment || '')});
      });
      return {ok: true, submissions: out};
    }

    /* Marking one piece of work. Points awarded here also land in the Cup log,
       because a point that exists in two places and agrees in neither is worse
       than no point at all. */
    case 'reviewSubmission': {
      var rvW = String((payload || {}).workId || '');
      var rvN = String((payload || {}).name || '');
      var rvS = String((payload || {}).status || 'checked');
      var rvP = (payload || {}).points;
      var rvC = String((payload || {}).comment || '').slice(0, 300);
      if (!rvW || !rvN) return {ok: false, error: 'Which submission?'};

      var shR = tab('submissions'), vR = shR.getDataRange().getValues();
      var iR = {}; for (var cR = 0; cR < vR[0].length; cR++) iR[String(vR[0][cR])] = cR;
      var flatR = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      var hitRow = -1, title = '', orgR = '';
      for (var rr = 1; rr < vR.length; rr++) {
        if (normAff(vR[rr][iR.Affiliation]) !== aff) continue;
        if (String(vR[rr][iR.WorkId]) !== rvW) continue;
        if (flatR(vR[rr][iR.MemberName]) !== flatR(rvN)) continue;
        hitRow = rr + 1; title = String(vR[rr][iR.WorkTitle] || ''); orgR = String(vR[rr][iR.Org] || '');
        break;
      }
      if (hitRow < 0) return {ok: false, error: 'No submission from that member.'};

      shR.getRange(hitRow, iR.Status + 1).setValue(rvS);
      shR.getRange(hitRow, iR.ReviewedBy + 1).setValue(email);
      shR.getRange(hitRow, iR.ReviewedAt + 1).setValue(new Date());
      shR.getRange(hitRow, iR.Comment + 1).setValue(rvC);

      var awarded = 0;
      if (rvP !== undefined && rvP !== null && rvP !== '') {
        awarded = Math.max(0, Math.min(999, Number(rvP) || 0));
        shR.getRange(hitRow, iR.Points + 1).setValue(awarded);
        if (awarded > 0) {
          appendRows('pointsLog', [{Timestamp: new Date(), MemberName: rvN,
            ActionId: 'work:' + rvW, ActionLabel: title || 'Assignment',
            Points: awarded, Track: '', Org: orgR, Affiliation: aff}]);
        }
      }
      return {ok: true, status: rvS, points: awarded};
    }

    /* Check off many hand-ins to one assignment at once ("everything that came
       in on time"). One call instead of one per member -- seventy-nine of them
       took minutes. No points: those are given one at a time, on purpose. */
    case 'reviewSubmissions': {
      var bW = String((payload || {}).workId || '');
      var bNames = ((payload || {}).names || []).slice(0, 500);
      if (!bW || !bNames.length) return {ok: false, error: 'Nothing to check off.'};
      var flatB = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      var want = {}; bNames.forEach(function (n) { want[flatB(n)] = 1; });
      var shB = tab('submissions'), vB = shB.getDataRange().getValues();
      var iB = {}; for (var cB = 0; cB < vB[0].length; cB++) iB[String(vB[0][cB])] = cB;
      var nowB = new Date(), doneB = 0;
      for (var rb = 1; rb < vB.length; rb++) {
        if (normAff(vB[rb][iB.Affiliation]) !== aff) continue;
        if (String(vB[rb][iB.WorkId]) !== bW) continue;
        if (!want[flatB(vB[rb][iB.MemberName])]) continue;
        if (String(vB[rb][iB.Status]) === 'checked') continue;
        vB[rb][iB.Status] = 'checked'; vB[rb][iB.ReviewedBy] = email; vB[rb][iB.ReviewedAt] = nowB;
        doneB++;
      }
      if (doneB) shB.getRange(1, 1, vB.length, vB[0].length).setValues(vB);
      return {ok: true, checked: doneB};
    }

    /* A signed-in Google address that has not joined a club yet. Same join
       code rule as sign-up, and always as a member. */
    case 'joinAffiliation': {
      var ja = findAff((payload || {}).affiliation);
      var jcode = String((payload || {}).joinCode || '').trim();
      if (!ja) return {ok: false, error: 'Pick the club you are joining.'};
      if (String(ja.joinCode) !== jcode) {
        Utilities.sleep(400);
        return {ok: false, error: 'That join code does not match this club.'};
      }
      if (id.via !== 'google') return {ok: false, error: 'Password accounts are placed when they are created.'};
      var already = affForEmail(email);
      if (already) return {ok: false, error: 'You are already in ' + already.aff + '.'};
      tab('roles').appendRow([email, 'member', 'self join', new Date(), ja.code]);
      bumpShared_(ja.code);
      /* The page used to ask for everything again right after joining; it
         rides along instead, one round trip fewer for a new member. */
      var jAll = null;
      try { jAll = dispatch('getAll', null, email, 'member',
                            {who: email, role: 'member', via: 'google', aff: ja.code, name: id.name}); } catch (e) {}
      return {ok: true, joined: ja.code, name: ja.name, all: jAll};
    }

    /* Renaming a club or rotating its join code, without touching its data. */
    case 'updateAffiliation': {
      var uc = normAff((payload || {}).code);
      var un = String((payload || {}).name || '').trim();
      var uj = String((payload || {}).joinCode || '').trim();
      var shA = tab('affiliations'), vA = shA.getDataRange().getValues();
      for (var z = 1; z < vA.length; z++) {
        if (normAff(vA[z][0]) !== uc) continue;
        if (un) shA.getRange(z + 1, 2).setValue(un);
        if (uj) {
          if (uj.length < 6) return {ok: false, error: 'Join codes must be at least 6 characters.'};
          shA.getRange(z + 1, 3).setValue(uj);
        }
        return {ok: true, updated: uc};
      }
      return {ok: false, error: 'No club with that code.'};
    }

    case 'createAffiliation': {
      var ac = normAff((payload || {}).code);
      var an = String((payload || {}).name || '').trim();
      var aj = String((payload || {}).joinCode || '').trim();
      if (!/^[a-z0-9-]{3,32}$/.test(ac)) return {ok: false, error: 'Codes are 3-32 characters: letters, digits, dashes.'};
      if (!an) return {ok: false, error: 'Give the club a display name.'};
      if (aj.length < 6) return {ok: false, error: 'Join codes must be at least 6 characters.'};
      if (findAff(ac)) return {ok: false, error: 'That code is taken.'};
      tab('affiliations').appendRow([ac, an, aj, email, new Date()]);
      return {ok: true, created: ac, name: an};
    }

    case 'getProfile': {
      var meE = String(email).toLowerCase(), got = null;
      readScoped('profiles', aff).forEach(function (r) {
        if (String(r.Email).toLowerCase() === meE) got = r;
      });
      return {ok: true, profile: got || null};
    }

    case 'saveProfile': {
      var pE = String(email).toLowerCase();
      var pf = capName_((payload || {}).firstName);
      var pl = capName_((payload || {}).lastName);
      var ph = String((payload || {}).photo || '');
      if (ph === 'none') ph = ' ';   /* explicit clear */
      if (ph.length > 200000) return {ok: false, error: 'That picture is too large.'};
      /* Shown to everyone who opens this member's card, so only an inline
         picture is kept. A web address here would load from somewhere else
         every time an officer looked at them, telling that site who and when. */
      if (ph && ph !== ' ' && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/.test(ph))
        return {ok: false, error: 'That picture could not be used. Choose a JPEG or PNG.'};
      var shP = tab('profiles'), vP = shP.getDataRange().getValues();
      var idxP = {}; for (var c0 = 0; c0 < vP[0].length; c0++) idxP[String(vP[0][c0])] = c0;
      for (var i0 = 1; i0 < vP.length; i0++) {
        if (String(vP[i0][idxP.Email]).toLowerCase() !== pE) continue;
        if (normAff(vP[i0][idxP.Affiliation]) !== aff) continue;
        if (pf) shP.getRange(i0 + 1, idxP.FirstName + 1).setValue(pf);
        if (pl) shP.getRange(i0 + 1, idxP.LastName + 1).setValue(pl);
        if (ph) shP.getRange(i0 + 1, idxP.Photo + 1).setValue(ph);
        /* A member correcting what the form recorded about them. Only their
           own row, and only the fields that are theirs to change -- year and
           leadership interest stay with the officers who read them. */
        var pay = payload || {};
        if (pay.track !== undefined && idxP.Track !== undefined)
          shP.getRange(i0 + 1, idxP.Track + 1).setValue(String(pay.track).slice(0, 40));
        if (pay.mbti !== undefined && idxP.MBTI !== undefined)
          shP.getRange(i0 + 1, idxP.MBTI + 1).setValue(fmtMbti_(pay.mbti));
        if (pay.notes !== undefined && idxP.FormNotes !== undefined)
          shP.getRange(i0 + 1, idxP.FormNotes + 1).setValue(String(pay.notes).slice(0, 300));
        if (pay.bday !== undefined && idxP.Birthday !== undefined)
          shP.getRange(i0 + 1, idxP.Birthday + 1).setValue(String(pay.bday).slice(0, 10));
        if (pay.availability !== undefined && idxP.Availability !== undefined)
          shP.getRange(i0 + 1, idxP.Availability + 1).setValue(String(pay.availability).slice(0, 120));
        if (pay.prefs !== undefined && idxP.Prefs !== undefined) {
          var pv = cleanPrefs_(pay.prefs);
          if (pv === null) return {ok: false, error: 'Those preferences could not be read.'};
          shP.getRange(i0 + 1, idxP.Prefs + 1).setValue(pv);
        }
        return {ok: true, saved: true};
      }
      /* First save for this account. Built against the header rather than a
         fixed five cells, so preferences sent before any other detail are not
         silently dropped. */
      var rowP = [];
      for (var kP = 0; kP < vP[0].length; kP++) rowP.push('');
      rowP[idxP.Email] = pE; rowP[idxP.Affiliation] = aff;
      rowP[idxP.FirstName] = pf; rowP[idxP.LastName] = pl; rowP[idxP.Photo] = ph;
      var pay0 = payload || {};
      /* The same member-owned fields the update above writes. A first save
         used to keep only the name and photo and still answer "saved". */
      if (pay0.track !== undefined && idxP.Track !== undefined)
        rowP[idxP.Track] = String(pay0.track).slice(0, 40);
      if (pay0.mbti !== undefined && idxP.MBTI !== undefined)
        rowP[idxP.MBTI] = fmtMbti_(pay0.mbti);
      if (pay0.notes !== undefined && idxP.FormNotes !== undefined)
        rowP[idxP.FormNotes] = String(pay0.notes).slice(0, 300);
      if (pay0.bday !== undefined && idxP.Birthday !== undefined)
        rowP[idxP.Birthday] = String(pay0.bday).slice(0, 10);
      if (pay0.availability !== undefined && idxP.Availability !== undefined)
        rowP[idxP.Availability] = String(pay0.availability).slice(0, 120);
      if (pay0.prefs !== undefined && idxP.Prefs !== undefined) {
        var pv0 = cleanPrefs_(pay0.prefs);
        if (pv0 === null) return {ok: false, error: 'Those preferences could not be read.'};
        rowP[idxP.Prefs] = pv0;
      }
      shP.appendRow(rowP);
      return {ok: true, saved: true};
    }

    /* Lets a Google account also gain a password, so the same person can come
       in either door. Keyed on the verified email, never on anything typed. */
    case 'setMyPassword': {
      var mE = String(email).toLowerCase();
      if (id.via !== 'google') return {ok: false, error: 'You already sign in with a password.'};
      var mdk = String((payload || {}).dk || ''), msalt = String((payload || {}).clientSalt || '');
      if (!mdk || !msalt) return {ok: false, error: 'The browser did not send a derived key.'};
      var ex = findUser(mE);
      var ss2 = Utilities.getUuid();
      if (ex) {
        setUserField(ex, 'ClientSalt', msalt);
        setUserField(ex, 'ServerSalt', ss2);
        setUserField(ex, 'Hash', hashDk(mdk, ss2));
        setUserField(ex, 'Iterations', Number((payload || {}).iterations) || PBKDF2_ITERS);
        return {ok: true, updated: true};
      }
      tab('users').appendRow([mE, msalt, ss2, hashDk(mdk, ss2),
        Number((payload || {}).iterations) || PBKDF2_ITERS, role, 0, '',
        'linked from Google', new Date(), aff,
        capName_((payload || {}).firstName), capName_((payload || {}).lastName), mE]);
      return {ok: true, created: true};
    }

    /* One member's public card: what any clubmate may see. Personality type
       and points are withheld unless the asker is an officer or it is them. */
    case 'memberCard': {
      var flatN = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      var want = flatN((payload || {}).name);
      var row = null;
      readScoped('teams', aff).forEach(function (r) { if (flatN(r.MemberName) === want) row = r; });
      /* Somebody who has signed up but has not been drafted has no row in
         Teams, and answering "no such member" for a name the officer is
         looking at in the roster is just wrong. Fall back to the account. */
      if (!row) {
        var acct = accountsFor(aff).filter(function (u) {
          return flatN(String(u.first) + String(u.last)) === want ||
                 flatN(u.who) === want || flatN(u.email) === want;
        })[0];
        if (!acct) return {ok: false, error: 'No such member in this club.'};
        var selfA = flatN(id.name || email) === want ||
                    String(acct.who).toLowerCase() === String(email).toLowerCase();
        return {ok: true, full: RANK[role] >= RANK.admin || selfA, undrafted: true,
                member: {name: ((acct.first || '') + ' ' + (acct.last || '')).trim() || acct.who,
                         email: (RANK[role] >= RANK.admin || selfA) ? (acct.email || acct.who) : '',
                         org: '', track: '', mbti: '', lead: '', notes: '',
                         /* How someone signs in, their role and when they joined
                            are account details: officers and the member only. */
                         role: (RANK[role] >= RANK.admin || selfA) ? acct.role : '',
                         joined: (RANK[role] >= RANK.admin || selfA) ? acct.joined : '',
                         kind: (RANK[role] >= RANK.admin || selfA) ? acct.kind : '',
                         points: null, entries: null, photo: acct.photo || null}};
      }
      var self = flatN(id.name || email) === want;
      var full = RANK[role] >= RANK.admin || self;
      var pts = 0, evts = 0;
      if (full) readScoped('pointsLog', aff).forEach(function (r) {
        if (flatN(r.MemberName) !== want) return;
        evts++; pts += Number(r.Points) || 0;
      });
      var ph = null;
      readScoped('profiles', aff).forEach(function (r) {
        if (flatN(String(r.FirstName) + String(r.LastName)) === want) ph = r.Photo;
      });
      return {ok: true, full: full, member: {
        name: row.MemberName, org: row.Org, track: row.Track,
        mbti: full ? row.MBTI : '', lead: row.IsLead,
        notes: RANK[role] >= RANK.admin ? row.Notes : '',
        points: full ? pts : null, entries: full ? evts : null, photo: ph}};
    }

    /* Reads a Google Form's own published page and pulls the question list
       out of FB_PUBLIC_LOAD_DATA_, the blob the form itself renders from. That
       gives the entry ids needed to prefill and to submit, without anyone
       copying field ids by hand. */
    case 'formSchema': {
      var furl = String((payload || {}).formUrl || '');
      /* Officers check any form they are about to link. A member only ever
         reads their own club's, so the script cannot be pointed elsewhere. */
      if (RANK[role] < RANK.admin) furl = String(clubCfg_(aff).formUrl || '');
      if (!/^https:\/\/docs\.google\.com\/forms\//.test(furl))
        return {ok: false, error: 'That is not a Google Forms link.'};
      var viewUrl = furl.replace(/\/edit.*$/, '/viewform').replace(/\?.*$/, '');
      if (viewUrl.indexOf('/viewform') < 0) viewUrl = viewUrl.replace(/\/*$/, '') + '/viewform';
      var res = UrlFetchApp.fetch(viewUrl, {muteHttpExceptions: true, followRedirects: true});
      if (res.getResponseCode() !== 200)
        return {ok: false, error: 'Could not open that form. Is it accepting responses and visible to anyone with the link?'};
      var html = res.getContentText();
      var m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
      if (!m) return {ok: false, error: 'That form did not return a readable question list.'};
      var data;
      try { data = JSON.parse(m[1]); } catch (e) { return {ok: false, error: 'Could not parse that form.'}; }
      var title = (data[3] || data[1] && data[1][8]) || 'Club sign-up form';
      var raw = (data[1] && data[1][1]) || [], fields = [];
      raw.forEach(function (q) {
        var type = q[3], title2 = q[1] || '', entries = q[4] || [];
        entries.forEach(function (en) {
          var opts = (en[1] || []).map(function (o) { return String(o[0]); }).filter(String);
          fields.push({id: 'entry.' + en[0], label: String(title2), type: type,
                       required: !!en[2], options: opts});
        });
      });
      return {ok: true, title: String(title), action: viewUrl.replace(/\/viewform$/, '/formResponse'),
              fields: fields};
    }

    case 'submitForm': {
      /* Posted only to this club's own form, worked out here rather than
         taken from the page -- otherwise any signed-in member could have the
         club's script post answers into any Google Form at all. */
      var act = formAction_(clubCfg_(aff).formUrl);
      if (!act) return {ok: false, error: 'This club has no sign-up form linked.'};
      if (!/^https:\/\/docs\.google\.com\/forms\/.*formResponse$/.test(act))
        return {ok: false, error: 'Bad form target.'};
      /* Only question fields, as bounded text, go through to Google. */
      var raw2 = (payload || {}).answers || {}, body2 = {};
      Object.keys(raw2).slice(0, 80).forEach(function (k) {
        if (!/^entry\.\d+$/.test(k)) return;
        var v = raw2[k];
        body2[k] = Array.isArray(v) ? v.slice(0, 30).map(function (x) { return String(x).slice(0, 500); })
                                    : String(v == null ? '' : v).slice(0, 3000);
      });
      var r2 = UrlFetchApp.fetch(act, {method: 'post', payload: body2,
                                       muteHttpExceptions: true, followRedirects: true});
      var code = r2.getResponseCode();
      if (code !== 200 && code !== 302)
        return {ok: false, error: 'The form rejected that (HTTP ' + code + ').'};
      /* Filed on the account straight away. The page holds a member at the
         form until their profile says it was sent, and reading it back from
         the club's response sheet can fail (no sheet linked, a name that does
         not match), which would ask them again on every other device. What
         the sheet says, once read back, still replaces these. */
      try { stampFormSent_(aff, email, (payload || {}).summary || {}); } catch (e) {}
      return {ok: true, submitted: true};
    }

    /* Every account on the system, with the club it belongs to. Master only,
       and deliberately does not return anything credential-shaped. */
    case 'listSignups': {
      /* A master runs the system and sees every club; an admin runs one club
         and sees only the accounts in it. The scope is decided here rather
         than in the browser so a filter cannot be edited around. */
      var sgScope = (role === 'master') ? null : aff;
      return {ok: true, signups: accountsFor(sgScope)};
    }

    /* Removing an account is two different writes depending on how the person
       gets in, so the browser says who and this decides where the row lives.
       An admin can only reach into their own club, and nobody can delete the
       master or themselves. */
    case 'deleteSignup': {
      var dsWho  = String((payload || {}).who || '').trim();
      var dsAff  = normAff((payload || {}).aff || aff);
      if (!dsWho) return {ok: false, error: 'No account was named.'};
      /* An admin runs one club, so the club being written to is confined here
         rather than in the browser -- a UI that only offers your own club is
         a suggestion, not a control. */
      if (RANK[role] < RANK.master && dsAff !== aff)
        return {ok: false, error: 'You can only remove accounts in your own club.'};
      if (dsWho.toLowerCase() === String(MASTER_EMAIL).toLowerCase())
        return {ok: false, error: 'The master account cannot be removed here.'};
      if (dsWho.toLowerCase() === String(email || '').toLowerCase())
        return {ok: false, error: 'You cannot remove the account you are signed in with.'};
      /* Confirm the account really is in that club before deleting anything,
         so a mistyped name cannot take out a row from somewhere else. */
      var dsFound = accountsFor(dsAff).filter(function (u) {
        return String(u.who).toLowerCase() === dsWho.toLowerCase();
      })[0];
      if (!dsFound) return {ok: false, error: 'No such account in this club.'};
      if (String(dsFound.role).toLowerCase() === 'master' && RANK[role] < RANK.master)
        return {ok: false, error: 'Only the master can remove a master account.'};

      var removed = 0;
      /* The kind comes from the record, never from the browser: the same person
         can hold a Google row in one club and a password row in another, and a
         payload claiming the wrong kind would otherwise reach across clubs. */
      if (String(dsFound.kind) === 'password') {
        var recS = findUser(normUser(dsWho));
        if (!recS) return {ok: false, error: 'No such account.'};
        if (normAff(recS.affiliation) !== dsAff)
          return {ok: false, error: 'No such account in this club.'};
        recS.sheet.deleteRow(recS.row);
        removed++;
      } else {
        var shS = tab('roles'), vS = shS.getDataRange().getValues();
        var hdrS = vS[0].map(function (x) { return String(x).trim(); });
        var cEm = hdrS.indexOf('Email'), cAf = hdrS.indexOf('Affiliation');
        for (var k = vS.length - 1; k >= 1; k--) {
          if (String(vS[k][cEm]).toLowerCase().trim() !== dsWho.toLowerCase()) continue;
          if (cAf > -1 && normAff(vS[k][cAf]) !== dsAff) continue;
          shS.deleteRow(k + 1);
          removed++;
        }
        if (!removed) return {ok: false, error: 'No such account in this club.'};
      }
      /* Their saved profile goes with them, so a re-signup starts clean. */
      try {
        var shP = tab('profiles'), vP = shP.getDataRange().getValues();
        var hP = vP[0].map(function (x) { return String(x).trim(); });
        var pEm = hP.indexOf('Email'), pAf = hP.indexOf('Affiliation');
        for (var q = vP.length - 1; q >= 1; q--) {
          if (String(vP[q][pEm]).toLowerCase().trim() === dsWho.toLowerCase() &&
              (pAf < 0 || normAff(vP[q][pAf]) === dsAff)) shP.deleteRow(q + 1);
        }
      } catch (e) {}
      return {ok: true, removed: dsWho, rows: removed};
    }

    /* The club's roster is the people who actually signed up for it -- not a
       spreadsheet someone imported. Officers of a club get their own club's
       list; nothing here is credential-shaped. */
    case 'clubRoster': return {ok: true, roster: accountsFor(aff)};

    /* Starts a new club and hands the officer who asked for it the keys, so a
       draft can be run somewhere new instead of over the top of a running
       club's teams. Deliberately narrower than createAffiliation, which stays
       master-only: this one cannot name an existing club, copies the current
       club's setup so the new one speaks the same vocabulary, and grants admin
       only to the caller. Nothing is read from or written to the club being
       left behind. */
    case 'forkClub': {
      /* An admin's identity is pinned to the club they joined, so every write
         after the fork still landed in the old club -- replacing its teams and
         renaming it. Only master can be pointed at a different club. */
      if (RANK[role] < RANK.master) return {ok: false, error: 'Only the master account can start a new club.'};
      var fc = normAff((payload || {}).code);
      var fn = String((payload || {}).name || '').trim();
      var fj = String((payload || {}).joinCode || '').trim();
      if (!/^[a-z0-9-]{3,32}$/.test(fc))
        return {ok: false, error: 'Codes are 3-32 characters: letters, digits, dashes.'};
      if (!fn) return {ok: false, error: 'Give the new club a display name.'};
      if (fj.length < 6) return {ok: false, error: 'Join codes must be at least 6 characters.'};
      if (findAff(fc)) return {ok: false, error: 'That code is taken.'};

      tab('affiliations').appendRow([fc, fn, fj, email, new Date()]);

      /* The caller has to be an officer of the club they just made, or they
         would be locked out of it the moment they switched. Master already
         reaches every club and needs no row. */
      if (RANK[role] < RANK.master) {
        tab('roles').appendRow([String(email).toLowerCase(), 'admin', String(email).toLowerCase(),
                                new Date(), fc]);
      }

      /* Carry the setup across -- track names, roles, whether MBTI is used --
         but not the form or sheet links, which belong to the old club. */
      var srcKey = 'club:' + aff, cfgSheet = tab('config');
      var cfgVals = cfgSheet.getDataRange().getValues(), srcCfg = null;
      for (var fi = 1; fi < cfgVals.length; fi++) {
        if (String(cfgVals[fi][0]) === srcKey) {
          try { srcCfg = JSON.parse(cfgVals[fi][1]); } catch (e) { srcCfg = null; }
          break;
        }
      }
      if (srcCfg) {
        delete srcCfg.formUrl; delete srcCfg.sheetUrl; delete srcCfg.formId;
        srcCfg.clubName = fn;
        cfgSheet.appendRow(['club:' + fc, JSON.stringify(srcCfg)]);
      }

      return {ok: true, code: fc, name: fn, copiedSetup: !!srcCfg};
    }

    /* Republishes a club's existing form. Forms created before the publish
       step above exist but serve "This document is not published", and there
       is otherwise no way to fix one from here: the saved link is a published
       URL, not a file id, so an older club's form is found by name in Drive. */
    /* ---- editing the club's own sign-up form ----
       The script owns every form it created, so it can read and rewrite the
       questions directly. Officers get a plain list rather than a link to
       Google Forms, because the form is the club's front door and sending an
       officer into another product to change one word is where clubs stop
       maintaining it. Only forms this script made are editable; a form
       somebody pasted a link to is opened in Google Forms as before. */
    case 'formItems': {
      var fiForm = clubForm_(aff);
      if (fiForm.error) return {ok: false, error: fiForm.error};
      return {ok: true, title: fiForm.form.getTitle(),
              description: fiForm.form.getDescription(),
              editUrl: fiForm.form.getEditUrl(),
              items: readFormItems_(fiForm.form)};
    }

    case 'saveFormItems': {
      var sfForm = clubForm_(aff);
      if (sfForm.error) return {ok: false, error: sfForm.error};
      var form = sfForm.form;
      var wanted = (payload || {}).items || [];
      if (!wanted.length) return {ok: false, error: 'A form needs at least one question.'};

      if ((payload || {}).title !== undefined)
        form.setTitle(String((payload || {}).title || '').slice(0, 200));
      if ((payload || {}).description !== undefined)
        form.setDescription(String((payload || {}).description || '').slice(0, 2000));

      var existing = form.getItems(), byId = {};
      existing.forEach(function (it) { byId[String(it.getId())] = it; });
      var keep = {}, order = [];

      /* Section headers, page breaks, images, grids and the rest are shown in
         the editor as read-only and are never sent back, so without this they
         would fall through to the delete sweep below and the first save would
         strip the form of everything it cannot edit. */
      existing.forEach(function (it) {
        if (FORM_TYPES.indexOf(String(it.getType())) < 0) keep[String(it.getId())] = true;
      });

      wanted.forEach(function (w) {
        var title = String(w.title || '').slice(0, 300);
        if (!title) return;
        var type = String(w.type || 'TEXT').toUpperCase();
        var opts = (w.options || []).map(function (o) { return String(o).slice(0, 200); })
                                    .filter(String);
        var item = w.id ? byId[String(w.id)] : null;

        /* Changing a question's type is a different Forms item, so the old one
           goes and a new one takes its place at the same position. */
        if (item && String(item.getType()) !== type) { form.deleteItem(item); item = null; }
        if (!item) item = addFormItem_(form, type);
        if (!item) return;
        keep[String(item.getId())] = true;
        order.push(item);
        applyFormItem_(item, type, title, String(w.help || '').slice(0, 500), !!w.required, opts);
      });

      /* Anything the officer removed from the list is removed from the form,
         deleted back to front so indexes stay valid mid-loop. */
      var live = form.getItems();
      for (var di = live.length - 1; di >= 0; di--) {
        if (!keep[String(live[di].getId())]) form.deleteItem(live[di]);
      }

      /* Order by the items themselves. Keying this by title looked tidier and
         was wrong: two questions called "Name" resolved to the same item, so
         one was moved twice and the other never at all. */
      order.forEach(function (it, k) { form.moveItem(it, k); });

      return {ok: true, items: readFormItems_(form), title: form.getTitle()};
    }

    case 'republishForm': {
      var rKey = 'club:' + aff, rSheet = tab('config'), rVals = rSheet.getDataRange().getValues();
      var rRow = -1, rCfg = {};
      for (var ri = 1; ri < rVals.length; ri++) {
        if (String(rVals[ri][0]) === rKey) {
          rRow = ri + 1;
          try { rCfg = JSON.parse(rVals[ri][1]) || {}; } catch (e) { rCfg = {}; }
          break;
        }
      }
      if (!rCfg.formUrl) return {ok: false, error: 'This club has no form yet.'};
      var rName = ((findAff(aff) || {}).name || aff) + ' sign-up', rForm = null;
      try {
        if (rCfg.formId) rForm = FormApp.openById(rCfg.formId);
        else {
          var it = DriveApp.getFilesByName(rName);
          if (it.hasNext()) rForm = FormApp.openById(it.next().getId());
        }
      } catch (e) {
        return {ok: false, error: 'Could not open the form: ' + e.message};
      }
      if (!rForm)
        return {ok: false, error: 'Could not find a form named "' + rName + '" in Drive.'};

      var rres = publishForm(rForm);
      rCfg.formUrl = rForm.getPublishedUrl();
      rCfg.formId  = rForm.getId();
      rCfg.formEditUrl = rForm.getEditUrl();
      /* Forms made before officers were given access are fixed here too --
         re-sharing is harmless when they already have it, and it is the only
         route back in for the ones created before this existed. */
      var rDest = rForm.getDestinationId ? rForm.getDestinationId() : null;
      if (rDest) rCfg.sheetId = rDest;
      var rShared = shareWithOfficers([rForm.getId(), rDest], email);
      var rJson = JSON.stringify(rCfg);
      if (rRow > 0) rSheet.getRange(rRow, 2).setValue(rJson);
      else rSheet.appendRow([rKey, rJson]);

      return {ok: true, formUrl: rCfg.formUrl, editUrl: rCfg.formEditUrl,
              did: rres.did, failed: rres.failed,
              sharedWith: email, shareFailed: rShared.failed};
    }

    /* Gives a club its own copy of the standard sign-up form, with a response
       spreadsheet attached, and writes both links into the club's setup so the
       rest of the tool picks them up without anyone pasting a URL. Copying
       rather than sharing matters: a club that edits its questions must not be
       editing another club's form. Refuses to run twice -- a second copy would
       split the club's answers across two spreadsheets. */
    case 'cloneForm': {
      var cfKey = 'club:' + aff, cfSheet = tab('config'), cfVals = cfSheet.getDataRange().getValues();
      var cfRow = -1, cfg = {};
      for (var ci = 1; ci < cfVals.length; ci++) {
        if (String(cfVals[ci][0]) === cfKey) {
          cfRow = ci + 1;
          try { cfg = JSON.parse(cfVals[ci][1]) || {}; } catch (e) { cfg = {}; }
          break;
        }
      }
      if (cfg.formUrl && !(payload || {}).replace)
        return {ok: false, error: 'This club already has a form. Clear the link first if you really want a new one.'};

      var clubName = (findAff(aff) || {}).name || aff;
      var title = clubName + ' sign-up';
      var copy, form, ss;
      try {
        copy = DriveApp.getFileById(FORM_TEMPLATE_ID).makeCopy(title);
        form = FormApp.openById(copy.getId());
        form.setTitle(title);
        ss = SpreadsheetApp.create(title + ' (responses)');
        form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
        publishForm(form);
      } catch (e) {
        return {ok: false, error: 'Could not copy the form: ' + e.message};
      }

      cfg.formUrl  = form.getPublishedUrl();
      cfg.sheetUrl = ss.getUrl();
      /* Kept so the form can be reopened later -- the published URL is not the
         file id, so without this a form can only be found by guessing at its
         name in Drive. */
      cfg.formId   = copy.getId();
      cfg.sheetId  = ss.getId();
      /* The published link is for answering the form. Editing the questions
         needs a different URL entirely, and without it an officer has no way
         in even once they have been given access. */
      cfg.formEditUrl = form.getEditUrl();
      cfg.ownerEmail  = String(((payload || {}).ownerEmail || cfg.ownerEmail || '')).trim();
      var shared = shareWithOfficers([copy.getId(), ss.getId()], email);
      /* A club's form and its answers belong to the club, not to whoever's
         account happens to run this script. Ownership moves to the address the
         club nominated; the script's own account is added as an editor first
         so the handover cannot lock this system out of the file it just made
         and still has to publish, read and edit. */
      var handover = handOwnership([copy.getId(), ss.getId()], cfg.ownerEmail);
      var cfJson = JSON.stringify(cfg);
      if (cfRow > 0) cfSheet.getRange(cfRow, 2).setValue(cfJson);
      else cfSheet.appendRow([cfKey, cfJson]);

      return {ok: true, formUrl: cfg.formUrl, sheetUrl: cfg.sheetUrl,
              editUrl: cfg.formEditUrl, title: title,
              sharedWith: email, shareFailed: shared.failed,
              owner: cfg.ownerEmail || '', ownerMoved: handover.moved.length,
              ownerSkipped: !!handover.skipped, ownerFailed: handover.failed};
    }

    /* Clears a club's roster, points and attendance but keeps the club, its
       accounts and its setup. Used to hand a club over between semesters. */
    case 'purgeClub': {
      var pc = normAff((payload || {}).code || aff);
      /* Officers may clear their own club and only their own. The club being
         cleared arrives in the payload, so confining it to the caller has to
         happen here -- a UI that only offers your own club is not a control,
         it is a suggestion. Master runs the whole system and may clear any. */
      if (RANK[role] < RANK.master && pc !== aff)
        return {ok: false, error: 'You can only clear your own club.'};
      /* The code is normalised on the way in but the typed confirmation was
         compared raw, so a single capital letter -- "Deanza-pbl" -- was
         refused with a message telling you to type the code you had just
         typed. Both sides are normalised now: it still has to be the code,
         but case and stray spacing no longer decide it. */
      if (normAff((payload || {}).confirm) !== pc)
        return {ok: false, error: 'That is not the code for this club. Type ' + pc + ' to confirm.'};
      var wiped = {};
      ['teams', 'pointsLog', 'attendance'].forEach(function (k) {
        var sh = tab(k); if (!sh) return;
        var v = sh.getDataRange().getValues(), col = -1, cnt = 0;
        for (var c = 0; c < v[0].length; c++) if (String(v[0][c]) === 'Affiliation') col = c;
        if (col < 0) return;
        for (var r3 = v.length - 1; r3 >= 1; r3--)
          if (normAff(v[r3][col]) === pc) { sh.deleteRow(r3 + 1); cnt++; }
        wiped[k] = cnt;
      });
      return {ok: true, purged: pc, wiped: wiped};
    }

    case 'deleteAffiliation': {
      var dcode = normAff((payload || {}).code);
      if (!dcode || dcode === DEFAULT_AFF) return {ok: false, error: 'That club cannot be deleted.'};
      if (normAff((payload || {}).confirm) !== dcode)
        return {ok: false, error: 'That is not the code for this club. Type ' + dcode + ' to confirm.'};
      /* Rows are removed bottom-up so earlier deletions do not shift the
         indexes of rows not yet examined. */
      ['teams', 'pointsLog', 'attendance', 'users', 'roles', 'profiles'].forEach(function (k) {
        var sh = tab(k); if (!sh) return;
        var v = sh.getDataRange().getValues();
        var col = -1;
        for (var c = 0; c < v[0].length; c++) if (String(v[0][c]) === 'Affiliation') col = c;
        if (col < 0) return;
        for (var r2 = v.length - 1; r2 >= 1; r2--)
          if (normAff(v[r2][col]) === dcode) sh.deleteRow(r2 + 1);
      });
      var shC = tab('config'), vC = shC.getDataRange().getValues();
      for (var q2 = vC.length - 1; q2 >= 1; q2--)
        if (String(vC[q2][0]) === 'club:' + dcode || String(vC[q2][0]) === 'teamreqs:' + dcode) shC.deleteRow(q2 + 1);
      var shA2 = tab('affiliations'), vA2 = shA2.getDataRange().getValues();
      for (var z2 = vA2.length - 1; z2 >= 1; z2--)
        if (normAff(vA2[z2][0]) === dcode) shA2.deleteRow(z2 + 1);
      return {ok: true, deleted: dcode};
    }

    case 'deleteUser': {
      var du = normUser((payload || {}).username);
      var recD = findUser(du);
      if (!recD) return {ok: false, error: 'No such account.'};
      recD.sheet.deleteRow(recD.row);
      return {ok: true, removed: du};
    }

    case 'resetPassword': {
      var ru = normUser((payload || {}).username);
      var rdk = String((payload || {}).dk || '');
      var rsalt = String((payload || {}).clientSalt || '');
      if (!rdk || !rsalt) return {ok: false, error: 'The browser did not send a derived key.'};
      var recR = findUser(ru);
      if (!recR) return {ok: false, error: 'No such account.'};
      var ssaltR = Utilities.getUuid();
      setUserField(recR, 'ClientSalt', rsalt);
      setUserField(recR, 'ServerSalt', ssaltR);
      setUserField(recR, 'Hash', hashDk(rdk, ssaltR));
      setUserField(recR, 'Iterations', Number((payload || {}).iterations) || PBKDF2_ITERS);
      setUserField(recR, 'FailCount', 0);
      setUserField(recR, 'LockedUntil', '');
      return {ok: true, reset: ru};
    }

    /* Changing your own password needs the old one, so a borrowed session
       cannot be used to lock the real owner out. */
    case 'changePassword': {
      if (id.via !== 'password')
        return {ok: false, error: 'You are signed in with Google, which has no password here.'};
      var oldDk = String((payload || {}).oldDk || '');
      var newDk = String((payload || {}).newDk || '');
      var newSalt = String((payload || {}).clientSalt || '');
      if (!oldDk || !newDk || !newSalt)
        return {ok: false, error: 'The browser did not send a derived key.'};
      var recC = findUser(email);
      if (!recC) return {ok: false, error: 'No such account.'};
      if (hashDk(oldDk, recC.serverSalt) !== recC.hash)
        return {ok: false, error: 'That is not your current password.'};
      var ssaltC = Utilities.getUuid();
      setUserField(recC, 'ClientSalt', newSalt);
      setUserField(recC, 'ServerSalt', ssaltC);
      setUserField(recC, 'Hash', hashDk(newDk, ssaltC));
      setUserField(recC, 'Iterations', Number((payload || {}).iterations) || PBKDF2_ITERS);
      return {ok: true, changed: true};
    }

    /* A member sends a team they put together themselves: what it is for
       (a client, an FLC event, a track), a name, who is on it, and a note.
       It is only a request -- nothing about the club's teams changes until
       an officer has checked it and approved it. One open request per
       member per kind; sending again replaces it. */
    case 'submitTeamRequest': {
      var tq = payload || {};
      var kind = String(tq.kind || '');
      if (!TEAMREQ_KINDS[kind]) return {ok: false, error: 'Pick what kind of team this is.'};
      var clip = function (v, n) { return String(v || '').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, n); };
      var target = clip(tq.target, 60), tname = clip(tq.name, 60), note = clip(tq.note, 200);
      /* The name they registered with. A Google account with no name on it
         reports its address as the name, and that is what officers ended up
         reading on the request and on the team. */
      var meClip = clip(tq.me, 60);
      var byName = profileName_(aff, email) || (meClip && meClip.indexOf('@') < 0 ? meClip : '') ||
        (String(id.name || '').indexOf('@') < 0 ? String(id.name || '') : '') || String(email).split('@')[0];
      if (kind !== 'other' && !target) return {ok: false, error: kind === 'flc' ? 'Pick the event.' : 'Pick the client.'};
      var seen = {}, mem = [byName].concat(tq.members || []).map(function (m) { return clip(m, 60); })
        .filter(function (m) { var k = m.toLowerCase().replace(/[^a-z]/g, ''); if (!k || seen[k]) return false; seen[k] = 1; return true; });
      if (mem.length > TEAMREQ_KINDS[kind])
        return {ok: false, error: 'That is ' + mem.length + ' people; this kind of team takes up to ' + TEAMREQ_KINDS[kind] + '.'};
      var who = String(email).toLowerCase();
      return withLock_(function () {
        var list = readReqs_(aff).filter(function (r) {
          return !(r.by === who && r.kind === kind && r.status !== 'approved');
        });
        if (list.length >= 400) return {ok: false, error: 'This club has too many open team requests. Ask EBOD to clear some.'};
        var req = {id: 'q' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
          by: who, byName: byName, kind: kind, target: target, name: tname, members: mem, note: note,
          status: 'pending', at: new Date().toISOString()};
        list.push(req);
        writeReqs_(aff, list);
        return {ok: true, request: req};
      });
    }

    case 'withdrawTeamRequest': {
      var wid = String((payload || {}).id || ''), whoW = String(email).toLowerCase();
      return withLock_(function () {
        var list = readReqs_(aff), n = list.length;
        list = list.filter(function (r) { return !(r.id === wid && r.by === whoW && r.status !== 'approved'); });
        if (list.length === n) return {ok: false, error: 'That request is not yours to withdraw, or it was already approved.'};
        writeReqs_(aff, list);
        return {ok: true, withdrawn: wid};
      });
    }

    /* Officers delete a request outright -- any status -- or every request
       that became a team they have just deleted, so nobody is left looking at
       "Approved" for a team that no longer exists. */
    case 'deleteTeamRequest': {
      var dq = payload || {}, dId = String(dq.id || ''), dTeam = String(dq.teamId || '');
      if (!dId && !dTeam) return {ok: false, error: 'Which request?'};
      return withLock_(function () {
        var list = readReqs_(aff), n = list.length;
        list = list.filter(function (r) { return !((dId && r.id === dId) || (dTeam && r.teamId === dTeam)); });
        if (list.length !== n) writeReqs_(aff, list);
        return {ok: true, deleted: n - list.length};
      });
    }

    /* Officers see every request. A member sees the ones they sent and the
       ones that list them, so they know when someone has put them on a team. */
    case 'listTeamRequests': {
      var all = readReqs_(aff);
      if (RANK[role] >= RANK.admin) return {ok: true, requests: all};
      var whoL = String(email).toLowerCase();
      var flatN = function (x) { return String(x || '').toLowerCase().replace(/[^a-z]/g, ''); };
      /* Matched on who they signed in as. A name in the payload let a member
         list every request naming somebody else. */
      var meN = flatN(id.name || '');
      return {ok: true, requests: all.filter(function (r) {
        return r.by === whoL || (meN && (r.members || []).some(function (m) { return flatN(m) === meN; }));
      }).map(function (r) {
        var c = {}; for (var k in r) if (k !== 'by') c[k] = r[k];
        c.mine = r.by === whoL; return c;
      })};
    }

    /* Officers change who is on a request -- before approving it, or after,
       when the team it became changes. The page updates the team itself;
       this keeps the request members see in step with it. */
    case 'editTeamRequest': {
      var ed = payload || {}, eid = String(ed.id || '');
      var clipE = function (v) { return String(v || '').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, 60); };
      return withLock_(function () {
        var list = readReqs_(aff), hit = null;
        list.forEach(function (r) { if (r.id === eid) hit = r; });
        if (!hit) return {ok: false, error: 'That request was withdrawn.'};
        var seenE = {}, mem = (ed.members || []).map(clipE).filter(function (m) {
          var k = m.toLowerCase().replace(/[^a-z]/g, ''); if (!k || seenE[k]) return false; seenE[k] = 1; return true; });
        if (!mem.length) return {ok: false, error: 'A team needs at least one member.'};
        if (mem.length > TEAMREQ_KINDS[hit.kind]) return {ok: false, error: 'This kind of team takes up to ' + TEAMREQ_KINDS[hit.kind] + '.'};
        hit.members = mem;
        /* Officers can rename a request, or point it at another event or
           client, where it sits. Only what was sent is changed. */
        if (ed.name !== undefined) hit.name = clipE(ed.name);
        if (ed.target) hit.target = clipE(ed.target);
        hit.editedBy = String(email); hit.editedAt = new Date().toISOString();
        writeReqs_(aff, list);
        return {ok: true, request: hit};
      });
    }

    /* Lays out member Drive folders for the whole club, as far as the time
       allows; the page calls again until nothing is left. */
    case 'syncMemberDrives': {
      var lockD = docLock_();
      if (!lockD.tryLock(5000)) return {ok: false, error: 'Another officer is setting up folders right now. Try again in a minute.'};
      try { return syncDrivesFor_(aff, Math.min(Number((payload || {}).budgetMs) || 40000, 240000)); }
      finally { lockD.releaseLock(); }
    }

    /* A member's own folder, made the first time they open the page. */
    case 'ensureMyDrive': {
      var lockM = docLock_();
      if (!lockM.tryLock(8000)) return {ok: false, error: 'busy'};
      try {
        var mCfg = null; readTab('config').forEach(function (r) { if (String(r.Key) === 'club:' + aff) { try { mCfg = JSON.parse(r.Value); } catch (e) {} } });
        var md = readDrive_(aff);
        ensureMemberDrive_(aff, mCfg || {}, md, acctFor_(aff, email, id), rosterIndex_(aff));
        writeDrive_(aff, md);
        /* No link back: the folder is the officers', not shared with the member. */
        return {ok: true};
      } finally { lockM.releaseLock(); }
    }

    case 'reviewTeamRequest': {
      var rv = payload || {}, rid = String(rv.id || ''), st = String(rv.status || '');
      if (st !== 'approved' && st !== 'returned') return {ok: false, error: 'Approve or return it.'};
      return withLock_(function () {
        var list = readReqs_(aff), hit = null;
        list.forEach(function (r) { if (r.id === rid) hit = r; });
        if (!hit) return {ok: false, error: 'That request was withdrawn.'};
        hit.status = st;
        hit.review = String(rv.note || '').replace(/[<>\u0000-\u001F]/g, '').slice(0, 200);
        hit.teamId = st === 'approved' ? String(rv.teamId || '').slice(0, 40) : '';
        hit.reviewedBy = String(email); hit.reviewedAt = new Date().toISOString();
        writeReqs_(aff, list);
        return {ok: true, request: hit};
      });
    }

    case 'getAll': {
      /* Everything the club looks like, shared by every caller and read
         through the short-lived cache above. */
      var sh = clubSnapshot_(aff);
      var cfg = sh.cfg, me = String(email).toLowerCase();
      var officer = RANK[role] >= RANK.admin, meRow = id.name || email;
      var myP = meBits_(aff, me);
      /* What the page used to ask for in three more calls after this one --
         whether the sign-up form is in, the member's FLC choices, and the
         team requests that involve them -- rides along, so a member's page is
         ready after one round trip instead of two. */
      var meN = String(id.name || '').toLowerCase().replace(/[^a-z]/g, '');
      var myReqs = officer ? sh.reqs : sh.reqs.filter(function (r) {
        return r.by === me || (meN && (r.members || []).some(function (m) {
          return String(m).toLowerCase().replace(/[^a-z]/g, '') === meN; }));
      }).map(function (r) { var c = {}; for (var k in r) if (k !== 'by') c[k] = r[k]; c.mine = r.by === me; return c; });
      return {
        /* Whether this person's folder exists yet; the page asks for it in the
           background if not. No link: members are not given access. */
        myDriveReady: !!sh.drive[me],
        gcal:        gcalFor_(sh.gcal, cfg, role),
        /* Opens the members' calendar feed (see doGet). */
        calFeedKey:  feedKey_(aff),
        memberNames: sh.memberNames,
        ok: true, role: role, email: email, name: id.name || email, via: id.via,
        config: officer ? cfg : memberCfg_(cfg, id.name || email),
        aff: aff, affName: sh.affName,
        needsAff: !!id.needsAff,
        affiliations: id.isRoot ? allAffiliations().map(function (a) {
          return {code: a.code, name: a.name}; }) : null,
        teamBoard:  sh.teamBoard,
        orgBoard:   sh.orgBoard,
        me: {formSent: !!myP.formAt, prefs: myP.prefs || '', requests: myReqs},
        /* The raw form-responses tab used to ride along here, for every club,
           to any signed-in member. Nothing in the page read it; officers get
           the roster they need from clubRoster, scoped to their own club. */
        teams:      officer ? sh.teams : memberRows_('teams', sh.teams, meRow),
        pointsLog:  officer ? sh.pointsLog : memberRows_('pointsLog', sh.pointsLog, meRow),
        attendance: officer ? sh.attendance : memberRows_('attendance', sh.attendance, meRow)
      };
    }

    case 'setConfig': {
      var ckey = 'club:' + aff;
      var sh0 = tab('config'), v0 = sh0.getDataRange().getValues(), next = payload || {};
      /* Two officers saving at once used to cost one of them their change:
         each save replaced the whole club. A page now sends only what it
         changed -- whole values for most settings, and item by item for the
         lists of things with ids (teams, rooms, cups, assignments, events) --
         and it is merged into what is stored, under the write lock. */
      if (next.__patch) {
        var base0 = {};
        for (var qp = 1; qp < v0.length; qp++) if (String(v0[qp][0]) === ckey) { try { base0 = JSON.parse(v0[qp][1]) || {}; } catch (e) {} }
        next = applyCfgPatch_(base0, next);
      }
      for (var q = 1; q < v0.length; q++) {
        if (String(v0[q][0]) === ckey) {
          /* The browser saves the whole club, but only the server ever learns
             the file ids of a form it made. A save that does not carry them
             would otherwise drop them, and the in-app form editor with them.
             They are kept only while the form is still the same one. */
          var prev0 = {};
          try { prev0 = JSON.parse(v0[q][1]) || {}; } catch (e) {}
          if (prev0.formUrl && next.formUrl === prev0.formUrl) {
            ['formId', 'sheetId'].forEach(function (k) {
              if (next[k] === undefined && prev0[k]) next[k] = prev0[k];
            });
          }
          sh0.getRange(q + 1, 2).setValue(JSON.stringify(next));
          /* The merged result goes back, so this page shows what the others
             saved too, straight away. */
          return {ok: true, saved: true, cfg: next};
        }
      }
      var json = JSON.stringify(next);
      sh0.appendRow([ckey, json]);
      return {ok: true, saved: true, cfg: next};
    }

    /* An Org Lead runs their own Org, and naming it is the one piece of that
       the system was making them ask an officer for. The caller is matched
       against the roster by name and has to actually be a lead of the Org
       being renamed -- the browser sends which Org it means, and this decides
       whether that is true. Officers go through setTeams as before. */
    case 'setOrgName': {
      var onFrom = String((payload || {}).from || '').trim();
      var onTo   = String((payload || {}).to || '').trim();
      if (!onFrom || !onTo) return {ok: false, error: 'Both names are required.'};
      if (onTo.length > 60) return {ok: false, error: 'That name is too long.'};
      if (/[<>]/.test(onTo)) return {ok: false, error: 'Names cannot contain < or >.'};

      var meName = String(id.name || email || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      var sh = tab('teams'), vals = sh.getDataRange().getValues();
      var hd = vals[0].map(function (x) { return String(x).trim(); });
      var cName = hd.indexOf('MemberName'), cOrg = hd.indexOf('Org'),
          cLead = hd.indexOf('IsLead'), cAff = hd.indexOf('Affiliation');
      if (cName < 0 || cOrg < 0) return {ok: false, error: 'The Teams tab is missing columns.'};

      var mayRename = RANK[role] >= RANK.admin;
      if (!mayRename) {
        for (var i = 1; i < vals.length && !mayRename; i++) {
          if (cAff > -1 && normAff(vals[i][cAff] || DEFAULT_AFF) !== aff) continue;
          if (String(vals[i][cOrg]).trim() !== onFrom) continue;
          var rn = String(vals[i][cName] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (rn && rn === meName && /^y/i.test(String(vals[i][cLead] || ''))) mayRename = true;
        }
      }
      if (!mayRename)
        return {ok: false, error: 'Only an officer or a lead of that ' + onFrom + ' can rename it.'};

      var changed = 0;
      for (var j = 1; j < vals.length; j++) {
        if (cAff > -1 && normAff(vals[j][cAff] || DEFAULT_AFF) !== aff) continue;
        if (String(vals[j][cOrg]).trim() !== onFrom) continue;
        sh.getRange(j + 1, cOrg + 1).setValue(onTo);
        changed++;
      }
      return {ok: true, renamed: onTo, rows: changed};
    }

    case 'setTeams': {
      /* Replaces only this club's rows. Clearing the whole sheet would delete
         every other affiliation's roster, so the surviving rows are read
         first and written back alongside the new ones. */
      var sh = tab('teams'), cols = TAB.teams.cols, allT = readTab('teams');
      var others = allT.filter(function (r) {
        return String(r.Affiliation || DEFAULT_AFF).toLowerCase() !== aff;
      });
      /* Moving one member, or renaming an Org, sends only the rows that
         changed, each with what it looked like when that page read it. Two
         officers rearranging at once then both keep their moves. A new
         draft still sends every row and replaces the club's roster. */
      if (payload && payload.__patch) {
        var flatT = function (n) { return String(n || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
        var cur = allT.filter(function (r) { return String(r.Affiliation || DEFAULT_AFF).toLowerCase() === aff; });
        var byN = {}, order = [];
        cur.forEach(function (r) { var k = flatT(r.MemberName); if (k && !byN[k]) { byN[k] = r; order.push(k); } });
        (payload.rm || []).forEach(function (n) { delete byN[flatT(n)]; });
        (payload.up || []).forEach(function (u) {
          var row = u && u.row; if (!row || !row.MemberName) return;
          var k = flatT(row.MemberName), was = u.was, have = byN[k];
          if (!have) { byN[k] = row; order.push(k); return; }
          Object.keys(row).forEach(function (f) {
            if (was && String(row[f] === undefined ? '' : row[f]) === String(was[f] === undefined ? '' : was[f])) return;
            have[f] = row[f];
          });
        });
        payload = order.filter(function (k) { return byN[k]; }).map(function (k) { return byN[k]; });
      }
      var mine = (payload || []).map(function (r) {
        r.Affiliation = aff;
        if (r.MemberName) r.MemberName = capName_(r.MemberName);
        if (r.MBTI) r.MBTI = fmtMbti_(r.MBTI);
        return r;
      });
      sh.clear();
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
      sh.setFrozenRows(1);
      appendRows('teams', others.concat(mine));
      return {ok: true, wrote: mine.length, kept: others.length};
    }

    case 'addPointsBulk': {
      var now = new Date();
      (payload || []).forEach(function (r) { if (!r.Timestamp) r.Timestamp = now; r.Affiliation = aff; });
      return {ok: true, wrote: appendRows('pointsLog', payload || [])};
    }

    case 'addAttendanceBulk': {
      var t = new Date();
      (payload || []).forEach(function (r) { if (!r.Timestamp) r.Timestamp = t; r.Affiliation = aff; });
      return {ok: true, wrote: appendRows('attendance', payload || [])};
    }

    case 'listRoles': {
      var affNm = {};
      allAffiliations().forEach(function (a) { affNm[a.code] = a.name; });
      var out2 = [{email: String(MASTER_EMAIL).toLowerCase(), role: 'master', locked: true,
                   aff: '', affName: 'every club'}];
      /* Master is answering "who runs what" across the whole system, so this
         is not scoped to the club being viewed -- that scoping is why an
         officer of another club was invisible from here. */
      var src = RANK[role] >= RANK.master ? readTab('roles') : readScoped('roles', aff);
      src.forEach(function (r) {
        var em = String(r.Email).toLowerCase().trim();
        if (!em || em === String(MASTER_EMAIL).toLowerCase()) return;
        var a = normAff(r.Affiliation || DEFAULT_AFF);
        out2.push({email: em, role: String(r.Role).toLowerCase().trim() || 'member',
                   locked: false, aff: a, affName: affNm[a] || a});
      });
      return {ok: true, roles: out2, scoped: RANK[role] < RANK.master};
    }

    case 'setRole': {
      var em2 = String((payload || {}).email || '').toLowerCase().trim();
      var newRole = String((payload || {}).role || '').toLowerCase().trim();
      if (!em2 || em2.indexOf('@') < 0) return {ok: false, error: 'Not an email address.'};
      if (!RANK[newRole] || newRole === 'none') return {ok: false, error: 'Unknown role.'};
      if (em2 === String(MASTER_EMAIL).toLowerCase())
        return {ok: false, error: 'The master account is set in the script, not here.'};

      /* Which club the officer runs is part of granting the role, not a
         consequence of whichever club the master happened to be viewing.
         Master may name any club; anyone else can only grant inside theirs. */
      var askedClub = String((payload || {}).club || '').trim();
      if (askedClub && RANK[role] < RANK.master) askedClub = '';
      var wantAff = askedClub ? normAff(askedClub) : aff;
      if (askedClub && wantAff !== DEFAULT_AFF && !findAff(wantAff))
        return {ok: false, error: 'No club with the code "' + wantAff + '".'};

      var sh2 = tab('roles'), vals = sh2.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]).toLowerCase().trim() === em2) {
          sh2.getRange(i + 1, 2).setValue(newRole);
          sh2.getRange(i + 1, 3).setValue(email);
          sh2.getRange(i + 1, 4).setValue(new Date());
          /* Affiliation was never rewritten here, so an officer could not be
             moved between clubs -- the grant looked like it worked and left
             them where they were. One row per address is what pins a person
             to one club, so it is updated rather than duplicated.

             Only when a club was actually named, though. Falling back to the
             club being viewed would mean changing somebody's role from the
             roles table -- which sends no club -- silently moved them into
             whichever club happened to be on screen. */
          var keptAff = normAff(vals[i][4] || DEFAULT_AFF);
          if (askedClub) { sh2.getRange(i + 1, 5).setValue(wantAff); keptAff = wantAff; }
          return {ok: true, updated: em2, role: newRole, aff: keptAff};
        }
      }
      sh2.appendRow([em2, newRole, email, new Date(), wantAff]);
      return {ok: true, added: em2, role: newRole, aff: wantAff};
    }

    case 'removeRole': {
      var em3 = String((payload || {}).email || '').toLowerCase().trim();
      if (em3 === String(MASTER_EMAIL).toLowerCase())
        return {ok: false, error: 'The master account cannot be removed here.'};
      var sh3 = tab('roles'), v3 = sh3.getDataRange().getValues();
      for (var j = v3.length - 1; j >= 1; j--) {
        if (String(v3[j][0]).toLowerCase().trim() === em3) sh3.deleteRow(j + 1);
      }
      return {ok: true, removed: em3};
    }
  }
  return {ok: false, error: 'Unhandled action.'};
}


/* ================= FORM EDITING HELPERS =================
   Kept out of dispatch so both the read and the write use exactly the same
   idea of what a question is. */

var FORM_TYPES = ['TEXT', 'PARAGRAPH_TEXT', 'MULTIPLE_CHOICE', 'CHECKBOX', 'LIST'];

/* The club's own form, or a reason it cannot be edited here. */
function clubForm_(aff) {
  var key = 'club:' + aff, vals = tab('config').getDataRange().getValues(), cfg = {};
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === key) {
      try { cfg = JSON.parse(vals[i][1]) || {}; } catch (e) { cfg = {}; }
      break;
    }
  }
  if (!cfg.formUrl) return {error: 'This club has no sign-up form yet.'};
  if (!cfg.formId)
    return {error: 'This form was linked by URL rather than created here, so its questions ' +
                   'are edited in Google Forms.'};
  try {
    return {form: FormApp.openById(cfg.formId)};
  } catch (e) {
    return {error: 'Could not open the form: ' + e.message};
  }
}

function readFormItems_(form) {
  return form.getItems().map(function (it) {
    var type = String(it.getType()), out = {
      id: String(it.getId()), title: it.getTitle(), help: it.getHelpText(),
      type: type, required: false, options: [], editable: FORM_TYPES.indexOf(type) > -1
    };
    try {
      if (type === 'TEXT')                { var a = it.asTextItem();           out.required = a.isRequired(); }
      else if (type === 'PARAGRAPH_TEXT') { var b = it.asParagraphTextItem();  out.required = b.isRequired(); }
      else if (type === 'MULTIPLE_CHOICE'){ var c = it.asMultipleChoiceItem(); out.required = c.isRequired();
                                            out.options = c.getChoices().map(function (x) { return x.getValue(); }); }
      else if (type === 'CHECKBOX')       { var d = it.asCheckboxItem();       out.required = d.isRequired();
                                            out.options = d.getChoices().map(function (x) { return x.getValue(); }); }
      else if (type === 'LIST')           { var e2 = it.asListItem();          out.required = e2.isRequired();
                                            out.options = e2.getChoices().map(function (x) { return x.getValue(); }); }
    } catch (e) {}
    return out;
  });
}

function addFormItem_(form, type) {
  if (type === 'TEXT')            return form.addTextItem();
  if (type === 'PARAGRAPH_TEXT')  return form.addParagraphTextItem();
  if (type === 'MULTIPLE_CHOICE') return form.addMultipleChoiceItem();
  if (type === 'CHECKBOX')        return form.addCheckboxItem();
  if (type === 'LIST')            return form.addListItem();
  return null;
}

function applyFormItem_(item, type, title, help, required, options) {
  /* A choice question with no choices throws, so it falls back to one blank
     option rather than failing the whole save. */
  var choices = options && options.length ? options : ['Option 1'];
  if (type === 'TEXT') {
    item.asTextItem().setTitle(title).setHelpText(help).setRequired(required);
  } else if (type === 'PARAGRAPH_TEXT') {
    item.asParagraphTextItem().setTitle(title).setHelpText(help).setRequired(required);
  } else if (type === 'MULTIPLE_CHOICE') {
    item.asMultipleChoiceItem().setTitle(title).setHelpText(help)
        .setRequired(required).setChoiceValues(choices);
  } else if (type === 'CHECKBOX') {
    item.asCheckboxItem().setTitle(title).setHelpText(help)
        .setRequired(required).setChoiceValues(choices);
  } else if (type === 'LIST') {
    item.asListItem().setTitle(title).setHelpText(help)
        .setRequired(required).setChoiceValues(choices);
  }
}

/* Find or make a folder by name, at the Drive root when parent is null. Drive
   allows two folders with the same name in one place, so an existing one is
   always reused rather than a second being made every submission. */
function folderUnder(parent, name) {
  /* Searched rather than listed by name: getFoldersByName also returns
     folders in the bin, and at the root DriveApp.getFoldersByName searches
     everything shared with this account too, so a club could file work into a
     trashed folder or one somebody else owns. */
  var p = parent || DriveApp.getRootFolder();
  var q = 'title = "' + String(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '" and trashed = false';
  var it = p.searchFolders(q);
  if (it.hasNext()) return it.next();
  return p.createFolder(name);
}

/* ================= MEMBER DRIVE FOLDERS =================
   Every member gets one folder in the club's Drive with a subfolder for each
   assignment set for them, and their hand-ins are filed there. The folders
   are for officers: they are not shared with members (EBOD's decision), who
   keep handing in through the page. Officers also keep their usual tree,
   "<club> — handed in / assignment / Org / name", which now holds a shortcut
   to each file.

   The map of who has which folder lives under its own Config row
   ("drive:<club>"), kept small: one folder id and a stamp of which
   assignments were last laid out, per member. */
var MEMBER_ROOT_SUFFIX = ' — member folders';
var WORK_TAG = 'Org System assignment: ';
function readDrive_(aff) {
  var r = cfgRow_('drive:' + aff), d;
  try { d = JSON.parse(r.val || '{}') || {}; } catch (e) { d = {}; }
  /* The folders belong to whichever account runs this script. When that
     changes (the club moved the backend to its own account), a tree owned by
     the old account is left where it is and a fresh one is laid out in the
     new account's Drive. Checked once every few hours, not on every call. */
  if (d.root) {
    var cache = CacheService.getScriptCache(), ck = 'drootok:' + d.root;
    if (!cache.get(ck)) {
      var mine = false;
      try {
        var rf = DriveApp.getFolderById(d.root);
        mine = !rf.isTrashed() && rf.getOwner() && rf.getOwner().getEmail() === myDriveEmail_();
      } catch (e) { mine = false; }
      if (mine) cache.put(ck, '1', 6 * 3600);
      else d = {movedFrom: d.root};
    }
  }
  return d;
}
var MY_DRIVE_EMAIL_ = '';
function myDriveEmail_() {
  if (!MY_DRIVE_EMAIL_) { try { MY_DRIVE_EMAIL_ = DriveApp.getRootFolder().getOwner().getEmail(); } catch (e) { MY_DRIVE_EMAIL_ = ''; } }
  return MY_DRIVE_EMAIL_;
}
function writeDrive_(aff, d) {
  var r = cfgRow_('drive:' + aff), j = JSON.stringify(d);
  if (r.row > 0) r.sh.getRange(r.row, 2).setValue(j); else r.sh.appendRow(['drive:' + aff, j]);
}
function flatName_(x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
/* Every word of a name starts with a capital, after a hyphen or apostrophe
   too; the rest stays as typed ("mary-jane o'neil" -> "Mary-Jane O'Neil"). */
function capName_(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
    .replace(/(^|[\s\-'\u2019])([a-z\u00df-\u00ff])/g, function (m, a, b) { return a + b.toUpperCase(); });
}
/* A personality type in capitals: a proper four letters pulled out of
   whatever surrounds them ("enfp-t" -> "ENFP"), else just upper-cased. */
function fmtMbti_(v) {
  var u = String(v == null ? '' : v).toUpperCase().replace(/[^A-Z]/g, '');
  var m = u.match(/[EI][SN][TF][JP]/);
  return m ? m[0] : u.slice(0, 4);
}
function folderUrl_(id) { return 'https://drive.google.com/drive/folders/' + id; }
function safeFolderName_(x) { return String(x || '').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-').trim().slice(0, 90) || 'Untitled'; }
/* The assignments a member should see: everyone's, their Org's, their teams'. */
function workForMember_(cfg, rosterName, orgLabel) {
  var n = flatName_(rosterName);
  return (cfg.work || []).filter(function (w) {
    if (!w || !w.id) return false;
    if (w.team && w.team !== 'all') {
      var t = (cfg.teams || []).filter(function (x) { return x.id === w.team; })[0];
      return !!t && (t.members || []).some(function (m) { return flatName_(m) === n; });
    }
    if (w.org !== undefined && w.org !== null && w.org !== '' && w.org !== 'all')
      return !!orgLabel && flatName_(w.orgName) === flatName_(orgLabel);
    return true;
  });
}
/* Changes when an assignment is added, removed, renamed or re-dated. */
function workStamp_(list) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
    list.map(function (w) { return w.id + ':' + w.title + ':' + (w.due || ''); }).sort().join('|'))).slice(0, 12);
}
/* The club roster rows (name and Org), for working out whose assignments are whose. */
function rosterIndex_(aff) {
  var idx = {};
  readScoped('teams', aff).forEach(function (r) {
    if (r.MemberName) idx[flatName_(r.MemberName)] = {name: String(r.MemberName), org: String(r.Org || '')};
  });
  return idx;
}
/* Makes sure one member's folder exists, is shared with them, and holds a
   subfolder for each of their assignments (renaming ones whose title or due
   date changed). Returns the map entry. Safe to call again: it only does what
   is missing. */
function ensureMemberDrive_(aff, cfg, d, acct, roster) {
  var key = String(acct.email || acct.who || '').toLowerCase().trim();
  if (!key) return null;
  /* A real name when there is one: what they registered, else the name on
     their Google account (only known when they themselves are signed in).
     Failing both, the start of their address -- and a folder is never
     renamed back to that from a real name. */
  var realName = String(((acct.first || '') + ' ' + (acct.last || '')).trim() ||
    (acct.name && String(acct.name).indexOf('@') < 0 ? acct.name : '')).slice(0, 60);
  var display = realName || key.split('@')[0];
  var rr = roster[flatName_(display)] || null;
  var rosterName = rr ? rr.name : display;
  d.members = d.members || {};
  var e = d.members[key] || {};

  if (!d.root) {
    var clubName = (findAff(aff) || {}).name || aff;
    var rootF = folderUnder(null, clubName + MEMBER_ROOT_SUFFIX);
    d.root = rootF.getId();
    try { if (cfg.ownerEmail) rootF.addEditor(cfg.ownerEmail); } catch (x) {}
  }
  var root = DriveApp.getFolderById(d.root);
  var folder = null;
  if (e.f) { try { folder = DriveApp.getFolderById(e.f); if (folder.isTrashed()) folder = null; } catch (x) { folder = null; } }
  if (!folder) { folder = root.createFolder(safeFolderName_(rosterName)); e.f = folder.getId(); e.w = ''; }
  else if (realName && folder.getName() !== safeFolderName_(rosterName)) { try { folder.setName(safeFolderName_(rosterName)); } catch (x) {} }

  var list = workForMember_(cfg, rosterName, rr ? rr.org : '');
  var stamp = workStamp_(list);
  if (e.w !== stamp) {
    var have = {};
    var it = folder.getFolders();
    while (it.hasNext()) {
      var sub = it.next(), desc = String(sub.getDescription() || '');
      var at = desc.indexOf(WORK_TAG);
      if (at > -1) have[desc.slice(at + WORK_TAG.length).split(/\s/)[0]] = sub;
    }
    list.forEach(function (w) {
      var nm = safeFolderName_((w.due ? 'Due ' + w.due + ' · ' : '') + w.title);
      var sub = have[w.id];
      if (!sub) {
        sub = folder.createFolder(nm);
        sub.setDescription((w.brief ? String(w.brief).slice(0, 900) + '\n\n' : '') + WORK_TAG + w.id);
      } else if (sub.getName() !== nm) { try { sub.setName(nm); } catch (x) {} }
    });
    e.w = stamp;
  }
  e.n = rosterName; e.at = new Date().getTime();
  d.members[key] = e;
  return e;
}
/* Lays out folders for a whole club for up to budgetMs; reports what is left. */
function syncDrivesFor_(aff, budgetMs) {
  var t0 = new Date().getTime();
  var dCfg = null; readTab('config').forEach(function (r) { if (String(r.Key) === 'club:' + aff) { try { dCfg = JSON.parse(r.Value); } catch (e) {} } });
  dCfg = dCfg || {};
  var dd = readDrive_(aff), roster = rosterIndex_(aff), accts = accountsFor(aff), seenA = {};
  accts = accts.filter(function (u) { var k = String(u.email || u.who || '').toLowerCase(); if (!k || seenA[k]) return false; seenA[k] = 1; return true; });
  var done = 0, left = 0, failed = [];
  for (var ai = 0; ai < accts.length; ai++) {
    if (new Date().getTime() - t0 > budgetMs) { left = accts.length - ai; break; }
    try { ensureMemberDrive_(aff, dCfg, dd, accts[ai], roster); done++; }
    catch (e) { failed.push(String(((accts[ai].first || '') + ' ' + (accts[ai].last || '')).trim() || accts[ai].email) + ': ' + String(e.message || e).slice(0, 120)); }
    if (ai % 10 === 9) writeDrive_(aff, dd);      /* banked as it goes */
  }
  writeDrive_(aff, dd);
  var mm = dd.members || {}, ks = Object.keys(mm);
  return {ok: true, processed: done, remaining: left, failed: failed, total: accts.length,
    folders: ks.length, rootUrl: dd.root ? folderUrl_(dd.root) : ''};
}
/* Records that this account sent the club's form, with the few answers the
   page could pick out, on its Profiles row. Only empty cells are filled: the
   read-back from the response sheet is the better source and wins. */
function stampFormSent_(aff, email, sum) {
  var e = String(email || '').toLowerCase();
  var sh = tab('profiles'), v = sh.getDataRange().getValues(), ix = {};
  for (var c = 0; c < v[0].length; c++) ix[String(v[0][c])] = c;
  var clip = function (x, n) { return String(x || '').replace(/[<>\u0000-\u001F]/g, ' ').slice(0, n); };
  var fill = {Year: clip(sum.year, 40), Track: clip(sum.track, 40),
              MBTI: fmtMbti_(clip(sum.mbti, 40)),
              Availability: clip(sum.avail, 120), FormNotes: clip(sum.notes, 500)};
  for (var r = 1; r < v.length; r++) {
    if (String(v[r][ix.Email]).toLowerCase() !== e) continue;
    if (normAff(v[r][ix.Affiliation]) !== aff) continue;
    Object.keys(fill).forEach(function (k) {
      if (ix[k] !== undefined && fill[k] && !String(v[r][ix[k]] || '').trim())
        sh.getRange(r + 1, ix[k] + 1).setValue(fill[k]);
    });
    if (ix.FormAt !== undefined) sh.getRange(r + 1, ix.FormAt + 1).setValue(new Date());
    return;
  }
  var row = [];
  for (var k2 = 0; k2 < v[0].length; k2++) row.push('');
  row[ix.Email] = e; row[ix.Affiliation] = aff;
  Object.keys(fill).forEach(function (k) { if (ix[k] !== undefined) row[ix[k]] = fill[k]; });
  if (ix.FormAt !== undefined) row[ix.FormAt] = new Date();
  sh.appendRow(row);
}

/* The Drive work below keeps a document lock so an editor run and a web
   request cannot lay out the same folders at once. Apps Script can answer
   null for a document lock inside a web app call, and calling tryLock on that
   threw before any folder was made. Every web path here already runs under
   doPost's script lock, so a stand-in that always succeeds is safe there. */
function docLock_() {
  var l = null;
  try { l = LockService.getDocumentLock(); } catch (e) {}
  return l || {tryLock: function () { return true; }, waitLock: function () {},
               releaseLock: function () {}, hasLock: function () { return true; }};
}

/* Run from the editor to give every existing member of every club a folder
   now, instead of waiting for each to open the app. Safe to run again: it
   only does what is missing. Stops after about five minutes; run it again if
   the log says some are left. */
function setUpMemberFolders() {
  var lock = docLock_();
  if (!lock.tryLock(10000)) { Logger.log('Another run is going. Try again in a minute.'); return; }
  try {
    var t0 = new Date().getTime(), lines = [];
    allAffiliations().forEach(function (a) {
      var left = 300000 - (new Date().getTime() - t0);
      if (left < 15000) { lines.push((a.name || a.code) + ': not reached, run again'); return; }
      var r = syncDrivesFor_(normAff(a.code), left - 10000);
      lines.push((a.name || a.code) + ': ' + r.folders + ' member folders' +
        (r.remaining ? ', ' + r.remaining + ' left (run again)' : '') +
        (r.failed.length ? ', failed: ' + r.failed.join('; ') : '') + (r.rootUrl ? '\n  ' + r.rootUrl : ''));
    });
    Logger.log(lines.join('\n'));
  } finally { lock.releaseLock(); }
}
/* The subfolder one member's hand-in for one assignment goes into. */
function workFolderFor_(aff, cfg, acct, workId) {
  var lock = docLock_();
  if (!lock.tryLock(15000)) throw new Error('The club Drive is busy. Try again in a moment.');
  try {
    var d = readDrive_(aff);
    var e = ensureMemberDrive_(aff, cfg, d, acct, rosterIndex_(aff));
    writeDrive_(aff, d);
    var folder = DriveApp.getFolderById(e.f), it = folder.getFolders();
    while (it.hasNext()) {
      var sub = it.next();
      if (String(sub.getDescription() || '').indexOf(WORK_TAG + workId) > -1) return {folder: sub, entry: e};
    }
    var w = (cfg.work || []).filter(function (x) { return x.id === workId; })[0] || {title: 'Assignment'};
    var made = folder.createFolder(safeFolderName_((w.due ? 'Due ' + w.due + ' · ' : '') + w.title));
    made.setDescription(WORK_TAG + workId);
    return {folder: made, entry: e};
  } finally { lock.releaseLock(); }
}
/* The account record for whoever is calling, shaped like accountsFor's rows. */
function acctFor_(aff, email, id) {
  var k = String(email || '').toLowerCase();
  var hit = accountsFor(aff).filter(function (u) { return String(u.email || u.who || '').toLowerCase() === k; })[0];
  if (hit && !String((hit.first || '') + (hit.last || '')).trim() && id && id.name) { hit = JSON.parse(JSON.stringify(hit)); hit.name = id.name; }
  return hit || {email: k, who: k, first: '', last: '', name: id && id.name};
}
/* Writes that change only the caller's own things. They leave the club's
   cache alone (forty members sending the sign-up form at orientation would
   otherwise empty it forty times) and refresh just that member's bits. A
   profile save that changes a name does touch the club: names are on the
   roster everybody picks teammates from. */
var OWN_BITS_ = {saveProfile: 1, submitForm: 1, myFormAnswers: 1};
function clubWide_(action, payload) {
  if (action === 'ensureMyDrive' || action === 'submitForm' || action === 'myFormAnswers' ||
      action === 'changePassword' || action === 'setMyPassword') return false;
  if (action === 'saveProfile') return !!(payload && (payload.firstName || payload.lastName));
  return true;
}

/* ---- what every page load reads, kept for a couple of minutes ----
   Opening the page cost about eight seconds, nearly all of it reading the
   same dozen sheets for every member of the club in turn. The club-wide part
   is now kept in the script cache, compressed, under a version number that
   every write through this script bumps -- so anyone who changes something
   sees it at once. Edits made straight in the spreadsheet show up within
   SHARED_TTL_ seconds. Nothing per-person is cached here except what that
   person is allowed to see anyway, and photos never are. */
/* Every write through the page bumps the version, so the TTL only bounds how
   long an edit made straight in the sheet takes to show. The keep-warm ping
   rebuilds it every ten minutes, inside this window. */
var SHARED_TTL_ = 1500, SHARED_CHUNK_ = 90000;
function sharedVer_(aff) {
  try { return CacheService.getScriptCache().get('ver:' + aff) || '0'; } catch (e) { return '0'; }
}
function bumpShared_(aff) {
  try { CacheService.getScriptCache().put('ver:' + normAff(aff), Utilities.getUuid().slice(0, 8), 21600); } catch (e) {}
}
function sharedGet_(name, aff, ver) {
  try {
    var c = CacheService.getScriptCache(), base = 'sh:' + name + ':' + aff + ':' + ver;
    var n = Number(c.get(base) || 0); if (!n) return null;
    var keys = []; for (var i = 0; i < n; i++) keys.push(base + ':' + i);
    var got = c.getAll(keys), b64 = '';
    for (var j = 0; j < n; j++) { if (!got[keys[j]]) return null; b64 += got[keys[j]]; }
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip');
    return JSON.parse(Utilities.ungzip(blob).getDataAsString());
  } catch (e) { return null; }
}
function sharedPut_(name, aff, ver, obj) {
  try {
    var b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(obj), 'application/json')).getBytes());
    var n = Math.ceil(b64.length / SHARED_CHUNK_); if (n > 20) return;   // too big to be worth it
    var c = CacheService.getScriptCache(), base = 'sh:' + name + ':' + aff + ':' + ver, put = {};
    for (var i = 0; i < n; i++) put[base + ':' + i] = b64.slice(i * SHARED_CHUNK_, (i + 1) * SHARED_CHUNK_);
    c.putAll(put, SHARED_TTL_ + 30);
    c.put(base, String(n), SHARED_TTL_);
  } catch (e) {}
}
/* Read through the cache: the version is taken before anything is read, so
   a write landing mid-way files this copy under a version nobody asks for. */
function shared_(name, aff, compute) {
  var ver = sharedVer_(aff), hit = sharedGet_(name, aff, ver);
  if (hit) return hit;
  /* Forty members opening the page together after a change all missed the
     cache at once and all rebuilt it -- forty times the work, and Apps Script
     only runs thirty at a time. The first one rebuilds; the rest wait a few
     seconds for its result rather than starting their own. */
  var c = null, flag = 'bld:' + name + ':' + aff + ':' + ver;
  try { c = CacheService.getScriptCache(); } catch (e) {}
  if (c && c.get(flag)) {
    for (var w = 0; w < 16; w++) {
      Utilities.sleep(500);
      hit = sharedGet_(name, aff, ver);
      if (hit) return hit;
    }
  }
  try { if (c) c.put(flag, '1', 30); } catch (e) {}
  var val = compute();
  sharedPut_(name, aff, ver, val);
  try { if (c) c.remove(flag); } catch (e) {}
  return val;
}
/* One member's own bits for the page (form sent, FLC choices), kept apart
   from the club so that a member saving them does not empty the club's cache
   for everyone else. */
function meBits_(aff, email) {
  var k = 'me:' + aff + ':' + String(email).toLowerCase(), c = null;
  try { c = CacheService.getScriptCache(); var got = c.get(k); if (got) return JSON.parse(got); } catch (e) {}
  var me = {formAt: false, prefs: ''};
  readTab('profiles').forEach(function (r) {
    if (normAff(r.Affiliation) !== aff || String(r.Email).toLowerCase() !== String(email).toLowerCase()) return;
    me = {formAt: !!(r.FormAt || r.Year || r.Track || r.MBTI), prefs: String(r.Prefs || '')};
  });
  try { if (c) c.put(k, JSON.stringify(me), 21600); } catch (e) {}
  return me;
}
function dropMe_(aff, email) {
  try { CacheService.getScriptCache().remove('me:' + aff + ':' + String(email).toLowerCase()); } catch (e) {}
}

/* The name a member registered with, for labels other people read. Asked on
   every request from a Google account, so it comes from the cache too. */
function profileName_(aff, email) {
  var k = String(email || '').toLowerCase();
  var names = shared_('names', aff, function () {
    var m = {};
    readTab('profiles').forEach(function (r) {
      if (normAff(r.Affiliation) !== aff || !r.Email) return;
      m[String(r.Email).toLowerCase()] = capName_((r.FirstName || '') + ' ' + (r.LastName || '')).slice(0, 60);
    });
    return m;
  });
  return String(names[k] || '');
}

/* Run from the editor: checks every way the backend touches Google Drive and
   says which work. It creates one test folder, a test file and a shortcut,
   then puts all three in the bin. Nothing belonging to a club is changed. */
function checkDriveIntegrations() {
  var out = [], t0 = new Date().getTime(), tmp = null;
  var step = function (label, fn) {
    try { var r = fn(); out.push('OK    ' + label + (r ? ' — ' + r : '')); }
    catch (e) { out.push('FAIL  ' + label + ' — ' + (e && e.message ? e.message : e)); }
  };
  step('Drive reachable (My Drive root)', function () { return DriveApp.getRootFolder().getName() + ' of ' + myDriveEmail_(); });
  step('Folder lookup skips the bin', function () {
    tmp = DriveApp.createFolder('Org System Drive check — safe to delete');
    var again = folderUnder(null, 'Org System Drive check — safe to delete');
    if (again.getId() !== tmp.getId()) throw new Error('found a different folder');
    return 'reuses the live folder';
  });
  step('Create a file in a folder (hand-ins)', function () {
    var f = tmp.createFile(Utilities.newBlob('check', 'text/plain', 'check.txt'));
    return f.getName();
  });
  step('Shortcut in the officers’ tree', function () {
    var f = tmp.getFilesByName('check.txt').next();
    var sc = tmp.createShortcut(f.getId());
    if (sc.getTargetId() !== f.getId()) throw new Error('shortcut points elsewhere');
    return 'points at the file';
  });
  step('Member folders stay private', function () {
    var viewers = tmp.getViewers().length + tmp.getEditors().length;
    return viewers + ' people besides the owner on a new folder';
  });
  step('Form template readable (club sign-up forms)', function () {
    return DriveApp.getFileById(FORM_TEMPLATE_ID).getName();
  });
  step('Hand-in folders', function () {
    var n = 0, names = [];
    allAffiliations().forEach(function (a) {
      var it = DriveApp.getRootFolder().searchFolders('title = "' + (a.name || a.code) + ' — handed in" and trashed = false');
      if (it.hasNext()) { n++; names.push(a.name || a.code); }
    });
    return n + ' club' + (n === 1 ? '' : 's') + (names.length ? ' (' + names.join(', ') + ')' : '');
  });
  step('Member folders', function () {
    return allAffiliations().map(function (a) {
      var d = readDrive_(normAff(a.code)), ks = Object.keys(d.members || {});
      return (a.name || a.code) + ': ' + ks.length + ' folders';
    }).join('; ');
  });
  step('Submissions sheet links open', function () {
    var rows = readTab('submissions').filter(function (r) { return r.FileId; }).slice(-5), bad = 0;
    rows.forEach(function (r) { try { DriveApp.getFileById(String(r.FileId)).getName(); } catch (e) { bad++; } });
    if (bad) throw new Error(bad + ' of the last ' + rows.length + ' hand-in files cannot be opened');
    return rows.length + ' most recent hand-in files open';
  });
  if (tmp) { try { tmp.setTrashed(true); out.push('      (test folder moved to the bin)'); } catch (e) {} }
  var msg = out.join('\n') + '\nChecked in ' + Math.round((new Date().getTime() - t0) / 100) / 10 + ' s.';
  Logger.log(msg);
  return msg;
}

/* ================= ONE-TIME AUTHORISATION =================
   Apps Script grants scopes when a person runs the code, not when it is
   deployed. Calendar and Drive were added after this project was last
   authorised, so the web app could compile, deploy and run and still be
   refused the moment it touched either one — which is exactly what
   "The script does not have permission to perform that action" means.

   Run this once from the editor and approve the prompt. It touches Calendar
   and Drive in the most harmless way each allows: it counts things. Nothing is
   created, changed or deleted. After it succeeds, the sync and the homework
   uploads work for everyone, because the web app runs as the account that
   approved it. */
function authorizeScopes() {
  var out = [];

  try {
    var cals = CalendarApp.getAllOwnedCalendars();
    out.push('Calendar: OK (' + cals.length + ' calendars visible)');
  } catch (e) {
    out.push('Calendar: FAILED — ' + e.message);
  }

  try {
    var it = DriveApp.getRootFolder().getFolders();
    var n = 0;
    while (it.hasNext() && n < 5) { it.next(); n++; }
    out.push('Drive: OK');
  } catch (e) {
    out.push('Drive: FAILED — ' + e.message);
  }

  try {
    out.push('Sheet: OK (' + book().getName() + ')');
  } catch (e) {
    out.push('Sheet: FAILED — ' + e.message);
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/* Lists the chapter calendars this account owns, so duplicates left behind by
   the runs that timed out can be found and removed by hand. Read-only. */
function listChapterCalendars() {
  var rows = [];
  CalendarApp.getAllOwnedCalendars().forEach(function (c) {
    if (c.getName().indexOf('chapter calendar') > -1) rows.push(c.getName() + '  —  ' + c.getId());
  });
  var msg = rows.length ? rows.join('\n') : 'No chapter calendars found.';
  Logger.log(msg);
  return msg;
}
