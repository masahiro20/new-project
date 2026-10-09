import { guard, json } from "@/lib/api";
import { getKV } from "@/lib/redis";
import { dashboardView } from "@/lib/guard/views";

/** GET: everything the /app dashboard shows. 401 without a valid access cookie. */
export async function GET(request: Request) {
  const kv = getKV();
  const account = await guard(request, kv, { mutation: false });
  if (account instanceof Response) return account;
  return json(await dashboardView(kv, account));
}
