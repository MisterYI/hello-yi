"""Score for the 冬冬 sand film: a quiet piano lullaby, played on a real piano.

    python3 sand-music.py <Salamander Samples dir>   -> out/sand-dongdong.wav

The notes are played on the Salamander Grand Piano (Alexander Holm, CC BY 3.0,
https://github.com/sfzinstruments/SalamanderGrandPiano): real recordings of a
Yamaha C5, several velocity layers, pitch-shifted by at most 1.5 semitones.

To keep it from sounding programmed, it is performed rather than sequenced:
chords are rolled, timing and touch vary a little, phrases breathe, the
sustain pedal is changed on each bar (with its mechanical noise), and it is
heard in a small, warm room.

3/4 at 72 BPM: one bar is 2.5 s, so each 10 s tableau of the film is 4 bars.
"""

import os
import subprocess
import sys

import numpy as np

SR = 48000
BEAT = 60 / 72
BAR = BEAT * 3
DUR = 63.5
rng = np.random.default_rng(1011)

SAMPLES = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out', 'sand-dongdong.wav')


def load(name):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(SAMPLES, name + '.flac'),
                          '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


# ---------- the piano ----------
ROOTS = {'C': 0, 'D#': 3, 'F#': 6, 'A': 9}
LAYERS = [3, 6, 9, 12]
cache = {}


def sample_for(midi, layer):
    """The nearest recorded note (C, D#, F#, A in each octave) and the shift to reach midi."""
    best = None
    for name, pc in ROOTS.items():
        for octave in range(1, 8):
            m = 12 * (octave + 1) + pc
            if best is None or abs(m - midi) < abs(best[1] - midi):
                best = (f'{name}{octave}', m)
    key = (best[0], layer)
    if key not in cache:
        cache[key] = load(f'{best[0]}v{layer}')
    return cache[key], midi - best[1]


def note(buf, t, midi, vel, off):
    """Strike midi at time t with velocity vel (0..1); the damper falls at off."""
    vel = float(np.clip(vel, 0.05, 1))
    layer = LAYERS[min(3, int(vel * 4))]
    smp, shift = sample_for(midi, layer)
    ratio = 2 ** (shift / 12)
    length = min(len(smp) / ratio, (off - t + 0.6) * SR)
    n = int(length)
    pos = np.arange(n) * ratio
    out = np.stack([np.interp(pos, np.arange(len(smp)), smp[:, c]) for c in range(2)], axis=1)
    # the damper: a quick but not instant fade after release
    rel = int(max(0, (off - t)) * SR)
    if rel < n:
        fade = np.exp(-np.arange(n - rel) / (0.16 * SR))
        out[rel:] *= fade[:, None]
    gain = 0.35 + 0.65 * vel
    if t < 0:
        out, t = out[int(-t * SR):], 0.0
    start = int(t * SR)
    end = min(len(buf), start + len(out))
    if start < len(buf):
        buf[start:end] += out[:end - start] * gain


# ---------- the score ----------
# chords: (bass, [inner tones]) as MIDI; F major
CH = {
    'F': (41, [48, 57]), 'C/E': (40, [48, 55]), 'Dm': (38, [45, 53]), 'Bb': (34, [41, 50]),
    'Gm7': (43, [50, 53]), 'C': (36, [43, 52]), 'F/A': (45, [48, 53]), 'Bbadd9': (34, [41, 48, 50]),
}
A = ['F', 'C/E', 'Dm', 'Bb']
B = ['Gm7', 'C', 'F/A', 'Bb']
NIGHT = ['Dm', 'Bb', 'F', 'C']
# per tableau: (progression, left-hand style, melody)
# melody: per bar, a list of (midi, beats); None is a rest
M1 = [[(69, 2), (72, 1)], [(67, 2), (64, 1)], [(65, 1), (69, 1), (74, 1)], [(72, 3)]]
M2 = [[(70, 2), (69, 1)], [(67, 1), (72, 1), (76, 1)], [(77, 2), (76, 1)], [(74, 2), (72, 1)]]
INTRO = [[(84, 3)], [None], [(81, 3)], [(86, 2), (84, 1)]]
NIGHT_M = [[None], [(74, 2), (72, 1)], [(69, 3)], [(67, 2), (64, 1)]]
up = lambda m, k: [[(p + k, d) if p else (None, d) for p, d in bar] if bar != [None] else [None] for bar in m]
SCENES = [
    (A, 'rolled', INTRO, 0.30),
    (NIGHT, 'waltz', NIGHT_M, 0.38),
    (A, 'waltz', M1, 0.48),
    (B, 'waltz', M2, 0.52),
    (A, 'full', up(M1, 12), 0.58),
    (B, 'waltz', [M2[0], M2[1], [(77, 3)], [None]], 0.46),
]

buf = np.zeros((int((DUR + 2) * SR), 2), dtype=np.float64)
pedal_changes = []


def humanize(t, amount=0.012):
    return t + rng.normal(0, amount)


for s, (prog, style, mel, dyn) in enumerate(SCENES):
    for b in range(4):
        bar_t = (s * 4 + b) * BAR
        chord = prog[b]
        bass, inner = CH[chord]
        off = bar_t + BAR + 0.06            # the pedal is changed just after the next downbeat
        pedal_changes.append(bar_t)
        last_bar = s == len(SCENES) - 1 and b == 3
        # phrase shape: a swell towards the third bar, easing at the end
        shape = [0.92, 1.0, 1.06, 0.9][b]
        v = dyn * shape
        if style == 'rolled':
            for k, m in enumerate([bass, bass + 12] + inner):
                note(buf, humanize(bar_t + k * 0.055, 0.006), m, v * (0.85 - k * 0.06), off)
        else:
            beats = [bass, inner[0], inner[-1]]
            if style == 'full':
                beats = [bass, inner[0] + 0, inner[-1] + 0]
                note(buf, humanize(bar_t + 0.03, 0.006), bass + 12, v * 0.55, off)
            for k, m in enumerate(beats):
                t = bar_t + k * BEAT
                if k == 2 and b == 3:
                    t += 0.05             # the phrase breathes before the next one
                note(buf, humanize(t), m, v * (0.78 if k == 0 else 0.6), off)
        # melody: slightly ahead of the beat, a touch louder than the accompaniment
        beat = 0
        bar_mel = mel[b]
        if bar_mel != [None]:
            for p, d in bar_mel:
                if p:
                    t = humanize(bar_t + beat * BEAT - 0.012, 0.01)
                    note(buf, t, p, v * 1.18 + rng.normal(0, 0.03), off + (d - 1) * 0.0)
                    if style == 'full':
                        note(buf, t + 0.004, p - 12, v * 0.8, off)
                beat += d

# the ending: once everything but the moon is wiped away, a rolled F add9 rings out
END_T = 60.0
for k, m in enumerate([29, 41, 48, 55, 57, 60, 65, 69, 79]):
    note(buf, END_T + k * 0.07 + rng.normal(0, 0.008), m, 0.36 - k * 0.012, DUR + 1)
pedal_changes.append(END_T - 0.05)

# the sustain pedal: a soft thump each time it goes down
pedal_down = [load('pedalD1'), load('pedalD2')]
pedal_up = [load('pedalU1'), load('pedalU2')]
for i, t in enumerate(pedal_changes):
    for smp, dt in ((pedal_up[i % 2], -0.04), (pedal_down[i % 2], 0.08)):
        start = int(max(0, t + dt) * SR)
        end = min(len(buf), start + len(smp))
        buf[start:end] += smp[:end - start] * 0.22

# ---------- the room ----------
# a small warm room: a few early reflections and a dark, decorrelated tail
n_ir = int(2.0 * SR)
tt = np.arange(n_ir) / SR
ir = np.zeros((n_ir, 2))
for c in range(2):
    tail = rng.normal(0, 1, n_ir) * np.exp(-tt / 0.42)
    # darken the tail: a one-pole low-pass, sweeping lower as it decays
    y, out = 0.0, np.empty(n_ir)
    for i in range(n_ir):
        a = 0.35 * np.exp(-tt[i] / 0.9) + 0.04
        y += a * (tail[i] - y)
        out[i] = y
    ir[:, c] = out
    for d, g in ((0.011 + 0.002 * c, 0.5), (0.019 - 0.002 * c, 0.35), (0.027 + 0.003 * c, 0.25)):
        ir[int(d * SR), c] += g
ir[:int(0.008 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=0)).max()
size = 1 << int(np.ceil(np.log2(len(buf) + n_ir)))
wet = np.stack([np.fft.irfft(np.fft.rfft(buf[:, c], size) * np.fft.rfft(ir[:, c], size), size)[:len(buf)] for c in range(2)], axis=1)
mix = buf * 0.86 + wet * 0.24

# fade with the light box at the end, and a faint room tone underneath
mix = mix[:int(DUR * SR)]
t = np.arange(len(mix)) / SR
mix *= np.clip((DUR - t) / 2.5, 0, 1)[:, None] ** 1.5
mix *= np.clip(t / 0.05, 0, 1)[:, None]
room = rng.normal(0, 1, (len(mix), 2))
for c in range(2):
    room[:, c] = np.convolve(room[:, c], np.ones(64) / 64, mode='same')
mix += room * 10 ** (-62 / 20)
peak = np.abs(mix).max()
mix = mix / peak * 10 ** (-1.5 / 20)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', OUT], input=pcm.tobytes(), check=True)
print('wrote', OUT, f'({DUR}s)')
