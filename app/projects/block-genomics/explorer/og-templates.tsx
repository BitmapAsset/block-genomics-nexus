/**
 * Block Genomics — OG Image Templates (Satori JSX)
 *
 * These templates define the visual layout for Open Graph images
 * used when links are shared on Twitter, Discord, Telegram, etc.
 *
 * Satori converts this JSX to SVG, then we convert to PNG via sharp/resvg.
 * Dimensions: 1200 x 630 (standard OG image size)
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface BlockOGData {
  height: number;
  formattedHeight: string; // e.g., "500,000"
  genome: string; // 64-char hex
  trustScore: number;
  traits: Array<{ name: string; rarity: 'legendary' | 'rare' | 'uncommon' | 'common' }>;
  verifiedBy?: string;
  isVerified: boolean;
}

export interface AgentOGData {
  name: string;
  initial: string;
  isHuman: boolean; // true = human (green), false = AI (blue)
  tier: number;
  blockHeight: number;
  formattedBlockHeight: string;
  trustScore: number;
  genome: string;
}

// ═══════════════════════════════════════════════════════════════
// Color Utilities
// ═══════════════════════════════════════════════════════════════

const COLORS = {
  bgDeep: '#0a0a0f',
  bgPanel: '#12121a',
  btcOrange: '#f7931a',
  btcOrangeDim: 'rgba(247, 147, 26, 0.15)',
  dnaCyan: '#00bcd4',
  success: '#00e676',
  blue: '#64b5f6',
  gold: '#ffd700',
  purple: '#b388ff',
  textPrimary: '#f0f0f5',
  textSecondary: 'rgba(240, 240, 245, 0.6)',
  textTertiary: 'rgba(240, 240, 245, 0.35)',
  borderGlass: 'rgba(255, 255, 255, 0.08)',
};

const RARITY_COLORS: Record<string, string> = {
  legendary: COLORS.gold,
  rare: COLORS.purple,
  uncommon: COLORS.blue,
  common: '#78909c',
};

/**
 * Convert a hex character (0-f) to an HSL color for the DNA strip
 */
function hexCharToHSL(char: string): string {
  const val = parseInt(char, 16);
  const hue = Math.round((val / 15) * 360);
  return `hsl(${hue}, 70%, 45%)`;
}

/**
 * Generate DNA color strip segments from a genome string
 */
function generateDNAColors(genome: string, count: number = 32): string[] {
  const colors: string[] = [];
  const step = Math.max(1, Math.floor(genome.length / count));
  for (let i = 0; i < count; i++) {
    const idx = (i * step) % genome.length;
    colors.push(hexCharToHSL(genome[idx]));
  }
  return colors;
}

// ═══════════════════════════════════════════════════════════════
// Block OG Template
// ═══════════════════════════════════════════════════════════════

export function BlockOGTemplate(data: BlockOGData) {
  const dnaColors = generateDNAColors(data.genome, 40);
  const topTraits = data.traits.slice(0, 3);

  return {
    type: 'div',
    props: {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(135deg, ${COLORS.bgDeep} 0%, #0f0f1a 50%, #0a0f15 100%)`,
        fontFamily: 'Inter, sans-serif',
        padding: '0',
        position: 'relative',
        overflow: 'hidden',
      },
      children: [
        // Background grid pattern (subtle)
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            },
          },
        },
        // Ambient glow top-left
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: '-150px', left: '-100px',
              width: '500px', height: '500px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(247, 147, 26, 0.08) 0%, transparent 70%)',
            },
          },
        },
        // Ambient glow bottom-right
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '-100px', right: '-50px',
              width: '400px', height: '400px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0, 188, 212, 0.06) 0%, transparent 70%)',
            },
          },
        },
        // Content container
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              padding: '48px 60px',
              position: 'relative',
              zIndex: 1,
            },
            children: [
              // Top bar: Logo + Badge
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '40px',
                  },
                  children: [
                    // Logo
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                        },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '24px',
                              },
                              children: '🧬',
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '20px',
                                fontWeight: 700,
                                color: COLORS.textPrimary,
                                letterSpacing: '-0.02em',
                              },
                              children: 'BLOCK GENOMICS',
                            },
                          },
                        ],
                      },
                    },
                    // Verified badge
                    data.isVerified ? {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 20px',
                          borderRadius: '100px',
                          background: 'rgba(0, 230, 118, 0.1)',
                          border: '1px solid rgba(0, 230, 118, 0.25)',
                          color: COLORS.success,
                          fontSize: '14px',
                          fontWeight: 600,
                        },
                        children: '✓ Verified',
                      },
                    } : {
                      type: 'div',
                      props: {
                        style: {
                          padding: '8px 20px',
                          borderRadius: '100px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: COLORS.textSecondary,
                          fontSize: '14px',
                          fontWeight: 600,
                        },
                        children: 'Unclaimed',
                      },
                    },
                  ],
                },
              },
              // Block number (huge)
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '8px',
                    marginBottom: '24px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '32px',
                          fontWeight: 400,
                          color: COLORS.btcOrange,
                        },
                        children: '#',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '72px',
                          fontWeight: 900,
                          letterSpacing: '-0.03em',
                          color: COLORS.textPrimary,
                          lineHeight: 1,
                        },
                        children: data.formattedHeight,
                      },
                    },
                  ],
                },
              },
              // DNA Color Strip
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    height: '20px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    marginBottom: '32px',
                    boxShadow: '0 0 20px rgba(0, 188, 212, 0.15)',
                  },
                  children: dnaColors.map(color => ({
                    type: 'div',
                    props: {
                      style: {
                        flex: 1,
                        backgroundColor: color,
                      },
                    },
                  })),
                },
              },
              // Bottom info row
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    marginTop: 'auto',
                  },
                  children: [
                    // Left: Trust + Traits
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        },
                        children: [
                          // Trust score
                          {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                              },
                              children: [
                                {
                                  type: 'div',
                                  props: {
                                    style: {
                                      fontSize: '14px',
                                      fontWeight: 600,
                                      color: COLORS.textSecondary,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.08em',
                                    },
                                    children: 'Trust',
                                  },
                                },
                                {
                                  type: 'div',
                                  props: {
                                    style: {
                                      fontSize: '36px',
                                      fontWeight: 800,
                                      color: COLORS.btcOrange,
                                      lineHeight: 1,
                                    },
                                    children: `${data.trustScore}/100`,
                                  },
                                },
                              ],
                            },
                          },
                          // Traits
                          {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                gap: '8px',
                              },
                              children: topTraits.map(trait => ({
                                type: 'div',
                                props: {
                                  style: {
                                    padding: '6px 14px',
                                    borderRadius: '100px',
                                    background: `${RARITY_COLORS[trait.rarity]}15`,
                                    border: `1px solid ${RARITY_COLORS[trait.rarity]}40`,
                                    color: RARITY_COLORS[trait.rarity],
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    fontFamily: 'JetBrains Mono, monospace',
                                  },
                                  children: trait.name,
                                },
                              })),
                            },
                          },
                          // Verified by
                          data.verifiedBy ? {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '14px',
                                color: COLORS.textTertiary,
                              },
                              children: `Verified by @${data.verifiedBy}`,
                            },
                          } : null,
                        ].filter(Boolean),
                      },
                    },
                    // Right: URL
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '16px',
                          fontWeight: 600,
                          color: COLORS.textTertiary,
                          letterSpacing: '0.02em',
                        },
                        children: 'blockgenomics.io',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        // Bottom border accent
        {
          type: 'div',
          props: {
            style: {
              height: '4px',
              background: `linear-gradient(90deg, ${COLORS.btcOrange}, ${COLORS.dnaCyan}, ${COLORS.btcOrange})`,
            },
          },
        },
      ],
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Agent OG Template
// ═══════════════════════════════════════════════════════════════

export function AgentOGTemplate(data: AgentOGData) {
  const dnaColors = generateDNAColors(data.genome, 32);
  const ringColor = data.isHuman ? COLORS.success : COLORS.blue;
  const typeLabel = data.isHuman ? 'Human' : 'AI Agent';

  return {
    type: 'div',
    props: {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(135deg, ${COLORS.bgDeep} 0%, #0f0f1a 50%, #0a0f15 100%)`,
        fontFamily: 'Inter, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      },
      children: [
        // Grid pattern
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            },
          },
        },
        // Ambient glow
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: '-100px', left: '50px',
              width: '400px', height: '400px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${ringColor}12 0%, transparent 70%)`,
            },
          },
        },
        // Content
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              padding: '48px 60px',
              position: 'relative',
              zIndex: 1,
            },
            children: [
              // Top: Logo
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '40px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: { style: { fontSize: '24px' }, children: '🧬' },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '20px', fontWeight: 700,
                          color: COLORS.textPrimary, letterSpacing: '-0.02em',
                        },
                        children: 'BLOCK GENOMICS',
                      },
                    },
                  ],
                },
              },
              // Agent info row
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '32px',
                    marginBottom: '32px',
                  },
                  children: [
                    // Avatar with ring
                    {
                      type: 'div',
                      props: {
                        style: {
                          position: 'relative',
                          width: '100px',
                          height: '100px',
                          flexShrink: 0,
                        },
                        children: [
                          // Ring
                          {
                            type: 'div',
                            props: {
                              style: {
                                position: 'absolute', inset: 0,
                                borderRadius: '50%',
                                border: `3px solid ${ringColor}`,
                              },
                            },
                          },
                          // Avatar
                          {
                            type: 'div',
                            props: {
                              style: {
                                position: 'absolute',
                                top: '6px', left: '6px', right: '6px', bottom: '6px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #1a1a2e, #2a2a4e)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '40px',
                                fontWeight: 800,
                                color: COLORS.btcOrange,
                              },
                              children: data.initial,
                            },
                          },
                        ],
                      },
                    },
                    // Name + tags
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '48px',
                                fontWeight: 800,
                                color: COLORS.textPrimary,
                                letterSpacing: '-0.03em',
                                lineHeight: 1,
                              },
                              children: data.name,
                            },
                          },
                          // Tags row
                          {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'center',
                              },
                              children: [
                                // Human/AI tag
                                {
                                  type: 'div',
                                  props: {
                                    style: {
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '6px 14px',
                                      borderRadius: '100px',
                                      background: `${ringColor}15`,
                                      border: `1px solid ${ringColor}40`,
                                      color: ringColor,
                                      fontSize: '14px',
                                      fontWeight: 600,
                                    },
                                    children: [
                                      {
                                        type: 'div',
                                        props: {
                                          style: {
                                            width: '8px', height: '8px',
                                            borderRadius: '50%',
                                            backgroundColor: ringColor,
                                          },
                                        },
                                      },
                                      {
                                        type: 'div',
                                        props: { children: ` ${typeLabel}` },
                                      },
                                    ],
                                  },
                                },
                                // Divider
                                {
                                  type: 'div',
                                  props: {
                                    style: {
                                      color: COLORS.textTertiary,
                                      fontSize: '14px',
                                    },
                                    children: '·',
                                  },
                                },
                                // Tier
                                {
                                  type: 'div',
                                  props: {
                                    style: {
                                      color: COLORS.btcOrange,
                                      fontSize: '16px',
                                      fontWeight: 700,
                                    },
                                    children: `Tier ${data.tier}`,
                                  },
                                },
                                // Divider
                                {
                                  type: 'div',
                                  props: {
                                    style: {
                                      color: COLORS.textTertiary,
                                      fontSize: '14px',
                                    },
                                    children: '·',
                                  },
                                },
                                // Block
                                {
                                  type: 'div',
                                  props: {
                                    style: {
                                      color: COLORS.textSecondary,
                                      fontSize: '16px',
                                      fontWeight: 600,
                                    },
                                    children: `Block #${data.formattedBlockHeight}`,
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              // Trust + Genome row
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    gap: '40px',
                    marginBottom: '24px',
                    marginTop: 'auto',
                  },
                  children: [
                    // Trust
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px',
                        },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '14px',
                                fontWeight: 600,
                                color: COLORS.textTertiary,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                              },
                              children: 'Trust',
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '32px',
                                fontWeight: 800,
                                color: COLORS.btcOrange,
                                lineHeight: 1,
                              },
                              children: `${data.trustScore}/100`,
                            },
                          },
                        ],
                      },
                    },
                    // Genome
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px',
                        },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '14px',
                                fontWeight: 600,
                                color: COLORS.textTertiary,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                              },
                              children: 'Genome',
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '20px',
                                fontWeight: 500,
                                color: COLORS.dnaCyan,
                                fontFamily: 'JetBrains Mono, monospace',
                              },
                              children: data.genome.slice(0, 16) + '...',
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              // DNA strip
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    height: '16px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    marginBottom: '20px',
                    boxShadow: '0 0 15px rgba(0, 188, 212, 0.1)',
                  },
                  children: dnaColors.map(color => ({
                    type: 'div',
                    props: {
                      style: { flex: 1, backgroundColor: color },
                    },
                  })),
                },
              },
              // Footer URL
              {
                type: 'div',
                props: {
                  style: {
                    textAlign: 'right',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: COLORS.textTertiary,
                    letterSpacing: '0.02em',
                  },
                  children: 'blockgenomics.io',
                },
              },
            ],
          },
        },
        // Bottom accent bar
        {
          type: 'div',
          props: {
            style: {
              height: '4px',
              background: `linear-gradient(90deg, ${COLORS.btcOrange}, ${COLORS.dnaCyan}, ${COLORS.btcOrange})`,
            },
          },
        },
      ],
    },
  };
}
