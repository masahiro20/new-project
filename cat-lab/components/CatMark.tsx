export function CatMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label="猫のマーク">
      <path d="M10 28 8 6l16 10c5-2 11-2 16 0L56 6l-2 22c3 5 4 10 3 15-2 9-12 15-25 15S9 52 7 43c-1-5 0-10 3-15Z" fill="#2a2521" />
      <ellipse cx="23" cy="34" rx="4.2" ry="5.2" fill="#fffcf5" />
      <ellipse cx="41" cy="34" rx="4.2" ry="5.2" fill="#fffcf5" />
      <ellipse cx="23.6" cy="34.6" rx="1.4" ry="3.6" fill="#2a2521" />
      <ellipse cx="41.4" cy="34.6" rx="1.4" ry="3.6" fill="#2a2521" />
      <path d="m29.5 42 2.5 2.6 2.5-2.6Z" fill="#b3302a" />
      <path d="M32 44.6v3m0 0c-1.6 2-4 2-5.4.8M32 47.6c1.6 2 4 2 5.4.8" fill="none" stroke="#fffcf5" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
