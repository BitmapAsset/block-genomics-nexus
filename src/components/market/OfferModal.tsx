'use client';

import { useState } from 'react';
import PriceDisplay from './PriceDisplay';

interface OfferModalProps {
  blockHeight: number;
  onClose: () => void;
  walletAddress?: string;
}

export default function OfferModal({ blockHeight, onClose, walletAddress }: OfferModalProps) {
  const [amount, setAmount] = useState('');
  const [expiry, setExpiry] = useState('7');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!walletAddress) { setError('Connect wallet first'); return; }
    if (!amount || parseInt(amount) <= 0) { setError('Enter a valid amount'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/market/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockHeight,
          offererAddress: walletAddress,
          amount,
          expiresAt: new Date(Date.now() + parseInt(expiry) * 86400000).toISOString(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to submit offer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 rounded-2xl p-6 space-y-5"
        style={{ background: '#12121f', border: '1px solid rgba(247,147,26,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">Make Offer — Block {blockHeight.toLocaleString()}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl">×</button>
        </div>

        <div>
          <label className="text-xs text-white/50 uppercase tracking-wider">Offer Amount (sats)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100000"
            className="w-full mt-1.5 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-lg focus:outline-none focus:border-[#f7931a]/50"
          />
          {amount && parseInt(amount) > 0 && (
            <div className="mt-2">
              <PriceDisplay sats={amount} size="sm" />
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-white/50 uppercase tracking-wider">Expires In</label>
          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-full mt-1.5 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-[#f7931a]/50"
          >
            <option value="1">1 day</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
          </select>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3.5 rounded-xl font-bold text-white text-base transition-all disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #f7931a, #e2761b)',
            boxShadow: '0 4px 20px rgba(247,147,26,0.3)',
          }}
        >
          {loading ? 'Submitting...' : 'Submit Offer'}
        </button>
      </div>
    </div>
  );
}
