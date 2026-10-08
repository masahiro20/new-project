import { describe, expect, it } from "vitest";
import { createMemoryKV } from "@/lib/redis";
import { upsertEntitlement } from "@/lib/entitlements";
import { devOutbox } from "@/lib/mail";
import { checkAccount, checkAll } from "@/lib/guard/service";
import { addConnection, getLog, getSnapshot, listConnections, MAX_CONNECTIONS, removeConnection } from "@/lib/guard/store";

const target = { provider: "vercel" as const, teamId: "team_1", projectIds: ["prj_1"] };

describe("store", () => {
  it("never stores the plaintext token and starts in test mode", async () => {
    const kv = createMemoryKV();
    const c = await addConnection(kv, "acct", { label: "A", target, budgetUsd: 50, token: "vercel_secret_token_123" });
    expect(c.stopMode).toBe("test");
    expect(c.tokenHint).toBe("verc…_123");
    expect(JSON.stringify(await listConnections(kv, "acct"))).not.toContain("secret_token");
  });
  it("enforces the plan limit and unique labels", async () => {
    const kv = createMemoryKV();
    for (let i = 0; i < MAX_CONNECTIONS; i++) await addConnection(kv, "acct", { label: `L${i}`, target, budgetUsd: 1, token: "demo" });
    await expect(addConnection(kv, "acct", { label: "x", target, budgetUsd: 1, token: "demo" })).rejects.toThrow("allows");
    const kv2 = createMemoryKV();
    await addConnection(kv2, "a", { label: "same", target, budgetUsd: 1, token: "demo" });
    await expect(addConnection(kv2, "a", { label: "same", target, budgetUsd: 1, token: "demo" })).rejects.toThrow("Label");
  });
});

describe("service with the demo token", () => {
  it("checks, snapshots, logs and mails once per threshold", async () => {
    const kv = createMemoryKV();
    const c = await addConnection(kv, "acct", { label: "Vercel prod", target, budgetUsd: 50, token: "demo" }); // demo spend $42.50 = 85%
    const before = devOutbox.length;
    const notices = await checkAccount(kv, "acct", "me@example.com");
    expect(notices.map((n) => n.kind)).toEqual(["warn"]);
    expect((await getSnapshot(kv, "acct", c.id))?.level).toBe("warn");
    expect(devOutbox.length).toBe(before + 1);
    expect(devOutbox.at(-1)?.subject).toContain("80%");
    expect(await checkAccount(kv, "acct", "me@example.com")).toEqual([]);
    expect((await getLog(kv, "acct")).length).toBe(1);
    await removeConnection(kv, "acct", c.id);
    expect(await getSnapshot(kv, "acct", c.id)).toBeNull();
  });
  it("cron skips accounts without an active entitlement", async () => {
    const kv = createMemoryKV();
    const { entitlement: ent } = await upsertEntitlement(kv, { id: "dev_1", email: "a@example.com", plan: "monthly", source: "demo" });
    await addConnection(kv, ent.id, { label: "A", target, budgetUsd: 10, token: "demo" });
    await addConnection(kv, "dev_lapsed", { label: "B", target, budgetUsd: 10, token: "demo" });
    expect(await checkAll(kv)).toEqual({ accounts: 1, notices: 2 }); // limit + test-mode stop
  });
});
