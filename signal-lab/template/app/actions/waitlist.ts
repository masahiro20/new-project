"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";
import { sendMail } from "@/lib/mail";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getKV, key } from "@/lib/redis";
import { siteUrl } from "@/lib/site";

export type WaitlistState = { status: "idle" | "ok" | "error"; message: string };

const schema = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  company: z.string().max(0).optional(), // honeypot: humans never fill it
});

export async function joinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const done: WaitlistState = { status: "ok", message: t.waitlist.done };
  const honeypot = formData.get("company");
  if (typeof honeypot === "string" && honeypot.length > 0) return done; // pretend success for bots

  const parsed = schema.safeParse({ email: String(formData.get("email") ?? "").trim() });
  if (!parsed.success) return { status: "error", message: t.waitlist.invalid };

  const kv = getKV();
  if (!(await rateLimit(kv, `waitlist:${clientIp(await headers())}`, 5, 60 * 10))) {
    return { status: "error", message: t.waitlist.limited };
  }

  const { email } = parsed.data;
  const added = await kv.sadd(key("waitlist"), email);
  if (added) {
    await kv.hset(key("waitlist", "joined"), { [email]: new Date().toISOString() });
    after(async () => {
      await track(kv, "signup");
      await sendMail({ to: email, subject: t.mail.waitlistSubject(config.name), text: t.mail.waitlistBody(config.name, siteUrl()) });
    });
  }
  return done; // same answer for new and existing addresses
}
