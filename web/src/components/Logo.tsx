/** Ideas Portal logo: a lightbulb that lights up. */
export function LogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`ip-logo ${className}`} role="img" aria-label="Ideas Portal logo">
      <defs>
        <radialGradient id="ip-fill" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ffe3a1" />
        </radialGradient>
        <radialGradient id="ip-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd37a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffd37a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#0f6b61" />
      <circle className="ip-glow" cx="32" cy="26" r="25" fill="url(#ip-glow)" />
      <g className="ip-rays" stroke="#ffc65c" strokeWidth="2.6" strokeLinecap="round">
        <path d="M32 8V4" />
        <path d="M44.4 12.6l3-3" />
        <path d="M19.6 12.6l-3-3" />
        <path d="M50.5 25h4" />
        <path d="M13.5 25h-4" />
      </g>
      <path className="ip-bulb" d="M32 12a13 13 0 0 1 7.5 23.6c-1.3 1-1.8 2.2-1.8 3.9H26.3c0-1.7-.5-2.9-1.8-3.9A13 13 0 0 1 32 12z" fill="url(#ip-fill)" />
      <rect x="26.5" y="42" width="11" height="3.6" rx="1.8" fill="#ffffff" />
      <rect x="28.5" y="47" width="7" height="3" rx="1.5" fill="#ffffff" />
    </svg>
  );
}

export function Logo({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={36} />
      <span className="font-serif text-xl font-semibold tracking-tight">{name}</span>
    </span>
  );
}
