'use client';

import { useState, useCallback } from 'react';
import CrownShield from '@/components/CrownShield';

/* ── helpers ── */
function truncateAddress(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function mockGenomeHash() {
  return '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/* ── step indicator ── */
function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div
      className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold border transition-all ${
        done
          ? 'bg-green-500/20 border-green-500 text-green-400'
          : active
          ? 'bg-accent-cyan/20 border-accent-cyan text-accent-cyan'
          : 'bg-bg-tertiary/30 border-border text-text-muted'
      }`}
    >
      {done ? '✓' : n}
    </div>
  );
}

/* ── wallet icons (simple SVG placeholders) ── */
const walletMeta = [
  { id: 'unisat', label: 'Unisat', icon: '🟧' },
  { id: 'xverse', label: 'Xverse', icon: '🔵' },
  { id: 'leather', label: 'Leather', icon: '🟤' },
] as const;

export default function VerifyPage() {
  /* step 1 */
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletAddr, setWalletAddr] = useState('');

  /* step 2 */
  const [blockInput, setBlockInput] = useState('');
  const [blockError, setBlockError] = useState('');
  const [blockInfo, setBlockInfo] = useState<{ height: number; txCount: number } | null>(null);

  /* step 3 */
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [genomeHash, setGenomeHash] = useState('');

  /* step 4 */
  const [handle, setHandle] = useState('');
  const [handleError, setHandleError] = useState('');
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);
  const [profileCreated, setProfileCreated] = useState(false);

  const currentStep = !wallet ? 1 : !blockInfo ? 2 : !verified ? 3 : 4;

  /* ── actions ── */
  const connectWallet = useCallback((id: string) => {
    /* MOCK — replace with real wallet connect */
    const fakeAddr = 'bc1p' + Array.from({ length: 58 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    setWallet(id);
    setWalletAddr(fakeAddr);
  }, []);

  const submitBlock = useCallback(() => {
    const raw = blockInput.trim();
    const height = parseInt(raw.split(':')[0], 10);
    if (!height || height <= 0) {
      setBlockError('Enter a valid block height (positive integer)');
      return;
    }
    setBlockError('');
    /* MOCK — replace with real API lookup */
    setBlockInfo({ height, txCount: Math.floor(Math.random() * 3000) + 100 });
  }, [blockInput]);

  const signAndVerify = useCallback(async () => {
    setVerifying(true);
    /* MOCK — replace with real BIP-322 signing */
    await new Promise((r) => setTimeout(r, 1800));
    setGenomeHash(mockGenomeHash());
    setVerified(true);
    setVerifying(false);
  }, []);

  const validateHandle = (v: string) => {
    if (v.length < 3 || v.length > 20) return 'Must be 3–20 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(v)) return 'Only letters, numbers, underscores';
    return '';
  };

  const checkAvailability = useCallback(() => {
    const err = validateHandle(handle);
    if (err) { setHandleError(err); return; }
    setHandleError('');
    /* MOCK — always available */
    setHandleAvailable(true);
  }, [handle]);

  const createProfile = useCallback(() => {
    const err = validateHandle(handle);
    if (err) { setHandleError(err); return; }
    setProfileCreated(true);
  }, [handle]);

  /* ── render ── */
  return (
    <div className="min-h-screen bg-[#0a0a0f] px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-center mb-2 text-gradient-cyan-purple">
          Verify Ownership
        </h1>
        <p className="text-center text-text-secondary text-sm mb-12">
          Prove you own a Bitcoin block. Mint your genome. Claim your identity.
        </p>

        <div className="space-y-6">
          {/* ═══ STEP 1: Connect Wallet ═══ */}
          <section className={`glass-panel p-6 transition-opacity duration-500 ${currentStep >= 1 ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex items-center gap-3 mb-4">
              <StepBadge n={1} active={currentStep === 1} done={!!wallet} />
              <h2 className="text-lg font-semibold">Connect Wallet</h2>
            </div>

            {!wallet ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {walletMeta.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => connectWallet(w.id)}
                    className="flex items-center justify-center gap-2 rounded-lg border border-border bg-bg-tertiary/30 px-4 py-3 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-accent-cyan/40 hover:bg-accent-cyan/5 transition-all"
                  >
                    <span className="text-xl">{w.icon}</span>
                    {w.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm">
                <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-text-secondary">Connected via <strong className="text-text-primary capitalize">{wallet}</strong></span>
                <code className="ml-auto text-xs text-accent-cyan bg-accent-cyan/10 px-2 py-1 rounded">{truncateAddress(walletAddr)}</code>
              </div>
            )}
          </section>

          {/* ═══ STEP 2: Select Block ═══ */}
          <section className={`glass-panel p-6 transition-opacity duration-500 ${currentStep >= 2 ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex items-center gap-3 mb-4">
              <StepBadge n={2} active={currentStep === 2} done={!!blockInfo} />
              <h2 className="text-lg font-semibold">Select Block or Parcel</h2>
            </div>

            {!blockInfo ? (
              <div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={blockInput}
                      onChange={(e) => { setBlockInput(e.target.value); setBlockError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && submitBlock()}
                      placeholder="Block height or Block:TxIndex"
                      className="w-full rounded-lg border border-border bg-bg-tertiary/30 pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/50"
                    />
                  </div>
                  <button
                    onClick={submitBlock}
                    className="rounded-lg bg-accent-cyan px-5 py-2.5 text-sm font-semibold text-bg-primary hover:bg-accent-cyan/90 transition-colors"
                  >
                    Look Up
                  </button>
                </div>
                {blockError && <p className="text-xs text-red-400 mt-2">{blockError}</p>}
              </div>
            ) : (
              <div className="flex items-center gap-4 text-sm">
                <div className="flex-1 rounded-lg border border-border bg-bg-tertiary/20 p-4">
                  <div className="text-xs text-text-muted mb-1">Block Height</div>
                  <div className="text-xl font-bold text-accent-cyan">#{blockInfo.height.toLocaleString()}</div>
                </div>
                <div className="flex-1 rounded-lg border border-border bg-bg-tertiary/20 p-4">
                  <div className="text-xs text-text-muted mb-1">Transactions</div>
                  <div className="text-xl font-bold text-text-primary">{blockInfo.txCount.toLocaleString()}</div>
                </div>
              </div>
            )}
          </section>

          {/* ═══ STEP 3: Verify Ownership ═══ */}
          <section className={`glass-panel p-6 transition-opacity duration-500 ${currentStep >= 3 ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex items-center gap-3 mb-4">
              <StepBadge n={3} active={currentStep === 3} done={verified} />
              <h2 className="text-lg font-semibold">Verify Ownership</h2>
            </div>

            {!verified ? (
              <div>
                {blockInfo && (
                  <p className="text-sm text-text-secondary mb-4">
                    Sign a BIP-322 message to prove you own <strong className="text-accent-cyan">Block #{blockInfo.height.toLocaleString()}</strong>
                  </p>
                )}
                <button
                  onClick={signAndVerify}
                  disabled={verifying || currentStep !== 3}
                  className="rounded-lg bg-accent-purple/80 hover:bg-accent-purple px-6 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {verifying ? (
                    <>
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing…
                    </>
                  ) : (
                    'Sign & Verify'
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500/20 animate-pulse">
                    <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-400">Ownership Verified!</p>
                    <p className="text-xs text-text-muted">BIP-322 signature confirmed</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-bg-tertiary/20 p-4">
                  <div className="text-xs text-text-muted mb-1">Genome Hash</div>
                  <code className="text-xs text-accent-cyan break-all">{genomeHash}</code>
                </div>

                <div className="flex justify-center">
                  <CrownShield tier={1} size={80} verified glow />
                </div>
              </div>
            )}
          </section>

          {/* ═══ STEP 4: Create Handle ═══ */}
          <section className={`glass-panel p-6 transition-opacity duration-500 ${currentStep >= 4 ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex items-center gap-3 mb-4">
              <StepBadge n={4} active={currentStep === 4} done={profileCreated} />
              <h2 className="text-lg font-semibold">Create Handle</h2>
            </div>

            {!profileCreated ? (
              <div>
                <div className="flex gap-2 mb-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">@</span>
                    <input
                      type="text"
                      value={handle}
                      onChange={(e) => { setHandle(e.target.value); setHandleAvailable(null); setHandleError(''); }}
                      placeholder="your_handle"
                      className="w-full rounded-lg border border-border bg-bg-tertiary/30 pl-8 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/50"
                    />
                  </div>
                  <button
                    onClick={checkAvailability}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-accent-cyan/40 transition-colors"
                  >
                    Check
                  </button>
                </div>
                {handleError && <p className="text-xs text-red-400 mb-2">{handleError}</p>}
                {handleAvailable && <p className="text-xs text-green-400 mb-2">@{handle} is available!</p>}

                <button
                  onClick={createProfile}
                  disabled={!handleAvailable}
                  className="mt-2 rounded-lg bg-accent-cyan px-6 py-3 text-sm font-semibold text-bg-primary hover:bg-accent-cyan/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Create Profile
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 p-6 text-center">
                <div className="flex justify-center mb-4">
                  <CrownShield tier={1} size={64} verified glow />
                </div>
                <p className="text-lg font-bold text-accent-cyan mb-1">@{handle}</p>
                <p className="text-xs text-text-muted mb-3">Block #{blockInfo?.height.toLocaleString()} · Tier 1 — Gold</p>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  Profile Created
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
