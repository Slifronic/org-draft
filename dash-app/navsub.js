/* Each section's sub-tabs in the side bar (and the phone's More sheet), so a
   sub-section is one tap from anywhere. The lists below are what each screen
   shows before it has been opened; once a screen draws its sub-tabs, that
   live list (with its counts) replaces the one here, through subtabs(). */
'use strict';

/* [id, label]; officer and member lists differ where the screens do. */
var SUBNAV = {
  officer: {
    messages: [['compose', 'Compose'], ['log', 'Sent & scheduled'], ['auto', 'Automations']],
    orgs: [['orgs', 'Orgs'], ['draft', 'Draft Orgs'], ['swaps', 'Recommended swaps']],
    homework: [['list', 'Assignments'], ['review', 'Hand-ins'], ['tracks', 'Homework tracks'], ['setup', 'Folders and alerts']],
    sfblc: [['schedule', 'Schedule'], ['coaching', 'Coaching'], ['checklist', 'Checklist'], ['rides', 'Carpools'], ['about', 'About'], ['season', 'Season']],
    teams: [['board', 'SFBLC teams'], ['prefs', 'Choices'], ['rooms', 'Hotel rooms'], ['requests', 'Team requests']],
    consulting: [['teams', 'Client teams'], ['edit', 'Edit teams'], ['interest', 'Client interest']],
    attendance: [['take', 'Take attendance'], ['absent', 'Absences and tickets'], ['range', 'Over a date range']],
    club: [['setup', 'Setup'], ['form', 'Sign-up form'], ['roster', 'Roster'], ['calendar', 'Calendar'], ['positions', 'Positions']],
    admin: [['access', 'Access'], ['clubs', 'Clubs'], ['signups', 'Every sign-up'], ['accounts', 'Password accounts']]
  },
  member: {
    sfblc: [['schedule', 'Schedule'], ['coaching', 'Coaching'], ['checklist', 'Checklist'], ['rides', 'Carpools'], ['about', 'About'], ['season', 'Season']],
    teams: [['team', 'Your team'], ['choices', 'Your choices']]
  }
};
var NAVSUB = {seen: {}, open: null};
var NAVSUB_KEY = 'orgsystem.dash.navsub';

/* Learn the live list (labels and counts) from whichever screen just drew it. */
var navsubBase = subtabs;
subtabs = function (cur, list, base) {
  if (base && M) NAVSUB.seen[(M.officer ? 'o:' : 'm:') + base] = list.map(function (x) { return [x[0], x[1], x[2] || '']; });
  return navsubBase(cur, list, base);
};
function navSubs(id) {
  if (!M) return [];
  var seen = NAVSUB.seen[(M.officer ? 'o:' : 'm:') + id];
  if (seen) return seen;
  /* SFBLC's sections come in the order officers set. */
  if (id === 'sfblc') return sfOrder().map(function (k) { return [k, sfLabel(k)]; });
  return (M.officer ? SUBNAV.officer : SUBNAV.member)[id] || [];
}
function navOpen() {
  if (!NAVSUB.open) { try { NAVSUB.open = JSON.parse(lsGet(NAVSUB_KEY) || '{}') || {}; } catch (e) { NAVSUB.open = {}; } }
  return NAVSUB.open;
}
/* The screen you are on is always unfolded; others stay as you left them. */
function navIsOpen(id) { var o = navOpen(); return o[id] !== undefined ? !!o[id] : ROUTE.view === id; }

/* One side-bar entry: the link, a fold button, and its sub-sections. */
function navItemHtml(n, linkHtml) {
  var subs = navSubs(n.id);
  if (!subs.length) return linkHtml;
  var open = navIsOpen(n.id), cur = ROUTE.view === n.id ? (ROUTE.sub || subs[0][0]) : '';
  return '<div class="navi' + (open ? ' open' : '') + '">' + linkHtml +
    '<button type="button" class="navx" data-act="navFold" data-id="' + esc(n.id) + '" aria-expanded="' + open + '" aria-label="' + (open ? 'Hide' : 'Show') + ' ' + esc(n.label) + ' sections">' +
    '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10l4 4 4-4"/></svg></button>' +
    (open ? '<div class="navsubs">' + subs.map(function (s) {
      return '<a href="#' + n.id + '/' + s[0] + '" class="' + (cur === s[0] ? 'on' : '') + '"' + (cur === s[0] ? ' aria-current="page"' : '') + '><span>' + esc(s[1]) + '</span>' +
        (s[2] ? '<b class="nb soft">' + esc(s[2]) + '</b>' : '') + '</a>';
    }).join('') + '</div>' : '') + '</div>';
}
/* The phone's More sheet: the same sub-sections as a row of small links. */
function navMoreSubs(n) {
  var subs = navSubs(n.id);
  if (!subs.length) return '';
  return '<div class="moresubs">' + subs.map(function (s) {
    return '<a href="#' + n.id + '/' + s[0] + '" data-close class="' + (ROUTE.view === n.id && (ROUTE.sub || subs[0][0]) === s[0] ? 'on' : '') + '">' + esc(s[1]) + '</a>';
  }).join('') + '</div>';
}
ACT_EXT.navFold = function (el, d) {
  var o = navOpen(), was = navIsOpen(d.id);
  o[d.id] = !was;
  lsSet(NAVSUB_KEY, JSON.stringify(o));
  drawNav();
  var b = document.querySelector('.navx[data-id="' + d.id + '"]'); if (b) b.focus();
};
