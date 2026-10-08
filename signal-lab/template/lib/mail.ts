import { config } from "./config";
import { isProduction, warnOnce } from "./site";

export type Mail = { to: string; subject: string; text: string };

/** Last few mails "sent" without Resend configured — handy in tests and dev. */
export const devOutbox: Mail[] = [];
const OUTBOX_SIZE = 20;

/** Sends via the Resend REST API, or logs to the console when RESEND_API_KEY is unset. */
export async function sendMail(mail: Mail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (isProduction()) warnOnce("mail-prod", "[mail] RESEND_API_KEY is not set in production — emails are only logged.");
    devOutbox.push(mail);
    if (devOutbox.length > OUTBOX_SIZE) devOutbox.shift();
    console.info(`[mail:dev] to=${mail.to} subject=${JSON.stringify(mail.subject)}\n${mail.text}`);
    return;
  }
  const from = process.env.MAIL_FROM ?? `${config.name} <no-reply@example.com>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, reply_to: config.links.supportEmail }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
}
