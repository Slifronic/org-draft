# Moving every classic feature into the dashboard (Nov 2026)

The dashboard (`dash.html` + `dash-app/`) becomes the Org System's only interface. The classic
page (`index.html`, ~11.6K lines) will be kept only as a read-only demo. Five feature files carry
everything the classic page does that the dashboard does not. Line numbers below are index.html
unless a file is named.

## Rules for every package

- Write only your own file `dash-app/<pkg>.js` (already created and loaded in dash.html, before
  app.js; order: auth, onboard, teams2, orgs2, admin). You may add CSS at the END of
  `dash-app/app.css` under a `/* ---- <pkg> ---- */` heading. Do not edit any other file; if you
  truly need a change elsewhere, describe it in your report instead.
- Match the dashboard's style exactly: read core.js, views.js, more.js, pbl.js, sources.js first.
  HTML as strings, `esc()` on every value, `call(action, payload)` for the backend, `toast`,
  `plural`, `render()`, `rebuild()`, `saveCfg(patch, msg)` for club-record edits, cards
  `<section class="card"><header><h3>…`, `.btn sm ghost`, `.qbtn`, `.chips/.chip`, `.meta`,
  `.count`, `empty(title, text)`, sheets via `openSheet` (see app.js/views.js). Sentence case, no
  all-caps prose. ES5-style `var`/`function` like the rest. Comments sparse, explaining why.
- Plug in through the registries, never by editing shared files:
  - `NAV.push({id, label, icon, officer?, group?…})` (copy the shape in views.js:38) and
    `VIEWS[id] = function () { return html; }`; sub-tabs via `ROUTE.sub`.
  - Clicks: `ACT_EXT[name] = function (el, data) {}` with `data-act="name"`; `CHANGE_EXT`, `SUBMIT_EXT`.
  - `TOOLS` (more.js:455) lists Officer-tools cards that deep-link to the classic page: when you
    build a feature, replace its card in place (`TOOLS.forEach` and change `href` to `#yourview`
    or remove it). Also handle any other classic link for your feature listed below by
    overriding the view/handler, not by editing the file.
  - `BOOT_EXT.push(function (raw) {})` runs after the club loads.
  - `DEMO_EXT[action] = function (payload, state, officer, me, store) { return {...}; }` answers
    your backend actions in demo mode (`/dash.html?demo`, `&as=member`). Make the demo believable
    and stateful (mutate `state`, then `store()`), using only names already in demo.js.
- Roles: `M.officer` (admin+), `M.role` ('member' | 'admin' | 'master'), `RANK`. Members must
  never see officer data; the backend enforces it too (Code.gs `NEEDS`, `MEMBER_HIDDEN_CFG_`).
- Backend: read the real action in apps-script/Code.gs before calling it (payload shape, reply
  shape, role). Do not change the backend. If an action is missing, say so in your report.
- Phone width: under 860px the dashboard uses a bottom tab bar and bottom sheets; no sideways
  scroll; cards scroll inside.
- Test without the shared Browser pane (other builders use it): serve the repo ROOT yourself on
  your own port (`python3 -m http.server <port> --bind 127.0.0.1` from ~/org-draft; ports: auth
  4811, onboard 4812, teams2 4813, orgs2 4814, admin 4815) and drive `http://127.0.0.1:<port>/dash.html?demo`
  (and `&as=member`) with the Playwright MCP (`mcp__playwright__*`) or headless Chrome via node.
  Check every screen you add in officer and member views, desktop and 375px, with no console
  errors. `node --check` every dash-app file. Stop your server when done. Do not commit.
- Report: what you built (screens, actions used), what you left out and why, anything another
  package or the cutover must do, and test evidence.

## Session facts (from the inventory)

- Dashboard reads `localStorage['orgsystem.session']` (`v1.` password session or `g1.` 30-day
  home-screen Google session) else `localStorage['orgsystem.gtok']` = JSON `{t: <Google ID token>,
  exp: <sec>}` (used if >60 s left), and `orgsystem.aff` (master's club). `creds()` core.js:98,
  `call()` core.js:108. Request body `{action, payload, session|token, aff}`, text/plain POST to
  WEBAPP_URL.
- Classic flows: boot 11481-11538, `initGate` 2938, `resumeSession` 2803, `initGsi` 2979-3018
  (GIS script `https://accounts.google.com/gsi/client`, client id 2539, `auto_select`, one-tap),
  `onCredential` 2680-2707, sign-out 2708-2724, PBKDF2 210000 SHA-256 2733-2775, `getSalt` +
  `login` 2762/2777-2802 (Code.gs:946-958, 636-662), sign-up `doSignupSubmit` 2881-2918
  (`listAffiliations`, `signup`), join `gateMode('join')` 2841-2866 / `doJoinSubmit` 2919-2937
  (`joinAffiliation`), home-screen app: `launchedFromHome` 9748, GIS `ux_mode:'redirect'`,
  `login_uri: /api/signin` (api/signin.js:21 redirects to `/#gcred=<jwt>`; the cutover will point
  it at the dashboard — read the credential from `#gcred=` wherever the page is), `takeRedirectSignIn`
  9880, `keepHomeSession` 9890 (`googleSession` → `g1.` session). Host lock for org.deanzapbl.com
  index.html:25-30 and 11365-11411.
- Known dashboard bugs to fix in the owning package: `needsAff` shows "The backend did not
  answer." (auth); gtok expiry signs people out after an hour (auth); Profile commitment log reads
  `M.profile.entries` but the list is `history` (onboard, more.js:393); hand-in key mismatch
  classic `orgsys-hw:<aff>:<email>:<id>` (5360) vs dash `orgsystem.hw.<aff>.<id>` (core.js:522) —
  make the dashboard also read the classic key so old hand-ins show (onboard).

## Packages

**A. auth.js — session and entry.** Define `authGate(err)` (app.js `signedOut` calls it): a
sign-in card with the Google button (GIS, one-tap, `auto_select`; redirect mode when launched from
the home screen), password sign-in (PBKDF2 like classic, `getSalt`, `login`), sign-up (club
picker from `listAffiliations`, join code, `signup`), and the `needsAff` join step
(`joinAffiliation`). On success store keys exactly as the classic page does and `boot()`.
Take `#gcred=` from the address; swap to a `g1.` session with `googleSession` when launched from
the home screen; renew or re-prompt quietly before a gtok expires. Sign out (top bar/profile):
clear keys, `dropPush`, `google.accounts.id.disableAutoSelect()`. Master's club switcher
(`orgsystem.aff`, `listAffiliations`). Host lock: on org.deanzapbl.com use the PBL look and
manifest/icon (dash already defaults to Φ PBL — make it fixed there). Export a shared
`window.pbkdf2Dk(password, saltB64, iterations)` helper for admin.js. Demo: `?demo&as=new`
shows the sign-in/sign-up/join flow without a backend.

**B. onboard.js — member self-service.** Sign-up form gate for members who have not answered the
club's form (classic 9588-9685, 9941-10040: `formSchema`, `submitForm`, `myFormAnswers`,
`myProfile.answers`, key `orgsys-formdone:<aff>:<email>`); home-screen step (9760, 9903-9923,
`/media/demos/homescreen.mp4`, skip when launched from the icon) and a short first-run tour;
full Profile (8871-9158: photo resized to 160px, track, birthday, MBTI, notes, "read my answers
from the form", trophy case, commitment log from `history`), `setMyPassword` (Google accounts)
and `changePassword` (password accounts; use `pbkdf2Dk` from auth.js), phone notifications
complete (`pushOn` 9776-9878: real subscription state, turn off with `dropPush`, daily re-sync
key `orgsys-pushsync`), `ensureMyDrive` on load (5371). Fix the two bugs above.

**C. teams2.js — teams and competitions.** Member: FLC prefs (rank events, attending, rooming
group, roommates; `renderMyPrefs` 8135, `saveProfile {prefs}`) and consulting client ranking
(`renderMyClients` 8210); team requests (`renderReqMember` 8672: `submitTeamRequest`,
`withdrawTeamRequest`). Officer: consulting client teams editor (`makeClientTeams` 7595,
`fillClientTeams` 7619: clients, PMs, initiatives, assignments, fill from rankings, "Other"),
hotel rooms editor (`renderRoomsPanel` 8308, `formRooms` 8257, `roomCap`, CSV `exportFlc` 8289)
— rooms also sync with the SFBLC master sheet now, so edit `cfg.rooms` with the same fields
(`id, name, no, group, members` and keep `label/type/gender` if present), team requests review
(`renderReqAdmin` 8532: `listTeamRequests`, `reviewTeamRequest`, `editTeamRequest`,
`deleteTeamRequest`), officer prefs overview (7846). Replace the "Rank my events" links
(views.js:236, 444), pbl.js:182/198 and core.js:468-469 gap buttons through overrides.

**D. orgs2.js — Org program officer tools.** Roster source and mapping (Intake 1608-1720:
accounts via `clubRoster`, CSV, Google Sheet, paste; `buildMapper` 3978, `loadFromAccounts`
4116, `loadSheet` 4187), Draft Orgs (`run`/`draft` 4241-4370, `renderDraft` 6998, filters 7156:
draft, reshuffle, move members, export CSV, `setTeams`, `forkClub` master only), Org rename by
leads (`setOrgName`), EBOD contact assignment (`autoAssignEbod` 6985), recommended swaps
(`renderSwaps` 6747), member card (`openMemberCard` 7202, `memberCard`: photo, hand-ins,
recognitions), recognitions/trophies (4561-4593) and bulletin notices (`cfg.board` 5819-5880,
shown to everyone), cup removal, hand-in review (5626-5725: `listSubmissions` rows with file
links, `reviewSubmission(s)`, points), homework tracks (`renderFocusPanel` 5322, via `setTeams`),
member Drive folders (`syncMemberDrives` 5379), homework alerts email (`cfg.handinTo` 2112-2121),
brief templates for homework, attendance also writing `addPointsBulk` (3358), absences over a
date range with CSV (6401).

**E. admin.js — club and master admin.** Club setup (`renderClubSetup` 9385, `wireClubSetup`
9415, tracks 9158: names, kits, year, MBTI, test link, theme), sign-up form editor
(`renderFormEditor` 4396 / `initFormEditor` 4490: `formItems`, `saveFormItems`), form kit and
links (`renderFormKit` 9253, `renderRosterLinks` 9297: `cloneForm`, `republishForm`), roster
table with remove (`renderClubRoster` 9336: `clubRoster`, `deleteSignup`), clear club data
(`purgeClub`, 9206, with a typed confirmation), calendar connection (`runCalSync` 5227
`calendarSync`, `calShare`, hide Google events/series `calHide` 4946, `seasonOff`, delete
events), master only: access and roles (`renderAccess` 9491, `renderGrantClubs` 9484:
`listRoles`, `setRole`, `removeRole`), clubs (`renderAffs` 10043: `listAffiliations`,
`createAffiliation`, `updateAffiliation`, `deleteAffiliation`), every sign-up (`renderSignups`
10215: `listSignups`, `deleteSignup`), password accounts (`renderUsers` 10234: `listUsers`,
`createUser`, `setUserRole`, `resetPassword`, `deleteUser`; use `pbkdf2Dk` from auth.js).

## Dropped on purpose

Offline/local mode, undo/redo, JSON save/load/wipe, hidden panels and the officer tab-bar
layout, the hidden per-member points catalog, tab clip videos (orientation.html covers the
walkthrough), the assistant chat (the dashboard's ⌘K search replaces it).
