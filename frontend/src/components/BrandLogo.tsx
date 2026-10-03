import { useId } from "react";

// LinkSnip brand mark — gradient link icon (brand colors, constant across themes).
export default function BrandLogo({ size = 28 }: { size?: number }) {
  const id = useId(); // unique gradient id so multiple logos don't clash
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#9333ea" />
        </linearGradient>
      </defs>
      <path
        stroke={`url(#${id})`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
      />
    </svg>
  );
}
