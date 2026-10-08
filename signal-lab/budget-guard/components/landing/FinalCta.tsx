import { config } from "@/lib/config";
import { Cta } from "./Cta";

export function FinalCta() {
  return (
    <section>
      <div className="wrap narrow" style={{ textAlign: "center" }}>
        <h2>{config.tagline}</h2>
        <div style={{ display: "flex", justifyContent: "center" }}><Cta /></div>
      </div>
    </section>
  );
}
