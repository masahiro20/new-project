import { config } from "@/lib/config";
import { requireAccess } from "@/lib/session";

// ★ The product itself lives under app/(product)/app/. Replace this placeholder.
export default async function AppHome() {
  const access = await requireAccess(); // cached per request; cheap to call again
  return (
    <section>
      <h1>{config.name}</h1>
      <p className="lead">{config.tagline}</p>
      <p className="ok">
        {access.gated ? `Plan: ${access.plan} · ${access.entitlement.email}` : "Open access (access.gate = none)"}
      </p>
    </section>
  );
}
