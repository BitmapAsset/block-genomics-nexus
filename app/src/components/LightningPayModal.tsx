'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useModalClose } from '@/hooks/useModalClose';

/**
 * Lightning Payment Modal
 * 
 * Shows a bolt11 Lightning invoice as QR code + copyable string.
 * Auto-polls for payment confirmation every 3 seconds.
 * Works with any Lightning wallet (Phoenix, Muun, Cash App, Strike, etc.)
 */

interface LightningPayModalProps {
  /** Amount in USD */
  amountUsd: string;
  /** Payment description shown to user */
  description: string;
  /** Unique correlation ID for this payment */
  correlationId: string;
  /** Called when payment is confirmed */
  onPaid: (invoiceId: string) => void;
  /** Called when modal is closed */
  onClose: () => void;
}

export default function LightningPayModal({
  amountUsd,
  description,
  correlationId,
  onPaid,
  onClose,
}: LightningPayModalProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'paid' | 'error' | 'expired'>('loading');
  const [bolt11, setBolt11] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [amountBtc, setAmountBtc] = useState('');
  const [expiresIn, setExpiresIn] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { modalRef, handleBackdropClick } = useModalClose(onClose);

  // Create invoice on mount
  useEffect(() => {
    let cancelled = false;

    async function createInvoice() {
      try {
        const res = await fetch('/api/v1/lightning/invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amountUsd, description, correlationId }),
        });
        if (!res.ok) throw new Error('Failed to create invoice');
        const data = await res.json();
        if (cancelled) return;

        setBolt11(data.bolt11);
        setInvoiceId(data.invoiceId);
        setAmountBtc(data.amountBtc);
        setExpiresIn(data.expirationInSec);
        setState('ready');
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to create Lightning invoice');
          setState('error');
        }
      }
    }

    createInvoice();
    return () => { cancelled = true; };
  }, [amountUsd, description, correlationId]);

  // Poll for payment status
  useEffect(() => {
    if (state !== 'ready' || !invoiceId) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/lightning/status/${invoiceId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.paid) {
          setState('paid');
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          onPaid(invoiceId);
        }
      } catch {
        // Silent retry
      }
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state, invoiceId, onPaid]);

  // Countdown timer
  useEffect(() => {
    if (state !== 'ready' || expiresIn <= 0) return;

    timerRef.current = setInterval(() => {
      setExpiresIn(prev => {
        if (prev <= 1) {
          setState('expired');
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state]);

  const copyInvoice = useCallback(() => {
    navigator.clipboard.writeText(bolt11);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [bolt11]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Simple QR code as SVG using a data URL approach
  // In production you'd use a proper QR library — for now we show the bolt11 string
  const qrDataUrl = bolt11
    ? `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(bolt11)}`
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Lightning Payment"
    >
      <div ref={modalRef} className="bg-[#1a1a2e] border border-orange-500/30 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl shadow-orange-500/10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            ⚡ Lightning Payment
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Loading */}
        {state === 'loading' && (
          <div className="text-center py-12">
            <div className="animate-spin text-4xl mb-3">⚡</div>
            <p className="text-gray-400">Generating Lightning invoice...</p>
          </div>
        )}

        {/* Ready — show QR + bolt11 */}
        {state === 'ready' && (
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-1">{description}</p>
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="text-3xl font-bold text-orange-400">${amountUsd}</span>
              <span className="text-gray-500">≈</span>
              <span className="text-lg text-yellow-300">{amountBtc} BTC</span>
            </div>

            {/* QR Code */}
            <div className="bg-white rounded-xl p-3 inline-block mb-4">
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="Lightning Invoice QR Code"
                  width={220}
                  height={220}
                  className="rounded"
                />
              )}
            </div>

            {/* Bolt11 string */}
            <div
              className="bg-black/40 rounded-lg p-3 mb-4 cursor-pointer hover:bg-black/60 transition-colors"
              onClick={copyInvoice}
            >
              <p className="text-xs text-gray-500 mb-1">
                {copied ? '✅ Copied!' : '📋 Tap to copy invoice'}
              </p>
              <p className="text-[10px] text-orange-300/70 font-mono break-all line-clamp-3">
                {bolt11}
              </p>
            </div>

            {/* Timer */}
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-gray-500">Expires in</span>
              <span className={`font-mono font-bold ${expiresIn < 30 ? 'text-red-400' : 'text-green-400'}`}>
                {formatTime(expiresIn)}
              </span>
            </div>

            {/* Wallet options hint */}
            <p className="text-gray-600 text-xs mt-3">
              Scan with any Lightning wallet — Phoenix, Muun, Cash App, Strike, Wallet of Satoshi
            </p>
          </div>
        )}

        {/* Paid! */}
        {state === 'paid' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-3">✅</div>
            <h3 className="text-2xl font-bold text-green-400 mb-2">Payment Received!</h3>
            <p className="text-gray-400">${amountUsd} paid via Lightning ⚡</p>
          </div>
        )}

        {/* Expired */}
        {state === 'expired' && (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">⏰</div>
            <h3 className="text-xl font-bold text-red-400 mb-2">Invoice Expired</h3>
            <p className="text-gray-400 mb-4">The Lightning invoice has expired.</p>
            <button
              onClick={() => {
                setState('loading');
                // Re-trigger by updating correlationId would be needed
                // For now, close and re-open
                onClose();
              }}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Error */}
        {state === 'error' && (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">❌</div>
            <h3 className="text-xl font-bold text-red-400 mb-2">Payment Error</h3>
            <p className="text-gray-400">{error}</p>
          </div>
        )}

        {/* Lightning branding */}
        <div className="mt-4 pt-3 border-t border-white/5 text-center">
          <p className="text-[10px] text-gray-600">
            ⚡ Powered by Bitcoin Lightning Network
          </p>
        </div>
      </div>
    </div>
  );
}
