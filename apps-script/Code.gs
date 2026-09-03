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
  listSignups: 'master', purgeClub: 'admin',
  clubRoster: 'admin', cloneForm: 'admin', republishForm: 'admin',
  forkClub: 'admin'
};
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
      {first: r.FirstName, last: r.LastName, photo: r.Photo};
  });
  var out = [];
  function push(who, kind, a, pr, r, joined, how, email) {
    if (only && a !== normAff(only)) return;
    out.push({who: who, kind: kind,
              first: r.FirstName || pr.first || '', last: r.LastName || pr.last || '',
              email: email, role: String(r.Role || 'member').toLowerCase(),
              aff: a, affName: affNames[a] || a, joined: joined || '',
              how: how || '', photo: pr.photo || ''});
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
  teams:      {name: 'Teams',      cols: ['MemberName', 'Org', 'Track', 'Year', 'MBTI', 'LeadInterest', 'IsLead', 'Notes', 'Affiliation']},
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
  profiles:   {name: 'Profiles',   cols: ['Email', 'Affiliation', 'FirstName', 'LastName', 'Photo']}
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
function book() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActive();
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

function tab(key) {
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
function readTab(key) {
  var sh = tab(key);
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
  if (!token) return null;
  if (!CLIENT_ID) return null;

  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var hit = cache.get(key);
  if (hit) return hit;

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

  var email = String(p.email).toLowerCase();
  cache.put(key, email, 300);
  return email;
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
/* The affiliation a Google address belongs to, from the Roles tab. */
function affForEmail(email) {
  var rows = readTab('roles'), e = String(email || '').toLowerCase();
  for (var i = 0; i < rows.length; i++)
    if (String(rows[i].Email).toLowerCase().trim() === e)
      return {aff: normAff(rows[i].Affiliation || DEFAULT_AFF),
              role: String(rows[i].Role || 'member').toLowerCase()};
  return null;
}

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
  var first = String(p.firstName || '').trim();
  var last  = String(p.lastName || '').trim();
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
  var email;
  try { email = verifiedEmail(body.token); }
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
  if (email === String(MASTER_EMAIL).toLowerCase())
    return {ok: true, who: email, role: 'master', via: 'google',
            aff: normAff(body.aff || DEFAULT_AFF), isRoot: true};
  var hit = affForEmail(email);
  if (!hit) return {ok: true, who: email, role: 'member', via: 'google', aff: '', needsAff: true};
  return {ok: true, who: email, role: RANK[hit.role] ? hit.role : 'member', via: 'google', aff: hit.aff};
}

function roleFor(email) {
  if (!email) return 'none';
  if (email === String(MASTER_EMAIL).toLowerCase()) return 'master';
  var hit = affForEmail(email);
  return hit && RANK[hit.role] ? hit.role : 'member';
}

/* ---------------- entry points ---------------- */

function doGet() {
  // Reads moved to POST so the token travels in the body, never in a URL.
  return out({ok: false, error: 'This endpoint expects a POST carrying a Google ID token.'});
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
      try {
        return out({ok: true, affiliations: allAffiliations().map(function (a) {
          return {code: a.code, name: a.name};
        })});
      } catch (err) { return out({ok: false, error: 'Could not list affiliations: ' + err}); }
    }

    if (action === 'signup') {
      var lockS = LockService.getScriptLock();
      try { lockS.waitLock(20000); } catch (e) { return out({ok: false, error: 'Busy, try again.'}); }
      try { return out(doSignup(body.payload)); }
      catch (err) { return out({ok: false, error: 'Sign-up failed: ' + err}); }
      finally { try { lockS.releaseLock(); } catch (e2) {} }
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
      catch (err) { return out({ok: false, error: 'Login failed: ' + err}); }
      finally { try { lock0.releaseLock(); } catch (e2) {} }
    }

    if (!NEEDS[action]) return out({ok: false, error: 'Unknown action.'});

    var id;
    try { id = identify(body); }
    catch (err) { return out({ok: false, error: 'Identity check failed: ' + err}); }
    if (!id.ok) return out({ok: false, error: id.error});

    var email = id.who, role = id.role;

    if (RANK[role] < RANK[NEEDS[action]]) {
      return out({ok: false, error: 'Your account is ' + role + '. That action needs ' +
        NEEDS[action] + '.', role: role});
    }

    var lock = null;
    try { lock = LockService.getScriptLock(); lock.waitLock(20000); }
    catch (err) { return out({ok: false, error: 'Sheet busy, try again.'}); }
    try {
      return out(dispatch(action, body.payload, email, role, id));
    } catch (err) {
      return out({ok: false, error: String(err)});
    } finally {
      try { if (lock) lock.releaseLock(); } catch (err2) {}
    }
  } catch (fatal) {
    return out({ok: false, error: 'Backend error: ' + fatal});
  }
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
      var meName = flat((payload || {}).name || email);
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
      return {ok: true, profile: mine, points: pts, entries: evts,
              history: hist.slice(-25), aff: aff, role: role, who: email};
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
      return {ok: true, joined: ja.code, name: ja.name};
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
      var pf = String((payload || {}).firstName || '').trim();
      var pl = String((payload || {}).lastName || '').trim();
      var ph = String((payload || {}).photo || '');
      if (ph === 'none') ph = ' ';   /* explicit clear */
      if (ph.length > 200000) return {ok: false, error: 'That picture is too large.'};
      var shP = tab('profiles'), vP = shP.getDataRange().getValues();
      var idxP = {}; for (var c0 = 0; c0 < vP[0].length; c0++) idxP[String(vP[0][c0])] = c0;
      for (var i0 = 1; i0 < vP.length; i0++) {
        if (String(vP[i0][idxP.Email]).toLowerCase() !== pE) continue;
        if (String(vP[i0][idxP.Affiliation]).toLowerCase() !== aff) continue;
        if (pf) shP.getRange(i0 + 1, idxP.FirstName + 1).setValue(pf);
        if (pl) shP.getRange(i0 + 1, idxP.LastName + 1).setValue(pl);
        if (ph) shP.getRange(i0 + 1, idxP.Photo + 1).setValue(ph);
        return {ok: true, saved: true};
      }
      shP.appendRow([pE, aff, pf, pl, ph]);
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
        String((payload || {}).firstName || ''), String((payload || {}).lastName || ''), mE]);
      return {ok: true, created: true};
    }

    /* One member's public card: what any clubmate may see. Personality type
       and points are withheld unless the asker is an officer or it is them. */
    case 'memberCard': {
      var flatN = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      var want = flatN((payload || {}).name);
      var row = null;
      readScoped('teams', aff).forEach(function (r) { if (flatN(r.MemberName) === want) row = r; });
      if (!row) return {ok: false, error: 'No such member in this club.'};
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
      var act = String((payload || {}).action || '');
      if (!/^https:\/\/docs\.google\.com\/forms\/.*formResponse$/.test(act))
        return {ok: false, error: 'Bad form target.'};
      var body2 = (payload || {}).answers || {};
      var r2 = UrlFetchApp.fetch(act, {method: 'post', payload: body2,
                                       muteHttpExceptions: true, followRedirects: true});
      var code = r2.getResponseCode();
      return (code === 200 || code === 302)
        ? {ok: true, submitted: true}
        : {ok: false, error: 'The form rejected that (HTTP ' + code + ').'};
    }

    /* Every account on the system, with the club it belongs to. Master only,
       and deliberately does not return anything credential-shaped. */
    case 'listSignups': return {ok: true, signups: accountsFor(null)};

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
      var rJson = JSON.stringify(rCfg);
      if (rRow > 0) rSheet.getRange(rRow, 2).setValue(rJson);
      else rSheet.appendRow([rKey, rJson]);

      return {ok: true, formUrl: rCfg.formUrl, did: rres.did, failed: rres.failed};
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
      var cfJson = JSON.stringify(cfg);
      if (cfRow > 0) cfSheet.getRange(cfRow, 2).setValue(cfJson);
      else cfSheet.appendRow([cfKey, cfJson]);

      return {ok: true, formUrl: cfg.formUrl, sheetUrl: cfg.sheetUrl,
              editUrl: form.getEditUrl(), title: title};
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
      if (String((payload || {}).confirm) !== pc)
        return {ok: false, error: 'Type the club code to confirm.'};
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
      if (String((payload || {}).confirm) !== dcode)
        return {ok: false, error: 'Type the club code to confirm.'};
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
        if (String(vC[q2][0]) === 'club:' + dcode) shC.deleteRow(q2 + 1);
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

    case 'getAll': {
      /* The club's vocabulary lives in the sheet too, so a second officer
         opening the page sees the same words as the officer who set them
         rather than falling back to the defaults. */
      var key = 'club:' + aff, cfg = null;
      readTab('config').forEach(function (r) {
        if (String(r.Key) === key) { try { cfg = JSON.parse(r.Value); } catch (e) {} }
      });
      return {
        ok: true, role: role, email: email, config: cfg,
        aff: aff, affName: (findAff(aff) || {}).name || aff,
        needsAff: !!id.needsAff,
        affiliations: id.isRoot ? allAffiliations().map(function (a) {
          return {code: a.code, name: a.name}; }) : null,
        roster:     readTab('roster'),
        teams:      readScoped('teams', aff),
        pointsLog:  readScoped('pointsLog', aff),
        attendance: readScoped('attendance', aff)
      };
    }

    case 'setConfig': {
      var ckey = 'club:' + aff;
      var sh0 = tab('config'), v0 = sh0.getDataRange().getValues(), json = JSON.stringify(payload || {});
      for (var q = 1; q < v0.length; q++) {
        if (String(v0[q][0]) === ckey) { sh0.getRange(q + 1, 2).setValue(json); return {ok: true, saved: true}; }
      }
      sh0.appendRow([ckey, json]);
      return {ok: true, saved: true};
    }

    case 'setTeams': {
      /* Replaces only this club's rows. Clearing the whole sheet would delete
         every other affiliation's roster, so the surviving rows are read
         first and written back alongside the new ones. */
      var sh = tab('teams'), cols = TAB.teams.cols;
      var others = readTab('teams').filter(function (r) {
        return String(r.Affiliation || DEFAULT_AFF).toLowerCase() !== aff;
      });
      var mine = (payload || []).map(function (r) { r.Affiliation = aff; return r; });
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
      var wantAff = normAff((payload || {}).club || aff);
      if (RANK[role] < RANK.master) wantAff = aff;
      if (wantAff !== DEFAULT_AFF && !findAff(wantAff))
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
             to one club, so it is updated rather than duplicated. */
          sh2.getRange(i + 1, 5).setValue(wantAff);
          return {ok: true, updated: em2, role: newRole, aff: wantAff};
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
