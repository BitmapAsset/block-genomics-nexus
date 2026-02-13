"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type WalletType,
  detectWallets,
  connectWalletByType,
  signWithWallet,
  getSavedSession,
  saveSession,
  clearSession,
} from "@/lib/wallet-utils";

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
}

interface GlobalWalletContextValue extends GlobalWalletState {
  connect: (type: WalletType) => Promise<void>;
  disconnect: () => void;
  signMessage: (msg: string) => Promise<string>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
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
  });

  // Detect available wallets
  useEffect(() => {
    const check = () => {
      const detected = detectWallets();
      const available = (Object.entries(detected) as [WalletType, boolean][])
        .filter(([, v]) => v)
        .map(([k]) => k);
      setState(prev => ({ ...prev, availableWallets: available }));
    };
    check();
    // Re-check after a short delay (extensions may load late)
    const t = setTimeout(check, 500);
    return () => clearTimeout(t);
  }, []);

  // Auto-reconnect from saved session
  useEffect(() => {
    const saved = getSavedSession();
    if (!saved) return;
    let cancelled = false;

    (async () => {
      setState(prev => ({ ...prev, isConnecting: true }));
      try {
        // Try to reconnect to verify extension is still available
        const address = await connectWalletByType(saved.type);
        if (cancelled) return;
        const profile = await fetchProfileByWallet(address);
        if (cancelled) return;
        saveSession(saved.type, address);
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
        // Extension not available anymore — still set address from saved session
        // so UI shows connected state, but mark that we used cached data
        const profile = await fetchProfileByWallet(saved.address);
        if (cancelled) return;
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          walletAddress: saved.address,
          walletType: saved.type,
          profile,
        }));
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const connect = useCallback(async (type: WalletType) => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }));
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
    return signWithWallet(state.walletType, msg);
  }, [state.walletType]);

  const refreshProfile = useCallback(async () => {
    if (!state.walletAddress) return;
    const profile = await fetchProfileByWallet(state.walletAddress);
    setState(prev => ({ ...prev, profile }));
  }, [state.walletAddress]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const value = useMemo<GlobalWalletContextValue>(
    () => ({
      ...state,
      connect,
      disconnect,
      signMessage: signMessageFn,
      refreshProfile,
      clearError,
    }),
    [state, connect, disconnect, signMessageFn, refreshProfile, clearError]
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
