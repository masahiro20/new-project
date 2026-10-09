// AAC-LC decoder (ISO/IEC 14496-3 subpart 4, "General Audio"), written from the
// spec for the demo's m4a fallback. It decodes raw_data_block()s as stored in
// MP4 files: SCE / CPE (common_window, M/S, intensity stereo), section data,
// scalefactors, spectral Huffman codebooks 1–11 incl. escapes, pulse data, PNS,
// TNS, and the filterbank (long / start / short / stop windows, sine and KBD
// shapes, IMDCT, overlap-add). Not supported: main-profile prediction, LTP, gain
// control (SSR), CCE, 960-sample frames. SBR / PS (HE-AAC v1/v2) extension data
// is skipped, so HE-AAC decodes as its AAC-LC core at half the output rate —
// fine for F0 tracking, which only needs < 4 kHz.
//
// Numbers follow the spec: dequantised coefficients are on a 16-bit PCM scale,
// the IMDCT carries the spec's 2/N factor, and output is divided by 32768 to give
// floats in [-1, 1] (matching ffmpeg's and browsers' float output).

import {
  SPECTRUM_LENS, SPECTRUM_CODES, SCF_LENS, SCF_CODES,
  SAMPLE_RATES, SWB_OFFSETS, TNS_MAX_BANDS_LONG, TNS_MAX_BANDS_SHORT,
} from './tables.js';

// ---- bitstream ---------------------------------------------------------------

/** MSB-first bit reader over one access unit. Reading past the end throws. */
class BitReader {
  constructor(u8) { this.u8 = u8; this.pos = 0; this.end = u8.length * 8; }
  bit() {
    if (this.pos >= this.end) throw new Error('aac: frame data overrun');
    const p = this.pos++;
    return (this.u8[p >> 3] >> (7 - (p & 7))) & 1;
  }
  /** Read n ≤ 32 bits as an unsigned number. */
  bits(n) {
    if (this.pos + n > this.end) throw new Error('aac: frame data overrun');
    let v = 0, p = this.pos;
    while (n > 0) {
      const off = p & 7, avail = 8 - off, take = avail < n ? avail : n;
      v = v * (1 << take) + ((this.u8[p >> 3] >> (avail - take)) & ((1 << take) - 1));
      p += take; n -= take;
    }
    this.pos = p;
    return v;
  }
  skip(n) { this.pos += n; if (this.pos > this.end) throw new Error('aac: frame data overrun'); }
  align() { this.pos = (this.pos + 7) & ~7; }
}

/**
 * A Huffman code as a binary trie in an Int32Array: node i has children at
 * [2i, 2i+1]; a value v < 0 is a leaf for symbol -v-1, 0 means "no such code".
 */
function buildTrie(codes, lens) {
  let nodes = 1;
  const t = new Int32Array(2 * 2 * codes.length);
  for (let s = 0; s < codes.length; s++) {
    let node = 0;
    for (let b = lens[s] - 1; b >= 0; b--) {
      const bit = (codes[s] >>> b) & 1, slot = 2 * node + bit;
      if (b === 0) t[slot] = -s - 1;
      else { if (t[slot] === 0) t[slot] = nodes++; node = t[slot]; }
    }
  }
  return t;
}

function readHuff(br, trie) {
  let node = 0;
  for (;;) {
    const next = trie[2 * node + br.bit()];
    if (next < 0) return -next - 1;
    if (next === 0) throw new Error('aac: invalid Huffman code');
    node = next;
  }
}

let TRIES = null; // built on first use: [scf, cb1..cb11]
function tries() {
  if (!TRIES) TRIES = [buildTrie(SCF_CODES, SCF_LENS), ...SPECTRUM_CODES.map((c, i) => buildTrie(c, SPECTRUM_LENS[i]))];
  return TRIES;
}

// ---- constants -----------------------------------------------------------------

const ONLY_LONG = 0, LONG_START = 1, EIGHT_SHORT = 2, LONG_STOP = 3;
const ZERO_HCB = 0, ESC_HCB = 11, NOISE_HCB = 13, INTENSITY_HCB2 = 14, INTENSITY_HCB = 15;
const ID_SCE = 0, ID_CPE = 1, ID_CCE = 2, ID_LFE = 3, ID_DSE = 4, ID_PCE = 5, ID_FIL = 6, ID_END = 7;
const MAX_SFB = 64; // row stride for per-(group, band) arrays

/** |q|^(4/3) for the largest legal quantised value (8191). */
const POW43 = new Float64Array(8192);
for (let i = 0; i < 8192; i++) POW43[i] = Math.pow(i, 4 / 3);

/** Map an explicit sample rate to the nearest samplingFrequencyIndex (spec Table 4.82). */
function rateIndex(rate) {
  const lim = [92017, 75132, 55426, 46009, 37566, 27713, 23004, 18783, 13856, 11502, 9391, 0];
  return lim.findIndex((l) => rate >= l);
}

// ---- windows and IMDCT -------------------------------------------------------------

function sineWindow(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = Math.sin((Math.PI / n) * (i + 0.5));
  return w;
}

function besselI0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 50; k++) { term *= (x / (2 * k)) ** 2; sum += term; if (term < sum * 1e-12) break; }
  return sum;
}

/** Kaiser-Bessel-derived window of length n (spec 4.6.11.3.2). */
function kbdWindow(n, alpha) {
  const half = n / 2;
  const k = new Float64Array(half + 1);
  let total = 0;
  for (let i = 0; i <= half; i++) {
    const r = (i - n / 4) / (n / 4);
    k[i] = besselI0(Math.PI * alpha * Math.sqrt(Math.max(0, 1 - r * r)));
    total += k[i];
  }
  const w = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < half; i++) {
    acc += k[i];
    w[i] = Math.sqrt(acc / total);
    w[n - 1 - i] = w[i];
  }
  return w;
}

let WINDOWS = null; // [shape 0 = sine, shape 1 = KBD] × { long, short }
function windows() {
  if (!WINDOWS) {
    WINDOWS = [
      { long: sineWindow(2048), short: sineWindow(256) },
      { long: kbdWindow(2048, 4), short: kbdWindow(256, 6) },
    ];
  }
  return WINDOWS;
}

/** In-place iterative radix-2 complex FFT (forward, e^{-i2πnk/L}). */
function makeFft(L) {
  const bits = Math.log2(L);
  const rev = new Uint32Array(L);
  for (let i = 0; i < L; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(L / 2), sin = new Float64Array(L / 2);
  for (let i = 0; i < L / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / L); sin[i] = -Math.sin((2 * Math.PI * i) / L); }
  return (re, im) => {
    for (let i = 0; i < L; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= L; size <<= 1) {
      const h = size >> 1, step = L / size;
      for (let s = 0; s < L; s += size) {
        for (let j = 0, t = 0; j < h; j++, t += step) {
          const a = s + j, b = a + h;
          const xr = re[b] * cos[t] - im[b] * sin[t];
          const xi = re[b] * sin[t] + im[b] * cos[t];
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  };
}

/**
 * IMDCT of M = N/2 coefficients to N samples, with the spec's 2/N scale:
 *   y[n] = 2/N Σ_k X[k] cos(2π/N (n + n0)(k + ½)),  n0 = N/4 + ½.
 * Computed as a DCT-IV, u[n] = Σ X[k] cos(π/M (n+½)(k+½)), via a 2M-point FFT
 * (pre-twiddle e^{-iπk/2M}, post-twiddle e^{-iπ(n/2+¼)/M}), then unfolded:
 * y = [u[M/2..M), −u reversed over [0..M), −u[0..M/2)].
 */
function makeImdct(N) {
  const M = N / 2, L = 2 * M;
  const fft = makeFft(L);
  const re = new Float64Array(L), im = new Float64Array(L), u = new Float64Array(M);
  const preC = new Float64Array(M), preS = new Float64Array(M), postC = new Float64Array(M), postS = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    preC[k] = Math.cos((Math.PI * k) / L); preS[k] = -Math.sin((Math.PI * k) / L);
    const phi = (Math.PI * (k / 2 + 0.25)) / M;
    postC[k] = Math.cos(phi); postS[k] = Math.sin(phi);
  }
  const scale = 2 / N;
  return (X, xOff, y) => {
    re.fill(0); im.fill(0);
    for (let k = 0; k < M; k++) { const x = X[xOff + k]; re[k] = x * preC[k]; im[k] = x * preS[k]; }
    fft(re, im);
    for (let n = 0; n < M; n++) u[n] = (re[n] * postC[n] + im[n] * postS[n]) * scale;
    const h = M / 2;
    for (let n = 0; n < h; n++) y[n] = u[h + n];
    for (let n = h; n < 3 * h; n++) y[n] = -u[3 * h - 1 - n];
    for (let n = 3 * h; n < N; n++) y[n] = -u[n - 3 * h];
  };
}

let IMDCT = null;
function imdcts() {
  if (!IMDCT) IMDCT = { long: makeImdct(2048), short: makeImdct(256) };
  return IMDCT;
}

// ---- TNS -----------------------------------------------------------------------------

/** Convert transmitted TNS coefficients to LPC a[0..order] (a[0] = 1) (spec 4.6.9.3). */
function tnsLpc(coefs, order, coefRes, compress) {
  const bitsUsed = coefRes - compress; // width of each transmitted coef
  const iqfac = ((1 << (coefRes - 1)) - 0.5) / (Math.PI / 2);
  const iqfacM = ((1 << (coefRes - 1)) + 0.5) / (Math.PI / 2);
  const parcor = new Float64Array(order);
  for (let i = 0; i < order; i++) {
    let c = coefs[i];
    if (c >= 1 << (bitsUsed - 1)) c -= 1 << bitsUsed; // sign-extend
    parcor[i] = Math.sin(c / (c >= 0 ? iqfac : iqfacM));
  }
  // Step-up recursion from reflection coefficients to direct-form LPC.
  const a = new Float64Array(order + 1), b = new Float64Array(order + 1);
  a[0] = 1;
  for (let m = 1; m <= order; m++) {
    for (let i = 1; i < m; i++) b[i] = a[i] + parcor[m - 1] * a[m - i];
    for (let i = 1; i < m; i++) a[i] = b[i];
    a[m] = parcor[m - 1];
  }
  return a;
}

/** Apply the decoder's all-pole TNS filters to one channel's spectrum (spec 4.6.9.3). */
function applyTns(ics, spec, rateIdx) {
  const short = ics.winSeq === EIGHT_SHORT;
  const maxBands = (short ? TNS_MAX_BANDS_SHORT : TNS_MAX_BANDS_LONG)[rateIdx];
  const maxOrder = short ? 7 : 12;
  const lim = Math.min(maxBands, ics.maxSfb);
  for (let w = 0; w < ics.numWindows; w++) {
    const base = w * (short ? 128 : 1024);
    let bottom = ics.numSwb;
    for (const f of ics.tns[w]) {
      const top = bottom;
      bottom = Math.max(top - f.length, 0);
      const order = Math.min(f.order, maxOrder);
      if (!order) continue;
      const a = tnsLpc(f.coefs, order, f.coefRes, f.compress);
      const start = ics.swb[Math.min(bottom, lim)], end = ics.swb[Math.min(top, lim)];
      const size = end - start;
      if (size <= 0) continue;
      const inc = f.direction ? -1 : 1;
      let p = base + (f.direction ? end - 1 : start);
      const state = new Float64Array(order); // y[n-1], y[n-2], …
      for (let n = 0; n < size; n++, p += inc) {
        let y = spec[p];
        for (let i = 0; i < order; i++) y -= a[i + 1] * state[i];
        for (let i = order - 1; i > 0; i--) state[i] = state[i - 1];
        state[0] = y;
        spec[p] = y;
      }
    }
  }
}

// ---- decoder -----------------------------------------------------------------------

/**
 * Parse an AudioSpecificConfig (spec 1.6.2.1).
 * @returns {{ objectType:number, rate:number, rateIdx:number, channelConfig:number, sbr:boolean }}
 */
export function parseAudioSpecificConfig(asc) {
  const br = new BitReader(asc);
  const aot = () => { const a = br.bits(5); return a === 31 ? 32 + br.bits(6) : a; };
  const freq = () => { const i = br.bits(4); return i === 15 ? br.bits(24) : SAMPLE_RATES[i]; };
  let objectType = aot();
  const rate = freq();
  const channelConfig = br.bits(4);
  let sbr = false;
  if (objectType === 5 || objectType === 29) { // explicit HE-AAC (SBR) / HE-AAC v2 (PS)
    sbr = true;
    freq(); // extension (SBR) rate — not used: only the core is decoded
    objectType = aot();
  }
  if (rate === undefined) throw new Error('aac: invalid sampling frequency index');
  if (objectType === 1 || objectType === 2 || objectType === 4) { // GASpecificConfig
    if (br.bits(1)) throw new Error('aac: 960-sample frames are not supported');
  } else {
    throw new Error(`aac: unsupported audio object type ${objectType} (only AAC-LC is supported)`);
  }
  return { objectType, rate, rateIdx: rateIndex(rate), channelConfig, sbr };
}

export class AacDecoder {
  /** @param {Uint8Array} asc AudioSpecificConfig bytes (from esds) */
  constructor(asc) {
    Object.assign(this, parseAudioSpecificConfig(asc));
    [this.swbLong, this.swbShort] = SWB_OFFSETS[this.rateIdx];
    this.channelState = []; // per output channel position: { overlap, prevShape }
    this.channels = 0;
    this.noiseSeed = 1;
    this.T = tries();
    this.W = windows();
    this.I = imdcts();
  }

  /** Uniform pseudo-random in [-1, 1) for PNS (an LCG; any white noise will do). */
  rand() {
    this.noiseSeed = (Math.imul(this.noiseSeed, 1664525) + 1013904223) | 0;
    return this.noiseSeed / 2147483648;
  }

  /**
   * Decode one access unit (raw_data_block).
   * @param {Uint8Array} frame
   * @returns {Float32Array[]} 1024 samples per channel, in element order
   */
  decodeFrame(frame) {
    const br = new BitReader(frame);
    const out = [];
    let ch = 0;
    for (;;) {
      if (br.end - br.pos < 3) break;
      const id = br.bits(3);
      if (id === ID_END) break;
      if (id === ID_SCE || id === ID_LFE) {
        br.bits(4); // element_instance_tag
        const ics = this.readIcs(br, false, null);
        applyTns(ics, ics.spec, this.rateIdx);
        out.push(this.synthesize(ch++, ics));
      } else if (id === ID_CPE) {
        br.bits(4);
        const common = br.bits(1);
        let info = null, msPresent = 0, msUsed = null;
        if (common) {
          info = this.readIcsInfo(br);
          msPresent = br.bits(2);
          if (msPresent === 3) throw new Error('aac: reserved ms_mask_present');
          if (msPresent) {
            msUsed = new Uint8Array(8 * MAX_SFB);
            for (let g = 0; g < info.groups.length; g++) {
              for (let sfb = 0; sfb < info.maxSfb; sfb++) msUsed[g * MAX_SFB + sfb] = msPresent === 2 ? 1 : br.bits(1);
            }
          }
        }
        const l = this.readIcs(br, !!common, info);
        const r = this.readIcs(br, !!common, info);
        if (common) this.stereo(l, r, msPresent, msUsed);
        applyTns(l, l.spec, this.rateIdx);
        applyTns(r, r.spec, this.rateIdx);
        out.push(this.synthesize(ch++, l), this.synthesize(ch++, r));
      } else if (id === ID_DSE) {
        br.bits(4);
        const align = br.bits(1);
        let n = br.bits(8);
        if (n === 255) n += br.bits(8);
        if (align) br.align();
        br.skip(8 * n);
      } else if (id === ID_FIL) {
        let n = br.bits(4);
        if (n === 15) n += br.bits(8) - 1;
        br.skip(8 * n); // SBR / PS / dynamic-range extension payloads: ignored
      } else if (id === ID_PCE) {
        this.skipPce(br);
      } else if (id === ID_CCE) {
        throw new Error('aac: coupling channel elements are not supported');
      }
    }
    this.channels = Math.max(this.channels, out.length);
    return out;
  }

  /** program_config_element(): parsed only to skip it (spec 4.4.1.1). */
  skipPce(br) {
    br.bits(4 + 2 + 4); // tag, object_type, sampling_frequency_index
    const front = br.bits(4), side = br.bits(4), back = br.bits(4), lfe = br.bits(2), assoc = br.bits(3), cc = br.bits(4);
    if (br.bits(1)) br.bits(4); // mono mixdown
    if (br.bits(1)) br.bits(4); // stereo mixdown
    if (br.bits(1)) br.bits(3); // matrix mixdown
    br.skip(5 * (front + side + back) + 4 * lfe + 4 * assoc + 5 * cc);
    br.align();
    br.skip(8 * br.bits(8)); // comment field
  }

  /** ics_info(): window sequence/shape, max_sfb, grouping (spec 4.4.2.1). */
  readIcsInfo(br) {
    br.bits(1); // ics_reserved_bit
    const winSeq = br.bits(2), winShape = br.bits(1);
    const info = { winSeq, winShape };
    if (winSeq === EIGHT_SHORT) {
      info.maxSfb = br.bits(4);
      const grouping = br.bits(7);
      info.groups = [1];
      for (let i = 6; i >= 0; i--) {
        if ((grouping >> i) & 1) info.groups[info.groups.length - 1]++;
        else info.groups.push(1);
      }
      info.numWindows = 8;
      info.swb = this.swbShort;
    } else {
      info.maxSfb = br.bits(6);
      if (br.bits(1)) throw new Error('aac: prediction (AAC Main / LTP) is not supported');
      info.groups = [1];
      info.numWindows = 1;
      info.swb = this.swbLong;
    }
    info.numSwb = info.swb.length - 1;
    if (info.maxSfb > info.numSwb) throw new Error('aac: max_sfb out of range');
    return info;
  }

  /**
   * individual_channel_stream(): side info + dequantised spectrum (spec 4.4.2.7).
   * Returns the ICS info plus { spec (1024 floats, window-major for short blocks),
   * cb, sf (per group×band), tns }. Intensity bands are left at zero for stereo().
   */
  readIcs(br, commonWindow, shared) {
    const T = this.T;
    const globalGain = br.bits(8);
    const ics = { ...(commonWindow ? shared : this.readIcsInfo(br)) };
    const { groups, maxSfb, swb, winSeq } = ics;
    const short = winSeq === EIGHT_SHORT;

    // section_data(): a codebook per (group, band).
    const cb = new Uint8Array(8 * MAX_SFB);
    const sectBits = short ? 3 : 5, sectEsc = (1 << sectBits) - 1;
    for (let g = 0; g < groups.length; g++) {
      let k = 0;
      while (k < maxSfb) {
        const c = br.bits(4);
        if (c === 12) throw new Error('aac: reserved codebook 12');
        let len = 0, incr;
        while ((incr = br.bits(sectBits)) === sectEsc) len += sectEsc;
        len += incr;
        if (k + len > maxSfb) throw new Error('aac: section overruns max_sfb');
        for (let i = 0; i < len; i++) cb[g * MAX_SFB + k + i] = c;
        k += len;
      }
    }

    // scale_factor_data(): DPCM-coded gains, intensity positions and noise energies.
    const sf = new Int32Array(8 * MAX_SFB);
    let gain = globalGain, isPos = 0, noise = globalGain - 90, firstNoise = true;
    for (let g = 0; g < groups.length; g++) {
      for (let sfb = 0; sfb < maxSfb; sfb++) {
        const i = g * MAX_SFB + sfb, c = cb[i];
        if (c === ZERO_HCB) continue;
        if (c === INTENSITY_HCB || c === INTENSITY_HCB2) sf[i] = isPos += readHuff(br, T[0]) - 60;
        else if (c === NOISE_HCB) {
          if (firstNoise) { noise += br.bits(9) - 256; firstNoise = false; }
          else noise += readHuff(br, T[0]) - 60;
          sf[i] = noise;
        } else {
          gain += readHuff(br, T[0]) - 60;
          if (gain < 0 || gain > 255) throw new Error('aac: scalefactor out of range');
          sf[i] = gain;
        }
      }
    }

    // pulse_data(): small amplitude boosts on long blocks.
    let pulses = null;
    if (br.bits(1)) {
      if (short) throw new Error('aac: pulse data in a short block');
      const n = br.bits(2) + 1;
      let k = swb[br.bits(6)];
      pulses = [];
      for (let i = 0; i < n; i++) { k += br.bits(5); pulses.push([k, br.bits(4)]); }
    }

    // tns_data()
    ics.tns = [];
    const tnsPresent = br.bits(1);
    for (let w = 0; w < ics.numWindows; w++) {
      const filters = [];
      if (tnsPresent) {
        const nFilt = br.bits(short ? 1 : 2);
        const coefRes = nFilt ? br.bits(1) + 3 : 0;
        for (let f = 0; f < nFilt; f++) {
          const length = br.bits(short ? 4 : 6), order = br.bits(short ? 3 : 5);
          const filt = { length, order, coefRes, direction: 0, compress: 0, coefs: [] };
          if (order) {
            filt.direction = br.bits(1);
            filt.compress = br.bits(1);
            const width = coefRes - filt.compress;
            for (let i = 0; i < order; i++) filt.coefs.push(br.bits(width));
          }
          filters.push(filt);
        }
      }
      ics.tns.push(filters);
    }

    if (br.bits(1)) throw new Error('aac: gain control (AAC SSR) is not supported');

    // spectral_data(): quantised values, window-major (w*128 + bin for short blocks).
    const q = new Int32Array(1024);
    const winLen = short ? 128 : 1024;
    for (let g = 0, w0 = 0; g < groups.length; w0 += groups[g], g++) {
      for (let sfb = 0; sfb < maxSfb; sfb++) {
        const c = cb[g * MAX_SFB + sfb];
        if (c === ZERO_HCB || c >= NOISE_HCB) continue;
        const trie = T[c];
        const lo = swb[sfb], hi = swb[sfb + 1];
        for (let w = w0; w < w0 + groups[g]; w++) {
          const base = w * winLen;
          if (c <= 4) { // quads
            for (let k = lo; k < hi; k += 4) {
              const idx = readHuff(br, trie);
              let v0 = ((idx / 27) | 0), v1 = ((idx / 9) | 0) % 3, v2 = ((idx / 3) | 0) % 3, v3 = idx % 3;
              if (c <= 2) { v0--; v1--; v2--; v3--; } else {
                if (v0 && br.bit()) v0 = -v0;
                if (v1 && br.bit()) v1 = -v1;
                if (v2 && br.bit()) v2 = -v2;
                if (v3 && br.bit()) v3 = -v3;
              }
              q[base + k] = v0; q[base + k + 1] = v1; q[base + k + 2] = v2; q[base + k + 3] = v3;
            }
          } else { // pairs
            const mod = c <= 6 ? 9 : c <= 8 ? 8 : c <= 10 ? 13 : 17;
            for (let k = lo; k < hi; k += 2) {
              const idx = readHuff(br, trie);
              let y = (idx / mod) | 0, z = idx % mod;
              if (c <= 6) { y -= 4; z -= 4; } else {
                const sy = y && br.bit(), sz = z && br.bit();
                if (c === ESC_HCB) {
                  if (y === 16) y = readEscape(br);
                  if (z === 16) z = readEscape(br);
                }
                if (sy) y = -y;
                if (sz) z = -z;
              }
              q[base + k] = y; q[base + k + 1] = z;
            }
          }
        }
      }
    }
    if (pulses) {
      for (const [k, amp] of pulses) {
        if (k >= 1024) throw new Error('aac: pulse offset out of range');
        q[k] += q[k] > 0 ? amp : -amp;
      }
    }

    // Dequantise: x = sign(q)·|q|^(4/3)·2^((sf−100)/4); PNS bands get scaled noise.
    const spec = new Float64Array(1024);
    for (let g = 0, w0 = 0; g < groups.length; w0 += groups[g], g++) {
      for (let sfb = 0; sfb < maxSfb; sfb++) {
        const i = g * MAX_SFB + sfb, c = cb[i];
        if (c === ZERO_HCB || c === INTENSITY_HCB || c === INTENSITY_HCB2) continue;
        const lo = swb[sfb], hi = swb[sfb + 1];
        if (c === NOISE_HCB) {
          const target = Math.pow(2, 0.25 * sf[i]);
          for (let w = w0; w < w0 + groups[g]; w++) {
            const base = w * winLen;
            let e = 0;
            for (let k = lo; k < hi; k++) { const r = this.rand(); spec[base + k] = r; e += r * r; }
            const s = target / Math.sqrt(e || 1);
            for (let k = lo; k < hi; k++) spec[base + k] *= s;
          }
          continue;
        }
        const scale = Math.pow(2, 0.25 * (sf[i] - 100));
        for (let w = w0; w < w0 + groups[g]; w++) {
          const base = w * winLen;
          for (let k = lo; k < hi; k++) {
            const v = q[base + k];
            if (v === 0) continue;
            if (v > 8191 || v < -8191) throw new Error('aac: quantised value out of range');
            spec[base + k] = v > 0 ? POW43[v] * scale : -POW43[-v] * scale;
          }
        }
      }
    }
    Object.assign(ics, { cb, sf, spec });
    return ics;
  }

  /** Joint stereo for a common-window CPE: M/S, PNS correlation, intensity (spec 4.6.8). */
  stereo(l, r, msPresent, msUsed) {
    const { groups, maxSfb, swb, winSeq } = l;
    const winLen = winSeq === EIGHT_SHORT ? 128 : 1024;
    for (let g = 0, w0 = 0; g < groups.length; w0 += groups[g], g++) {
      for (let sfb = 0; sfb < maxSfb; sfb++) {
        const i = g * MAX_SFB + sfb;
        const used = msPresent ? msUsed[i] : 0;
        const cl = l.cb[i], cr = r.cb[i];
        const lo = swb[sfb], hi = swb[sfb + 1];
        if (cr === INTENSITY_HCB || cr === INTENSITY_HCB2) {
          // Right = scaled copy of left; sign from the codebook, flipped by ms_used.
          let sign = cr === INTENSITY_HCB ? 1 : -1;
          if (msPresent === 1 && used) sign = -sign;
          const s = sign * Math.pow(0.5, 0.25 * r.sf[i]);
          for (let w = w0; w < w0 + groups[g]; w++) {
            const base = w * winLen;
            for (let k = lo; k < hi; k++) r.spec[base + k] = l.spec[base + k] * s;
          }
        } else if (cl === NOISE_HCB && cr === NOISE_HCB) {
          // Correlated noise: right reuses left's noise shape at its own energy.
          if (used) {
            for (let w = w0; w < w0 + groups[g]; w++) {
              const base = w * winLen;
              let el = 0, er = 0;
              for (let k = lo; k < hi; k++) { el += l.spec[base + k] ** 2; er += r.spec[base + k] ** 2; }
              const s = Math.sqrt(er / (el || 1));
              for (let k = lo; k < hi; k++) r.spec[base + k] = l.spec[base + k] * s;
            }
          }
        } else if (used && cl !== NOISE_HCB && cr !== NOISE_HCB) {
          for (let w = w0; w < w0 + groups[g]; w++) {
            const base = w * winLen;
            for (let k = lo; k < hi; k++) {
              const m = l.spec[base + k], sd = r.spec[base + k];
              l.spec[base + k] = m + sd; r.spec[base + k] = m - sd;
            }
          }
        }
      }
    }
  }

  /** Filterbank: IMDCT, windowing (with the previous frame's shape on the left), overlap-add. */
  synthesize(ch, ics) {
    let st = this.channelState[ch];
    if (!st) st = this.channelState[ch] = { overlap: new Float64Array(1024), prevShape: 0, buf: new Float64Array(2048), y: new Float64Array(2048) };
    const { buf, y } = st;
    const prev = this.W[st.prevShape], cur = this.W[ics.winShape];
    const seq = ics.winSeq;
    if (seq === EIGHT_SHORT) {
      buf.fill(0);
      for (let w = 0; w < 8; w++) {
        this.I.short(ics.spec, w * 128, y);
        const left = w === 0 ? prev.short : cur.short, right = cur.short;
        const o = 448 + 128 * w;
        for (let n = 0; n < 128; n++) buf[o + n] += y[n] * left[n];
        for (let n = 128; n < 256; n++) buf[o + n] += y[n] * right[n];
      }
    } else {
      this.I.long(ics.spec, 0, y);
      for (let n = 0; n < 1024; n++) {
        let w;
        if (seq === LONG_STOP) w = n < 448 ? 0 : n < 576 ? prev.short[n - 448] : 1;
        else w = prev.long[n];
        buf[n] = y[n] * w;
      }
      for (let n = 1024; n < 2048; n++) {
        let w;
        if (seq === LONG_START) w = n < 1472 ? 1 : n < 1600 ? cur.short[n - 1472 + 128] : 0;
        else w = cur.long[n];
        buf[n] = y[n] * w;
      }
    }
    const out = new Float32Array(1024);
    for (let n = 0; n < 1024; n++) {
      out[n] = (buf[n] + st.overlap[n]) / 32768;
      st.overlap[n] = buf[1024 + n];
    }
    st.prevShape = ics.winShape;
    return out;
  }
}

/** Escape sequence for codebook 11 (spec 4.6.3.3): N ones, a zero, then N+4 bits. */
function readEscape(br) {
  let n = 4;
  while (br.bit()) if (++n > 12) throw new Error('aac: bad escape sequence');
  return (1 << n) + br.bits(n);
}
