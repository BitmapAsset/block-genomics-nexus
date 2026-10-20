'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBlockSummary, fetchRealBlock, type RealBlockData } from '@/lib/blockchainApi';

/** Each half of the estimate → real cross-fade; the whole swap is twice this. */
export const LAYOUT_FADE_MS = 220;
/** Automatic summary retry while the labelled estimate is on screen. */
export const SUMMARY_RETRY_MS = 15_000;
const MAX_AUTO_RETRIES = 4;

export interface BlockLayoutData {
  realBlock: RealBlockData | null;
  dataSource: 'loading' | 'real' | 'mock';
  /** The estimate is showing and another summary attempt is scheduled. */
  retrying: boolean;
  /** Fading the estimate out before the real layout replaces it. */
  swapping: boolean;
  /** Try the summary again now (the fallback's manual button). */
  retry: () => void;
}

/**
 * The block viewer's transactions, painted once.
 *
 * The parcel layout is a pure function of per-tx vsize in block order, so any
 * change of input re-shuffles the whole map. The normal path therefore waits
 * for the real summary (one request, cached server-side) and paints from it.
 * Only when that fails does the viewer show the old estimate (page 0 + a
 * synthesized remainder, badged 🟡 Estimated), retry on its own, and fade the
 * estimate out before the real layout replaces it, so the change is visible
 * and explained rather than a silent jump.
 */
export function useBlockLayoutData(blockHeight: number): BlockLayoutData {
  const [realBlock, setRealBlock] = useState<RealBlockData | null>(null);
  const [dataSource, setDataSource] = useState<'loading' | 'real' | 'mock'>('loading');
  const [retrying, setRetrying] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const attemptRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let autoRetries = 0;
    let showingFallback = false;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };

    setDataSource('loading');
    setRealBlock(null);
    setRetrying(false);
    setSwapping(false);

    const attempt = () => {
      clear();
      fetchBlockSummary(blockHeight).then(live => {
        if (cancelled) return;
        if (live) {
          setRetrying(false);
          if (!showingFallback) {
            setRealBlock(live);
            setDataSource('real');
            return;
          }
          setSwapping(true);
          timer = setTimeout(() => {
            if (cancelled) return;
            setRealBlock(live);
            setDataSource('real');
            setSwapping(false);
          }, LAYOUT_FADE_MS);
          return;
        }

        const schedule = () => {
          if (autoRetries >= MAX_AUTO_RETRIES) { setRetrying(false); return; }
          autoRetries++;
          setRetrying(true);
          timer = setTimeout(attempt, SUMMARY_RETRY_MS);
        };
        if (showingFallback) { schedule(); return; }

        showingFallback = true;
        fetchRealBlock(blockHeight).then(estimate => {
          if (cancelled) return;
          setRealBlock(estimate);
          setDataSource(estimate ? 'real' : 'mock');
          schedule();
        });
      });
    };

    attemptRef.current = attempt;
    attempt();
    return () => { cancelled = true; clear(); attemptRef.current = () => {}; };
  }, [blockHeight]);

  const retry = useCallback(() => attemptRef.current(), []);
  return { realBlock, dataSource, retrying, swapping, retry };
}
