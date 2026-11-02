"""Puts the narrated how-to videos together (python3, stdlib + ffmpeg).
Usage: python3 howto-build.py <outdir> <destdir>
  <outdir>   where howto.js recorded and howto-voice.py voiced
  <destdir>  gets join-the-org-system.mp4 and hand-in-homework.mp4 (+ posters);
             use ../../email-videos: they show the join code, so never media/
Each recorded part is encoded from its 2x frames, with every line of narration
placed at the moment its step began. The home-screen part is
media/demos/homescreen.mp4 cut at its own steps and voiced, each stretch held on
its last frame for as long as its line needs."""
import json, os, subprocess, sys

OUT, DEST = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
HOMECLIP = os.path.join(HERE, '..', '..', 'media', 'demos', 'homescreen.mp4')
VOICE = os.path.join(OUT, 'voice')
DUR = json.load(open(os.path.join(VOICE, 'durations.json')))
LEAD = 0.15        # the line starts this long after its step does
VIDEO = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-r', '30']
AUDIO = ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2']
os.makedirs(DEST, exist_ok=True)

def ff(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)

def length(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))

def lines_track(placed, total, dest):
    """placed: [(wav, start seconds)] -> one track `total` seconds long."""
    args, parts = [], []
    for i, (wav, at) in enumerate(placed):
        args += ['-i', wav]
        ms = int(round(at * 1000))
        parts.append(f'[{i}:a]aresample=48000,adelay={ms}|{ms}[a{i}]')
    mix = ''.join(f'[a{i}]' for i in range(len(placed)))
    graph = ';'.join(parts) + f';{mix}amix=inputs={len(placed)}:normalize=0,apad,atrim=0:{total:.3f},loudnorm=I=-16:TP=-1.5:LRA=7[out]'
    ff(*args, '-filter_complex', graph, '-map', '[out]', *AUDIO, dest)

def recorded(part):
    """A stage recording, encoded and voiced."""
    d = os.path.join(OUT, part)
    marks = json.load(open(os.path.join(d, 'marks.json')))
    silent = os.path.join(OUT, part + '-v.mp4')
    ff('-f', 'concat', '-safe', '0', '-i', os.path.join(d, 'f', 'list.txt'),
       '-vf', 'scale=1920:1080:flags=lanczos', *VIDEO, '-an', silent)
    total = length(silent)
    voice = os.path.join(OUT, part + '-a.m4a')
    lines_track([(os.path.join(VOICE, m['id'] + '.wav'), m['at'] + LEAD) for m in marks['marks']], total, voice)
    done = os.path.join(OUT, part + '.mp4')
    ff('-i', silent, '-i', voice, '-c', 'copy', '-shortest', done)
    return done

def home_part():
    """homescreen.mp4, step by step, voiced."""
    spans = json.loads(subprocess.check_output(['node', '-e',
        "console.log(JSON.stringify(require(process.argv[1]).HOME))", os.path.join(HERE, 'howto.js')]))
    segs = []
    for i, sp in enumerate(spans):
        wav = os.path.join(VOICE, f'home-{i}.wav')
        need = max(sp['to'] - sp['from'], DUR[f'home-{i}'] + LEAD + 0.45)
        hold = need - (sp['to'] - sp['from'])
        seg = os.path.join(OUT, f'home-{i}.mp4')
        ff('-ss', str(sp['from']), '-to', str(sp['to']), '-i', HOMECLIP, '-i', wav,
           '-filter_complex', f'[0:v]fps=30,tpad=stop_mode=clone:stop_duration={hold:.3f},scale=1920:1080[v];'
           f'[1:a]aresample=48000,adelay={int(LEAD*1000)}|{int(LEAD*1000)},apad,atrim=0:{need:.3f}[a]',
           '-map', '[v]', '-map', '[a]', *VIDEO, *AUDIO, '-t', f'{need:.3f}', seg)
        segs.append(seg)
    return concat(segs, os.path.join(OUT, 'home.mp4'), norm=True)

def concat(parts, dest, norm=False):
    args, ins = [], ''
    for i, p in enumerate(parts):
        args += ['-i', p]
        ins += f'[{i}:v][{i}:a]'
    graph = f'{ins}concat=n={len(parts)}:v=1:a=1[v][a0]'
    graph += ';[a0]loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000[a]' if norm else ';[a0]anull[a]'
    ff(*args, '-filter_complex', graph, '-map', '[v]', '-map', '[a]', *VIDEO, *AUDIO, '-movflags', '+faststart', dest)
    return dest

def poster(video, at, dest):
    ff('-ss', str(at), '-i', video, '-frames:v', '1', '-q:v', '3', dest)

join = concat([recorded('join'), home_part(), recorded('join-end')], os.path.join(DEST, 'join-the-org-system.mp4'))
hw = concat([recorded('homework'), recorded('homework-end')], os.path.join(DEST, 'hand-in-homework.mp4'))
poster(join, 1.0, os.path.join(DEST, 'join-the-org-system.jpg'))
poster(hw, 1.0, os.path.join(DEST, 'hand-in-homework.jpg'))
for v in (join, hw):
    print(f'{os.path.basename(v):28s} {length(v):5.1f}s {os.path.getsize(v) // 1024:6d} KB')
