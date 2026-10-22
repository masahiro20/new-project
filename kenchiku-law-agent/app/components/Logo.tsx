/** Mark: a lot outline with a pin, drawn as one stroke. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="logo-mark">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="var(--signal)" />
      <path d="M7 24 L7 13 L16 7 L25 13 L25 24 Z" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="16" cy="17" r="3.4" fill="var(--ink)" />
      <path d="M16 20.4 V24" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
