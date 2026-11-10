"""Builds the narrated member walkthrough from tour.js's recording (python3 + ffmpeg).
Usage: python3 tour-build.py <outdir> <mediadir>
Encodes the 2x frames at 1920x1080 and places each spoken line at the moment
its step began, then writes member-walkthrough.mp4 and its poster .jpg."""
import json, os, subprocess, sys

OUT, DEST = sys.argv[1], sys.argv[2]
LEAD = 0.15
rec = os.path.join(OUT, 'rec')
marks = json.load(open(os.path.join(rec, 'marks.json')))

def ff(*a):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *a], check=True)

def length(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))

silent = os.path.join(OUT, 'tour-v.mp4')
ff('-f', 'concat', '-safe', '0', '-i', os.path.join(rec, 'f', 'list.txt'),
   '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p',
   '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-tune', 'animation', '-an', silent)
total = length(silent)

args, parts = [], []
for i, m in enumerate(marks['marks']):
    args += ['-i', os.path.join(OUT, 'voice', m['id'] + '.wav')]
    ms = int(round((m['at'] + LEAD) * 1000))
    parts.append(f'[{i}:a]aresample=48000,adelay={ms}|{ms}[a{i}]')
n = len(marks['marks'])
graph = ';'.join(parts) + ';' + ''.join(f'[a{i}]' for i in range(n)) + \
    f'amix=inputs={n}:normalize=0,apad,atrim=0:{total:.3f},loudnorm=I=-16:TP=-1.5:LRA=7[out]'
voice = os.path.join(OUT, 'tour-a.m4a')
ff(*args, '-filter_complex', graph, '-map', '[out]', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', voice)

dest = os.path.join(DEST, 'member-walkthrough.mp4')
ff('-i', silent, '-i', voice, '-c', 'copy', '-shortest', '-movflags', '+faststart', dest)
ff('-ss', '16', '-i', dest, '-frames:v', '1', '-q:v', '3', os.path.join(DEST, 'member-walkthrough.jpg'))
ff('-i', dest, '-vf', 'fps=1/6,scale=480:-2,tile=5x5', '-frames:v', '1', os.path.join(OUT, 'tour-sheet.jpg'))
print(f'member-walkthrough.mp4 {length(dest):.1f}s {os.path.getsize(dest) // 1024} KB')
