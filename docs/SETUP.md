# Org System — Fall 2026 setup

The Org System replaces the old Hub. It runs at https://org-draft.vercel.app
(and on the chapter address). A walkthrough video is in
`media/setup-walkthrough.mp4`, and a safe sandbox is at `/demo`:

| Link | What you see |
| --- | --- |
| `/demo` | EBOD's view of a club mid-season |
| `/demo?as=member` | the same club as one member sees it |
| `/demo?as=new` | a brand-new member signing up and onboarding |
| add `&fresh=1` | start before any Orgs or teams exist |

Nothing in the demo is saved or sent anywhere. Use "Reset demo" in the demo bar to start over.

---

## What changed this season (EBOD decisions)

- **No titles.** No Associate / Analyst / Org Lead. Everyone is a **Member**; the only
  label next to a name is **1st year** or **2nd year**. 2nd years mentor inside their Org
  without a title.
- **Orgs** of 8–10, a mix of 1st and 2nd years, tracks and MBTI spread. Each Org has one
  **EBOD point of contact** (supervisory, low lift). Orgs are also the bootcamp breakout groups.
- **Teams.** Consulting: one team per client, 2 PMs, ~10–12 consultants split into
  initiatives. FLC: up to 4 per team, up to 3 teams per event. A member can be on one of each.
- **Points** are now a private *commitment log* on each member's profile, for reflection.
  Nothing ranks members. **Org Cups** replace the leaderboard: an Org earns a cup each time
  80% of its members hand an assignment in on time, or when EBOD awards one.
- **Season dates** are built into the Calendar: IM orientation Oct 15, bootcamp 1 + team
  formation Oct 20, bootcamp 2 (FLC / consulting split rooms) Oct 22, mock case stations the
  week of Oct 27, FLC Nov 13–15 (Emeryville), consulting finals Nov 19.

---

## For members

1. **Sign up.** Open the site → *Create an account* → *Sign up with Google* using your own
   email. Pick **De Anza PBL** and enter the join code EBOD gives you.
2. **Onboard.** The *Sign-up form* tab opens first. Answer year, track (Consulting /
   Case competition (FLC) / Polaris / Not sure yet), MBTI (there is a link to the test) and
   when you are usually available. Your answers are saved to your profile.
3. **Take the walkthrough** that opens the first time you sign in (Orgs → Teams → Homework →
   Calendar → Org Cup → Profile).
4. **Competing at FLC?** On the **Teams** tab, rank your three events, optionally name a
   teammate, and confirm you can be there Nov 13–15. Press *Send my choices*.
5. **After bootcamp 1 (Oct 20):** *Orgs* shows your Org, its 2nd years and your EBOD contact.
   *Teams* shows your consulting team (PMs, your initiative) and FLC team.
6. **Homework:** open *Homework*, upload a file or paste a shared link before the due date.
   Re-handing in replaces your earlier version; the first on-time hand-in still counts.
7. **Calendar:** every event has *+ Calendar* to add it to your own Google Calendar.

## For EBOD

All EBOD sign in with the **PBL Google account** (or their own address once granted
*admin* on the Access tab by the master account).

**Before orientation (once)**
1. *Intake → Club setup*: tracks should read Consulting, Case competition (FLC), Polaris.
   If the live club still shows the old names, edit them there (or "Load kit" →
   Business / PBL, which also resets the points catalog).
2. *Intake → The sign-up form's questions*: make sure the form asks year (1st/2nd), track,
   MBTI and availability. Members fill it in inside the app; answers land in the linked sheet
   and on their profile.
3. Share the join code.

**Bootcamp 1 — form Orgs (Oct 20)**
1. *Intake → Roster source → Signed-up members → Use signed-up members.* The mapping fills
   itself; the Org count is suggested so each Org has 8–10.
2. *Run draft.* Check the *Draft* tab: each card shows the track bar, the 2nd/1st split and
   the type spread. Red border = needs a manual look.
3. *Assign EBOD contacts* (round-robin), then change any from the card's dropdown.
4. Move people on each Org's page with the *Move* dropdown. *Reshuffle draft* starts over.

**Teams**
1. *Teams → Set up every client team and place consulting-track members.* Then on each card
   pick the two PMs, type the initiatives (comma-separated) and set each consultant's initiative.
2. The *FLC preferences* panel lists everyone who sent choices. *Form FLC teams from
   preferences* fills each event's teams from first, then second, then third choices, keeps
   requested teammates together where it can, and lists anyone it could not place. Selection
   criteria are still EBOD's call — adjust by hand (an FLC card stops at 4).
3. *Build a team* adds a single consulting / FLC / other team.

**Homework**
1. *Homework → Set an assignment*: start from a template or blank, set a due date, choose
   who it is for (everyone, one Org, one team) and whether it is a file, a link, or either.
2. Under each assignment: handed in / on time / late / still to come, the names not in yet,
   and each hand-in with *Check off* (optional commitment points).

**Org Cups** are automatic from on-time homework; *Award a cup* on the Org Cup tab for
anything else (turnout, a mock case win).

**Calendar**: season dates are already there. Add rooms/times as new events; hide a built-in
date with its ×. *Sync with Google Calendar* pushes everything to the chapter calendar.

---

## One-time backend update (Bryant)

`index.html` deploys with Vercel as before. The new features that need the sheet —
FLC preferences, availability, link hand-ins, Org Cup numbers, onboarding answers on the
club roster — need the updated **`apps-script/Code.gs`**:

1. Open the "Org System Data" sheet → Extensions → Apps Script.
2. Replace the code with `apps-script/Code.gs` from this branch and save.
3. Deploy → Manage deployments → edit the web app → *New version* → Deploy (keep the same
   URL so `WEBAPP_URL` in `index.html` does not change).

New columns are appended automatically on first use (Teams: `Availability`;
Profiles: `Availability`, `Prefs`) — nothing is archived. **Redeploy before members send FLC
preferences:** the old script accepts the save and quietly drops the preferences. Until then,
link hand-ins are refused ("No file arrived"), Org Cups show only hand-awarded cups, and
"Use signed-up members" drafts everyone as 1st year / not sure (use the Google Sheet tab instead).
