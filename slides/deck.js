/* Orientation deck — Phi Beta Lambda / The Org System
 *
 * The content and the geometry live here once. build-pptx.js renders it to a
 * .pptx and build-preview.js renders the same numbers to HTML, so what gets
 * inspected in a browser is the layout that ships rather than a redrawing of
 * it. Inches throughout, on a 13.333 x 7.5 stage.
 *
 * Colours are the app's own: near-black ground, parchment ink, one teal
 * accent, and the same coral and blue it uses to tell the two divisions
 * apart. Headings are set light and large the way the site sets them.
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
};

/* Calibri and Consolas ship with Office on both platforms. The site's own
   faces are Google fonts and would silently substitute on a laptop that has
   never loaded them, which is exactly the machine this gets presented from. */
const F = { head: 'Calibri Light', body: 'Calibri', mono: 'Consolas' };

const W = 13.333, H = 7.5, M = 0.85;

const deck = [

  { kind: 'title',
    eyebrow: 'Phi Beta Lambda · Chapter orientation',
    title: 'The Org System',
    sub: 'How this chapter drafts its teams, tracks who shows up, and runs the Org Cup.',
    foot: 'org-draft.vercel.app' },

  { kind: 'stat',
    eyebrow: 'The problem',
    title: 'Nobody can hold a hundred people in their head',
    stats: [
      { n: '100', l: 'members in the chapter' },
      { n: '10',  l: 'Orgs competing' },
      { n: '14',  l: 'weeks in a season' } ],
    note: 'Who is new, who competes, who has turned up to nothing since September. This page answers that without a spreadsheet nobody wants to maintain.' },

  { kind: 'three',
    eyebrow: 'What it does',
    title: 'Three things, and everything else serves them',
    items: [
      { n: '01', h: 'Drafts', p: 'Sorts the chapter into balanced Orgs instead of letting teams form by friend group.', c: C.blue },
      { n: '02', h: 'Tracks',  p: 'Records attendance and participation, so showing up is visible and counts.', c: C.teal },
      { n: '03', h: 'Competes', p: 'Runs the Org Cup — the season-long contest that makes the first two matter.', c: C.coral } ] },

  { kind: 'steps',
    eyebrow: 'Getting in',
    title: 'Three steps, once',
    steps: [
      { n: '1', h: 'Sign in',              p: 'Google is the normal door. The page receives your name, email and picture — never your password. Officers can issue a username and password instead.' },
      { n: '2', h: 'Join your chapter',    p: 'Pick it from the list and enter the join code. Officers hand that out the way you would a door code.' },
      { n: '3', h: 'Fill in the form',     p: 'The part people skip, and the part that matters. The draft cannot place you sensibly without it.' } ] },

  { kind: 'callout',
    eyebrow: 'Why the form is not optional',
    title: 'A blank answer does not make you neutral',
    body: 'The draft balances four things at once: team size, which division you lean toward, how long you have been in the chapter, and whether you are interested in leading.',
    kicker: 'Every one of those comes from the form. Leave it blank and you are not neutral — you are a coin flip.' },

  { kind: 'table',
    eyebrow: 'Permissions',
    title: 'The four roles',
    cols: ['Can they…', 'Member', 'Org Lead', 'Admin', 'Master'],
    rows: [
      ['See standings and their own Org',        1,1,1,1],
      ['See their own points and type',          1,1,1,1],
      ["See another member's points or type",    0,0,1,1],
      ['Rename their own Org',                   0,1,1,1],
      ['Run the draft, log attendance',          0,0,1,1],
      ['Read private notes on members',          0,0,1,1],
      ['Remove accounts, edit the form',         0,0,1,1],
      ['Create chapters, grant roles',           0,0,0,1] ],
    note: 'Roles are checked on the server every time anything is saved. Hiding a button is not what keeps things safe.' },

  { kind: 'grid',
    eyebrow: 'The tabs · 1 of 2',
    title: 'Where a semester happens',
    cells: [
      { h: 'Intake',     w: 'Officers', p: 'Set the chapter’s vocabulary, then load the roster.' },
      { h: 'Roster',     w: 'Officers', p: 'Everyone with an account. Click anyone to see their card.' },
      { h: 'Draft',      w: 'Everyone', p: 'The Orgs as cards. Officers run it; members see the teams.' },
      { h: 'Teams',      w: 'Everyone', p: 'One Org in depth — roster, split, type mix, standing.' },
      { h: 'Attendance', w: 'Officers', p: 'Pick the event, check who came, log it.' },
      { h: 'Org Cup',    w: 'Everyone', p: 'Standings on arrival; the scoring catalog behind it.' } ] },

  { kind: 'grid',
    eyebrow: 'The tabs · 2 of 2',
    title: 'And the rest',
    cells: [
      { h: 'Assistant',    w: 'Officers', p: 'Swaps that improve type balance without disturbing anything else.' },
      { h: 'Profile',      w: 'Everyone', p: 'Your points, your answers, your recognitions.' },
      { h: 'Sign-up form', w: 'Everyone', p: 'The chapter’s form, filled in without leaving the page.' },
      { h: 'Access',       w: 'Master',   p: 'Roles, chapters, join codes, every account.' } ] },

  { kind: 'three',
    eyebrow: 'The draft',
    title: 'Not random, and not a popularity contest',
    items: [
      { n: '', h: 'Size',       p: 'Orgs come out within one member of each other.', c: C.blue },
      { n: '', h: 'Division',   p: 'Whichever tracks the chapter runs get spread evenly rather than clustering.', c: C.coral },
      { n: '', h: 'Tenure',     p: 'First-years and returning members are mixed, so no Org is all new.', c: C.teal } ],
    tail: 'Plus leadership interest, and — if the chapter uses them — personality types. That last one is what the balance score measures. Lower is better.' },

  { kind: 'callout',
    eyebrow: 'The flexible pieces',
    title: '“Either / no preference” is a real answer',
    body: 'Members with no division preference are what let a lopsided chapter still come out even. They go wherever the numbers need them.',
    kicker: 'If you genuinely do not mind, saying so is more useful than guessing.' },

  { kind: 'chips',
    eyebrow: 'The Org Cup',
    title: 'Points have a kind, and a colour',
    chips: [
      { t: 'Meetings',    c: C.blue },
      { t: 'Competition', c: C.coral },
      { t: 'Service',     c: C.green },
      { t: 'Social',      c: C.gold },
      { t: 'Leadership',  c: 'A98BD0' },
      { t: 'Recruiting',  c: '4FA3A3' } ],
    note: 'Officers set what each action is worth, and it is meant to be edited — the catalog should describe what this chapter actually does. Grouping by kind is what shows an Org winning on attendance but doing no service.' },

  { kind: 'three',
    eyebrow: 'The Org Cup',
    title: 'Three bonuses sit on top',
    items: [
      { n: '', h: 'Cross-division', p: 'Turn up on the other side of the chapter and earn extra. This exists to stop two divisions becoming two clubs.', c: C.coral },
      { n: '', h: 'No preference',  p: 'Members with no division preference earn a little extra for exploring.', c: C.blue },
      { n: '', h: 'Full team',      p: 'If most of an Org shows up to the same thing, the whole Org scores. Dragging your friends along is the point.', c: C.teal } ],
    tail: 'Standings rank on points per member, not raw totals — otherwise an Org with eleven people beats one with nine regardless of effort.' },

  { kind: 'steps',
    eyebrow: 'Your own page',
    title: 'The one screen written for you',
    steps: [
      { n: '', h: 'Points, and where they came from', p: 'Your total, your entries, and the split across the six kinds.' },
      { n: '', h: 'Your sign-up answers',             p: 'Year, division, type, leadership interest — read back from the chapter’s sheet.' },
      { n: '', h: 'Your recognitions',                p: 'Awarded by officers for what the points system does not capture. They do not affect the Cup.' } ],
    tail: 'Another member’s type and points are theirs. Officers see them because running the draft requires it; other members do not.' },

  { kind: 'timeline',
    eyebrow: 'For officers',
    title: 'A semester, start to finish',
    phases: [
      { w: 'Week 0',     h: 'Set up',        p: 'Name the divisions and ranks, create the form, hand out the join code.' },
      { w: 'Weeks 1–2',  h: 'Collect',       p: 'Members join and appear on the roster on their own. Chase the ones who have not.' },
      { w: 'Week 2',     h: 'Draft',         p: 'Run it, read the flags, take the Assistant’s swaps, hand-adjust, announce.' },
      { w: 'All term',   h: 'Log',           p: 'Five minutes after every event. This is the whole job.' },
      { w: 'End',        h: 'Hand over',     p: 'Export a save file, then clear the data for a new semester.' } ] },

  { kind: 'callout',
    eyebrow: 'The one thing that goes wrong',
    title: 'The browser copy is not a backup',
    body: 'It disappears if the cache is cleared or the officer changes laptops.',
    kicker: 'Export a save file at the end of each semester. Never let one person’s browser hold the only copy of anything.',
    warn: true },

  { kind: 'close',
    eyebrow: 'Start here',
    title: 'org-draft.vercel.app',
    sub: 'Sign in, join with the code, fill in the form. The full written orientation is at /orientation.',
    foot: 'Questions go to your chapter officers.' },
];

module.exports = { deck, C, F, W, H, M };
