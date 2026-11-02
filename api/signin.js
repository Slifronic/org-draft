// Google sign-in for the home-screen app.
//
// Opened from its home-screen icon, the Org System runs in its own window
// whose storage is not Safari's, and Google's sign-in popup cannot hand its
// answer back to it. So there the page asks Google for a full-page redirect
// instead: Google posts the signed-in credential here, and this sends the
// member straight back to the page with it in the address fragment, which
// never reaches a server. The backend checks the credential with Google
// exactly as it does a popup sign-in; this only carries it.
//
// The address must be listed under the OAuth client's Authorized redirect
// URIs in Google Cloud. See docs/SETUP.md.

function cookie(req, name) {
  const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const back = (hash) => { res.statusCode = 303; res.setHeader('Location', '/#' + hash); res.end(); };
  if (req.method !== 'POST') return back('gerr=method');
  const body = req.body || {};
  // Google's double-submit check: the same random value in a cookie it set
  // and in the form it posted. A page elsewhere cannot set the cookie.
  const csrf = String(body.g_csrf_token || '');
  if (!csrf || csrf !== cookie(req, 'g_csrf_token')) return back('gerr=csrf');
  const cred = String(body.credential || '');
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(cred) || cred.length > 4096) return back('gerr=credential');
  return back('gcred=' + encodeURIComponent(cred));
};
