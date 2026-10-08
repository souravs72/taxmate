/** TaxMate mark for native chrome. */
import { useId } from "react";

export default function TaxMateMark({ size = 56, title }: { size?: number; title?: string }) {
  const gid = `tm-star-${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#3B6CF6" />
        </linearGradient>
      </defs>
      <rect x="12" y="12" width="40" height="40" fill={`url(#${gid})`} />
      <rect x="12" y="12" width="40" height="40" fill={`url(#${gid})`} transform="rotate(45 32 32)" />
      <path d="M22.5 32.5l6.5 6.5 12.5-13" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
