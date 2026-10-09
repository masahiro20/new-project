// Minimal MP4 / M4A (ISO BMFF, QuickTime) demuxer for the first audio track.
// Reads just what the decoders need: the codec config (stsd → mp4a → esds →
// AudioSpecificConfig, or stsd → alac → ALACSpecificConfig), the sample table
// (stsz, stsc, stco/co64) and the edit list (edts/elst, which carries the
// encoder priming delay). The moov box may
// come before or after mdat (`-movflags +faststart` or not): the whole file is
// in memory, so order does not matter. Fragmented MP4 (moof) is not supported.
// Written from ISO/IEC 14496-12 / 14496-14; no third-party code.

/** True if the buffer starts like an ISO BMFF file (an 'ftyp' box, or a bare moov/mdat/free/wide/skip). */
export function looksLikeMp4(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 12) return false;
  const type = String.fromCharCode(u8[4], u8[5], u8[6], u8[7]);
  return ['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip'].includes(type);
}

/**
 * Iterate the boxes in u8[start, end).
 * @returns {{type:string, start:number, body:number, end:number}[]} body = payload offset
 */
function boxes(u8, dv, start, end) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = dv.getUint32(p);
    const type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
    let body = p + 8;
    if (size === 1) { // 64-bit largesize
      if (p + 16 > end) break;
      size = dv.getUint32(p + 8) * 2 ** 32 + dv.getUint32(p + 12);
      body = p + 16;
    } else if (size === 0) size = end - p; // extends to the end of the enclosing box/file
    if (size < body - p || p + size > end) {
      // Truncated last box (e.g. a recording cut short): keep what is there.
      out.push({ type, start: p, body, end });
      break;
    }
    out.push({ type, start: p, body, end: p + size });
    p += size;
  }
  return out;
}

const child = (list, type) => list.find((b) => b.type === type);

/** Read an MPEG-4 descriptor length (1–4 bytes of 7 bits). */
function descLen(u8, p) {
  let len = 0, n = 0;
  for (; n < 4; n++) {
    const b = u8[p + n];
    len = (len << 7) | (b & 0x7f);
    if (!(b & 0x80)) { n++; break; }
  }
  return { len, size: n };
}

/** Parse an esds payload (after version/flags) → { objectType, asc: Uint8Array }. */
function parseEsds(u8, p, end) {
  // ES_Descriptor (tag 3)
  if (u8[p] !== 3) throw new Error('m4a: bad esds (no ES_Descriptor)');
  let d = descLen(u8, p + 1);
  p += 1 + d.size;
  const flags = u8[p + 2];
  p += 3; // ES_ID (2) + flags (1)
  if (flags & 0x80) p += 2; // streamDependenceFlag → dependsOn_ES_ID
  if (flags & 0x40) p += 1 + u8[p]; // URL_Flag → URLlength + URLstring
  if (flags & 0x20) p += 2; // OCRstreamFlag → OCR_ES_Id
  // DecoderConfigDescriptor (tag 4)
  if (u8[p] !== 4) throw new Error('m4a: bad esds (no DecoderConfigDescriptor)');
  d = descLen(u8, p + 1);
  const dcdEnd = Math.min(end, p + 1 + d.size + d.len);
  p += 1 + d.size;
  const objectType = u8[p];
  p += 13; // objectTypeIndication, streamType, bufferSizeDB(3), maxBitrate(4), avgBitrate(4)
  let asc = null;
  if (p < dcdEnd && u8[p] === 5) { // DecoderSpecificInfo
    d = descLen(u8, p + 1);
    p += 1 + d.size;
    asc = u8.slice(p, Math.min(p + d.len, dcdEnd));
  }
  return { objectType, asc };
}

/** Find a box of `type` anywhere below [start, end) (depth-limited), for esds inside 'wave'. */
function findDeep(u8, dv, start, end, type, depth = 3) {
  for (const b of boxes(u8, dv, start, end)) {
    if (b.type === type) return b;
    if (depth > 0 && /^[a-z]{4}$/.test(b.type)) {
      const r = findDeep(u8, dv, b.body, b.end, type, depth - 1);
      if (r) return r;
    }
  }
  return null;
}

/**
 * Parse an audio sample entry (mp4a / alac / …) inside stsd.
 * @returns {{ codec:string, channels:number, rate:number, objectType?:number, asc?:Uint8Array, cookie?:Uint8Array }}
 */
function parseSampleEntry(u8, dv, entry) {
  const codec = entry.type;
  const p = entry.body;
  // SampleEntry: reserved(6) + data_reference_index(2); AudioSampleEntry:
  // version(2) revision(2) vendor(4) channelcount(2) samplesize(2) compressionId(2) packetSize(2) samplerate 16.16(4)
  const version = dv.getUint16(p + 8);
  const channels = dv.getUint16(p + 16);
  const rate = dv.getUint32(p + 24) >>> 16;
  let kids = p + 28;
  if (version === 1) kids += 16; // QuickTime sound description v1
  else if (version === 2) kids += 36; // v2
  const info = { codec, channels, rate };
  if (codec === 'mp4a') {
    const esds = findDeep(u8, dv, kids, entry.end, 'esds');
    if (!esds) throw new Error('m4a: mp4a track without esds');
    Object.assign(info, parseEsds(u8, esds.body + 4, esds.end));
  } else if (codec === 'alac') {
    // Inner 'alac' full box: version/flags(4) + 24-byte ALACSpecificConfig.
    const cfg = findDeep(u8, dv, kids, entry.end, 'alac');
    if (!cfg || cfg.end - cfg.body < 28) throw new Error('m4a: alac track without config');
    info.cookie = u8.slice(cfg.body + 4, cfg.body + 28);
  }
  return info;
}

/**
 * Demux the first audio track of an MP4/M4A file.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {{ codec:string, objectType?:number, asc?:Uint8Array, cookie?:Uint8Array, channels:number, rate:number,
 *   timescale:number, frames:Uint8Array[], skip:number, duration:number|null }}
 *   frames: the encoded access units in decode order; skip/duration: edit-list
 *   trim in media-timescale units (duration null = no edit list).
 */
export function demuxMp4(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const top = boxes(u8, dv, 0, u8.length);
  const moov = child(top, 'moov');
  if (!moov) {
    if (child(top, 'moof')) throw new Error('m4a: fragmented MP4 is not supported');
    throw new Error('m4a: no moov box (not an MP4 file, or truncated)');
  }
  const moovKids = boxes(u8, dv, moov.body, moov.end);
  const mvhd = child(moovKids, 'mvhd');
  const movieScale = mvhd ? dv.getUint32(mvhd.body + (u8[mvhd.body] === 1 ? 20 : 12)) : 0;

  for (const trak of moovKids.filter((b) => b.type === 'trak')) {
    const trakKids = boxes(u8, dv, trak.body, trak.end);
    const mdia = child(trakKids, 'mdia');
    if (!mdia) continue;
    const mdiaKids = boxes(u8, dv, mdia.body, mdia.end);
    const hdlr = child(mdiaKids, 'hdlr');
    if (!hdlr || String.fromCharCode(...u8.subarray(hdlr.body + 8, hdlr.body + 12)) !== 'soun') continue;
    const mdhd = child(mdiaKids, 'mdhd');
    const timescale = mdhd ? dv.getUint32(mdhd.body + (u8[mdhd.body] === 1 ? 20 : 12)) : 0;
    const minf = child(mdiaKids, 'minf');
    const stbl = minf && child(boxes(u8, dv, minf.body, minf.end), 'stbl');
    if (!stbl) continue;
    const st = boxes(u8, dv, stbl.body, stbl.end);
    const stsd = child(st, 'stsd');
    if (!stsd) continue;
    const entries = boxes(u8, dv, stsd.body + 8, stsd.end); // version/flags(4) + entry_count(4)
    if (!entries.length) continue;
    const info = parseSampleEntry(u8, dv, entries[0]);

    // Sample sizes.
    const stsz = child(st, 'stsz');
    if (!stsz) throw new Error('m4a: no stsz (only stsz sample tables are supported)');
    const fixed = dv.getUint32(stsz.body + 4), count = dv.getUint32(stsz.body + 8);
    const sizes = new Array(count);
    for (let i = 0; i < count; i++) sizes[i] = fixed || dv.getUint32(stsz.body + 12 + 4 * i);
    // Chunk offsets.
    const stco = child(st, 'stco'), co64 = child(st, 'co64');
    const offsets = [];
    if (stco) {
      const n = dv.getUint32(stco.body + 4);
      for (let i = 0; i < n; i++) offsets.push(dv.getUint32(stco.body + 8 + 4 * i));
    } else if (co64) {
      const n = dv.getUint32(co64.body + 4);
      for (let i = 0; i < n; i++) offsets.push(dv.getUint32(co64.body + 8 + 8 * i) * 2 ** 32 + dv.getUint32(co64.body + 12 + 8 * i));
    } else throw new Error('m4a: no chunk offsets (stco/co64)');
    // Sample-to-chunk runs: walk chunks, taking samples_per_chunk from the run in force.
    const stsc = child(st, 'stsc');
    if (!stsc) throw new Error('m4a: no stsc');
    const nRuns = dv.getUint32(stsc.body + 4);
    const runs = [];
    for (let i = 0; i < nRuns; i++) {
      const q = stsc.body + 8 + 12 * i;
      runs.push({ first: dv.getUint32(q), per: dv.getUint32(q + 4) });
    }
    const frames = [];
    let s = 0;
    for (let c = 0, r = 0; c < offsets.length && s < count; c++) {
      while (r + 1 < runs.length && runs[r + 1].first <= c + 1) r++;
      let off = offsets[c];
      const per = runs.length ? runs[r].per : 0;
      for (let k = 0; k < per && s < count; k++, s++) {
        const end = off + sizes[s];
        if (end > u8.length) break; // truncated file: stop at what is present
        frames.push(u8.subarray(off, end));
        off = end;
      }
    }

    if (!frames.length && child(top, 'moof')) throw new Error('m4a: fragmented MP4 is not supported');

    // Edit list: first non-empty edit gives the priming skip and the playable length.
    let skip = 0, duration = null;
    const edts = child(trakKids, 'edts');
    const elst = edts && child(boxes(u8, dv, edts.body, edts.end), 'elst');
    if (elst) {
      const v = u8[elst.body];
      const n = dv.getUint32(elst.body + 4);
      let q = elst.body + 8;
      for (let i = 0; i < n; i++) {
        const segDur = v === 1 ? dv.getUint32(q) * 2 ** 32 + dv.getUint32(q + 4) : dv.getUint32(q);
        const mediaTime = v === 1 ? Number(dv.getBigInt64(q + 8)) : dv.getInt32(q + 4);
        q += v === 1 ? 20 : 12;
        if (mediaTime < 0) continue; // empty edit (a start delay) — ignored
        skip = mediaTime;
        // segment_duration is in the movie timescale; convert to media units.
        if (segDur > 0 && movieScale > 0 && timescale > 0) duration = Math.round((segDur * timescale) / movieScale);
        break;
      }
    }
    return { ...info, timescale, frames, skip, duration };
  }
  throw new Error('m4a: no audio track found');
}
