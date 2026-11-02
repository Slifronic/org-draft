/* The Org System's service worker. It does one thing: show the homework
   notifications the backend sends (new assignment, due tomorrow, hand-in
   received) and open the page when one is tapped. It caches nothing and
   handles no requests, so the site loads exactly as it does without it. */
var PBL = self.location.hostname === 'org.deanzapbl.com';
var ICON = PBL ? '/icons/pbl-icon-192.png' : '/icons/org-icon-192.png';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {body: e.data ? e.data.text() : ''}; }
  var title = String(d.title || (PBL ? 'De Anza PBL' : 'Org System')).slice(0, 80);
  e.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || '').slice(0, 240),
    icon: ICON, badge: ICON,
    /* A newer note about the same assignment replaces the older one. */
    tag: String(d.tag || ''),
    data: {url: String(d.url || '/')}
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin);
  if (url.origin !== self.location.origin) url = new URL('/', self.location.origin);
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(function (wins) {
    for (var i = 0; i < wins.length; i++) {
      if (new URL(wins[i].url).origin === url.origin && 'focus' in wins[i])
        return wins[i].focus().then(function (w) { return w && w.navigate ? w.navigate(url.href) : w; });
    }
    return self.clients.openWindow(url.href);
  }));
});
