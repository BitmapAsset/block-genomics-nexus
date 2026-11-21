'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { playerFrameSrc, streamPlatform, type StreamPlatform } from '@/lib/stream-embed';
import { STREAM_PLAYERS_ON } from '@/lib/stream-players-flag';
import { playerBoxFits } from '@/lib/stream-read';

const PLATFORM_LABEL: Record<StreamPlatform, string> = { youtube: 'YouTube', twitch: 'Twitch', kick: 'Kick' };

/** "YouTube", "Twitch" or "Kick" for a stream link, else null. */
export function platformLabel(streamUrl: string): string | null {
  let p: StreamPlatform | null;
  try { p = streamPlatform(new URL(streamUrl)); } catch { return null; }
  return p ? PLATFORM_LABEL[p] : null;
}

/** The switch, for the words of the pages around the player (the flag module itself is imported here only). */
export const PLAYERS_ON = STREAM_PLAYERS_ON;

// The player frame's sandbox. Scripts let the player run; allow-same-origin keeps the player's own origin (its own
// cookies and storage on its own site) and gives it no access to this page, which a frame of another origin cannot
// read; our own origin is never framed (playerFrameSrc refuses it, frame-src has no 'self'). Presentation lets it cast
// to another screen. Popups let a link inside the player (its logo, an ad) open a new window; that window may be the
// platform's page or an advertiser's site, and it inherits this sandbox. There is no allow-top-navigation of any kind,
// so the player can never move this page to another address, and no allow-popups-to-escape-sandbox. The page's
// permissions policy already denies camera, microphone and location to every frame.
export const PLAYER_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups';
export const PLAYER_ALLOW = 'autoplay; encrypted-media; fullscreen; picture-in-picture';

export type StreamPlayerStatus = 'live' | 'unconfirmed' | 'ended';

export interface StreamPlayerProps {
  blockHeight: number;
  /** The normalised link the read returns. */
  streamUrl: string;
  /** The player address the read returns. */
  embedUrl: string;
  /** `unconfirmed` keeps a playing frame and its link and offers no new one; `ended` closes the frame for good. */
  status: StreamPlayerStatus;
  onPlay?: () => void;
}

/** Whether the player's box is big enough for this platform's frame right now. */
function boxFits(box: HTMLDivElement | null, label: string): boolean {
  if (box === null) return false;
  const r = box.getBoundingClientRect();
  return playerBoxFits(label, r.width, r.height);
}

export default function StreamPlayer({ blockHeight, streamUrl, embedUrl, status, onPlay }: StreamPlayerProps) {
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [fits, setFits] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const label = platformLabel(streamUrl);
  useEffect(() => {
    if (status === 'ended') setFrameSrc(null);
  }, [status]);
  // Measured before the first paint, so the card never shows a moment of the wrong words.
  useLayoutEffect(() => {
    if (label === null) return;
    const measure = () => setFits(boxFits(box.current, label));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [label]);
  if (label === null) return null;
  const canPlay = STREAM_PLAYERS_ON && status === 'live' && playerFrameSrc(embedUrl, '') !== null && fits;
  const tooSmall = STREAM_PLAYERS_ON && status === 'live' && !fits && label === 'Twitch';
  const showFrame = frameSrc !== null && status !== 'ended';
  const showLink = status === 'live' || (status === 'unconfirmed' && showFrame);
  const play = () => {
    // Made only now, on the visitor's own click: before it no request goes to the platform.
    if (!boxFits(box.current, label)) { setFits(false); return; }
    const src = playerFrameSrc(embedUrl, window.location.hostname);
    if (src === null) return;
    setFrameSrc(src);
    onPlay?.();
  };
  return (
    <div data-testid="stream-player" className="w-full">
      <div ref={box} className="relative w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio: '16 / 10' }}>
        {showFrame ? (
          <iframe
            src={frameSrc ?? undefined}
            title={`Live stream on block ${blockHeight} from ${label}`}
            sandbox={PLAYER_SANDBOX}
            referrerPolicy="strict-origin-when-cross-origin"
            allow={PLAYER_ALLOW}
            allowFullScreen
            className="absolute inset-0 h-full w-full"
            style={{ border: 'none' }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center" style={{ background: 'linear-gradient(135deg, #1a0a10, #0a0a12)' }}>
            {status === 'ended' ? (
              <div className="text-sm text-gray-300">This stream has ended.</div>
            ) : (
              <>
                <div className="text-sm font-bold text-white">Block {blockHeight} · live on {label}</div>
                {canPlay && <div className="text-[11px] text-gray-400">Plays from {label}; its terms and cookies apply. Ads there may open other sites.</div>}
                {tooSmall && <div className="text-[11px] text-gray-400">Twitch&apos;s player needs a wider screen. Watch it on Twitch.</div>}
                {status === 'unconfirmed' && <div className="text-[11px] text-gray-400">Checking who holds this block. Try again in a moment.</div>}
                {canPlay && (
                  <button type="button" onClick={play} className="rounded-lg px-4 py-2 text-sm font-bold" style={{ background: 'rgba(255,51,51,0.2)', border: '1.5px solid #ff3333', color: '#ff6b6b' }}>
                    ▶ Play
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {showLink && (
        <div className="mt-2 flex justify-start sm:justify-end">
          <a href={streamUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono" style={{ color: '#94a3b8' }}>
            Watch on {label} ↗
          </a>
        </div>
      )}
    </div>
  );
}
