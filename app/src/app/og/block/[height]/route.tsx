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
import { fetchBlockCardFacts, shortenAddress } from '@/lib/blockPageData';
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
    // Max must stay inside the strip's container height, or satori overflows it.
    return { color: hexPairToColor(pair), height: 14 + value * 68 };
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

  // 404, not 400: the height is part of the path, so an unparseable one means
  // this card does not exist. An unfurler seeing 400 may retry a request that
  // can never succeed.
  if (height === undefined) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // Chain header stats and the app's own facts are independent lookups; both
  // degrade to blanks rather than throwing, so overlap them.
  const [summary, facts] = await Promise.all([
    fetchBlockOgSummary(height),
    fetchBlockCardFacts(height),
  ]);
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

  // Chain stats only appear when mempool.space answered; the object count is
  // ours and is always truthful, including the zero case.
  const stats: Array<{ label: string; value: string }> = [
    ...(summary
      ? [
          { label: 'TRANSACTIONS', value: formatNumber(summary.txCount) },
          { label: 'SIZE', value: formatBytes(summary.size) },
          { label: 'MINED', value: mined ?? '—' },
        ]
      : []),
    { label: 'OBJECTS', value: formatNumber(facts.objectCount) },
  ];

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
            marginTop: 10,
          }}
        >
          <div style={{ fontSize: 24, color: MUTED, letterSpacing: 8 }}>BITCOIN BLOCK</div>
          {/* 108, not the 132 this started at: the holder row below has to fit in
              the same 630px, and satori overlaps rather than shrinks on overflow. */}
          <div
            style={{
              fontSize: 108,
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

          {/* The deed. Ownership is the headline fact about a block, so it sits
              with the title rather than down in the stat row. */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 16 }}>
            {facts.owner ? (
              <>
                <div style={{ display: 'flex', fontSize: 20, color: MUTED, letterSpacing: 2 }}>
                  HELD BY
                </div>
                <div style={{ display: 'flex', fontSize: 28, color: TEXT, marginLeft: 16 }}>
                  {shortenAddress(facts.owner, 12, 8)}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', fontSize: 26, color: MUTED, letterSpacing: 1 }}>
                Unclaimed district
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
              height: 84,
              marginTop: 10,
              marginBottom: 16,
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
          <div style={{ display: 'flex' }}>
            {stats.map((s, i) => (
              <div
                key={s.label}
                style={{ display: 'flex', marginRight: i === stats.length - 1 ? 0 : 48 }}
              >
                <Stat label={s.label} value={s.value} />
              </div>
            ))}
          </div>
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
