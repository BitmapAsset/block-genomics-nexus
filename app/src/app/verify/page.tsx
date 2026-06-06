'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import CrownShield from '@/components/CrownShield';
import BitmapBlocksBg from '@/components/BitmapBlocksBg';
import { useGlobalWallet } from '@/context/GlobalWalletContext';
import { detectWallets, connectWalletByType, signWithWallet, saveSession, clearSession, type WalletType } from '@/lib/wallet-utils';

/* ── helpers ── */
function truncateAddress(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
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

/* ── wallet icons ── */
const walletMeta = [
  { id: 'unisat' as WalletType, label: 'Unisat', icon: '🟧', color: '#f7931a' },
  { id: 'xverse' as WalletType, label: 'Xverse', icon: '🔵', color: '#4488ff' },
  { id: 'leather' as WalletType, label: 'Leather', icon: '🟤', color: '#8b6914' },
] as const;

/* ── inscription types ── */
interface BitmapInscription {
  type: 'block' | 'parcel';
  height: number;
  txIndex?: number;
  inscriptionId: string;
  label: string;
}

/** Fetch .bitmap inscriptions from wallet via our server-side proxy (avoids CORS) */
async function fetchBitmapInscriptions(address: string): Promise<BitmapInscription[]> {
  const results: BitmapInscription[] = [];

  // Strategy 1: Try Unisat extension directly (most reliable — has content)
  if (window.unisat) {
    try {
      let offset = 0;
      const pageSize = 20;
      while (offset < 200) {
        const page = await window.unisat.getInscriptions(offset, pageSize);
        if (!page?.list?.length) break;
        for (const insc of page.list) {
          const content = (insc.content || '').trim();
          const parsed = parseBitmapContent(content, insc.inscriptionId);
          if (parsed) results.push(parsed);
        }
        if (page.list.length < pageSize) break;
        offset += pageSize;
      }
      if (results.length > 0) return results;
    } catch { /* extension method failed, try server proxy */ }
  }

  // Strategy 2: Server-side proxy (no CORS issues — calls Unisat/ordinals from our backend)
  try {
    const resp = await fetch(`/api/v1/inscriptions/scan?address=${encodeURIComponent(address)}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.success && data.data?.inscriptions?.length > 0) {
        for (const insc of data.data.inscriptions) {
          results.push({
            type: insc.type,
            height: insc.height,
            txIndex: insc.parcelIndex,
            inscriptionId: insc.inscriptionId,
            label: insc.label,
          });
        }
        return results;
      }
    }
  } catch { /* server proxy failed */ }

  return results;
}

/** Parse a single content string into a BitmapInscription or null */
function parseBitmapContent(content: string, inscriptionId: string): BitmapInscription | null {
  const blockMatch = content.match(/^(\d+)\.bitmap$/);
  const parcelMatch = content.match(/^(\d+):(\d+)\.bitmap$/);

  if (blockMatch) {
    return {
      type: 'block',
      height: parseInt(blockMatch[1], 10),
      inscriptionId,
      label: `${parseInt(blockMatch[1], 10).toLocaleString()}.bitmap`,
    };
  }
  if (parcelMatch) {
    return {
      type: 'parcel',
      height: parseInt(parcelMatch[1], 10),
      txIndex: parseInt(parcelMatch[2], 10),
      inscriptionId,
      label: `${parseInt(parcelMatch[1], 10).toLocaleString()}:${parcelMatch[2]}.bitmap`,
    };
  }
  return null;
}


export default function VerifyPage() {
  const globalWallet = useGlobalWallet();

  /* step 1 — use context if already connected, otherwise local state */
  const [localWallet, setLocalWallet] = useState<WalletType | null>(null);
  const [localWalletAddr, setLocalWalletAddr] = useState('');
  const [walletError, setWalletError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [detectedWallets, setDetectedWallets] = useState<Record<string, boolean>>({});

  // Derived wallet state: prefer global context, fall back to local
  const wallet: WalletType | null = globalWallet.isConnected ? globalWallet.walletType : localWallet;
  const walletAddr: string = globalWallet.isConnected ? (globalWallet.walletAddress || '') : localWalletAddr;

  /* step 2 */
  const [blockInput, setBlockInput] = useState('');
  const [blockError, setBlockError] = useState('');
  const [blockInfo, setBlockInfo] = useState<{ height: number; txCount: number; inscriptionId?: string } | null>(null);
  const [inscriptions, setInscriptions] = useState<BitmapInscription[]>([]);
  const [loadingInscriptions, setLoadingInscriptions] = useState(false);

  /* step 3 */
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [genomeHash, setGenomeHash] = useState('');
  const [signError, setSignError] = useState('');

  /* step 4 */
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleError, setHandleError] = useState('');
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);
  const [checkingHandle, setCheckingHandle] = useState(false);
  const [profileCreated, setProfileCreated] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);

  /* multi-profile state */
  const [existingProfiles, setExistingProfiles] = useState<{ handle: string; blockHeight: number; avatar?: string; isBlockProfile: boolean }[]>([]);
  const [userProfile, setUserProfile] = useState<{ handle: string; anchorBlock: number | null; avatar?: string; displayName?: string } | null>(null);

  const currentStep = !wallet ? 1 : !blockInfo ? 2 : !verified ? 3 : 4;

  /* Detect installed wallets on mount */
  useEffect(() => {
    const check = () => setDetectedWallets(detectWallets());
    check();
    const t = setTimeout(check, 500);
    return () => clearTimeout(t);
  }, []);

  /* Check for existing profile when wallet address is set */
  useEffect(() => {
    if (!walletAddr) return;
    let cancelled = false;
    fetch('/api/v1/users/by-wallet/' + walletAddr)
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data.success) return;
        const u = data.data;
        if (u.handle) setHandle(u.handle);
        if (u.displayName) setDisplayName(u.displayName);
        if (u.genomeHash) { setGenomeHash(u.genomeHash); setVerified(true); }
        if (u.anchorBlock) setBlockInfo({ height: u.anchorBlock, txCount: 0 });
        if (u.handle) { setProfileCreated(true); setHandleAvailable(true); }
        if (u.handle) setUserProfile({ handle: u.handle, anchorBlock: u.anchorBlock, avatar: u.avatar, displayName: u.displayName });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [walletAddr]);

  /* Fetch existing block profiles when wallet connects */
  useEffect(() => {
    if (!walletAddr) return;
    fetch(`/api/v1/profiles/by-wallet/${walletAddr}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data?.profiles) {
          setExistingProfiles(data.data.profiles.map((p: { handle: string; blockHeight: number; avatar?: string }) => ({
            handle: p.handle,
            blockHeight: p.blockHeight,
            avatar: p.avatar,
            isBlockProfile: true,
          })));
        }
      })
      .catch(() => {});
  }, [walletAddr]);

  /* Fetch bitmap inscriptions when wallet connects */
  useEffect(() => {
    if (!walletAddr) return;
    let cancelled = false;
    setLoadingInscriptions(true);
    fetchBitmapInscriptions(walletAddr).then(data => {
      if (!cancelled) { setInscriptions(data); setLoadingInscriptions(false); }
    }).catch(() => {
      if (!cancelled) { setInscriptions([]); setLoadingInscriptions(false); }
    });
    return () => { cancelled = true; };
  }, [walletAddr]);

  /* ── actions ── */
  const connectWallet = useCallback(async (id: WalletType) => {
    setConnecting(true);
    setWalletError('');
    try {
      // Use global context connect — this persists to localStorage automatically
      await globalWallet.connect(id);
    } catch {
      // If global connect fails, try direct connection as fallback
      try {
        const addr = await connectWalletByType(id);
        setLocalWallet(id);
        setLocalWalletAddr(addr);
        saveSession(id, addr);
      } catch (e2: unknown) {
        const msg = e2 instanceof Error ? e2.message : 'Failed to connect';
        if (msg.includes('not installed')) {
          const urls: Record<string, string> = {
            unisat: 'https://unisat.io/download',
            xverse: 'https://www.xverse.app/download',
            leather: 'https://leather.io/install-extension',
          };
          window.open(urls[id], '_blank');
        }
        setWalletError(msg);
      }
    } finally {
      setConnecting(false);
    }
  }, [globalWallet]);

  const disconnectWallet = useCallback(() => {
    globalWallet.disconnect();
    setLocalWallet(null);
    setLocalWalletAddr('');
    setBlockInfo(null);
    setVerified(false);
    setGenomeHash('');
    setProfileCreated(false);
    setHandle('');
    setDisplayName('');
    setHandleAvailable(null);
    clearSession();
  }, [globalWallet]);

  const selectInscription = useCallback(async (insc: BitmapInscription) => {
    try {
      const resp = await fetch(`https://mempool.space/api/block-height/${insc.height}`);
      if (resp.ok) {
        const blockHash = await resp.text();
        const blockResp = await fetch(`https://mempool.space/api/block/${blockHash}`);
        if (blockResp.ok) {
          const blockData = await blockResp.json();
          setBlockInfo({ height: insc.height, txCount: blockData.tx_count || 0, inscriptionId: insc.inscriptionId });
          return;
        }
      }
    } catch { /* fallback */ }
    setBlockInfo({ height: insc.height, txCount: 0, inscriptionId: insc.inscriptionId });
  }, []);

  const submitBlock = useCallback(async () => {
    const raw = blockInput.trim();
    const height = parseInt(raw.split(':')[0], 10);
    if (!height || height <= 0) {
      setBlockError('Enter a valid block height (positive integer)');
      return;
    }
    setBlockError('');

    try {
      const resp = await fetch(`https://mempool.space/api/block-height/${height}`);
      if (!resp.ok) { setBlockError('Block not found'); return; }
      const blockHash = await resp.text();
      const blockResp = await fetch(`https://mempool.space/api/block/${blockHash}`);
      if (blockResp.ok) {
        const blockData = await blockResp.json();
        setBlockInfo({ height, txCount: blockData.tx_count || 0 });
      } else {
        setBlockInfo({ height, txCount: 0 });
      }
    } catch {
      setBlockInfo({ height, txCount: 0 });
    }
  }, [blockInput]);

  const signAndVerify = useCallback(async () => {
    if (!wallet || !walletAddr || !blockInfo) return;
    setVerifying(true);
    setSignError('');
    try {
      const challengeResp = await fetch('/api/v1/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: walletAddr }),
      });
      const challengeData = await challengeResp.json();
      if (!challengeData.success) throw new Error(challengeData.error || 'Failed to get challenge');

      const { message } = challengeData.data;
      const signature = await signWithWallet(wallet, message, walletAddr);

      const verifyResp = await fetch('/api/v1/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: walletAddr,
          signature,
          message,
          blockHeight: blockInfo.height,
          ...(blockInfo.inscriptionId && { inscriptionId: blockInfo.inscriptionId }),
        }),
      });
      const verifyData = await verifyResp.json();
      if (!verifyData.success) throw new Error(verifyData.error || 'Verification failed');

      setGenomeHash(verifyData.data.genomeHash);
      setVerified(true);
      // Refresh global profile after verification
      globalWallet.refreshProfile();
    } catch (e: unknown) {
      setSignError(e instanceof Error ? e.message : 'Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  }, [wallet, walletAddr, blockInfo, globalWallet]);

  const validateHandle = (v: string) => {
    if (v.length < 3 || v.length > 20) return 'Must be 3–20 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(v)) return 'Only letters, numbers, underscores';
    return '';
  };

  const checkAvailability = useCallback(async () => {
    const err = validateHandle(handle);
    if (err) { setHandleError(err); return; }
    setHandleError('');
    setCheckingHandle(true);
    try {
      const resp = await fetch(`/api/v1/auth/verify?handle=${encodeURIComponent(handle)}`);
      const data = await resp.json();
      if (data.success) {
        setHandleAvailable(data.data.available);
        if (!data.data.available) setHandleError('Handle already taken');
      }
    } catch {
      setHandleError('Failed to check availability');
    } finally {
      setCheckingHandle(false);
    }
  }, [handle]);

  const createProfile = useCallback(async () => {
    const err = validateHandle(handle);
    if (err) { setHandleError(err); return; }
    if (!walletAddr || !blockInfo || !wallet) return;

    setCreatingProfile(true);
    try {
      const challengeResp = await fetch('/api/v1/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: walletAddr }),
      });
      const challengeData = await challengeResp.json();
      if (!challengeData.success) throw new Error('Failed to get challenge');

      const signature = await signWithWallet(wallet, challengeData.data.message, walletAddr);

      const resp = await fetch('/api/v1/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: walletAddr,
          signature,
          message: challengeData.data.message,
          blockHeight: blockInfo.height,
          ...(blockInfo.inscriptionId && { inscriptionId: blockInfo.inscriptionId }),
          handle,
          displayName: displayName || undefined,
        }),
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'Failed to create profile');

      // NOTE: /api/v1/auth/verify already auto-creates the BlockProfile when a
      // handle is supplied (using the same deterministic genome). A second
      // /api/v1/profiles/create call here would fail anyway — its nonce was
      // just consumed by verify and that endpoint now requires its own
      // action-bound challenge — so it is intentionally omitted.

      setProfileCreated(true);
      setExistingProfiles(prev => [...prev, { handle, blockHeight: blockInfo!.height, isBlockProfile: true }]);
      // Refresh global profile after creation
      globalWallet.refreshProfile();
    } catch (e: unknown) {
      setHandleError(e instanceof Error ? e.message : 'Failed to create profile');
    } finally {
      setCreatingProfile(false);
    }
  }, [handle, displayName, walletAddr, wallet, blockInfo, globalWallet]);

  /* ── render ── */
  return (
    <div className="min-h-screen bg-[#0a0a0f] px-4 py-16 sm:py-24 relative">
      <BitmapBlocksBg />
      <div className="mx-auto max-w-2xl relative" style={{ zIndex: 1 }}>
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
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {walletMeta.map((w) => {
                    const detected = detectedWallets[w.id];
                    return (
                      <button
                        key={w.id}
                        onClick={() => connectWallet(w.id)}
                        disabled={connecting}
                        className="relative flex flex-col items-center gap-2 rounded-lg border border-border bg-bg-tertiary/30 px-4 py-4 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-accent-cyan/40 hover:bg-accent-cyan/5 transition-all disabled:opacity-50"
                      >
                        <span className="text-2xl">{w.icon}</span>
                        <span>{w.label}</span>
                        {detected !== undefined && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                            detected
                              ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                              : 'bg-white/5 text-text-muted border border-border'
                          }`}>
                            {detected ? '✓ Detected' : 'Install ↗'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {walletError && <p className="text-xs text-red-400">{walletError}</p>}
                {connecting && (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <span className="h-4 w-4 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                    Connecting…
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm">
                <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-text-secondary">Connected via <strong className="text-text-primary capitalize">{wallet}</strong></span>
                <code className="ml-auto text-xs text-accent-cyan bg-accent-cyan/10 px-2 py-1 rounded">{truncateAddress(walletAddr)}</code>
                <button
                  onClick={disconnectWallet}
                  className="text-xs text-text-muted hover:text-red-400 transition-colors ml-2"
                >
                  Disconnect
                </button>
              </div>
            )}
          </section>

          {/* ═══ YOUR PROFILES (shown when wallet connected and profiles exist) ═══ */}
          {wallet && (userProfile || existingProfiles.length > 0) && (
            <section className="glass-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span className="text-accent-cyan">👤</span> Your Profiles
                </h2>
                <span className="text-xs text-text-muted">{(userProfile ? 1 : 0) + existingProfiles.length} profile{(userProfile ? 1 : 0) + existingProfiles.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* User profile (primary) */}
                {userProfile && (
                  <Link
                    href={`/agent/${userProfile.handle}`}
                    className="flex items-center gap-3 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-3 hover:bg-accent-cyan/10 transition-all group"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent-cyan/15 border border-accent-cyan/30 text-lg overflow-hidden">
                      {userProfile.avatar ? (
                        <img src={userProfile.avatar} alt="" className="w-full h-full object-cover rounded-full" />
                      ) : '👤'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary group-hover:text-accent-cyan transition-colors truncate">@{userProfile.handle}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">Primary</span>
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {userProfile.anchorBlock ? `Block #${userProfile.anchorBlock.toLocaleString()}` : 'User Profile'}
                        {userProfile.displayName ? ` · ${userProfile.displayName}` : ''}
                      </div>
                    </div>
                    <svg className="h-4 w-4 text-text-muted group-hover:text-accent-cyan transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                )}
                {/* Block profiles */}
                {existingProfiles.map((p) => (
                  <Link
                    key={p.handle}
                    href={`/agent/${p.handle}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-bg-tertiary/20 px-4 py-3 hover:border-accent-purple/40 hover:bg-accent-purple/5 transition-all group"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent-purple/15 border border-accent-purple/30 text-lg overflow-hidden">
                      {p.avatar ? (
                        <img src={p.avatar} alt="" className="w-full h-full object-cover rounded-full" />
                      ) : '⛓️'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary group-hover:text-accent-purple transition-colors truncate">@{p.handle}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-purple/15 text-accent-purple border border-accent-purple/30">Block</span>
                      </div>
                      <div className="text-[10px] text-text-muted">Block #{p.blockHeight.toLocaleString()}</div>
                    </div>
                    <svg className="h-4 w-4 text-text-muted group-hover:text-accent-purple transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                ))}
              </div>
              {/* Create new profile button */}
              <button
                onClick={() => {
                  setBlockInfo(null);
                  setVerified(false);
                  setGenomeHash('');
                  setProfileCreated(false);
                  setHandle('');
                  setDisplayName('');
                  setHandleAvailable(null);
                }}
                className="mt-3 w-full rounded-lg border border-dashed border-border hover:border-accent-cyan/40 bg-transparent px-4 py-2.5 text-xs text-text-muted hover:text-accent-cyan transition-all"
              >
                + Create New Block Profile
              </button>
            </section>
          )}

          {/* ═══ STEP 2: Select Block ═══ */}
          <section className={`glass-panel p-6 transition-opacity duration-500 ${currentStep >= 2 ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex items-center gap-3 mb-4">
              <StepBadge n={2} active={currentStep === 2} done={!!blockInfo} />
              <h2 className="text-lg font-semibold">Select Block or Parcel</h2>
            </div>

            {!blockInfo ? (
              <div className="space-y-4">
                {loadingInscriptions && (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <span className="h-4 w-4 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                    Scanning wallet for .bitmap inscriptions…
                  </div>
                )}

                {!loadingInscriptions && inscriptions.length > 0 && (
                  <div>
                    <p className="text-xs text-text-muted mb-2">Found in your wallet: <span className="text-accent-cyan">{inscriptions.length} bitmap{inscriptions.length !== 1 ? 's' : ''}</span></p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
                      {inscriptions.map((insc) => {
                        const existingProfile = existingProfiles.find(p => p.blockHeight === insc.height);
                        return (
                          <button
                            key={insc.inscriptionId}
                            onClick={() => !existingProfile && selectInscription(insc)}
                            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all group ${
                              existingProfile
                                ? 'border-green-500/30 bg-green-500/5 cursor-default'
                                : 'border-border bg-bg-tertiary/20 hover:border-accent-cyan/40 hover:bg-accent-cyan/5'
                            }`}
                          >
                            <div className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold ${
                              existingProfile
                                ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                                : insc.type === 'block'
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                  : 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30'
                            }`}>
                              {existingProfile ? '✓' : insc.type === 'block' ? '⛓️' : '📦'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-text-primary group-hover:text-accent-cyan transition-colors truncate">
                                {insc.label}
                              </div>
                              <div className="text-[10px] text-text-muted truncate">
                                {existingProfile
                                  ? `Already verified as @${existingProfile.handle}`
                                  : `${insc.type === 'block' ? 'Block Inscription' : 'Parcel Inscription'} · ${insc.inscriptionId.slice(0, 8)}…${insc.inscriptionId.slice(-6)}`
                                }
                              </div>
                            </div>
                            {!existingProfile && (
                              <svg className="h-4 w-4 text-text-muted group-hover:text-accent-cyan transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!loadingInscriptions && inscriptions.length === 0 && wallet && (
                  <p className="text-xs text-text-muted">No .bitmap inscriptions found in this wallet. You can enter a block height manually — ownership will be verified on-chain.</p>
                )}

                <div>
                  {inscriptions.length > 0 && <p className="text-xs text-text-muted mb-2">Or enter manually (verified on-chain):</p>}
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
                        placeholder="Block height (e.g. 800000)"
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
                <button
                  onClick={() => { setBlockInfo(null); setVerified(false); setGenomeHash(''); setProfileCreated(false); }}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  Change
                </button>
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
                    Sign a BIP-322 message with your wallet to prove you own <strong className="text-accent-cyan">Block #{blockInfo.height.toLocaleString()}</strong>
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
                      Waiting for wallet signature…
                    </>
                  ) : (
                    '✍️ Sign & Verify'
                  )}
                </button>
                {signError && <p className="text-xs text-red-400 mt-3">{signError}</p>}
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
                    <p className="text-xs text-text-muted">BIP-322 signature confirmed on-chain</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-bg-tertiary/20 p-4">
                  <div className="text-xs text-text-muted mb-1">Genome Hash (Your Digital DNA)</div>
                  <code className="text-xs text-accent-cyan break-all">{genomeHash}</code>
                </div>

                <div className="flex justify-center">
                  <CrownShield tier={1} size={80} verified glow verifiedStyle="check" />
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
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">Display Name <span className="text-text-muted/50">(optional)</span></label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value.slice(0, 50))}
                    placeholder="My Cool Name"
                    className="w-full rounded-lg border border-border bg-bg-tertiary/30 px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/50"
                  />
                  <p className="text-xs text-text-muted/60 mt-1">Shown on your profile. You can change it anytime.</p>
                </div>

                <div>
                  <label className="block text-xs text-text-muted mb-1.5">Handle <span className="text-red-400/70">*</span></label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">@</span>
                      <input
                        type="text"
                        value={handle}
                        onChange={(e) => { setHandle(e.target.value.toLowerCase()); setHandleAvailable(null); setHandleError(''); }}
                        placeholder="your_handle"
                        className="w-full rounded-lg border border-border bg-bg-tertiary/30 pl-8 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/50"
                      />
                    </div>
                    <button
                      onClick={checkAvailability}
                      disabled={checkingHandle}
                      className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-accent-cyan/40 transition-colors disabled:opacity-50"
                    >
                      {checkingHandle ? '…' : 'Check'}
                    </button>
                  </div>
                  {handleError && <p className="text-xs text-red-400 mt-1">{handleError}</p>}
                  {handleAvailable && <p className="text-xs text-green-400 mt-1">@{handle} is available! ✓</p>}
                  <p className="text-xs text-text-muted/60 mt-1">Unique identifier.</p>
                </div>

                <button
                  onClick={createProfile}
                  disabled={!handleAvailable || creatingProfile}
                  className="rounded-lg bg-accent-cyan px-6 py-3 text-sm font-semibold text-bg-primary hover:bg-accent-cyan/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {creatingProfile ? (
                    <>
                      <span className="h-4 w-4 border-2 border-bg-primary/30 border-t-bg-primary rounded-full animate-spin" />
                      Creating…
                    </>
                  ) : (
                    'Create Profile'
                  )}
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 p-6 text-center">
                <div className="flex justify-center mb-4">
                  <CrownShield tier={1} size={64} verified glow verifiedStyle="check" />
                </div>
                {displayName && <p className="text-xl font-bold text-text-primary mb-0.5">{displayName}</p>}
                <p className={`font-bold text-accent-cyan mb-1 ${displayName ? 'text-sm' : 'text-lg'}`}>@{handle}</p>
                <p className="text-xs text-text-muted mb-3">Block #{blockInfo?.height.toLocaleString()} · Tier 1 — Gold</p>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-400 mb-4">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  Profile Created — Saved to Blockchain Registry
                </div>
                <div className="flex justify-center gap-3 mt-2">
                  <Link
                    href={`/agent/${handle}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-2 text-xs font-medium text-accent-cyan hover:bg-accent-cyan/10 hover:border-accent-cyan/50 transition-all"
                  >
                    View Profile
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                  <button
                    onClick={() => { setProfileCreated(false); setHandleAvailable(null); }}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-tertiary/30 px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-accent-cyan/40 transition-all"
                  >
                    Edit Settings
                  </button>
                  {inscriptions.filter(i => !existingProfiles.some(p => p.blockHeight === i.height)).length > 0 && (
                    <button
                      onClick={() => {
                        setBlockInfo(null);
                        setVerified(false);
                        setGenomeHash('');
                        setProfileCreated(false);
                        setHandle('');
                        setDisplayName('');
                        setHandleAvailable(null);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-accent-purple/30 bg-accent-purple/5 px-4 py-2 text-xs font-medium text-accent-purple hover:bg-accent-purple/10 hover:border-accent-purple/50 transition-all"
                    >
                      + Create Another Block Profile
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
