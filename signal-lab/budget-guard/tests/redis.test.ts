import { describe, expect, it } from "vitest";
import { createMemoryKV, getJSON, setJSON } from "@/lib/redis";

function clock() {
  let t = 1_000_000;
  return { now: () => t, advance: (s: number) => (t += s * 1000) };
}

describe("in-memory KV", () => {
  it("SET NX only writes when the key is absent", async () => {
    const kv = createMemoryKV();
    expect(await kv.set("k", "a", { nx: true })).toBe(true);
    expect(await kv.set("k", "b", { nx: true })).toBe(false);
    expect(await kv.get("k")).toBe("a");
    expect(await kv.set("k", "c")).toBe(true);
    expect(await kv.get("k")).toBe("c");
  });

  it("EX expires keys, after which NX succeeds again", async () => {
    const c = clock();
    const kv = createMemoryKV(c.now);
    await kv.set("k", "a", { nx: true, ex: 10 });
    c.advance(9);
    expect(await kv.get("k")).toBe("a");
    expect(await kv.set("k", "b", { nx: true, ex: 10 })).toBe(false);
    c.advance(1);
    expect(await kv.get("k")).toBeNull();
    expect(await kv.set("k", "b", { nx: true, ex: 10 })).toBe(true);
  });

  it("plain SET clears a previous TTL", async () => {
    const c = clock();
    const kv = createMemoryKV(c.now);
    await kv.set("k", "a", { ex: 5 });
    await kv.set("k", "b");
    c.advance(60);
    expect(await kv.get("k")).toBe("b");
  });

  it("INCR counts from zero and keeps the TTL", async () => {
    const c = clock();
    const kv = createMemoryKV(c.now);
    expect(await kv.incr("n")).toBe(1);
    await kv.expire("n", 10);
    expect(await kv.incr("n")).toBe(2);
    c.advance(10);
    expect(await kv.get("n")).toBeNull();
    expect(await kv.incr("n")).toBe(1);
    await kv.set("s", "abc");
    await expect(kv.incr("s")).rejects.toThrow("not an integer");
  });

  it("GETDEL returns the value exactly once", async () => {
    const kv = createMemoryKV();
    await kv.set("t", "x");
    expect(await kv.getdel("t")).toBe("x");
    expect(await kv.getdel("t")).toBeNull();
  });

  it("supports hashes and sets", async () => {
    const kv = createMemoryKV();
    expect(await kv.hincrby("h", "a", 2)).toBe(2);
    expect(await kv.hincrby("h", "a", 3)).toBe(5);
    expect(await kv.hset("h", { b: "x" })).toBe(1);
    expect(await kv.hgetall("h")).toEqual({ a: "5", b: "x" });
    expect(await kv.hgetall("missing")).toEqual({});
    expect(await kv.sadd("s", "a", "b")).toBe(2);
    expect(await kv.sadd("s", "a")).toBe(0);
    expect(await kv.scard("s")).toBe(2);
    expect((await kv.smembers("s")).sort()).toEqual(["a", "b"]);
    expect(await kv.del("s", "h", "nope")).toBe(2);
  });

  it("throws WRONGTYPE like Redis", async () => {
    const kv = createMemoryKV();
    await kv.sadd("s", "a");
    await expect(kv.get("s")).rejects.toThrow("WRONGTYPE");
    await expect(kv.hincrby("s", "f", 1)).rejects.toThrow("WRONGTYPE");
  });

  it("round-trips JSON helpers", async () => {
    const kv = createMemoryKV();
    await setJSON(kv, "j", { a: 1 });
    expect(await getJSON(kv, "j")).toEqual({ a: 1 });
    expect(await getJSON(kv, "none")).toBeNull();
  });
});
