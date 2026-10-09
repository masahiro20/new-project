// Feedback for dashboard actions: /api/app/* answer with { msg: <key> }. Unknown values are ignored.
export const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  checked: { text: "Check finished." },
  busy: { text: "This connection is being checked right now (hourly check). Try again in a minute.", error: true },
  removed: { text: "Connection removed. Its token was deleted." },
  tested: { text: "Test run recorded below. Nothing was sent to the provider." },
  armed: { text: "Live mode armed. At 100% of budget the stop action will run automatically." },
  stopped: { text: "Stop action executed. See the activity log for how to undo it." },
  "stop-failed": { text: "Stop action failed. See the activity log.", error: true },
  "mode-test": { text: "Back in test mode. Automatic stops will only be simulated." },
  "mode-off": { text: "Stop action turned off. You will still get emails." },
  "confirm-label-mismatch": { text: "The label you typed did not match. Nothing was changed.", error: true },
  "confirm-expired": { text: "The confirmation expired (5 minutes). Review the plan again.", error: true },
  "confirm-plan-changed": { text: "The planned requests changed since you reviewed them. Review again.", error: true },
  "confirm-bad-signature": { text: "Invalid confirmation. Reload the page.", error: true },
  "confirm-wrong-target": { text: "Invalid confirmation. Reload the page.", error: true },
  "confirm-malformed": { text: "Invalid confirmation. Reload the page.", error: true },
  "not-found": { text: "Connection not found.", error: true },
  "bad-request": { text: "Bad request.", error: true },
  "slack-removed": { text: "Slack webhook removed." },
  "slack-sent": { text: "Test message sent to Slack." },
  "slack-failed": { text: "Slack did not accept the test message. Check the webhook URL.", error: true },
  "hook-saved": { text: "Webhook secret saved. Vercel alerts for this team will now trigger an immediate check." },
  "hook-removed": { text: "Webhook secret removed. The webhook URL now rejects every request." },
  "hook-invalid": { text: "The secret looks wrong (8–200 characters).", error: true },
};

export function Flash({ msg }: { msg?: string | string[] }) {
  const m = typeof msg === "string" ? MESSAGES[msg] : undefined;
  return m ? <p className={m.error ? "msg err" : "msg ok"}>{m.text}</p> : null;
}
