import { AXES, AXIS_ORDER } from "@/lib/questions";
import { AXIS_COMMENTS, levelOf } from "@/lib/types";
import type { AxisScores } from "@/lib/scoring";

export function AxisBars({ axes }: { axes: AxisScores }) {
  return (
    <div className="axes">
      {AXIS_ORDER.map((a) => (
        <div className="axis" key={a}>
          <div className="row">
            <b><span aria-hidden="true">{AXES[a].icon}</span>{AXES[a].name}</b>
            <span>{axes[a]}%</span>
          </div>
          <div className="bar" role="img" aria-label={`${AXES[a].name} ${axes[a]}%`}>
            <i className={`k-${a}`} style={{ ["--w" as string]: `${axes[a]}%` }} />
          </div>
          <div className="ends">
            <span>{AXES[a].low}</span>
            <span>{AXES[a].high}</span>
          </div>
          <p className="cmt">{AXIS_COMMENTS[a][levelOf(axes[a])]}</p>
        </div>
      ))}
    </div>
  );
}
