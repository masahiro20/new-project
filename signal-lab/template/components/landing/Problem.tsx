import { config } from "@/lib/config";

export function Problem() {
  const { problem } = config.landing;
  return (
    <section>
      <div className="wrap">
        <h2>{problem.title}</h2>
        <div className="grid">
          {problem.points.map((p) => <div key={p} className="card"><p>{p}</p></div>)}
        </div>
      </div>
    </section>
  );
}
