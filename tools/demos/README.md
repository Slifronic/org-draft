# Section demo clips and the member walkthrough

**The dashboard's clips (Nov 2026).** `dash-clips.js` records one silent, captioned clip per
member-side section of the dashboard (Overview, Calendar, Links, Inbox, EBOD, Org chart,
Orgs, Homework, Org Cup, SFBLC, Carpools, Competition teams, Client teams, Internal Members,
Profile, plus Sign up) from the demo club. Members open them from the **Watch** button at the
top of each section (`dash-app/watch.js`, which maps sections to clips) and on
`/orientation#clips`.

```
node serve.js ../.. 8791
PLAYWRIGHT=~/Projects/asset-library/node_modules/playwright node dash-clips.js out-dash   # or: … out-dash sfblc calendar
./encode.sh out-dash ../../media/demos
python3 orientation-clips.py 20261109     # rewrites the grid on orientation.html with the new lengths
```

Then bump `WATCH_V` in `dash-app/watch.js` to the same version. The demo club's data lives in
`dash-app/demo.js` (SFBLC checklist, rules and per-team coaching come from `SFBLC.starter()`
in `core.js`); keep anything private (join codes, phone numbers, real GroupMe links) out of it,
since the repo is public.

`clips.js` below is the older recorder for the classic page; the dashboard reuses its rig
(`INIT`, `rig`) but not its clip list.

## The classic page's clips (Oct 2026, retired)

`media/demos/*.mp4` are recorded from the demo club (`/demo?as=member`, `?as=new`)
with Playwright: a drawn cursor, a title card and burned-in captions, no audio.
`media/member-walkthrough.mp4` is one narrated run through the whole site as a new
member. Re-record after a tab changes so the videos match the app.

Frames come from Chrome's screencast at 2x and are encoded with ffmpeg, so the
text stays sharp (Playwright's own video recorder encodes at a low fixed bitrate).

```
# serve the site with the vercel.json rewrites (any server that maps /demo to index.html)
node serve.js ../.. 8791                        # or: npx serve -s -l 8791 ../..
npm i playwright && npx playwright install chromium
echo "$(node -e "console.log(require('playwright').chromium.executablePath())")" > exe.txt

node clips.js out                    # all clips, or: node clips.js out calendar homework
./encode.sh out ../../media/demos    # 1920x1200 H.264 + a poster .jpg per clip

node walkthrough.js out              # the narrated walkthrough, about 3 minutes in real time
./walkthrough.sh out                 # muxes walkthrough-narration.m4a -> media/member-walkthrough.mp4
```

`BASE` (default `http://127.0.0.1:8791`) and `PLAYWRIGHT` (a path to a playwright
package) can be set in the environment.

- `clips.js` holds one entry per clip (`CLIPS`): which demo view, which tab, and
  the steps with their captions.
- `walkthrough.js` starts each part on a cue point (`CUE`, seconds) taken from the
  narration, and prints `late by …` if a part overruns its cue. Keep those under
  about 1.5 s; record on an otherwise idle machine.
- `walkthrough-narration.m4a` is the ElevenLabs narration (voice "Rodney - Clear
  Educator", `eleven_v4`, flow `KnfUbsdLteI0re72cVtT`). The opening line was
  re-voiced on Oct 13 2026 for org.deanzapbl.com and the removed join code. To
  change a line, re-voice it there and splice it in at the same time.

After re-recording, bump `DEMO_V` in `index.html` and the `?v=` on the walkthrough
in `orientation.html`: `/media` is cached for a day, so the old video would keep
showing at the same address. Update the lengths shown beside each clip too.

## Narrated how-to videos for the member email

`howto.js` records two short narrated videos with the real site running in a phone
on `stage.html`: joining (sign up with Google, the join code, the sign-up form, then
the add-to-home-screen steps from `media/demos/homescreen.mp4`, voiced) and handing
in homework. The voice is Kokoro-82M, run locally: free, no ElevenLabs credits.

They show the real join code, and this repo is public, so the code is passed in
and the videos go to `email-videos/` (ignored by git and never deployed). Send them
to members by email or a Drive link; do not put them in `media/`.

```
node serve.js ../.. 8791
JOIN_CODE=XXXX node howto.js lines out-howto              # the narration script
~/jarvis/.venv/bin/python howto-voice.py out-howto         # any env with kokoro + soundfile
JOIN_CODE=XXXX node howto.js record out-howto              # about 2 minutes, in real time
python3 howto-build.py out-howto ../../email-videos        # encode, voice and join the parts
```

Each step lasts as long as its line, and `record` prints `ran over its line` when an
action takes longer. Change the words in `howto.js` (`say` is spoken, `t`/`sub` are
shown) and run all four steps again.
