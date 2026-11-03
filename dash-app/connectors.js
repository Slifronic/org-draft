/* Connected sheets on the screens they feed. Officer tools keeps the switches
   for every linked sheet; this puts a folded strip under the sub-tabs of each
   officer screen whose data comes from (or syncs with) one of them, so the
   sheet is one tap away where the work happens. Built only from SOURCES and
   SYNC (sources.js), so it never reads anything new and members never see it. */
'use strict';

/* view: [{sub, src: SOURCES ids, sync: Sync.gs domains}]; sub '*' is every sub-tab.
   The first entry per view is used when the address names no sub-tab. */
var CONN_PLACES = {
  members: [{sub: '*', src: ['signup', 'reenroll', 'track', 'discord', 'winter-dues'], sync: ['discord']}],
  attendance: [{sub: '*', src: ['attendance', 'discord'], sync: ['attendance', 'tickets']}],
  standing: [{sub: '*', src: ['attendance'], sync: ['attendance', 'tickets']}],
  teams: [{sub: 'board', src: ['sf-teams'], sync: ['teams']}, {sub: 'rooms', src: ['sf-rooms'], sync: ['rooms']}],
  sfblc: [{sub: 'schedule', src: ['sf-itin'], sync: ['itinerary']}],
  consulting: [{sub: '*', src: ['track']}],
  club: [{sub: 'setup', src: []}, {sub: 'roster', src: ['signup', 'reenroll', 'winter-dues']}]
};
var CONN = {open: {}};

function connSources(ids) { return ids.map(function (id) { return SOURCES.filter(function (s) { return s.id === id; })[0]; }).filter(Boolean); }
function connLine(s) {
  var st = LINKED.status[s.id];
  if (!sourceOn(s)) return {text: 'Off. Turn it on in Officer tools.', bad: false, off: true};
  if (!st) return {text: LINKED.loading ? 'Reading…' : 'Not read yet', bad: false};
  if (st.error) return {text: st.error, bad: true};
  return {text: plural(st.rows, 'row') + (s.tags ? ' · ' + plural(st.matched, 'member') + ' tagged' : '') +
    (st.missed && st.missed.length ? ' · ' + st.missed.length + ' names not on the roster' : '') + (st.at ? ' · read ' + ago(new Date(st.at)) : ''), bad: false};
}
/* When the two-way sync last carried this screen's data, from syncStatus. */
function connSync(domains) {
  if (!domains || !domains.length) return '';
  var s = SYNC.status;
  if (SYNC.err.status) return '<p class="meta bad">Sync: ' + esc(SYNC.err.status) + '</p>';
  if (!s) return '<p class="meta">Sync status loading…</p>';
  if (!s.linked) return '';
  var counts = s.counts || {}, what = domains.filter(function (d) { return counts[d] != null; }).map(function (d) { return SYNC_DOMAINS[d] + ' ' + counts[d]; });
  return '<div class="connsync"><p class="meta">Two-way sync: ' + esc(domains.map(function (d) { return SYNC_DOMAINS[d] || d; }).join(', ')) + ' · ' +
    (s.ranAt ? 'last synced ' + esc(ago(new Date(s.ranAt))) : 'not synced yet') + (what.length ? ' · ' + esc(what.join(' · ')) : '') + '</p>' +
    '<button class="btn sm" data-act="syncNow"' + (SYNC.busy ? ' disabled' : '') + '>' + (SYNC.busy ? 'Syncing…' : 'Sync now') + '</button></div>';
}
function connStrip(view, place) {
  var list = connSources(place.src);
  if (!list.length && !(place.sync || []).length) return '';
  var lines = list.map(connLine), bad = lines.filter(function (l) { return l.bad; }).length;
  var key = view + '/' + place.sub;
  var names = list.map(function (s) { return s.label.replace(/^SFBLC Master Sheet · /, 'Master sheet · '); });
  return '<details class="card conn" data-conn="' + esc(key) + '"' + (CONN.open[key] ? ' open' : '') + '><summary>' + icon('link') +
    '<h3>Connected sheets <span class="cn">' + esc(names.join(', ')) + '</span></h3>' +
    (bad ? '<span class="badge bad">' + plural(bad, 'problem') + '</span>' : '<span class="count">' + list.length + '</span>') + '</summary>' +
    '<ul class="autos">' + list.map(function (s, i) {
      var l = lines[i];
      return '<li><div><p class="tt">' + esc(s.label) + '</p><p class="meta">' + esc(s.about) + '</p><p class="meta' + (l.bad ? ' bad' : '') + '">' + esc(l.text) + '</p>' +
        '<div class="rowacts"><a class="btn sm ghost" href="https://docs.google.com/spreadsheets/d/' + esc(s.sheet) + '/edit" target="_blank" rel="noopener">Open sheet</a>' +
        (s.imports && !l.off ? '<button class="btn sm ghost" data-act="importSheet" data-what="' + s.imports + '">Import ' + ({teams: 'teams', rooms: 'rooms', schedule: 'itinerary'})[s.imports] + '</button>' : '') +
        '</div></div></li>';
    }).join('') + '</ul>' + connSync(place.sync) +
    '<div class="rowacts"><button class="btn sm ghost" data-act="srcReload">Read again</button><a class="btn sm ghost" href="#tools">Manage linked sheets</a></div></details>';
}
/* Under the sub-tabs when the screen has them, else at the top. */
function connInsert(html, strip) {
  if (!strip) return html;
  var at = html.indexOf('<div class="subtabs"');
  if (at < 0) return strip + html;
  var end = html.indexOf('</div>', at) + 6;
  return html.slice(0, end) + strip + html.slice(end);
}
Object.keys(CONN_PLACES).forEach(function (view) {
  var base = VIEWS[view];
  if (typeof base !== 'function') return;
  VIEWS[view] = function (sub) {
    var html = base.apply(this, arguments);
    if (!M || !M.officer) return html;
    var places = CONN_PLACES[view], cur = sub || places[0].sub;
    var place = places.filter(function (p) { return p.sub === '*' || p.sub === cur; })[0];
    return place ? connInsert(html, connStrip(view, place)) : html;
  };
});
/* Remember which strips are unfolded, since every render redraws the screen. toggle does not bubble. */
document.addEventListener('toggle', function (e) {
  var d = e.target;
  if (d && d.classList && d.classList.contains('conn')) CONN.open[d.getAttribute('data-conn')] = d.open;
}, true);
