/* Orientation deck — Phi Beta Lambda / The Org System
 *
 * Written for the member in the room, not the officer running it. Officers get
 * one slide near the end; everything before it answers "what is my Org, and
 * how do I earn points for it".
 *
 * The content and the geometry live here once. build-pptx.js renders it to a
 * .pptx and build-preview.js renders the same numbers to HTML, so what gets
 * inspected in a browser is the layout that ships rather than a redrawing of
 * it. Inches throughout, on a 13.333 x 7.5 stage.
 */

const C = {
  bg:     '151515',
  card:   '242424',
  void:   '0E0E0E',
  ink:    'E9EBDF',
  slate:  'CBCCC4',
  mute:   '94958E',
  rule:   '3F403D',
  teal:   '185849',
  moss:   '0E352C',
  tealUp: '2E9179',
  coral:  'E8765E',
  blue:   '7AA9DD',
  green:  '4FAE8C',
  gold:   'C9A24A',
  violet: 'A98BD0',
  aqua:   '4FA3A3',
};

/* Calibri and Consolas ship with Office on both platforms. The site's own
   faces are Google fonts and would silently substitute on a laptop that has
   never loaded them, which is exactly the machine this gets presented from. */
const F = { head: 'Calibri Light', body: 'Calibri', mono: 'Consolas' };

const W = 13.333, H = 7.5, M = 0.85;

const deck = [

  { kind: 'title',
    eyebrow: 'Phi Beta Lambda · Chapter orientation',
    title: 'Your Org',
    sub: 'You have been sorted into a team for the year. Here is what that means, and how you earn points for it.',
    foot: 'org-draft.vercel.app' },

  { kind: 'three',
    eyebrow: 'The short version',
    title: 'Three things are true of you now',
    items: [
      { n: '01', h: 'You are in an Org', p: 'A team of about ten, drawn from across the chapter. It is yours for the year.', c: C.blue },
      { n: '02', h: 'You earn points',    p: 'Almost everything you show up to is worth something, and it is credited to your Org.', c: C.teal },
      { n: '03', h: 'Your Org competes',  p: 'Against every other Org, all semester, for the Org Cup.', c: C.coral } ] },

  { kind: 'anatomy',
    eyebrow: 'What an Org is',
    title: 'A cross-section of the chapter, not a friend group',
    facts: [
      { n: '~10', l: 'members' },
      { n: '1',   l: 'academic year' },
      { n: '4',   l: 'ways it is balanced' } ],
    body: 'An Org is a small standing team inside the chapter. You did not pick it and neither did your friends — it was dealt so that every Org looks roughly like the chapter as a whole.',
    kicker: 'That is the point. You end the year knowing ten people you would not otherwise have met, across both divisions and both year groups.' },

  { kind: 'three',
    eyebrow: 'Why you did not choose',
    title: 'What the draft balanced when it placed you',
    items: [
      { n: '', h: 'Size',       p: 'Every Org comes out within one member of every other, so no team is carrying a numbers disadvantage in the Cup.', c: C.blue },
      { n: '', h: 'Division',   p: 'Consulting and case competition people are spread across all the Orgs rather than clustering into two camps.', c: C.coral },
      { n: '', h: 'Tenure',     p: 'First-years and returning members are mixed, so no Org is all new and none is a closed circle of veterans.', c: C.teal } ],
    tail: 'A fourth axis spreads members who said they are interested in leading, so every Org has somebody willing to organise it. If the chapter uses personality types, a fifth keeps any one Org from being nine of the same person.' },

  { kind: 'steps',
    eyebrow: 'Getting in',
    title: 'Three steps, once',
    steps: [
      { n: '1', h: 'Sign in',           p: 'Google is the normal door. The page receives your name, email and picture — never your password.' },
      { n: '2', h: 'Join the chapter',  p: 'Pick it from the list and enter the join code your officers gave you.' },
      { n: '3', h: 'Fill in the form',  p: 'Year in the chapter, which division you lean toward, and whether you want to lead. Two minutes.' } ] },

  { kind: 'callout',
    eyebrow: 'Why the form is not optional',
    title: 'A blank answer does not make you neutral',
    body: 'Every axis the draft balances comes from your form answers. Leave one blank and the sorter has nothing to work with.',
    kicker: 'You are not neutral — you are a coin flip, and so is the Org that ends up with you.' },

  { kind: 'cupstruct',
    eyebrow: 'The Org Cup',
    title: 'How the competition is put together',
    rows: [
      { k: 'The season',   v: 'Roughly fourteen weeks. Every Org starts at zero in week one.' },
      { k: 'The unit',     v: 'One member, at one thing, on one date. That is what gets logged.' },
      { k: 'The total',    v: 'Every point any member earns is credited to their Org, plus whole-team bonuses.' },
      { k: 'The ranking',  v: 'Orgs are ranked on points per member, not on raw totals.' },
      { k: 'The winner',   v: 'Whoever is top of that table when the season ends.' } ] },

  { kind: 'kindlist',
    eyebrow: 'Earning points · 1 of 2',
    title: 'Six kinds of thing are worth points',
    kinds: [
      { t: 'Meetings',    c: C.blue,   d: 'General chapter meetings, division workshops, study and prep sessions. Individually the smallest amount — but they happen most weeks, so over a semester they are the largest share of most members’ totals.' },
      { t: 'Competition', c: C.coral,  d: 'Case competitions, conference events, state and national qualifiers. The highest per-event value in the catalog, because it is the chapter competing in public. Usually scored twice: once for entering, again for placing.' },
      { t: 'Service',     c: C.green,  d: 'Community service, philanthropy, volunteering hours. Often logged by the hour rather than the event, so a long Saturday counts more than a short one.' } ] },

  { kind: 'kindlist',
    eyebrow: 'Earning points · 2 of 2',
    title: 'And the three that are easy to forget',
    kinds: [
      { t: 'Social',      c: C.gold,   d: 'Mixers, banquets, retreats, Org socials. Deliberately worth less than competition — but these are what turn ten people who were assigned to each other into a team that shows up for each other.' },
      { t: 'Leadership',  c: C.violet, d: 'Running a workshop, leading a session, holding a role, mentoring a first-year. Worth a lot per instance because few people do it. This is the category most within your control.' },
      { t: 'Recruiting',  c: C.aqua,   d: 'Bringing a guest, working a tabling shift, getting someone to actually join. Scored generously, since a chapter that does not recruit has no next year.' } ] },

  { kind: 'math',
    eyebrow: 'Earning points',
    title: 'What one attendance is actually worth',
    parts: [
      { n: '1',  l: 'Base value', s: 'What your officers set the action at', c: C.slate },
      { n: '+2', l: 'Cross-division', s: 'You went to the other side’s event', c: C.coral },
      { n: '3',  l: 'You earn', s: 'Credited to you, and to your Org', c: C.ink } ],
    note: 'Base values are set by your officers and are meant to be edited — the catalog should describe what this chapter actually does. Anything you attend outside your own division picks up the cross-division bonus on top.' },

  { kind: 'three',
    eyebrow: 'Earning points',
    title: 'Three bonuses, and how to trigger them',
    items: [
      { n: '', h: 'Cross-division', p: 'Go to something on the other side of the chapter. Every time. This bonus exists specifically to stop consulting and case competitions becoming two separate clubs.', c: C.coral },
      { n: '', h: 'No preference',  p: 'If you told the form you had no division preference, you pick up extra on anything you attend. You are being paid to explore.', c: C.blue },
      { n: '', h: 'Full team',      p: 'If most of your Org turns up to the same thing, the whole Org scores a bonus on top of the individual points. Bring your Org.', c: C.teal } ],
    tail: 'The third one is the only bonus you cannot earn alone, and it is the largest. Dragging four people to a workshop is worth more than going to two on your own.' },

  { kind: 'callout',
    eyebrow: 'Why the leaderboard looks like that',
    title: 'Ranked per member, not by total',
    body: 'An Org of eleven would beat an Org of nine on raw totals every time, whatever either of them actually did.',
    kicker: 'Dividing by headcount means the Cup measures participation. A small Org that all turns up beats a large one that half does.' },

  { kind: 'steps',
    eyebrow: 'Your page',
    title: 'What you can see about yourself',
    steps: [
      { n: '', h: 'Your points',        p: 'Your running total, how many things you have been to, and the split across the six kinds.' },
      { n: '', h: 'Your answers',       p: 'Year, division, type and leadership interest, read back from the form you filled in.' },
      { n: '', h: 'Your recognitions',  p: 'Awarded by officers for what points do not capture. They do not affect the Cup.' } ],
    tail: 'Another member’s points and personality type are theirs, not yours. Officers see them because running the draft and the Cup requires it — other members do not.' },

  { kind: 'steps',
    eyebrow: 'What is actually asked of you',
    title: 'Four habits, and that is the whole job',
    steps: [
      { n: '1', h: 'Turn up',        p: 'To meetings, and to at least some things outside your own division.' },
      { n: '2', h: 'Sign in',        p: 'On the sheet at the event. If you are not on it, you did not earn it.' },
      { n: '3', h: 'Bring your Org', p: 'The full-team bonus is the largest one available and needs other people.' },
      { n: '4', h: 'Check standings',p: 'Weekly. It takes ten seconds and it is the point of the whole thing.' } ] },

  { kind: 'timeline',
    eyebrow: 'For officers only',
    title: 'The other side of it',
    phases: [
      { w: 'Week 0',    h: 'Set up',    p: 'Name the divisions and ranks, create the sign-up form, hand out the join code.' },
      { w: 'Weeks 1–2', h: 'Collect',   p: 'Members join and appear on the roster on their own. Chase the ones who have not.' },
      { w: 'Week 2',    h: 'Draft',     p: 'Run it, read the flags, take the Assistant’s swaps, hand-adjust, announce.' },
      { w: 'All term',  h: 'Log',       p: 'Five minutes after every event. Skip three weeks and the standings stop meaning anything.' },
      { w: 'End',       h: 'Hand over', p: 'Export a save file for next year’s officers, then clear the data for a new semester.' } ] },

  { kind: 'close',
    eyebrow: 'Start here',
    title: 'org-draft.vercel.app',
    sub: 'Sign in, join with the code, fill in the form. Then find your Org under Teams and see where it stands.',
    foot: 'The full written orientation is at /orientation · Questions go to your chapter officers.' },
];

module.exports = { deck, C, F, W, H, M };
