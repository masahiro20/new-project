// WAV decoding for Node-side evaluation scripts (browsers use decodeAudioData).

/** Minimal WAV reader: PCM 16/24/32-bit or float32, any channel count → mono. */
export function readWav(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, false) !== 0x52494646) throw new Error('not RIFF');
  let off = 12, fmt = null;
  while (off + 8 <= dv.byteLength) {
    const id = dv.getUint32(off, false), size = dv.getUint32(off + 4, true);
    if (id === 0x666d7420) fmt = { format: dv.getUint16(off + 8, true), ch: dv.getUint16(off + 10, true), rate: dv.getUint32(off + 12, true), bits: dv.getUint16(off + 22, true) };
    if (id === 0x64617461 && fmt) {
      const bps = fmt.bits / 8, frames = Math.floor(Math.min(size, dv.byteLength - off - 8) / (bps * fmt.ch));
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < fmt.ch; c++) {
          const p = off + 8 + (i * fmt.ch + c) * bps;
          if (fmt.format === 3) s += dv.getFloat32(p, true);
          else if (fmt.bits === 16) s += dv.getInt16(p, true) / 32768;
          else if (fmt.bits === 24) s += ((dv.getUint8(p) | (dv.getUint8(p + 1) << 8) | (dv.getInt8(p + 2) << 16)) / 8388608);
          else if (fmt.bits === 32) s += dv.getInt32(p, true) / 2147483648;
        }
        out[i] = s / fmt.ch;
      }
      return { samples: out, sampleRate: fmt.rate };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}
