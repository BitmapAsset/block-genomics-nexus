"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TierResolution } from "@/lib/tier-resolver";
import {
  type WalletType,
  detectWallets,
  connectWalletByType,
  signWithWallet,
  getSavedSession,
  saveSession,
  clearSession,
} from "@/lib/wallet-utils";
import {
  deriveEncryptionKeypair,
  exportPublicKey,
  encryptMessage,
  decryptMessage,
  wipeKeypair,
  getDerivationMessage,
  isValidPublicKey,
  type EncryptionKeypair,
  type EncryptedMessage,
  type DecryptedMessage,
} from "@/lib/e2e-crypto";

export type { WalletType };

export interface UserProfile {
  handle: string;
  displayName: string;
  walletAddress: string;
  anchorBlock: number;
  genomeHash: string;
  bio?: string;
  tier?: number;
  createdAt?: string;
}

interface GlobalWalletState {
  isConnected: boolean;
  isConnecting: boolean;
  walletAddress: string | null;
  walletType: WalletType | null;
  profile: UserProfile | null;
  availableWallets: WalletType[];
  error: string | null;
  tierResolution: TierResolution | null;
}

interface GlobalWalletContextValue extends GlobalWalletState {
  connect: (type: WalletType) => Promise<void>;
  disconnect: () => void;
  signMessage: (msg: string) => Promise<string>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
  // E2E Encryption
  e2eReady: boolean;
  e2eSetup: () => Promise<boolean>;
  e2eEncrypt: (text: string, recipientIdentifier: string) => Promise<EncryptedMessage | null>;
  e2eDecrypt: (msg: EncryptedMessage) => Promise<DecryptedMessage | null>;
  tierResolution: TierResolution | null;
  resolveTier: (force?: boolean) => Promise<void>;
}

const GlobalWalletContext = createContext<GlobalWalletContextValue | undefined>(undefined);

async function fetchProfileByWallet(address: string): Promise<UserProfile | null> {
  try {
    const resp = await fetch(`/api/v1/users/by-wallet/${address}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.success || !data.data) return null;
    const u = data.data;
    return {
      handle: u.handle,
      displayName: u.displayName || u.handle,
      walletAddress: u.walletAddress,
      anchorBlock: u.anchorBlock || 0,
      genomeHash: u.genomeHash || '',
      bio: u.bio,
      tier: u.tier,
      createdAt: u.createdAt,
    };
  } catch {
    return null;
  }
}

export function GlobalWalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GlobalWalletState>({
    isConnected: false,
    isConnecting: false,
    walletAddress: null,
    walletType: null,
    profile: null,
    availableWallets: [],
    error: null,
    tierResolution: null,
  });

  // Detect available wallets + listen for account changes
  useEffect(() => {
    const check = () => {
      const detected = detectWallets();
      const available = (Object.entries(detected) as [WalletType, boolean][])
        .filter(([, v]) => v)
        .map(([k]) => k);
      setState(prev => ({ ...prev, availableWallets: available }));
    };
    check();
    const t = setTimeout(check, 500);

    // Listen for Unisat account switching (native event)
    const handleAccountsChanged = async (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (!accounts?.length) return;
      const newAddr = accounts[0];
      setState(prev => {
        if (prev.walletAddress === newAddr) return prev;
        return { ...prev, walletAddress: newAddr, profile: null };
      });
      const profile = await fetchProfileByWallet(newAddr);
      saveSession('unisat', newAddr);
      setState(prev => ({
        ...prev,
        isConnected: true,
        walletAddress: newAddr,
        profile,
      }));
    };

    if (typeof window !== 'undefined' && window.unisat) {
      try { window.unisat.on('accountsChanged', handleAccountsChanged); } catch {}
    }

    // Poll for address changes on ALL wallet types (Xverse/Leather don't have events)
    // Check every 5 seconds if the extension's current address differs from our state
    const pollInterval = setInterval(async () => {
      // Use a ref-like approach: read current state via setState callback
      setState(prev => {
        if (!prev.isConnected || !prev.walletType || !prev.walletAddress) return prev;
        // Fire async check outside setState
        (async () => {
          try {
            let currentAddr: string | null = null;
            if (prev.walletType === 'unisat' && window.unisat) {
              const accts = await window.unisat.getAccounts();
              currentAddr = accts?.[0] || null;
            } else if (prev.walletType === 'xverse' && window.BitcoinProvider) {
              // Xverse: re-connect returns current addresses without prompting
              const resp = await window.BitcoinProvider.connect();
              currentAddr = resp?.addresses?.[0]?.address || null;
            } else if (prev.walletType === 'leather' && window.LeatherProvider) {
              const resp = await window.LeatherProvider.request('getAddresses');
              const addrs = resp.result?.addresses || [];
              const taproot = addrs.find((a: { type: string }) => a.type === 'p2tr');
              currentAddr = taproot?.address || addrs[0]?.address || null;
            }
            if (currentAddr && currentAddr !== prev.walletAddress) {
              // Address changed! Update everything
              const profile = await fetchProfileByWallet(currentAddr);
              saveSession(prev.walletType!, currentAddr);
              setState(p => ({
                ...p,
                walletAddress: currentAddr!,
                profile,
              }));
            }
          } catch {
            // Extension unavailable or locked — ignore
          }
        })();
        return prev; // Don't change state synchronously
      });
    }, 5000);

    return () => {
      clearTimeout(t);
      clearInterval(pollInterval);
      if (typeof window !== 'undefined' && window.unisat) {
        try { window.unisat.removeListener('accountsChanged', handleAccountsChanged); } catch {}
      }
    };
  }, []);

  // Auto-reconnect from saved session
  useEffect(() => {
    const saved = getSavedSession();
    if (!saved) return;
    let cancelled = false;

    (async () => {
      setState(prev => ({ ...prev, isConnecting: true }));
      try {
        // Always get the LIVE address from the extension (not the saved one)
        // This ensures if user switched accounts while the tab was closed, we pick up the new one
        const address = await connectWalletByType(saved.type);
        if (cancelled) return;
        if (address !== saved.address) {
          // User switched wallets since last session — use the new address
          saveSession(saved.type, address);
        }
        const profile = await fetchProfileByWallet(address);
        if (cancelled) return;
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          walletAddress: address,
          walletType: saved.type,
          profile,
        }));
      } catch {
        if (cancelled) return;
        // Extension not available — clear session, don't trust stale data
        clearSession();
        setState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
          walletAddress: null,
          walletType: null,
          profile: null,
        }));
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const connect = useCallback(async (type: WalletType) => {
    // Clear any stale state from previous wallet connection
    setState(prev => ({ ...prev, isConnecting: true, error: null, profile: null }));
    if (keypairRef.current) { wipeKeypair(keypairRef.current); keypairRef.current = null; }
    setE2eReady(false);
    pubKeyCacheRef.current.clear();
    try {
      const address = await connectWalletByType(type);
      saveSession(type, address);
      const profile = await fetchProfileByWallet(address);
      setState(prev => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        walletAddress: address,
        walletType: type,
        profile,
        error: null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setState(prev => ({ ...prev, isConnecting: false, error: message }));
      throw err;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearSession();
    // Wipe E2E keys from memory
    if (keypairRef.current) { wipeKeypair(keypairRef.current); keypairRef.current = null; }
    setE2eReady(false);
    pubKeyCacheRef.current.clear();
    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      walletAddress: null,
      walletType: null,
      profile: null,
      error: null,
    }));
  }, []);

  const signMessageFn = useCallback(async (msg: string) => {
    if (!state.walletType) throw new Error('No wallet connected');
    return signWithWallet(state.walletType, msg, state.walletAddress || undefined);
  }, [state.walletType, state.walletAddress]);

  const refreshProfile = useCallback(async () => {
    if (!state.walletAddress) return;
    const profile = await fetchProfileByWallet(state.walletAddress);
    setState(prev => ({ ...prev, profile }));
  }, [state.walletAddress]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // ═══ Tier Resolution ═══
  const resolveTierFn = useCallback(async (force = false) => {
    const addr = state.walletAddress;
    if (!addr) return;
    try {
      const res = await fetch('/api/v1/tier/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: addr, force }),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        setState(prev => ({ ...prev, tierResolution: json.data as TierResolution }));
      }
    } catch {
      // silently fail
    }
  }, [state.walletAddress]);

  // Auto-resolve tier on connect
  useEffect(() => {
    if (state.isConnected && state.walletAddress) {
      resolveTierFn();
    }
  }, [state.isConnected, state.walletAddress, resolveTierFn]);

  // ═══ E2E Encryption ═══
  const [e2eReady, setE2eReady] = useState(false);
  const keypairRef = useRef<EncryptionKeypair | null>(null);
  const pubKeyCacheRef = useRef<Map<string, string>>(new Map());

  const e2eSetup = useCallback(async (): Promise<boolean> => {
    if (!state.walletType || !state.walletAddress) return false;
    try {
      const sig = await signWithWallet(state.walletType, getDerivationMessage(), state.walletAddress || undefined);
      if (!sig) return false;
      const kp = deriveEncryptionKeypair(sig);
      keypairRef.current = kp;
      const pubHex = exportPublicKey(kp);
      // Register on server
      await fetch('/api/v1/encryption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: state.walletAddress, encryptionPubKey: pubHex }),
      }).catch(() => {});
      setE2eReady(true);
      return true;
    } catch {
      return false;
    }
  }, [state.walletType, state.walletAddress]);

  const fetchRecipientPubKey = useCallback(async (id: string): Promise<string | null> => {
    const cached = pubKeyCacheRef.current.get(id.toLowerCase());
    if (cached) return cached;
    try {
      const isAddr = id.startsWith('bc1') || id.startsWith('1') || id.startsWith('3');
      const res = await fetch(`/api/v1/encryption?${isAddr ? 'wallet' : 'handle'}=${encodeURIComponent(id.toLowerCase())}`);
      if (!res.ok) return null;
      const json = await res.json();
      const pk = json.data?.encryptionPubKey;
      if (!pk || !isValidPublicKey(pk)) return null;
      pubKeyCacheRef.current.set(id.toLowerCase(), pk);
      return pk;
    } catch { return null; }
  }, []);

  const e2eEncrypt = useCallback(async (text: string, recipientId: string): Promise<EncryptedMessage | null> => {
    if (!keypairRef.current) return null;
    const rpk = await fetchRecipientPubKey(recipientId);
    if (!rpk) return null;
    try { return await encryptMessage(text, keypairRef.current, rpk); }
    catch { return null; }
  }, [fetchRecipientPubKey]);

  const e2eDecrypt = useCallback(async (msg: EncryptedMessage): Promise<DecryptedMessage | null> => {
    if (!keypairRef.current) return null;
    try { return await decryptMessage(msg, keypairRef.current); }
    catch { return null; }
  }, []);

  const value = useMemo<GlobalWalletContextValue>(
    () => ({
      ...state,
      connect,
      disconnect,
      signMessage: signMessageFn,
      refreshProfile,
      clearError,
      e2eReady,
      e2eSetup,
      e2eEncrypt,
      e2eDecrypt,
      tierResolution: state.tierResolution,
      resolveTier: resolveTierFn,
    }),
    [state, connect, disconnect, signMessageFn, refreshProfile, clearError, e2eReady, e2eSetup, e2eEncrypt, e2eDecrypt, resolveTierFn]
  );

  return (
    <GlobalWalletContext.Provider value={value}>
      {children}
    </GlobalWalletContext.Provider>
  );
}

export function useGlobalWallet(): GlobalWalletContextValue {
  const context = useContext(GlobalWalletContext);
  if (!context) {
    throw new Error("useGlobalWallet must be used within a GlobalWalletProvider");
  }
  return context;
}
