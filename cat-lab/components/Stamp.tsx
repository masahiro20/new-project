export function Stamp({ text = "認定" }: { text?: string }) {
  return (
    <svg className="stamp" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="45" fill="none" stroke="#b3302a" strokeWidth="4" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="#b3302a" strokeWidth="1.5" />
      <text x="50" y="30" textAnchor="middle" fontSize="9" letterSpacing="2" fill="#b3302a" fontFamily="serif">主従研究所</text>
      <text x="50" y="62" textAnchor="middle" fontSize="28" fontWeight="900" fill="#b3302a" fontFamily="serif">{text}</text>
      <text x="50" y="80" textAnchor="middle" fontSize="8" letterSpacing="1" fill="#b3302a" fontFamily="serif">之印</text>
    </svg>
  );
}
