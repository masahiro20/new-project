import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

// The 特商法 page tells buyers where to cancel; the name must be the button they actually see
// (components/client/AppBar.tsx renders t.access.billing). Ren QA: it said 「Billing」.
describe("特商法：解約方法のボタン名", () => {
  it("names the real billing button", () => {
    expect(config.legal.cancellationPolicy).toContain(`「${t.access.billing}」`);
  });
});
