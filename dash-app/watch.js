/* "Watch": the short demo clip for the section you are on, in the top bar.
   Members only (officers have the walkthrough under Officer tools). The clips
   are recorded from the demo club by tools/demos/dash-clips.js; bump WATCH_V
   after re-recording, since /media is cached for a day. */
'use strict';

var WATCH_V = '20261109';
/* section (or section/tab) -> [clip, what it shows] */
var WATCH = {
  overview: ['overview', 'Your week, your homework and SFBLC on one page'],
  calendar: ['calendar', 'Meetings, SFBLC and due dates, month by month'],
  links: ['links', 'Every link the chapter uses'],
  messages: ['inbox', 'Messages from EBOD and the automatic reminders'],
  board: ['ebod', 'Who is on the board, and who to ask for what'],
  orgchart: ['orgchart', 'Who does what in the chapter'],
  orgs: ['orgs', 'Your Org, and the other five'],
  homework: ['homework', 'Hand in a file or a link before the due date'],
  cup: ['cup', 'Cups your Org earns together'],
  sfblc: ['sfblc', 'The schedule, coaching, checklist and what to know'],
  'sfblc/rides': ['carpools', 'Offer a ride or find one'],
  teams: ['teams', 'Your SFBLC team, and your event choices'],
  consulting: ['consulting', 'Your client team, its PMs and initiatives'],
  members: ['members', 'Everyone in the chapter, and how to find them'],
  profile: ['profile', 'Your details, notifications and commitment log']
};
function watchClip() {
  if (!M || M.officer || typeof ROUTE === 'undefined') return null;
  return WATCH[ROUTE.view + '/' + (ROUTE.sub || '')] || WATCH[ROUTE.view] || null;
}
function watchSrc(id, ext) { return '/media/demos/' + id + '.' + ext + '?v=' + WATCH_V; }
function watchButton() {
  var b = $('watchbtn');
  if (!b) return;
  var c = watchClip();
  b.hidden = !c;
  if (c) b.setAttribute('aria-label', 'Watch how this works: ' + c[1]);
}
ACT_EXT.watch = function () {
  var c = watchClip();
  if (!c) return;
  openSheet('<header class="sh"><h3>How this works</h3></header><p class="meta">' + esc(c[1]) + '. Silent, with captions.</p>' +
    '<video class="watchvid" controls autoplay muted playsinline preload="metadata" poster="' + watchSrc(c[0], 'jpg') + '">' +
    '<source src="' + watchSrc(c[0], 'mp4') + '" type="video/mp4"></video>' +
    '<p class="meta"><a href="/orientation#clips">Every clip, on the orientation page</a></p>');
};
/* After every redraw, alongside the page editor's button. */
var watchBaseApply = pageApply;
pageApply = function (view) { watchBaseApply(view); watchButton(); };
/* A clip left playing in a closed sheet would keep going unseen. */
/* closeSheet comes from app.js, which loads after this file, so it is wrapped once every script has run. */
document.addEventListener('DOMContentLoaded', function () {
  var base = closeSheet;
  closeSheet = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.watchvid'), function (v) { try { v.pause(); } catch (e) {} });
    return base.apply(this, arguments);
  };
});
