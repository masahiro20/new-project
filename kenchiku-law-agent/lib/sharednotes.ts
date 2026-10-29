// 役所調査の結果を社内で共有する（Vercel Blob の非公開ストア）。
// 保存するのは道路・上下水・ガスの調査メモと位置だけ。お客様の情報は保存しない。
// 市ごとの索引（notes/index/<市>.json）に位置と要約を持ち、近くの調査結果を探せるようにする。

import { createHash } from "node:crypto";
import { get, put } from "@vercel/blob";
import { z } from "zod";

const NOTE_KEYS = ["roadNote", "roadLedgerNote", "waterNote", "sewerNote", "gasNote"] as const;
export type NoteKey = (typeof NOTE_KEYS)[number];

const note = z.string().trim().max(300).catch("");
export const sharedNotesSchema = z.object({
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().max(40).catch(""),
  lat: z.number().min(20).max(46).nullable().catch(null),
  lon: z.number().min(122).max(154).nullable().catch(null),
  notes: z.object(Object.fromEntries(NOTE_KEYS.map((k) => [k, note])) as Record<NoteKey, typeof note>),
  /** 記入した人（任意。社員名など）。 */
  by: z.string().trim().max(40).catch(""),
});
export type SharedNotes = z.infer<typeof sharedNotesSchema> & { updatedAt: string };
type IndexEntry = { key: string; address: string; lat: number | null; lon: number | null; updatedAt: string; summary: string };

export const sharingAvailable = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const norm = (a: string) =>
  a
    .replace(/\s/g, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ー－―‐]/g, "-")
    .replace(/番地?の?|号/g, "-")
    .replace(/-+$/, "");
export const noteKey = (address: string) => createHash("sha256").update(norm(address)).digest("hex").slice(0, 24);
const cityKey = (city: string) => createHash("sha256").update(city || "不明").digest("hex").slice(0, 16);

async function readJson<T>(pathname: string): Promise<T | null> {
  const r = await get(pathname, { access: "private", useCache: false }).catch(() => null);
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return JSON.parse(await new Response(r.stream).text()) as T;
}

async function writeJson(pathname: string, value: unknown) {
  await put(pathname, JSON.stringify(value), { access: "private", contentType: "application/json", allowOverwrite: true, addRandomSuffix: false });
}

export async function loadNotes(address: string): Promise<SharedNotes | null> {
  return readJson<SharedNotes>(`notes/by-address/${noteKey(address)}.json`);
}

/** 近く（半径 m 以内）の別の住所の調査結果。 */
export async function nearbyNotes(city: string, lat: number, lon: number, exclude: string, radius = 200): Promise<(IndexEntry & { meters: number })[]> {
  const index = (await readJson<IndexEntry[]>(`notes/index/${cityKey(city)}.json`)) ?? [];
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  return index
    .filter((e) => e.key !== noteKey(exclude) && e.lat !== null && e.lon !== null)
    .map((e) => ({ ...e, meters: Math.round(Math.hypot((e.lon! - lon) * kx, (e.lat! - lat) * 110540)) }))
    .filter((e) => e.meters <= radius)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, 6);
}

export async function saveNotes(input: z.infer<typeof sharedNotesSchema>): Promise<SharedNotes> {
  const value: SharedNotes = { ...input, updatedAt: new Date().toISOString() };
  const key = noteKey(input.address);
  await writeJson(`notes/by-address/${key}.json`, value);
  const indexPath = `notes/index/${cityKey(input.city)}.json`;
  const index = ((await readJson<IndexEntry[]>(indexPath)) ?? []).filter((e) => e.key !== key);
  const summary = NOTE_KEYS.map((k) => input.notes[k]).filter(Boolean).join("／").slice(0, 400);
  if (summary) index.push({ key, address: input.address, lat: input.lat, lon: input.lon, updatedAt: value.updatedAt, summary });
  await writeJson(indexPath, index.slice(-2000));
  return value;
}
