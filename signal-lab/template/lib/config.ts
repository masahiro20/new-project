import { z } from "zod";
import raw from "@/product.config";

// Validates product.config.ts. Importing this module parses the config, so an
// invalid config fails `next build` (and `npm test`) immediately.

const text = (max = 200) => z.string().trim().min(1).max(max);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb color");
// The OG image uses ImageResponse's bundled Latin font; CJK glyphs would render as tofu.
const latin = (max: number) =>
  text(max).regex(/^[\x20-\x7E -ɏ–—’]+$/, "OG text must be Latin/ASCII (no Japanese font is bundled)");

const ZERO_DECIMAL = new Set(["jpy", "krw", "vnd", "clp", "pyg", "ugx", "xaf", "xof", "bif", "djf", "gnf", "kmf", "mga", "rwf", "vuv", "xpf"]);

const planSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,32}$/, "plan id: lowercase letters, digits, - and _"),
    label: text(60),
    // Smallest currency unit (JPY: yen, USD: cents). Stripe's minimum is ~50 for both.
    amount: z.number().int().min(50),
    mode: z.enum(["payment", "subscription"]),
    interval: z.enum(["month", "year"]).optional(),
    features: z.array(text(120)).default([]),
    highlight: z.boolean().default(false),
  })
  .refine((p) => (p.mode === "subscription") === (p.interval !== undefined), {
    message: "interval is required for subscription plans and not allowed for payment plans",
    path: ["interval"],
  });

export const productConfigSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,30}$/, "slug: lowercase letters, digits and -"),
    name: text(60),
    tagline: text(140),
    description: text(300),
    locale: z.enum(["en", "ja"]),
    brand: z.object({ color: hex, ink: hex.default("#ffffff") }),
    links: z.object({
      supportEmail: z.email(),
      x: z.url().optional(),
      github: z.url().optional(),
    }),
    launch: z.object({ mode: z.enum(["waitlist", "presale", "live"]) }),
    pricing: z.object({
      currency: z.string().regex(/^[a-z]{3}$/),
      plans: z.array(planSchema).min(1),
    }),
    access: z.object({
      gate: z.enum(["none", "license"]),
      magicLink: z.boolean().default(true),
      sessionDays: z.number().int().min(1).max(400).default(30),
    }),
    landing: z.object({
      hero: z.object({ eyebrow: text(60).optional(), headline: text(120), sub: text(300) }),
      problem: z.object({ title: text(120), points: z.array(text(200)).min(1) }),
      features: z.array(z.object({ title: text(80), body: text(300) })).min(1),
      faq: z.array(z.object({ q: text(200), a: text(1000) })).default([]),
      socialProof: z.array(z.object({ quote: text(300), author: text(80) })).default([]),
    }),
    og: z.object({ title: latin(60), subtitle: latin(120) }),
    legal: z.object({
      sellerName: text(),
      representative: text(),
      address: text(300),
      phone: text(),
      email: text(),
      paymentTiming: text(300),
      deliveryTiming: text(300),
      refundPolicy: text(1000),
      cancellationPolicy: text(1000), // shown for subscription plans
      extraFees: text(300).default("インターネット接続にかかる通信料"),
      effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  })
  .refine((c) => new Set(c.pricing.plans.map((p) => p.id)).size === c.pricing.plans.length, {
    message: "plan ids must be unique",
    path: ["pricing", "plans"],
  });

export type ProductConfigInput = z.input<typeof productConfigSchema>;
export type ProductConfig = z.output<typeof productConfigSchema>;
export type Plan = ProductConfig["pricing"]["plans"][number];

export const PLACEHOLDER = "【要記入】";
const PLACEHOLDER_MARK = "【要記入"; // also matches 【要記入：…】 hints

/** Parse + validate. Throws a readable error listing every invalid field. */
export function parseConfig(input: unknown, env: { NODE_ENV?: string } = process.env): ProductConfig {
  const result = productConfigSchema.safeParse(input);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`product.config.ts is invalid:\n${lines.join("\n")}`);
  }
  const unfilled = findPlaceholders(result.data);
  if (env.NODE_ENV === "production" && unfilled.length > 0) {
    console.warn(`[config] ${PLACEHOLDER} is still present in: ${unfilled.join(", ")} — fill these before going live.`);
  }
  return result.data;
}

/** Dotted paths of every string that still contains 【要記入】. */
export function findPlaceholders(value: unknown, path = ""): string[] {
  if (typeof value === "string") return value.includes(PLACEHOLDER_MARK) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => findPlaceholders(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => findPlaceholders(v, path ? `${path}.${k}` : k));
  }
  return [];
}

export const config: ProductConfig = parseConfig(raw);

/** Name of the signed access cookie (read by proxy.ts, so it lives in this light module). */
export const ACCESS_COOKIE = `${config.slug}_access`;

export function getPlan(id: string): Plan | undefined {
  return config.pricing.plans.find((p) => p.id === id);
}

export const toMajorUnits = (amount: number, currency = config.pricing.currency) => (ZERO_DECIMAL.has(currency) ? amount : amount / 100);

export function formatAmount(amount: number, currency = config.pricing.currency, locale = config.locale): string {
  const major = toMajorUnits(amount, currency);
  return new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-US", { style: "currency", currency: currency.toUpperCase() }).format(major);
}

export const hasSubscription = () => config.pricing.plans.some((p) => p.mode === "subscription");
