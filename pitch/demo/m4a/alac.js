// Apple Lossless (ALAC) decoder — the format iPhone Voice Memos use when
// "Lossless" audio quality is selected. Written for this project from the
// published ALAC format (Apple's ALAC reference release, Apache-2.0; no code
// copied): per-element adaptive Golomb–Rice residuals ("dyn_decomp"), an
// adaptive integer FIR predictor ("unpc_block"), optional stereo
// decorrelation and low-byte shift buffer, or verbatim PCM ("escape").

const QBSHIFT = 9, QB = 1 << QBSHIFT, MMULSHIFT = 2, MDENSHIFT = QBSHIFT - MMULSHIFT - 1, MOFF = 1 << (MDENSHIFT - 2);
const BITOFF = 24, MAX_PREFIX_16 = 9, MAX_PREFIX_32 = 9, MAX_DATATYPE_BITS_16 = 16;
const N_MAX_MEAN_CLAMP = 0xffff, N_MEAN_CLAMP_VAL = 0xffff;

/** MSB-first bit reader that also allows peeking and rewinding (the Rice decoder needs both). */
class Bits {
  constructor(u8) { this.u8 = u8; this.pos = 0; this.end = u8.length * 8; }
  read(n) {
    if (n === 0) return 0;
    if (this.pos + n > this.end) throw new Error('alac: frame data overrun');
    let v = 0, p = this.pos;
    while (n > 0) {
      const off = p & 7, avail = 8 - off, take = avail < n ? avail : n;
      v = v * (1 << take) + ((this.u8[p >> 3] >> (avail - take)) & ((1 << take) - 1));
      p += take; n -= take;
    }
    this.pos = p;
    return v;
  }
  /** Count leading 1 bits (up to max), consuming them but not the terminating 0. */
  ones(max) {
    let n = 0;
    while (n < max && this.pos < this.end && ((this.u8[this.pos >> 3] >> (7 - (this.pos & 7))) & 1)) { n++; this.pos++; }
    return n;
  }
  signed(n) { const v = this.read(n); return v >= 2 ** (n - 1) ? v - 2 ** n : v; }
}

/** Parse the 24-byte ALACSpecificConfig ("magic cookie"). */
export function parseAlacConfig(c) {
  const dv = new DataView(c.buffer, c.byteOffset, c.byteLength);
  if (c.length < 24) throw new Error('alac: short config');
  return {
    frameLength: dv.getUint32(0), bitDepth: c[5], pb: c[6], mb: c[7], kb: c[8],
    numChannels: c[9], maxRun: dv.getUint16(10), sampleRate: dv.getUint32(20),
  };
}

const lead = (x) => Math.clz32(x);

/** Rice-coded value with a 16-bit escape (zero-run lengths). */
function dynGet(b, m, k) {
  const pre = b.ones(MAX_PREFIX_16);
  if (pre >= MAX_PREFIX_16) return b.read(MAX_DATATYPE_BITS_16);
  b.pos++; // the terminating 0
  const v = b.read(k);
  if (v < 2) { b.pos--; return pre * m; } // only k-1 bits belonged to this value
  return pre * m + v - 1;
}

/** Rice-coded value with a maxBits escape (residuals). */
function dynGet32(b, m, k, maxBits) {
  const pre = b.ones(MAX_PREFIX_32);
  if (pre >= MAX_PREFIX_32) return b.read(maxBits);
  b.pos++;
  if (k === 1) return pre;
  const v = b.read(k);
  if (v < 2) { b.pos--; return pre * m; }
  return pre * m + v - 1;
}

/** Adaptive Golomb decode of numSamples sign-folded residuals into out. */
function dynDecomp(b, out, numSamples, pb, mb0, kb, chanBits) {
  const wb = (1 << kb) - 1;
  let mb = mb0, zmode = 0, c = 0;
  while (c < numSamples) {
    let k = 31 - lead((mb >>> QBSHIFT) + 3);
    if (k > kb) k = kb;
    const m = (1 << k) - 1;
    const n = dynGet32(b, m, k, chanBits);
    const nd = n + zmode;
    out[c++] = nd & 1 ? -((nd + 1) / 2) : nd / 2;
    mb = pb * nd + mb - Math.floor((pb * mb) / QB);
    if (n > N_MAX_MEAN_CLAMP) mb = N_MEAN_CLAMP_VAL;
    zmode = 0;
    if (mb * (1 << MMULSHIFT) < QB && c < numSamples) {
      // Low mean: a run of zeros follows.
      zmode = 1;
      const kz = lead(mb) - BITOFF + ((mb + MOFF) >> MDENSHIFT);
      const mz = ((1 << kz) - 1) & wb;
      const run = dynGet(b, mz, kz);
      if (c + run > numSamples) throw new Error('alac: zero run overflows the frame');
      for (let j = 0; j < run; j++) out[c++] = 0;
      if (run >= 65535) zmode = 0;
      mb = 0;
    }
  }
}

const sext = (v, shift) => (v << shift) >> shift; // keep chanBits significant bits, signed
const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** Adaptive FIR prediction (inverse): residuals pc → samples out (may alias for numActive 31). */
function unpcBlock(pc, out, num, coefs, numActive, chanBits, denShift) {
  const chanShift = 32 - chanBits;
  out[0] = pc[0];
  if (numActive === 0) { if (out !== pc) for (let j = 1; j < num; j++) out[j] = pc[j]; return; }
  if (numActive === 31) { // first-order integrator
    let prev = out[0];
    for (let j = 1; j < num; j++) { prev = sext(pc[j] + prev, chanShift); out[j] = prev; }
    return;
  }
  const denHalf = 1 << (denShift - 1);
  for (let j = 1; j <= numActive && j < num; j++) out[j] = sext(pc[j] + out[j - 1], chanShift);
  const lim = numActive + 1;
  for (let j = lim; j < num; j++) {
    const top = out[j - lim];
    let sum = 0;
    for (let k = 0; k < numActive; k++) sum += coefs[k] * (out[j - 1 - k] - top);
    let del = pc[j];
    let del0 = del;
    const sg = sign(del);
    del += top + ((sum + denHalf) >> denShift);
    out[j] = sext(del, chanShift);
    if (sg > 0) {
      for (let k = numActive - 1; k >= 0; k--) {
        const dd = top - out[j - 1 - k], s = sign(dd);
        coefs[k] -= s;
        del0 -= (numActive - k) * ((s * dd) >> denShift);
        if (del0 <= 0) break;
      }
    } else if (sg < 0) {
      for (let k = numActive - 1; k >= 0; k--) {
        const dd = top - out[j - 1 - k], s = sign(dd);
        coefs[k] += s;
        del0 -= (numActive - k) * ((-s * dd) >> denShift);
        if (del0 >= 0) break;
      }
    }
  }
}

export class AlacDecoder {
  /** @param {Uint8Array} cookie ALACSpecificConfig */
  constructor(cookie) {
    this.cfg = parseAlacConfig(cookie);
    const { bitDepth, sampleRate, numChannels } = this.cfg;
    if (![16, 20, 24, 32].includes(bitDepth)) throw new Error(`alac: unsupported bit depth ${bitDepth}`);
    this.rate = sampleRate;
    this.channels = numChannels;
    this.scale = 1 / 2 ** (bitDepth - 1);
  }

  /**
   * Decode one ALAC packet.
   * @returns {Float32Array[]} one array per channel, in element order
   */
  decodeFrame(frame) {
    const b = new Bits(frame);
    const out = [];
    for (;;) {
      if (b.end - b.pos < 3) break;
      const tag = b.read(3);
      if (tag === 7) break; // END
      if (tag === 0 || tag === 3) out.push(...this.element(b, 1)); // SCE / LFE
      else if (tag === 1) out.push(...this.element(b, 2)); // CPE
      else if (tag === 6) { // FIL
        let n = b.read(4);
        if (n === 15) n += b.read(8) - 1;
        b.pos += 8 * n;
      } else if (tag === 4) { // DSE
        b.read(4);
        const align = b.read(1);
        let n = b.read(8);
        if (n === 255) n += b.read(8);
        if (align) b.pos = (b.pos + 7) & ~7;
        b.pos += 8 * n;
      } else throw new Error(`alac: unsupported element ${tag}`);
    }
    return out;
  }

  /** One SCE (nch 1) or CPE (nch 2). */
  element(b, nch) {
    const { bitDepth, frameLength, pb, mb, kb } = this.cfg;
    b.read(4); // element instance tag
    if (b.read(12) !== 0) throw new Error('alac: bad element header');
    const partial = b.read(1), bytesShifted = b.read(2), escape = b.read(1);
    const n = partial ? b.read(32) : frameLength;
    if (n > frameLength || n === 0) throw new Error('alac: bad frame length');
    const shift = bytesShifted * 8;
    const ch = [];
    for (let c = 0; c < nch; c++) ch.push(new Int32Array(n));
    let mixBits = 0, mixRes = 0;
    if (!escape) {
      const chanBits = bitDepth - shift + (nch - 1);
      if (chanBits > 32) throw new Error('alac: unsupported sample width');
      mixBits = b.read(8);
      mixRes = b.signed(8);
      const params = [];
      for (let c = 0; c < nch; c++) {
        const h1 = b.read(8), h2 = b.read(8);
        const p = { mode: h1 >> 4, denShift: h1 & 15, pbFactor: h2 >> 5, num: h2 & 31, coefs: new Int32Array(32) };
        for (let i = 0; i < p.num; i++) p.coefs[i] = b.signed(16);
        params.push(p);
      }
      let shiftPos = 0;
      if (shift) { shiftPos = b.pos; b.pos += shift * nch * n; } // low bytes precede the residuals; read them last
      const pred = new Int32Array(n);
      for (let c = 0; c < nch; c++) {
        const p = params[c];
        dynDecomp(b, pred, n, (pb * p.pbFactor) >> 2, mb, kb, chanBits);
        if (p.mode === 0) unpcBlock(pred, ch[c], n, p.coefs, p.num, chanBits, p.denShift);
        else {
          unpcBlock(pred, pred, n, null, 31, chanBits, 0);
          unpcBlock(pred, ch[c], n, p.coefs, p.num, chanBits, p.denShift);
        }
      }
      if (nch === 2 && mixRes !== 0) {
        const [u, v] = ch;
        for (let i = 0; i < n; i++) {
          const l = u[i] + v[i] - ((mixRes * v[i]) >> mixBits);
          v[i] = l - v[i]; u[i] = l;
        }
      }
      if (shift) {
        const end = b.pos;
        b.pos = shiftPos;
        for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) ch[c][i] = ch[c][i] * 2 ** shift + b.read(shift);
        b.pos = end;
      }
    } else {
      // Verbatim PCM, interleaved.
      for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) ch[c][i] = b.signed(bitDepth);
    }
    return ch.map((x) => {
      const f = new Float32Array(n);
      for (let i = 0; i < n; i++) f[i] = x[i] * this.scale;
      return f;
    });
  }
}
