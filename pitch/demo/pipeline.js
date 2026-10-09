// Shared audio pipeline for the demo page (main checker and 最小対で練習):
//   file → decode → pickUtterance   (loadUtterance)
//   samples → normalize → extractF0 (pitchy) → judge   (judgeSamples)
//   samples → speaker   (play, click-started only)
// Everything runs in the page; nothing is fetched or sent anywhere.

import { PitchDetector } from '../vendor/pitchy.js';
import { extractF0, normalize } from '../src/f0.js';
import { judge } from '../src/judge.js';
import { decodeAudioFile, pickUtterance } from './decode.js';

export const SR = 16000;

/**
 * Decode a picked/dropped audio file and cut out the utterance (≤ 4 s).
 * @returns {Promise<{samples:Float32Array, rate:number, duration:number, start:number, end:number, decoder:string}>}
 *   decoder 'js-aac' / 'js-alac': the browser could not decode the m4a; the built-in decoder did.
 */
export async function loadUtterance(file) {
  const buf = await file.arrayBuffer();
  const { samples, rate, duration, decoder } = await decodeAudioFile(buf);
  const u = pickUtterance(samples, rate, { maxSec: 4 });
  return { samples: u.samples, rate, duration, start: u.start, end: u.end, decoder };
}

/** F0 track + judgement of `samples` against word `w`. */
export function judgeSamples(samples, rate, w) {
  const tr = extractF0(PitchDetector, normalize(samples), rate);
  return { tr, r: judge(tr, w) };
}

let audioCtx = null;
/** Play mono samples (must be called from a click handler the first time). */
export function play(samples, rate) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx ??= new Ctx();
  audioCtx.resume?.();
  const b = audioCtx.createBuffer(1, samples.length, rate);
  b.getChannelData(0).set(samples);
  const src = audioCtx.createBufferSource();
  src.buffer = b;
  src.connect(audioCtx.destination);
  src.start();
}
