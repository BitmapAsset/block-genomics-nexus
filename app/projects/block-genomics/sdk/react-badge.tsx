/**
 * Block Genomics — React Badge Component
 *
 * Drop-in React component for Next.js and React apps.
 * Supports all badge styles, themes, and trust tiers.
 *
 * @example
 * ```tsx
 * import { BlockGenomicsBadge } from './react-badge';
 *
 * <BlockGenomicsBadge genomeId="bg_a3f7b2c1d4e5f6a7" style="standard" theme="dark" />
 * <BlockGenomicsBadge agent={agentData} style="detailed" />
 * ```
 *
 * @version 1.0.0
 */

'use client';

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type CSSProperties,
  type FC,
} from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BadgeStyle = 'minimal' | 'standard' | 'detailed' | 'icon-only';
export type BadgeTheme = 'dark' | 'light' | 'transparent';
export type TrustTier = 1 | 2 | 3;

export interface TrustComponents {
  total: number;
  age: { score: number; max: number; years: string };
  richness: { score: number; max: number; txCount: number; size: number };
  security: { score: number; max: number; difficulty: number };
  ownership: { score: number; max: number };
  history: { score: number; max: number };
}

export interface AgentData {
  id: string;
  name: string;
  blockHeight: number;
  genome: string;
  tier: TrustTier;
  trustScore: number;
  trustComponents?: TrustComponents;
  dnaSequence?: string;
  verified: boolean;
  registeredAt?: string;
}

export interface BlockGenomicsBadgeProps {
  /** Genome/Agent ID — fetches agent data from API */
  genomeId?: string;
  /** Agent data object — render directly without fetching */
  agent?: AgentData;
  /** Badge style */
  style?: BadgeStyle;
  /** Color theme */
  theme?: BadgeTheme;
  /** Enable animations */
  animate?: boolean;
  /** Override verification link URL */
  verifyUrl?: string;
  /** API base URL (default: https://verify.blockgenomics.io/api/v1) */
  apiBase?: string;
  /** Additional CSS class */
  className?: string;
  /** Inline styles for the wrapper */
  wrapperStyle?: CSSProperties;
  /** Called when agent data loads */
  onLoad?: (agent: AgentData) => void;
  /** Called on fetch error */
  onError?: (error: Error) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const API_BASE_DEFAULT = 'https://verify.blockgenomics.io/api/v1';
const VERIFY_BASE = 'https://verify.blockgenomics.io/agent';

const TIER_COLORS: Record<TrustTier, { primary: string; label: string }> = {
  1: { primary: '#f7931a', label: 'Block Owner' },
  2: { primary: '#94a3b8', label: 'TX Anchor' },
  3: { primary: '#cd7f32', label: 'Delegated' },
};

const THEME_STYLES: Record<BadgeTheme, Record<string, string>> = {
  dark: {
    bg: '#0a0a0f',
    bgAlt: '#0c0c14',
    text: '#f0f0f5',
    muted: '#a0a0b0',
    dim: '#606070',
    border: '#1e1e2e',
    borderAlpha: 'rgba(255,255,255,0.06)',
    glass: 'rgba(255,255,255,0.03)',
    glassStroke: 'rgba(255,255,255,0.08)',
  },
  light: {
    bg: '#ffffff',
    bgAlt: '#f8f9fc',
    text: '#111118',
    muted: '#555566',
    dim: '#888899',
    border: '#d0d5dd',
    borderAlpha: 'rgba(0,0,0,0.08)',
    glass: 'rgba(0,0,0,0.02)',
    glassStroke: 'rgba(0,0,0,0.06)',
  },
  transparent: {
    bg: 'transparent',
    bgAlt: 'transparent',
    text: '#f0f0f5',
    muted: '#a0a0b0',
    dim: '#606070',
    border: 'rgba(255,255,255,0.1)',
    borderAlpha: 'rgba(255,255,255,0.05)',
    glass: 'rgba(255,255,255,0.04)',
    glassStroke: 'rgba(255,255,255,0.1)',
  },
};

const ACCENT = { cyan: '#66ccff', purple: '#a855f7', gold: '#f7931a' };

const DNA_PALETTE = [
  ACCENT.cyan, ACCENT.purple, ACCENT.gold,
  '#22c55e', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function truncGenome(g: string, len = 16): string {
  return g.slice(0, len) + '…';
}

function genomeColors(genome: string, count = 24): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = parseInt(genome[i % genome.length], 16);
    colors.push(DNA_PALETTE[idx % DNA_PALETTE.length]);
  }
  return colors;
}

function trustArcPath(cx: number, cy: number, r: number, score: number, max = 100): string {
  const angle = (score / max) * 360;
  const rad = (angle - 90) * (Math.PI / 180);
  const x = cx + r * Math.cos(rad);
  const y = cy + r * Math.sin(rad);
  const large = angle > 180 ? 1 : 0;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${x} ${y}`;
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

const CheckmarkIcon: FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} />
    <path d="M7.5 12.5L10.5 15.5L16.5 9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DnaIcon: FC<{ size: number; color: string }> = ({ size, color }) => {
  const s = size / 20;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${20} ${20}`} fill="none">
      <path d="M6 2C6 2 6 6 10 10C14 14 14 18 14 18" stroke={color} strokeWidth={1.5 / s} strokeLinecap="round" opacity={0.8} />
      <path d="M14 2C14 2 14 6 10 10C6 14 6 18 6 18" stroke={color} strokeWidth={1.5 / s} strokeLinecap="round" opacity={0.8} />
      <line x1="7" y1="5" x2="13" y2="5" stroke={color} strokeWidth={1 / s} opacity={0.4} />
      <line x1="6.5" y1="10" x2="13.5" y2="10" stroke={color} strokeWidth={1 / s} opacity={0.4} />
      <line x1="7" y1="15" x2="13" y2="15" stroke={color} strokeWidth={1 / s} opacity={0.4} />
    </svg>
  );
};

const TrustRing: FC<{
  score: number;
  size: number;
  strokeWidth: number;
  color: string;
  textColor: string;
  dimColor: string;
  animate?: boolean;
}> = ({ score, size, strokeWidth, color, textColor, dimColor, animate }) => {
  const r = (size - strokeWidth * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={dimColor} strokeWidth={strokeWidth} opacity={0.3} />
      <path
        d={trustArcPath(cx, cy, r, score)}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        style={animate ? {
          transition: 'stroke-dasharray 1s ease',
        } : undefined}
      />
      <text
        x={cx}
        y={cy + 2}
        textAnchor="middle"
        fontFamily="system-ui,-apple-system,sans-serif"
        fontSize={size * 0.3}
        fontWeight={800}
        fill={textColor}
      >
        {score}
      </text>
      <text
        x={cx}
        y={cy + size * 0.18}
        textAnchor="middle"
        fontFamily="system-ui,-apple-system,sans-serif"
        fontSize={size * 0.1}
        fontWeight={600}
        fill={dimColor}
        letterSpacing="1.5"
      >
        TRUST
      </text>
    </svg>
  );
};

// ─── Badge Variants ──────────────────────────────────────────────────────────

const IconOnlyBadge: FC<{ agent: AgentData; thm: Record<string, string>; tier: typeof TIER_COLORS[1] }> = ({ agent, tier }) => (
  <CheckmarkIcon size={24} color={tier.primary} />
);

const MinimalBadge: FC<{
  agent: AgentData;
  thm: Record<string, string>;
  tier: typeof TIER_COLORS[1];
}> = ({ agent, thm, tier }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      height: 28,
      borderRadius: 6,
      border: `1px solid ${thm.borderAlpha}`,
      background: thm.bg,
      overflow: 'hidden',
      fontSize: 11,
      fontFamily: 'system-ui,-apple-system,sans-serif',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 8px',
        height: '100%',
        background: `${tier.primary}19`,
        borderRight: `1px solid ${tier.primary}26`,
      }}
    >
      <CheckmarkIcon size={14} color={tier.primary} />
      <span style={{ fontWeight: 600, color: tier.primary }}>Verified</span>
    </div>
    <span
      style={{
        padding: '0 8px',
        fontFamily: 'ui-monospace,monospace',
        fontSize: 10,
        color: thm.text,
      }}
    >
      Block #{fmtNum(agent.blockHeight)}
    </span>
    <span
      style={{
        padding: '0 8px',
        fontFamily: 'ui-monospace,monospace',
        fontSize: 9,
        color: thm.dim,
      }}
    >
      {truncGenome(agent.genome, 12)}
    </span>
    <div
      style={{
        padding: '0 8px',
        height: 20,
        margin: 4,
        borderRadius: 4,
        background: `${tier.primary}1a`,
        display: 'flex',
        alignItems: 'center',
        fontWeight: 700,
        fontSize: 10,
        color: tier.primary,
      }}
    >
      {agent.trustScore}/100
    </div>
  </div>
);

const StandardBadge: FC<{
  agent: AgentData;
  thm: Record<string, string>;
  tier: typeof TIER_COLORS[1];
  animate?: boolean;
}> = ({ agent, thm, tier, animate }) => {
  const dnaColors = useMemo(() => genomeColors(agent.genome, 24), [agent.genome]);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        width: 360,
        height: 80,
        borderRadius: 12,
        background: thm.bg,
        border: `1px solid ${thm.borderAlpha}`,
        padding: '12px 16px',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'system-ui,-apple-system,sans-serif',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Tier accent line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: tier.primary,
          opacity: 0.6,
          borderRadius: '12px 0 0 12px',
        }}
      />

      {/* DNA Icon */}
      <div style={{ flexShrink: 0 }}>
        <DnaIcon size={28} color={tier.primary} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: thm.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {agent.name}
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.8px',
            color: tier.primary,
            padding: '2px 6px',
            borderRadius: 3,
            background: `${tier.primary}1a`,
            width: 'fit-content',
          }}
        >
          TIER {agent.tier} · {tier.label.toUpperCase()}
        </div>
        <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, color: thm.muted }}>
          Block #{fmtNum(agent.blockHeight)} · {truncGenome(agent.genome)}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {dnaColors.map((c, i) => (
            <div
              key={i}
              style={{
                width: 5,
                height: 4,
                borderRadius: 1,
                background: c,
                opacity: 0.7,
              }}
            />
          ))}
        </div>
      </div>

      {/* Trust Ring */}
      <div style={{ flexShrink: 0 }}>
        <TrustRing
          score={agent.trustScore}
          size={48}
          strokeWidth={3}
          color={tier.primary}
          textColor={thm.text}
          dimColor={thm.dim}
          animate={animate}
        />
      </div>
    </div>
  );
};

const DetailedBadge: FC<{
  agent: AgentData;
  thm: Record<string, string>;
  tier: typeof TIER_COLORS[1];
  animate?: boolean;
}> = ({ agent, thm, tier, animate }) => {
  const dnaColors = useMemo(() => genomeColors(agent.genome, 48), [agent.genome]);
  const tc = agent.trustComponents;

  const breakdownRows = useMemo(() => tc ? [
    { label: 'Block Age', score: tc.age.score, max: tc.age.max },
    { label: 'Richness', score: tc.richness.score, max: tc.richness.max },
    { label: 'Security', score: tc.security.score, max: tc.security.max },
    { label: 'Ownership', score: tc.ownership.score, max: tc.ownership.max },
    { label: 'History', score: tc.history.score, max: tc.history.max },
  ] : [], [tc]);

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        width: 420,
        minHeight: 220,
        borderRadius: 16,
        background: thm.bg,
        border: `1px solid ${thm.borderAlpha}`,
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'system-ui,-apple-system,sans-serif',
      }}
    >
      {/* Gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 16,
          background: `linear-gradient(135deg, ${tier.primary}0a 0%, transparent 50%)`,
          pointerEvents: 'none',
        }}
      />

      {/* ═══ HEADER ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DnaIcon size={24} color={tier.primary} />
            <span style={{ fontSize: 16, fontWeight: 800, color: thm.text }}>{agent.name}</span>
            <CheckmarkIcon size={18} color={tier.primary} />
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.8px',
              color: tier.primary,
              padding: '2px 8px',
              borderRadius: 4,
              background: `${tier.primary}1a`,
              border: `0.5px solid ${tier.primary}4d`,
              width: 'fit-content',
            }}
          >
            TIER {agent.tier} · {tier.label.toUpperCase()}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'ui-monospace,monospace', fontSize: 10, color: thm.muted, lineHeight: 1.6 }}>
          <div>Block #{fmtNum(agent.blockHeight)}</div>
          <div style={{ color: thm.dim, fontSize: 9 }}>{truncGenome(agent.genome, 20)}</div>
        </div>
      </div>

      {/* Separator */}
      <div style={{ width: '100%', height: 1, background: thm.border, opacity: 0.5, margin: '4px 0 8px', position: 'relative', zIndex: 1 }} />

      {/* ═══ DNA VISUALIZATION ═══ */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: thm.dim, letterSpacing: 1, marginBottom: 6 }}>GENOME SIGNATURE</div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 24 }}>
          {dnaColors.map((c, i) => {
            const barH = 6 + (parseInt(agent.genome[(i * 2) % agent.genome.length], 16) / 15) * 18;
            return (
              <div
                key={i}
                style={{
                  width: 6,
                  height: barH,
                  borderRadius: 1.5,
                  background: c,
                  opacity: 0.75,
                  transition: animate ? 'height 0.3s ease' : undefined,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* ═══ TRUST BREAKDOWN ═══ */}
      {breakdownRows.length > 0 && (
        <div style={{ marginTop: 12, position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: thm.dim, letterSpacing: 1, marginBottom: 6 }}>TRUST BREAKDOWN</div>
          {breakdownRows.map((row) => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 9, marginBottom: 3 }}>
              <span style={{ width: 64, color: thm.muted }}>{row.label}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: `${tier.primary}14`, overflow: 'hidden', maxWidth: 120 }}>
                <div
                  style={{
                    width: `${(row.score / row.max) * 100}%`,
                    height: '100%',
                    borderRadius: 4,
                    background: tier.primary,
                    opacity: 0.7,
                    transition: animate ? 'width 0.8s ease' : undefined,
                  }}
                />
              </div>
              <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 8, color: thm.dim, width: 32 }}>
                {row.score}/{row.max}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ═══ TRUST RING (Positioned right) ═══ */}
      <div
        style={{
          position: 'absolute',
          top: 85,
          right: 20,
        }}
      >
        <TrustRing
          score={agent.trustScore}
          size={90}
          strokeWidth={4}
          color={tier.primary}
          textColor={thm.text}
          dimColor={thm.dim}
          animate={animate}
        />
      </div>

      {/* ═══ FOOTER ═══ */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 'auto',
          paddingTop: 8,
          borderTop: `1px solid ${tier.primary}0f`,
          fontSize: 8,
          color: thm.dim,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span>Verified by Block Genomics · blockgenomics.io</span>
        {agent.registeredAt && (
          <span>Since {new Date(agent.registeredAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
        )}
      </div>
    </div>
  );
};

// ─── Loading / Error States ──────────────────────────────────────────────────

const LoadingBadge: FC<{ style: BadgeStyle; thm: Record<string, string> }> = ({ style: badgeStyle, thm }) => {
  const dims: Record<BadgeStyle, { w: number; h: number }> = {
    'icon-only': { w: 24, h: 24 },
    minimal: { w: 320, h: 28 },
    standard: { w: 360, h: 80 },
    detailed: { w: 420, h: 220 },
  };
  const d = dims[badgeStyle];
  return (
    <div
      style={{
        width: d.w,
        height: d.h,
        borderRadius: badgeStyle === 'icon-only' ? '50%' : 12,
        background: thm.bg === 'transparent' ? 'rgba(10,10,15,0.4)' : thm.bg,
        border: `1px solid ${thm.borderAlpha}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui,sans-serif',
        fontSize: 10,
        color: thm.dim,
      }}
    >
      {badgeStyle !== 'icon-only' && '🧬 Loading…'}
    </div>
  );
};

const ErrorBadge: FC<{ genomeId: string; thm: Record<string, string> }> = ({ genomeId, thm }) => (
  <a
    href={`${VERIFY_BASE}/${genomeId}`}
    target="_blank"
    rel="noopener noreferrer"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      background: thm.bg === 'transparent' ? 'rgba(10,10,15,0.6)' : thm.bg,
      border: `1px solid ${thm.borderAlpha}`,
      borderRadius: 8,
      color: thm.text,
      fontFamily: 'system-ui,sans-serif',
      fontSize: 12,
      textDecoration: 'none',
    }}
  >
    <span style={{ fontSize: 16 }}>🧬</span>
    <span>Verified by <strong>Block Genomics</strong></span>
  </a>
);

// ─── Main Component ──────────────────────────────────────────────────────────

export const BlockGenomicsBadge: FC<BlockGenomicsBadgeProps> = ({
  genomeId,
  agent: agentProp,
  style: badgeStyle = 'standard',
  theme = 'dark',
  animate = true,
  verifyUrl,
  apiBase = API_BASE_DEFAULT,
  className,
  wrapperStyle,
  onLoad,
  onError,
}) => {
  const [agent, setAgent] = useState<AgentData | null>(agentProp || null);
  const [loading, setLoading] = useState(!agentProp && !!genomeId);
  const [error, setError] = useState<Error | null>(null);

  const thm = THEME_STYLES[theme] || THEME_STYLES.dark;

  // Fetch agent data if genomeId provided
  useEffect(() => {
    if (agentProp) {
      setAgent(agentProp);
      setLoading(false);
      return;
    }
    if (!genomeId) return;

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetch(`${apiBase}/verify/${encodeURIComponent(genomeId)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        return res.json();
      })
      .then((data: AgentData) => {
        setAgent(data);
        setLoading(false);
        onLoad?.(data);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err);
          setLoading(false);
          onError?.(err);
        }
      });

    return () => controller.abort();
  }, [genomeId, agentProp, apiBase, onLoad, onError]);

  const tier = agent ? TIER_COLORS[agent.tier] || TIER_COLORS[1] : TIER_COLORS[1];
  const link = verifyUrl || (agent ? `${VERIFY_BASE}/${agent.id}` : genomeId ? `${VERIFY_BASE}/${genomeId}` : '#');

  const renderBadgeContent = useCallback(() => {
    if (loading) return <LoadingBadge style={badgeStyle} thm={thm} />;
    if (error || !agent) return <ErrorBadge genomeId={genomeId || ''} thm={thm} />;

    switch (badgeStyle) {
      case 'icon-only':
        return <IconOnlyBadge agent={agent} thm={thm} tier={tier} />;
      case 'minimal':
        return <MinimalBadge agent={agent} thm={thm} tier={tier} />;
      case 'detailed':
        return <DetailedBadge agent={agent} thm={thm} tier={tier} animate={animate} />;
      default:
        return <StandardBadge agent={agent} thm={thm} tier={tier} animate={animate} />;
    }
  }, [loading, error, agent, badgeStyle, thm, tier, animate, genomeId]);

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={agent ? `Verified by Block Genomics — Trust: ${agent.trustScore}/100` : 'Verified by Block Genomics'}
      aria-label={agent ? `Block Genomics Verified: ${agent.name}, Trust Score ${agent.trustScore}` : 'Block Genomics Verification Badge'}
      style={{
        display: 'inline-block',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'transform 150ms ease',
        ...wrapperStyle,
      }}
    >
      {renderBadgeContent()}
    </a>
  );
};

// ─── Hook for programmatic use ───────────────────────────────────────────────

export function useBlockGenomicsAgent(genomeId: string | undefined, apiBase = API_BASE_DEFAULT) {
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(!!genomeId);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!genomeId) return;
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetch(`${apiBase}/verify/${encodeURIComponent(genomeId)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`API ${res.status}`);
        return res.json();
      })
      .then((data) => { setAgent(data); setLoading(false); })
      .catch((err) => {
        if (err.name !== 'AbortError') { setError(err); setLoading(false); }
      });

    return () => controller.abort();
  }, [genomeId, apiBase]);

  return { agent, loading, error };
}

export default BlockGenomicsBadge;
