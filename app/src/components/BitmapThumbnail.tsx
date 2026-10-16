"use client";

import { useState } from "react";

// Bitfeed orange, used for the fallback tile when the image cannot load.
const BITFEED_ORANGE = "#fd931e";

/**
 * Bitmap art for one block.
 *
 * Renders the server PNG from `/api/v1/block-thumbnail/{height}` (Mondrian
 * layout, rendered once and cached in the DB). This replaced a client-side
 * renderer that walked mempool.space 25 transactions per request — up to 200
 * sequential calls per block — and showed a bare number whenever mempool
 * rate-limited or was unreachable.
 *
 * `fill` makes the tile take its container's width (square), for card grids.
 * `variant` is accepted for API compatibility; the server image is always the
 * dark Bitfeed palette.
 */
export default function BitmapThumbnail({
  blockHeight,
  size = 64,
  fill = false,
  className,
}: {
  blockHeight: number;
  size?: number;
  fill?: boolean;
  className?: string;
  variant?: "dark" | "light";
}) {
  // Keyed by height so a reused tile (e.g. the wallet dropdown) retries a new block.
  const [failedHeight, setFailedHeight] = useState<number | null>(null);
  const failed = failedHeight === blockHeight;
  const box = fill
    ? { width: "100%", height: "auto", aspectRatio: "1 / 1" }
    : { width: size, height: size };

  if (failed) {
    return (
      <div
        className={className}
        style={{
          ...box,
          borderRadius: 4,
          background: BITFEED_ORANGE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: fill ? 24 : Math.max(8, size * 0.18),
          color: "#fff",
          fontWeight: 700,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {blockHeight}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- dynamic API PNG; next/image would re-encode an already-cached image
    <img
      src={`/api/v1/block-thumbnail/${blockHeight}.png?v=2`}
      alt={`${blockHeight}.bitmap`}
      width={fill ? 256 : size}
      height={fill ? 256 : size}
      loading="lazy"
      decoding="async"
      onError={() => setFailedHeight(blockHeight)}
      className={className}
      style={{
        ...box,
        borderRadius: 4,
        flexShrink: 0,
        background: "#1d1f31",
      }}
    />
  );
}
