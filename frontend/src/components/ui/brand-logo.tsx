import { cn } from "@/lib/cn";

export function BrandMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="pw-bg" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="55%" stopColor="#0e8573" />
          <stop offset="100%" stopColor="#0f5248" />
        </linearGradient>
        <linearGradient id="pw-top" x1="16" y1="8" x2="48" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5eead4" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="pw-cross" x1="20" y1="18" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ccfbf1" />
        </linearGradient>
      </defs>

      {/* Rounded squircle container */}
      <rect x="3" y="3" width="58" height="58" rx="15" fill="url(#pw-bg)" stroke="#99f6e4" strokeOpacity="0.35" strokeWidth="1.5" />

      {/* Isometric warehouse cube facets (subtle architectural depth) */}
      <path d="M32 9L52 20.5V43.5L32 55L12 43.5V20.5L32 9Z" fill="#0b3b34" fillOpacity="0.38" stroke="#5eead4" strokeOpacity="0.3" strokeWidth="1.2" />
      <path d="M32 9L52 20.5L32 32L12 20.5L32 9Z" fill="url(#pw-top)" />
      <path d="M32 32V55" stroke="#5eead4" strokeOpacity="0.22" strokeWidth="1.2" />

      {/* Clinical Pharmacy Cross (centerpiece) */}
      <path
        d="M28 19C28 17.8954 28.8954 17 30 17H34C35.1046 17 36 17.8954 36 19V28H45C46.1046 28 47 28.8954 47 30V34C47 35.1046 46.1046 36 45 36H36V45C36 46.1046 35.1046 47 34 47H30C28.8954 47 28 46.1046 28 45V36H19C17.8954 36 17 35.1046 17 34V30C17 28.8954 17.8954 28 19 28H28V19Z"
        fill="url(#pw-cross)"
      />

      {/* Inner warehouse shelf/lot line + AI forecast pulse node */}
      <path
        d="M23 34L28.5 30.5L33.5 33L41 25.5"
        stroke="#0e8573"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="41" cy="25.5" r="2.6" fill="#10b981" stroke="#ffffff" strokeWidth="1.2" />
    </svg>
  );
}
