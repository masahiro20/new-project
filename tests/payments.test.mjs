// Run: npm test  (node --test with type stripping; no extra dependencies)
import assert from "node:assert/strict";
import { test } from "node:test";
import { getPaymentsMode, isDemoMode, PaymentsConfigError } from "../lib/payments/mode.ts";
import { validateCard, luhnValid } from "../lib/payments/card.ts";
import { createDemoCheckout, payDemoCheckout, isDemoPaidFor, isDemoToken } from "../lib/payments/demo.ts";

test("PAYMENTS_MODE resolution table", () => {
  assert.equal(getPaymentsMode({}), "demo");
  assert.equal(getPaymentsMode({ STRIPE_SECRET_KEY: "sk_test_x" }), "stripe");
  assert.equal(getPaymentsMode({ PAYMENTS_MODE: "demo", STRIPE_SECRET_KEY: "sk_test_x" }), "demo");
  assert.equal(getPaymentsMode({ PAYMENTS_MODE: "stripe", STRIPE_SECRET_KEY: "sk_test_x" }), "stripe");
  assert.throws(() => getPaymentsMode({ PAYMENTS_MODE: "stripe" }), PaymentsConfigError);
  assert.throws(() => getPaymentsMode({ PAYMENTS_MODE: "free" }), PaymentsConfigError);
  assert.equal(isDemoMode({ PAYMENTS_MODE: "bogus" }), false);
});

test("card validation", () => {
  assert.ok(luhnValid("4242424242424242"));
  const ok = validateCard({ number: "4242 4242 4242 4242", expiry: "12/34", cvc: "123", name: "TARO" }, new Date("2026-10-09"));
  assert.deepEqual(ok, { ok: true, last4: "4242" });
  const bad = validateCard({ number: "4242 4242 4242 4241", expiry: "01/20", cvc: "1", name: "" }, new Date("2026-10-09"));
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ["cvc", "expiry", "name", "number"]);
});

test("demo token: pay, bind to input, reject tampering", async () => {
  process.env.DEMO_SIGNING_SECRET = "test-secret";
  const url = await createDemoCheckout("hash-a");
  const token = new URL(url, "http://x").searchParams.get("token");
  assert.ok(isDemoToken(token));
  assert.equal(await isDemoPaidFor(token, "hash-a"), false, "unpaid token is not paid");
  const paid = await payDemoCheckout(token);
  assert.ok(paid);
  assert.equal(await isDemoPaidFor(paid, "hash-a"), true);
  assert.equal(await isDemoPaidFor(paid, "hash-b"), false, "bound to the input hash");
  const forged = paid.replace(/\.[^.]+$/, ".AAAA");
  assert.equal(await isDemoPaidFor(forged, "hash-a"), false, "bad signature");
  process.env.DEMO_SIGNING_SECRET = "other-secret";
  assert.equal(await isDemoPaidFor(paid, "hash-a"), false, "other secret");
});
