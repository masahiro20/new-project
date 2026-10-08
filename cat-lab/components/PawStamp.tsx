export function PawStamp() {
  return (
    <svg className="paw-stamp" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#fff" stroke="#4a3a33" strokeWidth="4" />
      <circle cx="50" cy="50" r="46" fill="#ff7f66" opacity=".16" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="#ff7f66" strokeWidth="2.5" strokeDasharray="3 5" />
      <g fill="#ff7f66">
        <ellipse cx="50" cy="60" rx="14" ry="11" />
        <ellipse cx="30" cy="46" rx="6" ry="8" transform="rotate(-20 30 46)" />
        <ellipse cx="42" cy="34" rx="6" ry="8" transform="rotate(-6 42 34)" />
        <ellipse cx="58" cy="34" rx="6" ry="8" transform="rotate(6 58 34)" />
        <ellipse cx="70" cy="46" rx="6" ry="8" transform="rotate(20 70 46)" />
      </g>
      <text x="50" y="86" textAnchor="middle" fontSize="12" fontWeight="900" fill="#4a3a33">認定</text>
    </svg>
  );
}
