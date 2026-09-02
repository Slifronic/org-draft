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
  resetPassword: 'master', setUserRole: 'master'
};
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
var TAB = {
  roles:      {name: 'Roles',      cols: ['Email', 'Role', 'GrantedBy', 'GrantedAt']},
  teams:      {name: 'Teams',      cols: ['MemberName', 'Org', 'Track', 'Year', 'MBTI', 'LeadInterest', 'IsLead', 'Notes']},
  pointsLog:  {name: 'PointsLog',  cols: ['Timestamp', 'MemberName', 'ActionId', 'ActionLabel', 'Points', 'Track', 'Org']},
  attendance: {name: 'Attendance', cols: ['Timestamp', 'MemberName', 'EventLabel', 'Track', 'Org']},
  roster:     {name: 'Form Responses 1', cols: null, readOnly: true},
  config:     {name: 'Config',     cols: ['Key', 'Value']},
  users:      {name: 'Users',      cols: ['Username', 'ClientSalt', 'ServerSalt', 'Hash', 'Iterations',
                                          'Role', 'FailCount', 'LockedUntil', 'CreatedBy', 'CreatedAt']}
};

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
  Logger.log('Authorised. tokeninfo reachable (HTTP ' + r.getResponseCode() +
             '), ' + sheets + ' sheets visible, cache and lock OK.');
}

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
function usersSheet() {
  var ss = book(), name = TAB.users.name, cols = TAB.users.cols;
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
    return sh;
  }
  var head = sh.getRange(1, 1, 1, cols.length).getValues()[0], same = true;
  for (var i = 0; i < cols.length; i++)
    if (String(head[i]) !== cols[i]) { same = false; break; }
  if (!same) {
    sh.setName(name + ' (old ' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss') + ')');
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function tab(key) {
  if (key === 'users') return usersSheet();
  var spec = TAB[key], ss = book(), sh = ss.getSheetByName(spec.name);
  if (!sh) {
    // The Form response tab belongs to the Form; never conjure a fake one.
    if (spec.readOnly) return null;
    sh = ss.insertSheet(spec.name);
    sh.appendRow(spec.cols);
    sh.setFrozenRows(1);
  }
  return sh;
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
            iters: Number(g('Iterations')) || PBKDF2_ITERS,
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
  return {ok: true, session: signSession(rec.username, exp), role: rec.role,
          username: rec.username, expires: exp};
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
    return {ok: true, who: rec.username, role: rec.role, via: 'password'};
  }
  var email;
  try { email = verifiedEmail(body.token); }
  catch (err) { return {ok: false, error: 'Token check failed: ' + err}; }
  if (!email) {
    return {ok: false, error: CLIENT_ID
      ? 'Sign-in could not be verified. Sign out and back in.'
      : 'The backend has no CLIENT_ID set, so no sign-in can be verified yet.'};
  }
  return {ok: true, who: email, role: roleFor(email), via: 'google'};
}

function roleFor(email) {
  if (!email) return 'none';
  if (email === String(MASTER_EMAIL).toLowerCase()) return 'master';
  var rows = readTab('roles');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].Email).toLowerCase().trim() === email) {
      var r = String(rows[i].Role).toLowerCase().trim();
      return RANK[r] ? r : 'member';
    }
  }
  return 'member';
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
  switch (action) {

    case 'whoami':
      return {ok: true, role: role, email: email};

    /* ---- password accounts ---- */

    case 'listUsers': {
      var rows = [];
      readTab('users').forEach(function (r) {
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
                              nrole, 0, '', email, new Date()]);
      return {ok: true, created: nu, role: nrole};
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
      var cfg = null;
      readTab('config').forEach(function (r) {
        if (String(r.Key) === 'club') { try { cfg = JSON.parse(r.Value); } catch (e) {} }
      });
      return {
        ok: true, role: role, email: email, config: cfg,
        roster:     readTab('roster'),
        teams:      readTab('teams'),
        pointsLog:  readTab('pointsLog'),
        attendance: readTab('attendance')
      };
    }

    case 'setConfig': {
      var sh0 = tab('config'), v0 = sh0.getDataRange().getValues(), json = JSON.stringify(payload || {});
      for (var q = 1; q < v0.length; q++) {
        if (String(v0[q][0]) === 'club') { sh0.getRange(q + 1, 2).setValue(json); return {ok: true, saved: true}; }
      }
      sh0.appendRow(['club', json]);
      return {ok: true, saved: true};
    }

    case 'setTeams': {
      /* Write the header to row 1 explicitly. appendRow() after clear() places
         it relative to whatever the sheet still considers its last row, which
         is how a stray "Column 1..8" row ended up above the real header and
         got parsed as a member called "undefined". */
      var sh = tab('teams'), cols = TAB.teams.cols;
      sh.clear();
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
      sh.setFrozenRows(1);
      appendRows('teams', payload || []);
      return {ok: true, wrote: (payload || []).length};
    }

    case 'addPointsBulk': {
      var now = new Date();
      (payload || []).forEach(function (r) { if (!r.Timestamp) r.Timestamp = now; });
      return {ok: true, wrote: appendRows('pointsLog', payload || [])};
    }

    case 'addAttendanceBulk': {
      var t = new Date();
      (payload || []).forEach(function (r) { if (!r.Timestamp) r.Timestamp = t; });
      return {ok: true, wrote: appendRows('attendance', payload || [])};
    }

    case 'listRoles': {
      var out2 = [{email: String(MASTER_EMAIL).toLowerCase(), role: 'master', locked: true}];
      readTab('roles').forEach(function (r) {
        var em = String(r.Email).toLowerCase().trim();
        if (!em || em === String(MASTER_EMAIL).toLowerCase()) return;
        out2.push({email: em, role: String(r.Role).toLowerCase().trim() || 'member', locked: false});
      });
      return {ok: true, roles: out2};
    }

    case 'setRole': {
      var em2 = String((payload || {}).email || '').toLowerCase().trim();
      var newRole = String((payload || {}).role || '').toLowerCase().trim();
      if (!em2 || em2.indexOf('@') < 0) return {ok: false, error: 'Not an email address.'};
      if (!RANK[newRole] || newRole === 'none') return {ok: false, error: 'Unknown role.'};
      if (em2 === String(MASTER_EMAIL).toLowerCase())
        return {ok: false, error: 'The master account is set in the script, not here.'};

      var sh2 = tab('roles'), vals = sh2.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]).toLowerCase().trim() === em2) {
          sh2.getRange(i + 1, 2).setValue(newRole);
          sh2.getRange(i + 1, 3).setValue(email);
          sh2.getRange(i + 1, 4).setValue(new Date());
          return {ok: true, updated: em2, role: newRole};
        }
      }
      sh2.appendRow([em2, newRole, email, new Date()]);
      return {ok: true, added: em2, role: newRole};
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
