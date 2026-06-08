/**
 * Inline SVG logos for providers, partners, and distribution channels.
 * Self-contained — no external image dependencies.
 *
 * Sized 24×24 by default; pass size prop for larger contexts.
 */

interface LogoProps {
  size?: number;
  className?: string;
}

// ─── Provider logos (Blue Agent ecosystem) ────────────────────────────────────

export function BlueAgentLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <defs>
        <linearGradient id="ba-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4FC3F7" />
          <stop offset="100%" stopColor="#A78BFA" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#ba-grad)" />
      <path d="M10 22V10h5.5c2.5 0 4 1.4 4 3.4 0 1.4-.7 2.4-1.8 2.9 1.4.4 2.3 1.4 2.3 3 0 2.1-1.6 3.7-4.2 3.7H10zm2.5-7h2.7c1.2 0 2-.6 2-1.5s-.8-1.5-2-1.5h-2.7V15zm0 5h3c1.4 0 2.3-.6 2.3-1.8 0-1-.9-1.7-2.3-1.7h-3V20z" fill="#050508"/>
    </svg>
  );
}

export function AeonLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#A78BFA" />
      <circle cx="16" cy="16" r="9" stroke="#050508" strokeWidth="2" fill="none" />
      <circle cx="16" cy="16" r="3" fill="#050508" />
      <path d="M16 4v3M16 25v3M28 16h-3M7 16H4" stroke="#050508" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function MiroSharkLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#34D399" />
      <path d="M6 18l8-8 6 4 6-6-4 12-6-4-10 4v-2z" fill="#050508" />
      <circle cx="13" cy="13" r="1" fill="#34D399" />
    </svg>
  );
}

// Generic community / unknown provider
export function CommunityLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#F59E0B" fillOpacity="0.15" stroke="#F59E0B" strokeOpacity="0.4" />
      <text x="16" y="22" textAnchor="middle" fill="#F59E0B" fontSize="14" fontWeight="700" fontFamily="ui-monospace,monospace">+</text>
    </svg>
  );
}

// ─── Partner logos (Base ecosystem) ───────────────────────────────────────────

export function BaseLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="14" fill="#0052FF" />
      <path d="M15.7 26c5.5 0 10-4.5 10-10s-4.5-10-10-10c-5.2 0-9.5 4-9.9 9.1h13.2v1.7H5.8c.4 5.2 4.7 9.2 9.9 9.2z" fill="#fff"/>
    </svg>
  );
}

export function CoinbaseLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="14" fill="#0052FF" />
      <rect x="11" y="11" width="10" height="10" rx="1" fill="#fff" />
    </svg>
  );
}

export function AnthropicLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="6" fill="#D97757" />
      <path d="M11.5 9h-3.2L4 23h3l1-3h5l1 3h3L13.5 9h-2zM8.6 17.5L10.5 12l1.9 5.5h-3.8z" fill="#fff" />
      <path d="M20.5 9h3.2L28 23h-3l-1-3h-5l-1 3h-3L18.5 9h2zm2.9 8.5l-1.9-5.5-1.9 5.5h3.8z" fill="#fff" />
    </svg>
  );
}

export function UniswapLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="14" fill="#FF007A" />
      <path d="M11.5 9c2 3 5 4 7.5 3 2-.8 3-2.5 3-4 0 2-1 4-3 5.5-1.5 1-3.5 1.5-5 3-1.5 1.5-1.5 4 1 5.5 2.5 1.5 5 0 5-2 0 2-1 3.5-3 4.5-2.5 1-5.5 0-7-2-1-1.5-1-3 0-4.5 1-1.5 3-2 4-3 1-1 1.5-2.5 0-4.5-1-1.3-2-2-3-2.5z" fill="#fff" />
    </svg>
  );
}

export function BankrLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#F59E0B" />
      <text x="16" y="22" textAnchor="middle" fill="#050508" fontSize="16" fontWeight="900" fontFamily="ui-monospace,monospace">Bk</text>
    </svg>
  );
}

export function VercelLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="6" fill="#000" stroke="#1A1A2E" />
      <path d="M16 8l8 14H8L16 8z" fill="#fff" />
    </svg>
  );
}

// ─── Distribution channel logos ───────────────────────────────────────────────

export function SmitheryLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="6" fill="#E36B2C" />
      <path d="M9 9h5l3 6 3-6h5l-5 9 5 9h-5l-3-6-3 6H9l5-9-5-9z" fill="#fff" />
    </svg>
  );
}

export function McpSoLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="6" fill="#1A1A2E" stroke="#475569" />
      <text x="16" y="21" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="800" fontFamily="ui-monospace,monospace">MCP</text>
    </svg>
  );
}

export function CdpLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="14" fill="#0052FF" />
      <text x="16" y="21" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="800" fontFamily="ui-monospace,monospace">CDP</text>
    </svg>
  );
}

export function AgenticMarketLogo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="6" fill="#F59E0B" />
      <circle cx="16" cy="14" r="3" fill="#fff" />
      <path d="M10 24c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

// ─── Provider lookup by name ──────────────────────────────────────────────────

export function ProviderLogo({ provider, size = 24, className = "" }: LogoProps & { provider: string }) {
  switch (provider.toLowerCase()) {
    case "blue agent":
    case "blueagent":
      return <BlueAgentLogo size={size} className={className} />;
    case "aeon":
      return <AeonLogo size={size} className={className} />;
    case "miroshark":
      return <MiroSharkLogo size={size} className={className} />;
    default:
      return <CommunityLogo size={size} className={className} />;
  }
}
