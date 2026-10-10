// Original 8-bit soundtrack for cat-mv.html (冬冬和我们), synthesised from scratch.
//
//   node cat-mv-music.mjs   -> out/cat-mv.wav
//
// 120 BPM, 32 bars (64 s), C - G - Am - F. Square-wave lead and arpeggio,
// triangle bass, noise drums: the classic NES-style voice set. The arrangement
// follows the eight 4-bar scenes of the video.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100, BPM = 120, BEAT = 60 / BPM, BAR = BEAT * 4, BARS = 32;
const DUR = BARS * BAR, SCENE = BAR * 4;
const N = Math.ceil((DUR + 1) * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const echoBus = new Float32Array(N);

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function add(i, v, pan) {
  if (i < 0 || i >= N) return;
  L[i] += v * Math.cos((pan + 1) * Math.PI / 4);
  R[i] += v * Math.sin((pan + 1) * Math.PI / 4);
}

// One pitched note with an ADSR envelope.
function tone(t, dur, midi, { wave = 'square', duty = 0.5, vol = 0.1, pan = 0,
  a = 0.005, d = 0.08, s = 0.6, r = 0.06, vib = 0, echo = 0 } = {}) {
  const f = mtof(midi);
  const start = Math.round(t * SR), len = Math.round((dur + r) * SR);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    let env = tt < a ? tt / a : tt < a + d ? 1 - (1 - s) * (tt - a) / d : s;
    if (tt > dur) env *= Math.max(0, 1 - (tt - dur) / r);
    const fv = f * (1 + (vib && tt > 0.18 ? vib * Math.sin(2 * Math.PI * 5.5 * tt) : 0));
    ph += fv / SR; ph -= Math.floor(ph);
    const v = (wave === 'square' ? (ph < duty ? 1 : -1) : 4 * Math.abs(ph - 0.5) - 1) * env * vol;
    add(start + i, v, pan);
    if (echo && start + i < N) echoBus[start + i] += v * echo;
  }
}

// Deterministic 15-bit LFSR noise, like the NES noise channel.
let lfsr = 1;
const noise = () => { const b = ((lfsr >> 0) ^ (lfsr >> 1)) & 1; lfsr = (lfsr >> 1) | (b << 14); return (lfsr & 1) ? 1 : -1; };

function kick(t, vol = 0.55) {
  const start = Math.round(t * SR), len = Math.round(0.22 * SR);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    ph += (45 + 120 * Math.exp(-tt * 30)) / SR;
    add(start + i, Math.sin(2 * Math.PI * ph) * Math.exp(-tt * 14) * vol, 0);
  }
}
function snare(t, vol = 0.2) {
  const start = Math.round(t * SR), len = Math.round(0.18 * SR);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const v = noise() * Math.exp(-tt * 22) + 0.5 * Math.sin(2 * Math.PI * 190 * tt) * Math.exp(-tt * 40);
    add(start + i, v * vol, 0.1);
  }
}
function hat(t, vol = 0.05, decay = 70) {
  const start = Math.round(t * SR), len = Math.round(0.08 * SR);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const n = noise(), hp = n - prev; prev = n;   // crude high-pass
    add(start + i, hp * 0.5 * Math.exp(-i / SR * decay) * vol, -0.2);
  }
}
function crash(t, vol = 0.1) {
  const start = Math.round(t * SR), len = Math.round(1.6 * SR);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const n = noise(), hp = n - prev; prev = n;
    add(start + i, hp * 0.5 * Math.exp(-i / SR * 2.5) * vol, 0.25);
  }
}
// A little chiptune "meow": a pulse wave bending up then down.
function meow(t, vol = 0.06) {
  const start = Math.round(t * SR), len = Math.round(0.42 * SR);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const tt = i / SR, k = tt / 0.42;
    const f = 620 + 520 * Math.sin(Math.PI * Math.min(1, k * 1.3)) + 18 * Math.sin(2 * Math.PI * 30 * tt);
    ph += f / SR; ph -= Math.floor(ph);
    const env = Math.min(1, tt / 0.03) * (1 - k);
    add(start + i, (ph < 0.25 ? 1 : -1) * env * vol, 0.2);
  }
}
// Car horn: two short, slightly detuned square blips.
function honk(t) {
  for (const dt of [0, 0.22]) {
    tone(t + dt, 0.13, 81, { duty: 0.5, vol: 0.06, pan: -0.5, a: 0.002, d: 0.02, s: 0.9, r: 0.02 });
    tone(t + dt, 0.13, 77, { duty: 0.25, vol: 0.05, pan: -0.5, a: 0.002, d: 0.02, s: 0.9, r: 0.02 });
  }
}

// ---------- the song ----------
const CHORDS = {
  C: { tones: [60, 64, 67, 72], bass: 48 },
  G: { tones: [59, 62, 67, 71], bass: 43 },
  Am: { tones: [57, 60, 64, 69], bass: 45 },
  F: { tones: [57, 60, 65, 69], bass: 41 },
};
const chordAt = bar => bar === BARS - 1 ? 'C' : ['C', 'G', 'Am', 'F'][bar % 4];

// [midi or null, beats]; each phrase is 4 bars = 16 beats.
const MEL_A = [
  [76, 1], [74, .5], [72, .5], [74, 1], [76, 1],
  [74, 1], [71, 1], [67, 1.5], [null, .5],
  [72, 1], [76, 1], [81, 1], [79, .5], [76, .5],
  [77, 1], [76, .5], [74, .5], [72, 1.5], [null, .5],
];
const MEL_B = [
  [79, 1.5], [76, .5], [79, 1], [84, 1],
  [83, 1.5], [79, .5], [74, 2],
  [81, 1], [84, 1], [83, 1], [81, 1],
  [79, 1], [77, .5], [76, .5], [77, 1], [79, 1],
];
const OUTRO = [...MEL_A.slice(0, 14), [72, 4]];

function phrase(bar0, notes, opts, transpose = 0) {
  let beat = 0;
  for (const [m, len] of notes) {
    if (m !== null) {
      tone(bar0 * BAR + beat * BEAT, len * BEAT * 0.92, m + transpose,
        { ...opts, vib: len >= 1 ? 0.006 : 0 });
    }
    beat += len;
  }
}

for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR;
  const ch = CHORDS[chordAt(bar)];

  // arpeggio: everywhere, fading in over the intro
  const arpVol = bar < 4 ? 0.06 + bar * 0.005 : 0.07;
  const pattern = bar === BARS - 1 ? [0, 1, 2, 3] : [0, 1, 2, 3, 2, 1, 2, 1];
  pattern.forEach((idx, i) => {
    const len = bar === BARS - 1 ? BEAT : BEAT / 2;
    tone(t0 + i * len, len * 0.8, ch.tones[idx] + 12,
      { duty: 0.125, vol: arpVol, pan: -0.35, d: 0.1, s: 0.3 });
  });

  // bass: from bar 4. Gentle quarters first, driving eighths once the beat starts.
  if (bar >= 4 && bar < BARS - 1) {
    const driving = (bar >= 8 && bar < 16) || (bar >= 20 && bar < 28);
    const steps = driving ? 8 : 4, len = BAR / steps;
    for (let i = 0; i < steps; i++) {
      const m = ch.bass + (driving && i % 4 === 2 ? 12 : 0);
      tone(t0 + i * len, len * 0.7, m, { wave: 'tri', vol: driving ? 0.24 : 0.17, d: 0.05, s: 0.8 });
    }
  }
  if (bar === BARS - 1) tone(t0, BAR, ch.bass, { wave: 'tri', vol: 0.26, r: 0.8 });

  // drums
  const light = bar >= 8 && bar < 16;
  const full = bar >= 20 && bar < 28;
  if (light) {
    kick(t0); kick(t0 + 2 * BEAT);
    for (let i = 0; i < 8; i++) hat(t0 + i * BEAT / 2, i % 2 ? 0.035 : 0.05);
  }
  if (full) {
    kick(t0); kick(t0 + 2 * BEAT); kick(t0 + 2.5 * BEAT, 0.4);
    snare(t0 + BEAT); snare(t0 + 3 * BEAT);
    for (let i = 0; i < 8; i++) hat(t0 + i * BEAT / 2, i % 2 ? 0.06 : 0.04, i % 2 ? 30 : 70);
    if (bar % 4 === 3) [3.25, 3.5, 3.75].forEach(b => snare(t0 + b * BEAT, 0.13));
  }
  if (bar === 20 || bar === BARS - 1) crash(t0);
  if (bar >= 28 && bar < BARS - 1) kick(t0, 0.4);
}

// melodies, phrase by phrase
const lead = { duty: 0.5, vol: 0.1, pan: 0.15, echo: 0.35 };
phrase(8, MEL_A, lead);
phrase(12, MEL_A, lead);
phrase(16, MEL_A, { ...lead, duty: 0.25, vol: 0.075 }, -12);   // quiet night verse, an octave down
phrase(20, MEL_B, lead);
phrase(24, MEL_B, lead);
phrase(24, MEL_B, { duty: 0.25, vol: 0.05, pan: -0.3 }, -12);  // doubled an octave below
phrase(28, OUTRO, { ...lead, vol: 0.09 });

// sound effects
honk(SCENE + 3.0);              // the cattery van pulls up (scene 2)
meow(SCENE + 6.4);              // the kitten peeks out of the carrier
meow(SCENE * 2 + 1.1, 0.05);    // ...and steps out to meet the couple (scene 3)

// ---------- mix down ----------
// echo on the lead: 3/8-note delay with feedback
const delay = Math.round(BEAT * 0.75 * SR);
for (let i = delay; i < N; i++) echoBus[i] += echoBus[i - delay] * 0.35;
for (let i = 0; i < N; i++) { L[i] += echoBus[i] * 0.8; R[i] += echoBus[i] * 0.8; }

const total = Math.round(DUR * SR);
const pcm = Buffer.alloc(44 + total * 4);
const a = 1 - Math.exp(-2 * Math.PI * 9000 / SR);   // gentle low-pass to tame aliasing
let yl = 0, yr = 0;
for (let i = 0; i < total; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.05, (DUR - t) / 3);
  yl += a * (L[i] - yl); yr += a * (R[i] - yr);
  const l = Math.tanh(yl * 1.2) * fade, r = Math.tanh(yr * 1.2) * fade;
  pcm.writeInt16LE(Math.round(l * 30000), 44 + i * 4);
  pcm.writeInt16LE(Math.round(r * 30000), 46 + i * 4);
}
// WAV header: PCM, stereo, 16-bit
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + total * 4, 4); pcm.write('WAVE', 8);
pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(total * 4, 40);

const out = join(dirname(fileURLToPath(import.meta.url)), 'out', 'cat-mv.wav');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, pcm);
console.log(`wrote ${out} (${DUR}s)`);
