// Pure-JS fallback decoder for .m4a / .mp4 audio (AAC-LC, and Apple Lossless),
// for browsers whose decodeAudioData cannot handle them (e.g. open-source
// Chromium builds have no AAC). No network, workers or WebAssembly: everything
// runs synchronously on the main thread (≈ 5–10 ms per second of audio in V8).

import { demuxMp4, looksLikeMp4 } from './mp4.js';
import { AacDecoder } from './aac.js';
import { AlacDecoder } from './alac.js';

export { looksLikeMp4 };

/** Average channels into one array (all the same length). */
function mix(chs) {
  if (chs.length === 1) return chs[0];
  const out = new Float32Array(chs[0].length);
  for (const c of chs) for (let i = 0; i < out.length; i++) out[i] += c[i];
  for (let i = 0; i < out.length; i++) out[i] /= chs.length;
  return out;
}

/**
 * Decode an MP4/M4A file's first audio track to mono float samples.
 * The edit list's priming skip and length are applied, as browsers do.
 * HE-AAC is decoded as its AAC-LC core (half the nominal rate; `sbr: true`).
 * @param {ArrayBuffer|Uint8Array} arrayBuffer
 * @returns {{ samples: Float32Array, rate: number, channels: number, codec: 'aac'|'alac', sbr: boolean }}
 */
export function decodeM4A(arrayBuffer) {
  const track = demuxMp4(arrayBuffer);
  let dec, codec;
  if (track.codec === 'mp4a') {
    if (track.objectType === 0x69 || track.objectType === 0x6b) throw new Error('m4a: MP3 inside MP4 is not supported by the built-in decoder');
    if (!track.asc || !track.asc.length) throw new Error('m4a: missing AudioSpecificConfig');
    dec = new AacDecoder(track.asc);
    codec = 'aac';
  } else if (track.codec === 'alac') {
    dec = new AlacDecoder(track.cookie);
    codec = 'alac';
  } else throw new Error(`m4a: unsupported codec '${track.codec}'`);
  if (!track.frames.length) throw new Error('m4a: the audio track is empty');

  const chunks = [];
  let failed = 0, total = 0, last = 1024;
  for (const frame of track.frames) {
    let pcm;
    try {
      pcm = dec.decodeFrame(frame);
    } catch (e) {
      // Conceal an isolated bad frame with silence; give up if it is not isolated.
      if (++failed > Math.max(2, track.frames.length * 0.05)) throw e;
      pcm = [];
    }
    const mono = pcm.length ? mix(pcm) : new Float32Array(last);
    last = mono.length;
    chunks.push(mono);
    total += mono.length;
  }
  if (failed === track.frames.length) throw new Error('m4a: no frame could be decoded');

  // Edit list: units are the media timescale, which for HE-AAC (or odd files)
  // may differ from the rate we decode at.
  const ratio = track.timescale > 0 ? dec.rate / track.timescale : 1;
  const skip = Math.min(total, Math.round(track.skip * ratio));
  const len = track.duration == null ? total - skip : Math.min(total - skip, Math.round(track.duration * ratio));
  const samples = new Float32Array(Math.max(0, len));
  let w = 0, pos = 0;
  for (const c of chunks) {
    const a = Math.max(0, skip - pos), b = Math.min(c.length, skip + len - pos);
    if (b > a) { samples.set(c.subarray(a, b), w); w += b - a; }
    pos += c.length;
  }
  return { samples, rate: dec.rate, channels: dec.channels, codec, sbr: !!dec.sbr };
}
