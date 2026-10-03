// Shield-check mark — used to indicate the Safe-Browsing (malware/phishing) scan.
export default function ShieldIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    >
      <path stroke="currentColor" d="M12 3l7 3v5c0 4.3-2.8 7.9-7 9-4.2-1.1-7-4.7-7-9V6l7-3z" />
      <path stroke="currentColor" d="M9 12l2 2 4-4" />
    </svg>
  );
}