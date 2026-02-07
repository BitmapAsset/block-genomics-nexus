/**
 * Block Genomics — Badge Generator
 * 
 * Generates embeddable SVG verification badges in multiple styles and themes.
 * Zero external dependencies. All SVGs are valid, accessible, and self-contained.
 * 
 * @module badge-generator
 * @version 1.0.0
 */

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

export interface BadgeOptions {
  style: BadgeStyle;
  theme: BadgeTheme;
  animate?: boolean;
  linkUrl?: string;
  locale?: string;
}

// ─── Color Palettes ──────────────────────────────────────────────────────────

interface TierPalette {
  primary: string;
  primaryGlow: string;
  label: string;
  icon: string;
}

interface ThemePalette {
  bg: string;
  bgAlt: string;
  surface: string;
  surfaceAlpha: string;
  border: string;
  borderAlpha: string;
  text: string;
  textMuted: string;
  textDim: string;
  glassBg: string;
  glassStroke: string;
}

const TIER_PALETTES: Record<TrustTier, TierPalette> = {
  1: { primary: '#f7931a', primaryGlow: '#f7931a40', label: 'Block Owner', icon: '👑' },
  2: { primary: '#94a3b8', primaryGlow: '#94a3b840', label: 'TX Anchor', icon: '⚓' },
  3: { primary: '#cd7f32', primaryGlow: '#cd7f3240', label: 'Delegated', icon: '🔗' },
};

const THEME_PALETTES: Record<BadgeTheme, ThemePalette> = {
  dark: {
    bg: '#0a0a0f',
    bgAlt: '#0c0c14',
    surface: '#111118',
    surfaceAlpha: 'rgba(17,17,24,0.85)',
    border: '#1e1e2e',
    borderAlpha: 'rgba(255,255,255,0.06)',
    text: '#f0f0f5',
    textMuted: '#a0a0b0',
    textDim: '#606070',
    glassBg: 'rgba(255,255,255,0.03)',
    glassStroke: 'rgba(255,255,255,0.08)',
  },
  light: {
    bg: '#ffffff',
    bgAlt: '#f8f9fc',
    surface: '#f0f1f5',
    surfaceAlpha: 'rgba(240,241,245,0.9)',
    border: '#d0d5dd',
    borderAlpha: 'rgba(0,0,0,0.08)',
    text: '#111118',
    textMuted: '#555566',
    textDim: '#888899',
    glassBg: 'rgba(0,0,0,0.02)',
    glassStroke: 'rgba(0,0,0,0.06)',
  },
  transparent: {
    bg: 'transparent',
    bgAlt: 'transparent',
    surface: 'rgba(10,10,15,0.6)',
    surfaceAlpha: 'rgba(10,10,15,0.4)',
    border: 'rgba(255,255,255,0.1)',
    borderAlpha: 'rgba(255,255,255,0.05)',
    text: '#f0f0f5',
    textMuted: '#a0a0b0',
    textDim: '#606070',
    glassBg: 'rgba(255,255,255,0.04)',
    glassStroke: 'rgba(255,255,255,0.1)',
  },
};

const ACCENT = {
  cyan: '#66ccff',
  purple: '#a855f7',
  gold: '#f7931a',
};

// ─── Utility Functions ───────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function truncateGenome(genome: string, len = 16): string {
  return genome.slice(0, len) + '…';
}

/**
 * Derive DNA segment colors from a genome hex string.
 * Returns an array of hex color strings.
 */
function genomeToDnaColors(genome: string, count = 32): string[] {
  const palette = [
    ACCENT.cyan, ACCENT.purple, ACCENT.gold,
    '#22c55e', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6',
  ];
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = parseInt(genome[i % genome.length], 16);
    colors.push(palette[idx % palette.length]);
  }
  return colors;
}

/**
 * Generate a trust score arc path for SVG.
 */
function trustArc(cx: number, cy: number, r: number, score: number, max = 100): string {
  const angle = (score / max) * 360;
  const rad = (angle - 90) * (Math.PI / 180);
  const x = cx + r * Math.cos(rad);
  const y = cy + r * Math.sin(rad);
  const largeArc = angle > 180 ? 1 : 0;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y}`;
}

/**
 * Build the verified checkmark SVG icon.
 */
function checkmarkIcon(size: number, color: string): string {
  return `<g transform="scale(${size / 24})">
    <circle cx="12" cy="12" r="11" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="1.5"/>
    <path d="M7.5 12.5L10.5 15.5L16.5 9" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>`;
}

/**
 * Build the Block Genomics DNA helix icon.
 */
function dnaIcon(size: number, color: string): string {
  const s = size / 20;
  return `<g transform="scale(${s})">
    <path d="M6 2C6 2 6 6 10 10C14 14 14 18 14 18" stroke="${color}" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.8"/>
    <path d="M14 2C14 2 14 6 10 10C6 14 6 18 6 18" stroke="${color}" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.8"/>
    <line x1="7" y1="5" x2="13" y2="5" stroke="${color}" stroke-width="1" opacity="0.4"/>
    <line x1="6.5" y1="10" x2="13.5" y2="10" stroke="${color}" stroke-width="1" opacity="0.4"/>
    <line x1="7" y1="15" x2="13" y2="15" stroke="${color}" stroke-width="1" opacity="0.4"/>
  </g>`;
}

// ─── Badge Generators ────────────────────────────────────────────────────────

/**
 * Generate an icon-only badge — tiny verified checkmark.
 * Suitable for inline use, avatars, small UI elements.
 */
function generateIconOnly(agent: AgentData, theme: BadgeTheme, animate: boolean): string {
  const tp = TIER_PALETTES[agent.tier];
  const thm = THEME_PALETTES[theme];
  const size = 24;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
  role="img" aria-label="Verified by Block Genomics — Trust Score ${agent.trustScore}/100">
  <title>Verified by Block Genomics</title>
  <defs>
    <filter id="glow-ico">
      <feGaussianBlur stdDeviation="1" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="${agent.trustScore >= 70 ? 'url(#glow-ico)' : 'none'}">
    ${checkmarkIcon(size, tp.primary)}
  </g>${animate ? `
  <animateTransform attributeName="transform" type="rotate" values="0 12 12;2 12 12;0 12 12;-2 12 12;0 12 12" dur="3s" repeatCount="indefinite" additive="sum"/>` : ''}
</svg>`;
}

/**
 * Generate a minimal badge — small inline shield (like GitHub badges).
 * Dimensions: ~320×28
 */
function generateMinimal(agent: AgentData, theme: BadgeTheme, animate: boolean): string {
  const tp = TIER_PALETTES[agent.tier];
  const thm = THEME_PALETTES[theme];
  const w = 320;
  const h = 28;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"
  role="img" aria-label="Block Genomics Verified: ${escapeXml(agent.name)} — Block #${formatNumber(agent.blockHeight)} — Trust ${agent.trustScore}/100">
  <title>Block Genomics Verified: ${escapeXml(agent.name)}</title>
  <defs>
    <linearGradient id="mg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${thm.bg === 'transparent' ? '#0a0a0f' : thm.bg}"/>
      <stop offset="100%" stop-color="${thm.bgAlt === 'transparent' ? '#0c0c14' : thm.bgAlt}"/>
    </linearGradient>
    <clipPath id="mrr"><rect width="${w}" height="${h}" rx="6"/></clipPath>
  </defs>
  <g clip-path="url(#mrr)">
    <!-- Background -->
    <rect width="${w}" height="${h}" fill="${thm.bg === 'transparent' ? 'none' : 'url(#mg)'}"/>
    <rect width="${w}" height="${h}" rx="6" fill="none" stroke="${tp.primary}" stroke-width="1" stroke-opacity="0.3"/>

    <!-- Left: Verified label -->
    <rect x="0" y="0" width="90" height="${h}" fill="${tp.primary}" fill-opacity="0.12"/>
    <line x1="90" y1="2" x2="90" y2="${h - 2}" stroke="${tp.primary}" stroke-opacity="0.2" stroke-width="1"/>
    <g transform="translate(6, 6)">
      ${checkmarkIcon(16, tp.primary)}
    </g>
    <text x="28" y="18" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="600" fill="${tp.primary}">Verified</text>

    <!-- Center: Block + Genome -->
    <text x="100" y="18" font-family="ui-monospace,monospace" font-size="10" fill="${thm.text}">Block #${formatNumber(agent.blockHeight)}</text>
    <text x="190" y="18" font-family="ui-monospace,monospace" font-size="9" fill="${thm.textDim}">${truncateGenome(agent.genome, 12)}</text>

    <!-- Right: Trust Score -->
    <rect x="${w - 56}" y="4" width="48" height="20" rx="4" fill="${tp.primary}" fill-opacity="0.1"/>
    <text x="${w - 32}" y="18" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="700" fill="${tp.primary}" text-anchor="middle">${agent.trustScore}/100</text>
  </g>
</svg>`;
}

/**
 * Generate a standard badge — medium card with genome preview and trust score.
 * Dimensions: ~360×80
 */
function generateStandard(agent: AgentData, theme: BadgeTheme, animate: boolean): string {
  const tp = TIER_PALETTES[agent.tier];
  const thm = THEME_PALETTES[theme];
  const w = 360;
  const h = 80;
  const dnaColors = genomeToDnaColors(agent.genome, 24);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"
  role="img" aria-label="Block Genomics Verified Agent: ${escapeXml(agent.name)}, Block #${formatNumber(agent.blockHeight)}, Tier ${agent.tier} ${tp.label}, Trust Score ${agent.trustScore} out of 100">
  <title>Block Genomics — ${escapeXml(agent.name)} — Tier ${agent.tier} ${tp.label}</title>
  <defs>
    <linearGradient id="sbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${thm.bg === 'transparent' ? '#0a0a0f' : thm.bg}"/>
      <stop offset="100%" stop-color="${thm.bgAlt === 'transparent' ? '#0c0c14' : thm.bgAlt}"/>
    </linearGradient>
    <filter id="glow-s">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="srr"><rect width="${w}" height="${h}" rx="12"/></clipPath>
  </defs>
  <g clip-path="url(#srr)">
    <!-- Background -->
    <rect width="${w}" height="${h}" fill="${thm.bg === 'transparent' ? 'none' : 'url(#sbg)'}"/>

    <!-- Glassmorphism overlay -->
    <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="11" fill="${thm.glassBg}" stroke="${thm.glassStroke}" stroke-width="1"/>

    <!-- Tier accent line -->
    <rect x="0" y="0" width="3" height="${h}" fill="${tp.primary}" opacity="0.6"/>

    <!-- DNA Helix icon -->
    <g transform="translate(14, ${(h - 28) / 2})" ${agent.trustScore >= 70 ? 'filter="url(#glow-s)"' : ''}>
      ${dnaIcon(28, tp.primary)}
    </g>

    <!-- Agent name -->
    <text x="52" y="26" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="700" fill="${thm.text}">
      ${escapeXml(agent.name)}
    </text>

    <!-- Tier badge -->
    <rect x="52" y="32" width="auto" height="16" rx="3" fill="${tp.primary}" fill-opacity="0.12"/>
    <text x="58" y="44" font-family="system-ui,-apple-system,sans-serif" font-size="9" font-weight="600" fill="${tp.primary}" letter-spacing="0.5">
      TIER ${agent.tier} · ${tp.label.toUpperCase()}
    </text>

    <!-- Block info -->
    <text x="52" y="60" font-family="ui-monospace,monospace" font-size="10" fill="${thm.textMuted}">
      Block #${formatNumber(agent.blockHeight)} · ${truncateGenome(agent.genome)}
    </text>

    <!-- Genome preview bar -->
    <g transform="translate(52, 66)">
      ${dnaColors.map((c, i) => `<rect x="${i * 7}" y="0" width="5" height="4" rx="1" fill="${c}" opacity="0.7"/>`).join('')}
    </g>

    <!-- Trust score circle -->
    <g transform="translate(${w - 50}, ${h / 2})">
      <circle cx="0" cy="0" r="22" fill="none" stroke="${thm.border}" stroke-width="3"/>
      <path d="${trustArc(0, 0, 22, agent.trustScore)}" fill="none" stroke="${tp.primary}" stroke-width="3" stroke-linecap="round"${animate ? `>
        <animate attributeName="stroke-dasharray" from="0 200" to="${(agent.trustScore / 100) * 138} 200" dur="1s" fill="freeze"/>
      </path>` : '/>'}
      <text x="0" y="3" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="800" fill="${thm.text}" text-anchor="middle">${agent.trustScore}</text>
      <text x="0" y="14" font-family="system-ui,-apple-system,sans-serif" font-size="7" fill="${thm.textDim}" text-anchor="middle">TRUST</text>
    </g>

    <!-- Outer border -->
    <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="none" stroke="${tp.primary}" stroke-width="1" stroke-opacity="0.2"/>
  </g>
</svg>`;
}

/**
 * Generate a detailed badge — full card with DNA visualization, tier info,
 * trust breakdown, and claims.
 * Dimensions: ~420×220
 */
function generateDetailed(agent: AgentData, theme: BadgeTheme, animate: boolean): string {
  const tp = TIER_PALETTES[agent.tier];
  const thm = THEME_PALETTES[theme];
  const w = 420;
  const h = 220;
  const dnaColors = genomeToDnaColors(agent.genome, 48);
  const tc = agent.trustComponents;

  // Build trust breakdown rows
  const breakdownRows = tc
    ? [
        { label: 'Block Age', score: tc.age.score, max: tc.age.max, detail: `${tc.age.years}y` },
        { label: 'Richness', score: tc.richness.score, max: tc.richness.max, detail: `${formatNumber(tc.richness.txCount)} tx` },
        { label: 'Security', score: tc.security.score, max: tc.security.max, detail: '' },
        { label: 'Ownership', score: tc.ownership.score, max: tc.ownership.max, detail: '' },
        { label: 'History', score: tc.history.score, max: tc.history.max, detail: '' },
      ]
    : [];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"
  role="img" aria-label="Block Genomics Detailed Verification Badge for ${escapeXml(agent.name)}. Block ${formatNumber(agent.blockHeight)}, Tier ${agent.tier} ${tp.label}, Trust Score ${agent.trustScore} out of 100. Genome ${agent.genome.slice(0, 16)}.">
  <title>Block Genomics — ${escapeXml(agent.name)} — Full Verification</title>
  <defs>
    <linearGradient id="dbg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${thm.bg === 'transparent' ? '#0a0a0f' : thm.bg}"/>
      <stop offset="50%" stop-color="${thm.bgAlt === 'transparent' ? '#0c0c14' : thm.bgAlt}"/>
      <stop offset="100%" stop-color="${thm.bg === 'transparent' ? '#0a0a0f' : thm.bg}"/>
    </linearGradient>
    <linearGradient id="dtier" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${tp.primary}" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="${tp.primary}" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow-d">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glassFx">
      <feGaussianBlur in="SourceGraphic" stdDeviation="8"/>
    </filter>
    <clipPath id="drr"><rect width="${w}" height="${h}" rx="16"/></clipPath>
  </defs>
  <g clip-path="url(#drr)">
    <!-- Background -->
    <rect width="${w}" height="${h}" fill="${thm.bg === 'transparent' ? 'none' : 'url(#dbg)'}"/>

    <!-- Frosted glass panel -->
    <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="15" fill="${thm.glassBg}" stroke="${thm.glassStroke}" stroke-width="1"/>

    <!-- Top tier accent gradient -->
    <rect x="0" y="0" width="${w}" height="50" fill="url(#dtier)" opacity="0.5"/>

    <!-- ═══ HEADER ═══ -->
    <!-- DNA icon -->
    <g transform="translate(16, 12)" ${agent.trustScore >= 70 ? 'filter="url(#glow-d)"' : ''}>
      ${dnaIcon(24, tp.primary)}
    </g>

    <!-- Title -->
    <text x="48" y="28" font-family="system-ui,-apple-system,sans-serif" font-size="16" font-weight="800" fill="${thm.text}">
      ${escapeXml(agent.name)}
    </text>

    <!-- Verified checkmark -->
    <g transform="translate(${48 + agent.name.length * 9.5}, 14)">
      ${checkmarkIcon(18, tp.primary)}
    </g>

    <!-- Tier label -->
    <rect x="48" y="34" width="${70 + tp.label.length * 5}" height="18" rx="4" fill="${tp.primary}" fill-opacity="0.1" stroke="${tp.primary}" stroke-width="0.5" stroke-opacity="0.3"/>
    <text x="56" y="47" font-family="system-ui,-apple-system,sans-serif" font-size="9" font-weight="700" fill="${tp.primary}" letter-spacing="0.8">
      TIER ${agent.tier} · ${tp.label.toUpperCase()}
    </text>

    <!-- Block info (top right) -->
    <text x="${w - 16}" y="24" font-family="ui-monospace,monospace" font-size="11" fill="${thm.textMuted}" text-anchor="end">
      Block #${formatNumber(agent.blockHeight)}
    </text>
    <text x="${w - 16}" y="40" font-family="ui-monospace,monospace" font-size="9" fill="${thm.textDim}" text-anchor="end">
      ${truncateGenome(agent.genome, 20)}
    </text>

    <!-- Separator -->
    <line x1="16" y1="60" x2="${w - 16}" y2="60" stroke="${thm.border}" stroke-width="0.5" opacity="0.5"/>

    <!-- ═══ DNA VISUALIZATION ═══ -->
    <text x="16" y="78" font-family="system-ui,-apple-system,sans-serif" font-size="9" font-weight="600" fill="${thm.textDim}" letter-spacing="1">
      GENOME SIGNATURE
    </text>
    <g transform="translate(16, 84)">
      <!-- DNA strand visualization: colored segments -->
      ${dnaColors.map((c, i) => {
        const barH = 6 + (parseInt(agent.genome[(i * 2) % agent.genome.length], 16) / 15) * 14;
        return `<rect x="${i * 8}" y="${20 - barH}" width="6" height="${barH}" rx="1.5" fill="${c}" opacity="0.75">
          ${animate ? `<animate attributeName="height" values="${barH};${barH + 3};${barH}" dur="${2 + (i % 3)}s" repeatCount="indefinite"/>` : ''}
        </rect>`;
      }).join('\n      ')}
    </g>

    <!-- ═══ TRUST BREAKDOWN ═══ -->
    <text x="16" y="132" font-family="system-ui,-apple-system,sans-serif" font-size="9" font-weight="600" fill="${thm.textDim}" letter-spacing="1">
      TRUST BREAKDOWN
    </text>

    ${breakdownRows.map((row, i) => {
      const y = 142 + i * 14;
      const barW = 120;
      const filled = (row.score / row.max) * barW;
      return `
    <!-- ${row.label} -->
    <text x="16" y="${y + 9}" font-family="system-ui,-apple-system,sans-serif" font-size="9" fill="${thm.textMuted}">${row.label}</text>
    <rect x="85" y="${y + 1}" width="${barW}" height="8" rx="4" fill="${thm.border}" opacity="0.4"/>
    <rect x="85" y="${y + 1}" width="${filled}" height="8" rx="4" fill="${tp.primary}" opacity="0.7">${animate ? `
      <animate attributeName="width" from="0" to="${filled}" dur="0.8s" fill="freeze"/>` : ''}
    </rect>
    <text x="210" y="${y + 9}" font-family="ui-monospace,monospace" font-size="8" fill="${thm.textDim}">${row.score}/${row.max}</text>`;
    }).join('')}

    <!-- ═══ TRUST SCORE (Large, right column) ═══ -->
    <g transform="translate(${w - 80}, 100)">
      <!-- Outer ring background -->
      <circle cx="0" cy="0" r="42" fill="none" stroke="${thm.border}" stroke-width="4" opacity="0.3"/>
      <!-- Score arc -->
      <path d="${trustArc(0, 0, 42, agent.trustScore)}" fill="none" stroke="${tp.primary}" stroke-width="4" stroke-linecap="round" ${agent.trustScore >= 70 ? 'filter="url(#glow-d)"' : ''}${animate ? `>
        <animate attributeName="stroke-dasharray" from="0 300" to="${(agent.trustScore / 100) * 264} 300" dur="1.2s" fill="freeze"/>
      </path>` : '/>'}
      <!-- Score number -->
      <text x="0" y="4" font-family="system-ui,-apple-system,sans-serif" font-size="28" font-weight="900" fill="${thm.text}" text-anchor="middle">${agent.trustScore}</text>
      <text x="0" y="18" font-family="system-ui,-apple-system,sans-serif" font-size="8" font-weight="600" fill="${thm.textDim}" text-anchor="middle" letter-spacing="1.5">TRUST</text>
      <!-- Glow effect for high scores -->
      ${agent.trustScore >= 80 ? `<circle cx="0" cy="0" r="44" fill="none" stroke="${tp.primary}" stroke-width="1" opacity="0.15">
        ${animate ? '<animate attributeName="r" values="44;48;44" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite"/>' : ''}
      </circle>` : ''}
    </g>

    <!-- ═══ FOOTER ═══ -->
    <line x1="16" y1="${h - 28}" x2="${w - 16}" y2="${h - 28}" stroke="${thm.border}" stroke-width="0.5" opacity="0.3"/>
    <text x="16" y="${h - 10}" font-family="system-ui,-apple-system,sans-serif" font-size="8" fill="${thm.textDim}">
      Verified by Block Genomics · blockgenomics.io
    </text>
    ${agent.registeredAt ? `<text x="${w - 16}" y="${h - 10}" font-family="system-ui,-apple-system,sans-serif" font-size="8" fill="${thm.textDim}" text-anchor="end">
      Since ${new Date(agent.registeredAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
    </text>` : ''}

    <!-- Outer border -->
    <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="16" fill="none" stroke="${tp.primary}" stroke-width="1" stroke-opacity="0.15"/>
  </g>
</svg>`;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Generate an SVG badge for a verified Block Genomics agent.
 *
 * @param agent   - The agent data (id, name, genome, trust score, etc.)
 * @param options - Badge style, theme, animation, and link options
 * @returns       SVG string
 *
 * @example
 * ```ts
 * const svg = generateBadge(agent, { style: 'standard', theme: 'dark' });
 * ```
 */
export function generateBadge(agent: AgentData, options: Partial<BadgeOptions> = {}): string {
  const {
    style = 'standard',
    theme = 'dark',
    animate = true,
    linkUrl,
  } = options;

  let svg: string;
  switch (style) {
    case 'icon-only':
      svg = generateIconOnly(agent, theme, animate);
      break;
    case 'minimal':
      svg = generateMinimal(agent, theme, animate);
      break;
    case 'detailed':
      svg = generateDetailed(agent, theme, animate);
      break;
    case 'standard':
    default:
      svg = generateStandard(agent, theme, animate);
      break;
  }

  // Wrap in a link if URL provided
  if (linkUrl) {
    svg = svg.replace(
      '<svg ',
      `<a href="${escapeXml(linkUrl)}" target="_blank" rel="noopener"><svg `
    ) + '</a>';
  }

  return svg;
}

/**
 * Generate badge as a data URI for use in <img> tags and markdown.
 */
export function generateBadgeDataUri(agent: AgentData, options: Partial<BadgeOptions> = {}): string {
  const svg = generateBadge(agent, options);
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
}

/**
 * Generate an HTML embed snippet for a badge.
 */
export function generateEmbedSnippet(agent: AgentData, options: Partial<BadgeOptions> = {}): string {
  const { style = 'standard' } = options;
  const verifyUrl = `https://verify.blockgenomics.io/agent/${agent.id}`;
  const badgeUrl = `https://verify.blockgenomics.io/api/v1/badge/${agent.id}?style=${style}`;

  const dims: Record<BadgeStyle, { w: number; h: number }> = {
    'icon-only': { w: 24, h: 24 },
    minimal: { w: 320, h: 28 },
    standard: { w: 360, h: 80 },
    detailed: { w: 420, h: 220 },
  };
  const { w, h } = dims[style] || dims.standard;

  return `<!-- Block Genomics Verification Badge -->
<a href="${verifyUrl}" target="_blank" rel="noopener"
   title="Verified by Block Genomics — Trust: ${agent.trustScore}/100">
  <img src="${badgeUrl}" alt="✓ Verified by Block Genomics"
       width="${w}" height="${h}" style="border:0" />
</a>`;
}

/**
 * Generate a markdown badge string (for GitHub READMEs, etc.)
 */
export function generateMarkdownBadge(agent: AgentData): string {
  const verifyUrl = `https://verify.blockgenomics.io/agent/${agent.id}`;
  const badgeUrl = `https://verify.blockgenomics.io/api/v1/badge/${agent.id}?style=minimal`;
  return `[![Block Genomics Verified](${badgeUrl})](${verifyUrl})`;
}

// ─── Default Export ──────────────────────────────────────────────────────────

export default {
  generateBadge,
  generateBadgeDataUri,
  generateEmbedSnippet,
  generateMarkdownBadge,
};
