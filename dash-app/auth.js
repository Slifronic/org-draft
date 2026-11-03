/* Session and entry: Google and password sign-in, sign-up, joining a club, sign-out, renewing the home-screen session, the master's club switch and the chapter's own look. */
'use strict';

/* The same keys, formats and key derivation as the classic page
   (index.html 2539-2802), so an account made on either page signs in on the
   other. Nothing here decides a role: the backend checks every request. No
   token or password is ever written to the console. */
var AUTH = {
  CLIENT_ID: '60468094639-p10c21qva7269q2p6lqhucg488g98caa.apps.googleusercontent.com',
  ITERS: 210000,
  face: 'signin',      // signin | signup | join | offline
  msg: '', bad: false,
  last: undefined,     // the last getAll: {v: answer or null, had: whether it was sent signed in}
  pre: null,           // a getAll that came back with sign-up or joining, used instead of asking again
  who: null,           // a signed-in Google account that has no club yet
  affs: null,
  google: false,       // running on the hour-long Google token rather than a session
  leaving: false
};
var PBL_HOST = location.hostname === 'org.deanzapbl.com';
var AUTH_OUT = 'orgsystem.dash.signedout';   // sessionStorage: no one-tap right after signing out
var AUTH_MSG = 'orgsystem.dash.authmsg';     // sessionStorage: why the last session ended
var DEMO_AUTH = 'orgsystem.dash.demo.auth';  // sessionStorage: '' signed out, 'join' signed in without a club
if (!ICONS.signout) ICONS.signout = '<path d="M13.5 4.5H6.5v15h7"/><path d="M10.5 12H20M16.5 8.5L20 12l-3.5 3.5"/>';

function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function ssSet(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }

/* ---------- what this browser keeps (classic storeGoogleToken, storeWho) ---------- */
function jwtPeek(t) {
  /* Display only; never a permission decision. */
  try {
    var b = String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  } catch (e) { return {}; }
}
function storeGtok(t) {
  if (!t) return lsSet(KEYS.gtok, null);
  var exp = jwtPeek(t).exp;
  if (!exp) return;
  lsSet(KEYS.gtok, JSON.stringify({t: t, exp: exp}));
}
function gtokRaw() {
  try { var v = JSON.parse(lsGet(KEYS.gtok) || 'null'); return v && v.t && v.exp ? v : null; } catch (e) { return null; }
}
function storeWho(w) { lsSet('orgsystem.who', w ? JSON.stringify(w) : null); }
function clearCreds() { lsSet(KEYS.session, null); lsSet(KEYS.gtok, null); storeWho(null); }
function launchedFromHome() {
  try { return !!(navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)); } catch (e) { return false; }
}

/* ---------- key derivation (classic 2733-2775) ----------
   The password never leaves the browser: the sheet gets a PBKDF2-SHA256 key.
   WebCrypto needs a secure context, and without one this refuses rather than
   sending anything weaker. */
function cryptoOK() { return !!(window.crypto && window.crypto.subtle && window.isSecureContext); }
function bytesB64(bytes) { var s = '', b = new Uint8Array(bytes); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
function b64Bytes(str) {
  var t = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  var bin = atob(t), out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
window.pbkdf2Dk = function (password, saltB64, iterations) {
  if (!cryptoOK()) return Promise.reject(new Error('This browser will not do key derivation over an insecure connection. Use the https link, or sign in with Google.'));
  return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
    .then(function (k) { return crypto.subtle.deriveBits({name: 'PBKDF2', salt: b64Bytes(saltB64), iterations: iterations || AUTH.ITERS, hash: 'SHA-256'}, k, 256); })
    .then(bytesB64);
};
/* A password being set: fresh salt. Gives what signup, createUser,
   resetPassword and changePassword send. */
window.pbkdf2New = function (password) {
  if (!cryptoOK()) return window.pbkdf2Dk(password, '', AUTH.ITERS);
  var a = new Uint8Array(16); crypto.getRandomValues(a);
  var salt = bytesB64(a);
  return window.pbkdf2Dk(password, salt, AUTH.ITERS).then(function (dk) { return {dk: dk, clientSalt: salt, iterations: AUTH.ITERS}; });
};
/* A password being checked: this account's salt first. */
window.pbkdf2ForLogin = function (username, password) {
  return authPost('getSalt', {username: username}).then(function (r) {
    if (!r || !r.ok) throw new Error('The club sheet did not answer.');
    return window.pbkdf2Dk(password, r.salt, r.iterations || AUTH.ITERS);
  });
};

/* The four actions the backend answers before anyone is signed in
   (listAffiliations, signup, getSalt, login), which call() will not send. */
function authPost(action, payload, tries) {
  if (DEMO) return Promise.resolve(Demo.answer(action, payload || {}));
  document.body.classList.add('busy');
  return fetch(WEBAPP_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify({action: action, payload: payload || null})})
    .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    .then(function (v) {
      document.body.classList.remove('busy');
      var busy = v && v.ok === false && /\bbusy\b/i.test(String(v.error || ''));
      if ((busy || (!v && action === 'listAffiliations')) && (tries || 0) < 2)
        return new Promise(function (res) { setTimeout(res, 700 + Math.random() * 900); }).then(function () { return authPost(action, payload, (tries || 0) + 1); });
      return v;
    });
}

/* ---------- every backend call passes through here ----------
   To know why getAll failed (no club yet is not "no answer"), to hand back a
   getAll that already arrived with sign-up or joining, and to renew an
   expired Google sign-in instead of failing the call. */
var AUTH_EXPIRED = /session expired|could not be verified|account no longer exists/i;
(function () {
  var base = call;
  AUTH.rawCall = base;
  call = function (action, payload, tries) {
    if (action === 'getAll' && AUTH.pre && !tries) {
      var p = AUTH.pre; AUTH.pre = null; AUTH.last = {v: p, had: true};
      return Promise.resolve(p);
    }
    if (!DEMO && M && AUTH.google && !AUTH.leaving && !creds())
      return reauth().then(function (ok) { return ok ? base(action, payload, tries) : null; });
    var had = DEMO || !!creds();
    return base(action, payload, tries).then(function (v) {
      if (action === 'getAll') AUTH.last = {v: v, had: had};
      if (!tries && !DEMO && M && !AUTH.leaving && v && v.ok === false && AUTH_EXPIRED.test(String(v.error || ''))) {
        if (AUTH.google && !lsGet(KEYS.session)) {
          lsSet(KEYS.gtok, null);
          return reauth().then(function (ok) { return ok ? base(action, payload, tries) : v; });
        }
        sessionEnded(v.error);
      }
      return v;
    });
  };
})();
/* A password or home-screen session ran out mid-use. The page reloads to
   the sign-in card so nothing of the club stays on screen. */
function sessionEnded(msg) {
  AUTH.leaving = true;
  clearCreds();
  ssSet(AUTH_MSG, msg || 'Your session expired. Sign in again.');
  location.reload();
}

/* ---------- Google (classic initGsi 2979-3018) ---------- */
function gisLoad() {
  if (window.google && google.accounts && google.accounts.id) return Promise.resolve(true);
  if (AUTH.gisP) return AUTH.gisP;
  AUTH.gisP = new Promise(function (res) {
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = function () { res(!!(window.google && google.accounts && google.accounts.id)); };
    s.onerror = function () { AUTH.gisP = null; s.remove(); res(false); };
    document.head.appendChild(s);
  });
  return AUTH.gisP;
}
function gisInit() {
  if (AUTH.gisOn) return;
  AUTH.gisOn = true;
  /* In the home-screen app Google's popup cannot answer back (its storage is
     not Safari's), so Google redirects to /api/signin, which returns the
     credential in the address fragment (taken below). */
  google.accounts.id.initialize(launchedFromHome()
    ? {client_id: AUTH.CLIENT_ID, ux_mode: 'redirect', login_uri: location.origin + '/api/signin'}
    : {client_id: AUTH.CLIENT_ID, callback: onCredential, auto_select: true});
}
function gisButton(id, text) {
  var box = $(id); if (!box) return;
  if (DEMO) {
    box.innerHTML = '<button type="button" class="btn ghost wide" data-act="authDemoGoogle">' +
      (text === 'signup_with' ? 'Sign up with Google' : text === 'continue_with' ? 'Continue with Google' : 'Sign in with Google') + '</button>';
    return;
  }
  box.innerHTML = '<p class="meta">Loading Google sign-in…</p>';
  gisLoad().then(function (ok) {
    var b = $(id); if (!b) return;
    /* Said in the button's place, so it never covers a message about the sign-in itself. */
    var no = function (t) { b.innerHTML = '<p class="meta gsino">' + esc(t) + '</p>'; };
    if (!ok) return no('Google sign-in did not load. Check your connection and reload, or use an email and password.');
    b.innerHTML = '';
    try {
      gisInit();
      /* As wide as the card: Google is how most members sign in. Google draws it at most 400px. */
      var w = Math.max(200, Math.min(400, Math.round(b.clientWidth) || 320));
      google.accounts.id.renderButton(b, {theme: 'outline', size: 'large', text: text, shape: 'pill', width: w});
    } catch (e) { no('Google sign-in failed to start: ' + e.message); }
  });
}
/* One-tap, once per page and never straight after signing out. */
function maybePrompt() {
  if (DEMO || AUTH.prompted || launchedFromHome() || ssGet(AUTH_OUT)) return;
  AUTH.prompted = true;
  gisLoad().then(function (ok) {
    if (!ok || !document.body.classList.contains('out')) return;
    try { gisInit(); google.accounts.id.prompt(); } catch (e) {}
  });
}
function onCredential(resp) {
  var t = resp && resp.credential; if (!t) return;
  if (M && !document.body.classList.contains('out')) {
    /* A renewal while the club is on screen. A different account means a
       different person's club: start over rather than mix the two. */
    var was = String(M.email || '').toLowerCase(), now = String(jwtPeek(t).email || '').toLowerCase();
    storeGtok(t);
    if (was && now && was !== now) { AUTH.leaving = true; lsSet(KEYS.aff, null); location.reload(); return; }
    scheduleRenew(); settleReauth(true);
    return;
  }
  lsSet(KEYS.session, null); storeGtok(t);
  authSay('Checking your role…');
  enter();
}
/* The Google token lasts an hour. Five minutes before it ends, Google is
   asked quietly for a new one (auto-select signs a returning account straight
   back in); if that does not happen, the next call asks in a sheet. */
function scheduleRenew() {
  clearTimeout(AUTH.renewT);
  var v = gtokRaw();
  if (DEMO || !v || lsGet(KEYS.session)) return;
  AUTH.renewT = setTimeout(function () {
    if (lsGet(KEYS.session) || launchedFromHome() || !M) return;
    gisLoad().then(function (ok) { if (ok) try { gisInit(); google.accounts.id.prompt(); } catch (e) {} });
  }, Math.max(0, v.exp * 1000 - Date.now() - 5 * 60000));
}
function reauth() {
  if (AUTH.reauthP) return AUTH.reauthP;
  AUTH.reauthP = new Promise(function (res) { AUTH.reauthRes = res; });
  openSheet('<header class="sh"><h3>Still you?</h3></header><p class="mb">Google sign-ins last an hour. Continue with Google and you carry on where you were; nothing on this page is lost.</p>' +
    '<div class="gsi" id="gsire"></div><div class="sheetacts"><button class="btn ghost" data-act="signOut">Sign out</button></div>');
  gisButton('gsire', 'continue_with');
  if (!launchedFromHome()) gisLoad().then(function (ok) { if (ok) try { gisInit(); google.accounts.id.prompt(); } catch (e) {} });
  /* Calls waiting on this give up after two minutes instead of hanging. */
  setTimeout(function () { settleReauth(false); }, 120000);
  return AUTH.reauthP;
}
function settleReauth(ok) {
  var r = AUTH.reauthRes;
  AUTH.reauthRes = null; AUTH.reauthP = null;
  if (ok && $('gsire')) closeSheet();
  if (r) r(ok);
}
/* The home-screen app swaps the hour-long Google token for a month-long
   session, renewed each time it opens (classic keepHomeSession 9890). */
function keepHomeSession(via) {
  if (via !== 'google') return;
  if (!(launchedFromHome() || String(lsGet(KEYS.session) || '').indexOf('g1.') === 0)) return;
  call('googleSession', null).then(function (r) {
    if (r && r.ok && r.session) { lsSet(KEYS.session, r.session); storeGtok(null); AUTH.google = false; clearTimeout(AUTH.renewT); }
  });
}

/* Google's redirect sign-in lands with the credential in the fragment. It is
   taken out of the address before anything reads it (classic takeRedirectSignIn). */
(function () {
  var h = String(location.hash || ''), m = /^#gcred=([\w.%-]+)$/.exec(h), e = /^#gerr=(\w+)$/.exec(h);
  if (!m && !e) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (x) { location.hash = ''; }
  if (m && !DEMO) { lsSet(KEYS.session, null); storeGtok(decodeURIComponent(m[1])); ssSet(AUTH_OUT, null); }
  if (e) { AUTH.msg = 'Google sign-in did not finish (' + e[1] + '). Try again.'; AUTH.bad = true; }
})();

/* ---------- the sign-in card ---------- */
function authGate(err) {
  M = null; RAW = null;
  var rec = AUTH.last, a = rec && rec.v;
  AUTH.last = undefined;
  var ended = ssGet(AUTH_MSG);
  if (ended) { ssSet(AUTH_MSG, null); AUTH.msg = ended; AUTH.bad = true; }
  if (DEMO && Demo.as === 'new') {
    AUTH.face = demoState() === 'join' ? 'join' : (AUTH.face === 'signup' ? 'signup' : 'signin');
    AUTH.who = a && a.needsAff ? {email: a.email, name: a.name} : null;
    return drawGate();
  }
  if (a && a.ok && a.needsAff) { AUTH.face = 'join'; AUTH.who = {email: a.email, name: a.name}; return drawGate(); }
  if (rec && rec.had && (!a || (a.ok === false && /\bbusy\b/i.test(String(a.error || ''))))) {
    /* No answer is the network or Apps Script having a moment; it does not
       sign anyone out (classic resumeSession). */
    AUTH.face = 'offline'; return drawGate();
  }
  if (a && a.ok === false) { clearCreds(); AUTH.msg = a.error || 'Sign in again.'; AUTH.bad = true; }
  else if (err && err !== 'signin' && !rec) { AUTH.msg = err; AUTH.bad = true; }
  AUTH.face = AUTH.face === 'signup' ? 'signup' : 'signin';
  drawGate();
}
function enter() {
  document.body.classList.remove('out');
  ssSet(AUTH_OUT, null);
  AUTH.msg = ''; AUTH.bad = false;
  boot();
}
function authSay(t, bad) {
  AUTH.msg = t || ''; AUTH.bad = !!bad;
  var el = $('authmsg'); if (!el) return;
  el.textContent = AUTH.msg; el.className = 'authmsg' + (bad ? ' bad' : '');
  /* On a phone the line can be below the fold, and a message nobody sees reads as nothing happening. */
  if (t && el.scrollIntoView) try { el.scrollIntoView({block: 'nearest', behavior: 'smooth'}); } catch (e) {}
}
function authBusy(f, on) {
  var b = f.querySelector('button[type=submit]'); if (b) b.disabled = on;
  if (on) f.setAttribute('aria-busy', 'true'); else f.removeAttribute('aria-busy');
}
function clubSelect(id) {
  return '<label class="fld"><span>' + (AUTH.face === 'join' ? 'Which club are you in?' : 'Which club are you joining?') + '</span><select name="aff" id="' + id + '"><option value="">Loading…</option></select></label>' +
    '<label class="fld"><span>Join code</span><input name="code" class="mono" placeholder="From your club officers" autocapitalize="none" autocomplete="off" spellcheck="false" maxlength="60"></label>' +
    (DEMO ? '<p class="meta">Demo join code: <code>' + DEMO_CODE + '</code></p>' : '');
}
function gateHtml() {
  var f = AUTH.face, h = '<section class="card authcard" aria-labelledby="authh"><p class="tag">' + (PBL_HOST ? 'De Anza PBL · Org System' : 'The Org System') + '</p>';
  if (f === 'offline') {
    return h + '<h2 id="authh">Could not reach the club sheet</h2><p class="lede">Check your connection and try again. You are still signed in.</p>' +
      '<div class="sheetacts"><button class="btn" data-act="authRetry">Try again</button><button class="btn ghost" data-act="signOut">Sign out</button></div></section>';
  }
  h += '<h2 id="authh">' + {signin: 'Sign in to continue', signup: 'Create your account', join: 'One more step'}[f] + '</h2><p class="lede">' + {
    signin: 'This page holds your club’s roster, teams and homework. Sign in with the account your club knows you by; what you can see and change depends on the role your officers gave you.',
    signup: 'You need two things from your club: which one you are joining, and its join code. Everything else is your name and how you want to sign in.',
    join: 'You are signed in, but you are not in a club yet. Pick yours and enter the join code your officers gave you. Until then there is nothing for you to see.'}[f] + '</p>';
  if (f === 'signin') {
    h += '<div class="gsi" id="gsibtn"></div><p class="author"><span>or</span></p>' +
      '<form class="form" data-act="authLogin" autocomplete="on" novalidate>' +
      '<label class="fld"><span>Email</span><input name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="you@example.com" maxlength="120"></label>' +
      '<label class="fld"><span>Password</span><input name="password" type="password" autocomplete="current-password" maxlength="200"></label>' +
      '<button class="btn wide" type="submit">Sign in</button></form>';
  }
  if (f === 'signup') {
    h += '<div class="gsi" id="gsibtn"></div><p class="meta">Signing up with Google takes your name and email from your account, so you only need your club and its join code. No password to choose or forget.</p>' +
      '<p class="author"><span>or use an email and password</span></p>' +
      '<form class="form" data-act="authSignup" autocomplete="on" novalidate><div class="row2">' +
      '<label class="fld"><span>First name</span><input name="first" autocomplete="given-name" maxlength="40"></label>' +
      '<label class="fld"><span>Last name</span><input name="last" autocomplete="family-name" maxlength="40"></label></div>' +
      '<label class="fld"><span>Email</span><input name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="you@example.com" maxlength="120"></label>' +
      '<label class="fld"><span>Password</span><input name="password" type="password" autocomplete="new-password" placeholder="At least 10 characters" maxlength="200"></label>' +
      clubSelect('authaff') + '<button class="btn wide" type="submit">Create account</button></form>';
  }
  if (f === 'join') {
    h += (AUTH.who && AUTH.who.email ? '<p class="meta">Signed in as <b>' + esc(AUTH.who.email) + '</b></p>' : '') +
      '<form class="form" data-act="authJoin" autocomplete="off" novalidate>' + clubSelect('authaff') +
      '<button class="btn wide" type="submit">Join this club</button><button class="btn ghost wide" type="button" data-act="signOut">Use a different account</button></form>';
  }
  h += '<p class="authmsg" id="authmsg" role="status" aria-live="polite"></p>';
  if (f !== 'join') h += '<p class="authswitch"><button type="button" class="link" data-act="authFace" data-v="' + (f === 'signup' ? 'signin' : 'signup') + '">' +
    (f === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account') + '</button></p>';
  h += '<p class="meta authfoot"><a href="/orientation">Watch the 3-minute orientation</a><span>Your Google account is used only to identify you. The page receives your name, email and profile picture, and never sees your password.</span></p>';
  return h + '</section>';
}
function drawGate() {
  document.body.classList.add('out');
  if (!$('drawer').hidden) closeSheet();
  $('vtitle').textContent = PBL_HOST ? 'De Anza PBL' : 'The Org System';
  $('veyebrow').textContent = '';
  document.title = (AUTH.face === 'signup' ? 'Create your account' : AUTH.face === 'join' ? 'Join your club' : 'Sign in') + ' · ' + (PBL_HOST ? 'De Anza PBL' : 'The Org System');
  if (DEMO) {
    var db = $('demobar'); db.hidden = false;
    db.innerHTML = 'Demo: a new member signing up. Nothing is saved or sent. <a href="' + esc(location.pathname) + '?demo&amp;as=officer">Officer view</a><a href="' + esc(location.pathname) + '?demo&amp;as=member">Member view</a>';
  }
  $('view').innerHTML = gateHtml();
  if (AUTH.face === 'signin' || AUTH.face === 'signup') gisButton('gsibtn', AUTH.face === 'signup' ? 'signup_with' : 'signin_with');
  if (AUTH.face === 'signup' || AUTH.face === 'join') fillClubs('authaff');
  if (AUTH.msg) authSay(AUTH.msg, AUTH.bad);
  if (AUTH.face === 'signin') maybePrompt();
}
function loadAffList() {
  if (AUTH.affsP) return AUTH.affsP;
  AUTH.affsP = authPost('listAffiliations', null).then(function (r) {
    AUTH.affsP = null;
    if (r && r.ok && r.affiliations) AUTH.affs = r.affiliations;
    return AUTH.affs;
  });
  return AUTH.affsP;
}
function fillClubs(id) {
  loadAffList().then(function (list) {
    var sel = $(id); if (!sel) return;
    if (!list || !list.length) {
      sel.innerHTML = '<option value="">No clubs set up yet</option>';
      return authSay(list ? 'No clubs exist yet. Whoever runs this needs to create one first.' : 'The club sheet did not answer. Try again in a moment.', true);
    }
    sel.innerHTML = (list.length > 1 ? '<option value="">Pick your club</option>' : '') +
      list.map(function (a) { return '<option value="' + esc(a.code) + '">' + esc(a.name) + '</option>'; }).join('');
  });
}
/* "mary-jane o'neil" -> "Mary-Jane O'Neil" (classic capName). */
function capName(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
    .replace(/(^|[\s\-'’])(\p{Ll})/gu, function (m, a, b) { return a + b.toUpperCase(); });
}

ACT_EXT.authFace = function (el, d) { AUTH.face = d.v; AUTH.msg = ''; drawGate(); };
ACT_EXT.authRetry = function () { enter(); };
ACT_EXT.authDemoGoogle = function () {
  /* A Google account the backend has never seen is signed in but in no club: the join step. */
  if (Demo.as === 'new' && document.body.classList.contains('out')) { ssSet(DEMO_AUTH, 'join'); return enter(); }
  settleReauth(true); toast('Demo: Google would sign you back in here.');
};

SUBMIT_EXT.authLogin = function (f) {
  var u = f.elements.username.value.trim(), p = f.elements.password.value;
  if (!u || !p) return authSay('Enter your email and password.', true);
  authBusy(f, true); authSay('Checking…');
  window.pbkdf2ForLogin(u, p).then(function (dk) {
    p = null;
    return authPost('login', {username: u, dk: dk});
  }).then(function (r) {
    f.elements.password.value = '';
    if (!r) { authBusy(f, false); return authSay('The club sheet did not answer. Try again in a moment.', true); }
    if (!r.ok) { authBusy(f, false); return authSay(r.error || 'That did not work.', true); }
    if (DEMO) return demoSignedIn();
    lsSet(KEYS.session, r.session);
    authSay('Signed in. Loading your club…');
    enter();
  }).catch(function (e) {
    p = null; f.elements.password.value = ''; authBusy(f, false);
    authSay(e && e.message ? e.message : 'Sign-in failed.', true);
  });
};
SUBMIT_EXT.authSignup = function (f) {
  var el = f.elements, first = capName(el.first.value), last = capName(el.last.value);
  var email = el.email.value.trim().toLowerCase(), pw = el.password.value, aff = el.aff.value, code = el.code.value.trim();
  if (!first) return authSay('Enter your first name.', true);
  if (!last) return authSay('Enter your last name.', true);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return authSay('Enter a valid email address.', true);
  if (pw.length < 10) return authSay('Pick a password of at least 10 characters.', true);
  if (!aff) return authSay('Pick the club you are joining.', true);
  if (!code) return authSay('You need the join code from your club officers.', true);
  authBusy(f, true); authSay('Securing your password…');
  window.pbkdf2New(pw).then(function (d) {
    pw = null;
    authSay('Creating your account…');
    return authPost('signup', {firstName: first, lastName: last, email: email, affiliation: aff, joinCode: code,
                               dk: d.dk, clientSalt: d.clientSalt, iterations: d.iterations});
  }).then(function (r) {
    if (!r) { authBusy(f, false); return authSay('The club sheet did not answer. Try again in a moment.', true); }
    if (!r.ok) { authBusy(f, false); return authSay(r.error || 'That did not work.', true); }
    el.password.value = '';
    if (DEMO) return demoSignedIn();
    lsSet(KEYS.session, r.session);
    AUTH.pre = r.all && r.all.ok ? r.all : null;
    authSay('Account created. Loading your club…');
    enter();
  }).catch(function (e) {
    pw = null; authBusy(f, false);
    authSay(e && e.message ? e.message : 'Could not create that account.', true);
  });
};
SUBMIT_EXT.authJoin = function (f) {
  var aff = f.elements.aff.value, code = f.elements.code.value.trim();
  if (!aff) return authSay('Pick your club.', true);
  if (!code) return authSay('You need the join code from your club officers.', true);
  authBusy(f, true); authSay('Checking your join code…');
  call('joinAffiliation', {affiliation: aff, joinCode: code}).then(function (r) {
    authBusy(f, false);
    if (!r) return authSay('The club sheet did not answer.', true);
    if (!r.ok) return authSay(r.error || 'That did not work.', true);
    if (DEMO) return demoSignedIn();
    AUTH.pre = r.all && r.all.ok ? r.all : null;
    authSay('You are in. Loading your club…');
    enter();
  });
};

/* ---------- signing out (classic signOut 2708) ----------
   This device stops getting the member's notifications, Google stops
   auto-selecting the account, and every key the classic page keeps for a
   signed-in person goes. The reload leaves nothing of the club in memory. */
function dropPushHere() {
  lsSet('orgsys-pushsync', null);
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return Promise.resolve();
  return navigator.serviceWorker.getRegistration().then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; })
    .then(function (sub) {
      if (!sub) return;
      return Promise.all([AUTH.rawCall('dropPush', {endpoint: sub.endpoint}), sub.unsubscribe().catch(function () {})]);
    }).catch(function () {});
}
function signOut() {
  if (AUTH.leaving) return;
  AUTH.leaving = true;
  if (DEMO) { ssSet(DEMO_AUTH, null); location.replace(location.pathname + '?demo&as=new'); return; }
  if (!$('drawer').hidden) closeSheet();
  toast('Signing out…');
  var viaGoogle = AUTH.google || !!gtokRaw() || String(lsGet(KEYS.session) || '').indexOf('g1.') === 0 || !!(RAW && RAW.all && RAW.all.via === 'google');
  var limit = function (p) { return Promise.race([p, new Promise(function (res) { setTimeout(res, 3000); })]); };
  limit(Promise.all([
    dropPushHere(),
    /* Loaded if need be: without this, one-tap would sign a Google account straight back in. */
    viaGoogle ? gisLoad().then(function (ok) { if (ok) try { google.accounts.id.disableAutoSelect(); } catch (e) {} }) : null
  ])).then(function () {
    clearCreds(); lsSet(KEYS.aff, null);
    ssSet(AUTH_OUT, '1');
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    location.reload();
  });
}
window.authSignOut = signOut;
ACT_EXT.signOut = function () { signOut(); };

/* ---------- your account: who you are, the master's club, sign out ---------- */
function viaLine() {
  if (DEMO) return 'Demo account. Nothing is saved or sent.';
  var s = String(lsGet(KEYS.session) || '');
  if (s.indexOf('g1.') === 0) return 'Signed in with Google. This home-screen app keeps you signed in for 30 days at a time.';
  if (s) return 'Signed in with an email and password. You stay signed in on this device for a week.';
  return 'Signed in with Google. It refreshes itself about once an hour while you use the page.';
}
function clubSwitch() {
  if (!M || !M.master) return '';
  var list = (RAW && RAW.all && RAW.all.affiliations) || AUTH.affs;
  if (!list) { loadAffList().then(function (l) { if (l) { refreshSheet(); if (ROUTE.view === 'profile') render(); } }); return '<p class="meta">Loading clubs…</p>'; }
  var opts = list.slice();
  if (!opts.some(function (a) { return a.code === 'default'; })) opts.unshift({code: 'default', name: 'default (unassigned data)'});
  return '<form class="form acctsw" data-act="authSwitch"><label class="fld"><span>Club you are looking at</span><select name="aff">' +
    opts.map(function (a) { return '<option value="' + esc(a.code) + '"' + (a.code === M.aff ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('') +
    '</select></label><p class="meta">Only the master account can look at more than one club. Switching reloads the page with that club.</p>' +
    '<div class="rowacts"><button class="btn sm" type="submit">Switch club</button></div></form>';
}
function accountBody() {
  var role = M.master ? 'Master' : M.officer ? 'Officer' : 'Member';
  return '<div class="acctme">' + avatar(M.me) + '<div><p class="pn">' + esc(M.me.name) + '</p>' + (M.email ? '<p class="pe">' + esc(M.email) + '</p>' : '') +
    '<p class="pe">' + esc(role + ' · ' + M.club) + '</p></div></div>' +
    '<p class="meta">' + esc(viaLine()) + '</p>' + clubSwitch() +
    '<div class="rowacts"><button class="btn sm ghost" data-act="signOut">' + icon('signout') + 'Sign out</button></div>';
}
function accountSheet() { return M ? '<header class="sh"><h3>Your account</h3></header><div class="acct">' + accountBody() + '</div>' : ''; }
ACT_EXT.account = function () { if (M) openSheet(accountSheet(), accountSheet); };
SUBMIT_EXT.authSwitch = function (f) {
  var code = f.elements.aff.value;
  if (!code || code === M.aff) return toast('You are already looking at that club.');
  if (DEMO) return toast('Demo: the page would reload with that club.');
  lsSet(KEYS.aff, code);
  AUTH.leaving = true;
  location.reload();
};
/* An Account card at the foot of Profile, whichever file draws Profile:
   onboard.js may replace VIEWS.profile after this file loads, and the setter
   keeps the card on whatever it sets (once, even if it wraps this one). */
(function () {
  var inner = VIEWS.profile;
  Object.defineProperty(VIEWS, 'profile', {
    configurable: true, enumerable: true,
    get: function () {
      return inner && function (sub) {
        var h = inner(sub);
        return !M || h.indexOf('id="acctcard"') > -1 ? h : h + '<section class="card acct" id="acctcard"><header><h3>Account</h3></header>' + accountBody() + '</section>';
      };
    },
    set: function (fn) { inner = fn; }
  });
})();
/* The top bar and the sidebar's name both open it. */
(function () {
  var acts = document.querySelector('.topacts');
  if (acts && !$('acctbtn')) {
    var b = document.createElement('button');
    b.className = 'ghost icon'; b.id = 'acctbtn'; b.type = 'button';
    b.setAttribute('data-act', 'account'); b.setAttribute('aria-label', 'Your account');
    b.innerHTML = icon('profile');
    acts.appendChild(b);
  }
  var who = $('who');
  if (who) { who.setAttribute('role', 'button'); who.setAttribute('tabindex', '0'); who.setAttribute('aria-label', 'Your account'); }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#who')) ACT_EXT.account(); });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'who') { e.preventDefault(); ACT_EXT.account(); } });
})();

/* ---------- after the club loads ---------- */
BOOT_EXT.push(function (raw) {
  document.body.classList.remove('out');
  if (DEMO) return;
  var all = raw.all || {}, g = gtokRaw();
  AUTH.google = !lsGet(KEYS.session) && !!g;
  /* The classic page paints from this while it checks in (display only). */
  storeWho({role: all.role, email: all.email || '', name: all.name || '', pic: all.via === 'google' && g ? jwtPeek(g.t).picture || '' : '',
            aff: all.aff || '', affName: all.affName || '', via: all.via || ''});
  keepHomeSession(all.via);
  scheduleRenew();
});

/* ---------- the chapter's own address (classic index.html 25-30, 11365) ----------
   org.deanzapbl.com only ever wears the chapter's look, icon and name. */
if (PBL_HOST) (function () {
  if (lsGet(KEYS.dtheme) !== 'phi') lsSet(KEYS.dtheme, 'phi');
  document.documentElement.setAttribute('data-theme', 'phi');
  var link = function (rel, href) { var l = document.querySelector('link[rel="' + rel + '"]'); if (l) l.href = href; };
  link('apple-touch-icon', '/icons/pbl-apple-touch-icon.png');
  link('manifest', '/icons/pbl.webmanifest');
  var t = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (!t) { t = document.createElement('meta'); t.name = 'apple-mobile-web-app-title'; document.head.appendChild(t); }
  t.content = 'De Anza PBL';
  var tb = $('themebtn'); if (tb) tb.style.display = 'none';
  var setT = ACT_EXT.setTheme;
  ACT_EXT.setTheme = function (el, d) { if (d.v === 'phi' && setT) setT(el, d); };
  var look = lookCard;
  lookCard = function () {
    var box = document.createElement('div'); box.innerHTML = look();
    var seg = box.querySelector('[data-act="setTheme"]'), fld = seg && seg.closest('.fld');
    if (fld) fld.remove();
    return box.innerHTML;
  };
})();

/* ---------- the demo: /?demo&as=new walks through all of it ---------- */
var DEMO_CODE = 'PBL2026';
function demoState() { return ssGet(DEMO_AUTH) || ''; }
/* Signed up, signed in or joined: the demo carries on as the demo club's member view. */
function demoSignedIn() {
  ssSet(DEMO_AUTH, null);
  ssSet('orgsystem.dash.demo.joined', '1');
  location.replace(location.pathname + '?demo&as=member#overview');
}
function demoClubs() { return [{code: 'demo', name: 'De Anza PBL (demo)'}]; }
if (DEMO) {
  DEMO_EXT.listAffiliations = function () { return {ok: true, affiliations: demoClubs()}; };
  DEMO_EXT.getSalt = function (pl) { return {ok: true, salt: btoa('orgsystem-demo:' + String(pl.username || '').toLowerCase()).slice(0, 24), iterations: AUTH.ITERS}; };
  DEMO_EXT.login = function (pl) {
    if (!pl.username || !pl.dk) return {ok: false, error: 'That username and password do not match.'};
    return {ok: true, session: 'demo', role: 'member', username: pl.username, name: '', email: pl.username, aff: 'demo', affName: 'De Anza PBL (demo)'};
  };
  var demoJoin = function (aff, code) {
    if (!demoClubs().some(function (c) { return c.code === aff; })) return {ok: false, error: 'Pick the club you are joining.'};
    if (String(code || '').trim() !== DEMO_CODE) return {ok: false, error: 'That join code does not match this club.'};
    return null;
  };
  DEMO_EXT.signup = function (pl) {
    var no = demoJoin(pl.affiliation, pl.joinCode); if (no) return no;
    if (!pl.dk || !pl.clientSalt || pl.iterations !== AUTH.ITERS) return {ok: false, error: 'Sign-up failed: the password was not secured.'};
    return {ok: true, session: 'demo', role: 'member', username: pl.email, name: (pl.firstName + ' ' + pl.lastName).trim(), email: pl.email, aff: 'demo', affName: 'De Anza PBL (demo)'};
  };
  DEMO_EXT.joinAffiliation = function (pl) {
    var no = demoJoin(pl.affiliation, pl.joinCode); if (no) return no;
    return {ok: true, joined: 'demo', name: 'De Anza PBL (demo)', all: null};
  };
  DEMO_EXT.googleSession = function () { return {ok: false, error: 'Only for Google sign-ins.'}; };
  DEMO_EXT.dropPush = function () { return {ok: true, removed: 0}; };
  if (Demo.as === 'new') DEMO_EXT.getAll = function () {
    return demoState() === 'join'
      ? {ok: true, role: 'member', email: 'new.member@demo.example', name: 'New Member', via: 'google', aff: '', needsAff: true}
      : {ok: false, error: ''};
  };
  /* ?demo&as=master: the officer view with the master's club switch. */
  if (Demo.as === 'master') DEMO_EXT.getAll = function (pl) {
    var self = DEMO_EXT.getAll, r;
    delete DEMO_EXT.getAll;
    try { r = Demo.answer('getAll', pl); } finally { DEMO_EXT.getAll = self; }
    if (r && r.ok) { r.role = 'master'; r.affiliations = demoClubs(); }
    return r;
  };
}
