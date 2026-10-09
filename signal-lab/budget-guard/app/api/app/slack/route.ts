import { badRequest, guard, json, readJson } from "@/lib/api";
import { getKV } from "@/lib/redis";
import { demoTokensAllowed } from "@/lib/guard/demo";
import { DEMO_SLACK_URL, isSlackWebhookUrl } from "@/lib/guard/notify-channels";
import { slackSchema } from "@/lib/guard/schemas";
import { sendSlackTest, setSlackUrl } from "@/lib/guard/service";

/** POST (JSON {op}): save {url} | remove | test. The URL is a secret: stored sealed, never returned. */
export async function POST(request: Request) {
  const kv = getKV();
  const account = await guard(request, kv, { mutation: true });
  if (account instanceof Response) return account;
  const op = slackSchema.safeParse(await readJson(request));
  if (!op.success) return badRequest();
  switch (op.data.op) {
    case "save": {
      const url = op.data.url.trim();
      const demoOk = url === DEMO_SLACK_URL && demoTokensAllowed();
      if (!demoOk && !isSlackWebhookUrl(url)) return badRequest("Paste a Slack incoming webhook URL (https://hooks.slack.com/services/…).");
      await setSlackUrl(kv, account.id, url);
      return json({ ok: true, message: "Slack webhook saved. Use “Send test message” to check it." });
    }
    case "remove":
      await setSlackUrl(kv, account.id, null);
      return json({ ok: true, msg: "slack-removed" });
    case "test":
      try {
        await sendSlackTest(kv, account.id);
        return json({ ok: true, msg: "slack-sent" });
      } catch {
        return json({ ok: false, msg: "slack-failed" }, 502);
      }
  }
}
