"""Voices the how-to lines locally with Kokoro-82M: free, offline, no ElevenLabs
credits. Usage: python howto-voice.py <outdir> [voice]
Reads <outdir>/lines.json (from `node howto.js lines <outdir>`), writes one
24 kHz WAV per line to <outdir>/voice/ and their lengths to durations.json.
Needs the kokoro and soundfile packages (Kokoro downloads its model once)."""
import json, os, sys
import soundfile as sf
from kokoro import KPipeline

out = sys.argv[1]
voice = sys.argv[2] if len(sys.argv) > 2 else 'af_heart'
lines = json.load(open(os.path.join(out, 'lines.json')))
vdir = os.path.join(out, 'voice')
os.makedirs(vdir, exist_ok=True)
pipe = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
dur = {}
for ln in lines:
    audio = []
    for _, _, a in pipe(ln['text'], voice=voice, speed=1.0):
        audio.extend(a.tolist())
    sf.write(os.path.join(vdir, ln['id'] + '.wav'), audio, 24000)
    dur[ln['id']] = round(len(audio) / 24000, 3)
    print(f"{ln['id']:16s} {dur[ln['id']]:5.1f}s  {ln['text'][:70]}")
json.dump(dur, open(os.path.join(vdir, 'durations.json'), 'w'), indent=1)
