// Sends homework notifications to members' phones.
//
// Apps Script cannot do what Web Push requires (P-256 key agreement, AES-GCM,
// ES256-signed VAPID tokens), so the backend hands the messages to this
// function and it does the sending. It holds the VAPID private key; the
// backend proves itself with PUSH_SECRET, which both sides keep and nobody
// else has. GET answers the page's one question: the public key to subscribe
// with.
//
// Vercel environment variables: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (a mailto: address), PUSH_SECRET. See docs/SETUP.md.
const crypto = require('node:crypto');
const webpush = require('web-push');

// Only the push services browsers actually use, so a made-up "subscription"
// cannot turn this into a way to post at any address on the internet.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
const MAX = 500;

function sameSecret(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

function okSub(s) {
  if (!s || typeof s.endpoint !== 'string' || !s.keys || !s.keys.p256dh || !s.keys.auth) return false;
  let u;
  try { u = new URL(s.endpoint); } catch (e) { return false; }
  return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
}

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

async function sendOne(m) {
  if (!okSub(m && m.sub)) return { ok: false, gone: true, status: 0 };
  const payload = JSON.stringify({ title: clip(m.title, 80), body: clip(m.body, 240),
    url: clip(m.url, 300) || '/', tag: clip(m.tag, 60) });
  try {
    const r = await webpush.sendNotification(m.sub, payload, { TTL: 86400, urgency: 'normal' });
    return { ok: true, status: r.statusCode };
  } catch (e) {
    // 404 and 410 mean the phone dropped this subscription for good.
    const status = e && e.statusCode || 0;
    return { ok: false, gone: status === 404 || status === 410, status };
  }
}

module.exports = async (req, res) => {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  res.setHeader('Cache-Control', 'no-store');
  if (!pub || !priv || !process.env.PUSH_SECRET)
    return res.status(503).json({ ok: false, error: 'Push is not set up on this deployment.' });
  if (req.method === 'GET') return res.status(200).json({ ok: true, publicKey: pub });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only.' });
  if (!sameSecret(req.headers['x-push-secret'], process.env.PUSH_SECRET))
    return res.status(403).json({ ok: false, error: 'Wrong secret.' });

  const list = (req.body && Array.isArray(req.body.messages)) ? req.body.messages.slice(0, MAX) : [];
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:deanzacapbl@gmail.com', pub, priv);
  // Twenty at a time: quick for a club of eighty, gentle on the push services.
  const results = new Array(list.length);
  for (let i = 0; i < list.length; i += 20) {
    const part = await Promise.all(list.slice(i, i + 20).map(sendOne));
    part.forEach((r, j) => { results[i + j] = r; });
  }
  return res.status(200).json({ ok: true, results });
};

module.exports.okSub = okSub;
