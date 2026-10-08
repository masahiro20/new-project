import { describe, expect, it, vi } from "vitest";
import product from "@/product.config";
import { findPlaceholders, formatAmount, parseConfig } from "@/lib/config";

const clone = () => structuredClone(product) as Record<string, any>;

describe("product config", () => {
  it("accepts the shipped config and applies defaults", () => {
    const c = parseConfig(product, {});
    expect(c.slug).toBe(product.slug);
    expect(c.brand.ink).toBe("#ffffff");
    expect(c.pricing.plans[1].highlight).toBe(false);
  });

  it.each([
    ["bad slug", (c: any) => (c.slug = "Not A Slug"), "slug"],
    ["subscription without interval", (c: any) => ((c.pricing.plans[0].mode = "subscription"), delete c.pricing.plans[0].interval), "pricing.plans.0.interval"],
    ["payment with interval", (c: any) => ((c.pricing.plans[0].mode = "payment"), (c.pricing.plans[0].interval = "month")), "pricing.plans.0.interval"],
    ["duplicate plan ids", (c: any) => (c.pricing.plans[1].id = c.pricing.plans[0].id), "pricing.plans"],
    ["amount below Stripe minimum", (c: any) => (c.pricing.plans[0].amount = 10), "pricing.plans.0.amount"],
    ["Japanese OG text", (c: any) => (c.og.title = "シグナル"), "og.title"],
    ["bad brand color", (c: any) => (c.brand.color = "green"), "brand.color"],
    ["unknown launch mode", (c: any) => (c.launch.mode = "beta"), "launch.mode"],
  ])("rejects %s", (_name, mutate, path) => {
    const c = clone();
    mutate(c);
    expect(() => parseConfig(c, {})).toThrow(path);
  });

  it("finds 【要記入】 placeholders and warns only in production", () => {
    const c = clone();
    c.legal.sellerName = "【要記入：氏名】";
    c.legal.address = "東京都";
    expect(findPlaceholders(c)).toContain("legal.sellerName");
    expect(findPlaceholders(c)).not.toContain("legal.address");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    parseConfig(c, { NODE_ENV: "development" });
    expect(warn).not.toHaveBeenCalled();
    parseConfig(c, { NODE_ENV: "production" });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("formats amounts in the smallest currency unit", () => {
    expect(formatAmount(2980, "jpy", "ja")).toMatch(/2,980/);
    expect(formatAmount(1999, "usd", "en")).toBe("$19.99");
  });
});
