import { createHash } from "node:crypto";
import type { FacilityInput } from "./form";

/** Binds a paid Stripe session to the exact form contents, so one payment yields one facility's set. */
export function hashInput(input: FacilityInput): string {
  const canonical = JSON.stringify(
    Object.keys(input)
      .sort()
      .map((k) => [k, input[k as keyof FacilityInput]]),
  );
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
