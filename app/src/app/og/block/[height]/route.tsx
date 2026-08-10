/**
 * Open Graph share card for a single Bitcoin block — 1200×630, the size X and
 * the other unfurlers expect for `summary_large_image`.
 *
 * Rendered with satori (via next/og) rather than the canvas renderer used for
 * bitmap thumbnails: satori lays out flexbox, which is what a text-heavy card
 * needs, and it ships with Next so this adds no dependency.
 */

import { ImageResponse } from 'next/og';
import { parseBlockParam } from '@/lib/blockDeepLink';
import { fetchBlockOgSummary } from '@/lib/blockOgData';
import { EPOCH_LABELS, getEpochColor, getEpochIndex } from '@/lib/bitmapStandard';
import { formatBytes, formatNumber, hexPairToColor } from '@/lib/genome-utils';

// crypto (genome derivation) and satori's WASM both need the Node runtime.
export const runtime = 'nodejs';

const WIDTH = 1200;
const HEIGHT = 630;

const BG = '#0a0a0f';
const PANEL = '#12121a';
const BITCOIN = '#f7931a';
const CYAN = '#66ccff';
const PURPLE = '#a855f7';
const TEXT = '#e2e8f0';
const MUTED = '#64748b';

/** Bars across the card foot, one per byte of the genome's first 32 bytes. */
const GENOME_BARS = 32;

function genomeBars(genome: string) {
  return Array.from({ length: GENOME_BARS }, (_, i) => {
    const pair = genome.slice(i * 2, i * 2 + 2);
    const value = parseInt(pair, 16) / 255;
    return { color: hexPairToColor(pair), height: 18 + value * 92 };
  });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 20, color: MUTED, letterSpacing: 2 }}>{label}</div>
      <div style={{ fontSize: 34, color: TEXT, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ height: string }> },
) {
  const { height: raw } = await params;
  const height = parseBlockParam(raw);

  if (height === undefined) {
    return new Response('Invalid block height', { status: 400 });
  }

  const summary = await fetchBlockOgSummary(height);
  const epochIndex = getEpochIndex(height);
  const epoch = EPOCH_LABELS[epochIndex] ?? EPOCH_LABELS[EPOCH_LABELS.length - 1];
  const epochColor = getEpochColor(height);
  const bars = summary ? genomeBars(summary.genome) : [];

  const mined = summary
    ? new Date(summary.timestamp * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: BG,
          backgroundImage: `radial-gradient(circle at 82% 12%, ${PANEL} 0%, ${BG} 55%)`,
          padding: '52px 60px',
          position: 'relative',
        }}
      >
        {/* Brand rule across the very top. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: WIDTH,
            height: 8,
            display: 'flex',
            backgroundImage: `linear-gradient(90deg, ${BITCOIN}, ${PURPLE}, ${CYAN})`,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                background: BITCOIN,
                display: 'flex',
                marginRight: 14,
              }}
            />
            <div style={{ fontSize: 26, color: TEXT, letterSpacing: 6 }}>BLOCK GENOMICS</div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              border: `1px solid ${epochColor}`,
              borderRadius: 999,
              padding: '8px 22px',
              fontSize: 22,
              color: epochColor,
            }}
          >
            {`${epoch.label} · ${epoch.sub}`}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            justifyContent: 'center',
            marginTop: 18,
          }}
        >
          <div style={{ fontSize: 24, color: MUTED, letterSpacing: 8 }}>BITCOIN BLOCK</div>
          <div
            style={{
              fontSize: 132,
              color: '#ffffff',
              lineHeight: 1.05,
              letterSpacing: -4,
              marginTop: 2,
            }}
          >
            {formatNumber(height)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
            <div style={{ fontSize: 40, color: BITCOIN }}>{`${height}.bitmap`}</div>
            {summary && (
              <div style={{ fontSize: 26, color: MUTED, marginLeft: 22 }}>
                {`genome ${summary.genome.slice(0, 12)}…`}
              </div>
            )}
          </div>
        </div>

        {/* Genome spectrum — deterministic from the block hash, so the card is a
            fingerprint of the block rather than generic art. */}
        {bars.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              height: 100,
              marginTop: 12,
              marginBottom: 24,
            }}
          >
            {bars.map((bar, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  width: 22,
                  height: bar.height,
                  background: bar.color,
                  borderRadius: 3,
                  marginRight: 6,
                  opacity: 0.92,
                }}
              />
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            borderTop: `1px solid rgba(102, 204, 255, 0.16)`,
            paddingTop: 24,
          }}
        >
          {summary ? (
            <div style={{ display: 'flex' }}>
              <div style={{ display: 'flex', marginRight: 64 }}>
                <Stat label="TRANSACTIONS" value={formatNumber(summary.txCount)} />
              </div>
              <div style={{ display: 'flex', marginRight: 64 }}>
                <Stat label="SIZE" value={formatBytes(summary.size)} />
              </div>
              <div style={{ display: 'flex' }}>
                <Stat label="MINED" value={mined ?? '—'} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', fontSize: 30, color: MUTED }}>
              Bitcoin DNA for Verified AI
            </div>
          )}
          <div style={{ display: 'flex', fontSize: 26, color: CYAN }}>blockgenomics.io</div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // Mined blocks never change; let the CDN and X's image cache hold on to it.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  );
}
