/** Endless ticker. The list is rendered twice so the loop is seamless. */
export default function Marquee({ items }: { items: string[] }) {
  const row = (hidden: boolean) => (
    <div className="marquee-row" aria-hidden={hidden || undefined}>
      {items.map((t, i) => (
        <span key={i}>
          {t}
          <i aria-hidden>／</i>
        </span>
      ))}
    </div>
  );
  return (
    <div className="marquee">
      <div className="marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
