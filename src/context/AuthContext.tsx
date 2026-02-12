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
import { sha256Hex } from "@/lib/client-crypto";
import {
  getHandleRegistry,
  getProfileRegistry,
  setHandleRegistry,
  setProfileRegistry,
} from "@/lib/auth-storage";

export type WalletType = "unisat" | "xverse" | "leather";

export interface AgentProfile {
  handle: string;
  displayName: string;
  walletAddress: string;
  walletType: WalletType;
  bitmapBlock: number;
  genomeHash: string;
  avatar?: string;
  bio?: string;
  links?: { x?: string; website?: string };
  createdAt: string;
  updatedAt: string;
}

export interface BitmapBlock {
  inscriptionId: string;
  inscriptionNumber?: number;
  content?: string;
  blockHeight: number;
}

interface AuthState {
  walletAddress: string | null;
  walletType: WalletType | null;
  isConnected: boolean;
  isConnecting: boolean;
  profile: AgentProfile | null;
  availableWallets: WalletType[];
  error: string | null;
}

interface AuthContextValue extends AuthState {
  connect: (type: WalletType) => Promise<void>;
  disconnect: () => void;
  signMessage: (message: string) => Promise<string>;
  getBitmapBlocks: () => Promise<BitmapBlock[]>;
  updateProfile: (updates: Partial<AgentProfile> & { handle?: string }) => AgentProfile | null;
  deleteProfile: () => void;
  refreshProfile: () => void;
  clearError: () => void;
  generateGenomeHash: (blockHeight: number, walletAddress: string) => Promise<string>;
}

const initialState: AuthState = {
  walletAddress: null,
  walletType: null,
  isConnected: false,
  isConnecting: false,
  profile: null,
  availableWallets: [],
  error: null,
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isUnisatAvailable(): boolean {
  return typeof window !== "undefined" && !!window.unisat;
}

function isXverseAvailable(): boolean {
  return typeof window !== "undefined" && !!window.BitcoinProvider;
}

function isLeatherAvailable(): boolean {
  return typeof window !== "undefined" && !!window.LeatherProvider;
}

function findProfileByAddress(address: string): AgentProfile | null {
  const registry = getHandleRegistry();
  const profiles = getProfileRegistry<AgentProfile>();
  const entry = Object.entries(registry).find(
    ([, walletAddress]) => walletAddress === address
  );
  if (!entry) return null;
  const [handle] = entry;
  return profiles[handle] ?? null;
}

function parseBitmapHeight(content: string | undefined): number | null {
  if (!content) return null;
  const match = content.match(/^(\d+)\.bitmap$/i);
  return match ? parseInt(match[1], 10) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    const available: WalletType[] = [];
    if (isUnisatAvailable()) available.push("unisat");
    if (isXverseAvailable()) available.push("xverse");
    if (isLeatherAvailable()) available.push("leather");
    setState((prev) => ({ ...prev, availableWallets: available }));
  }, []);

  const generateGenomeHash = useCallback(
    async (blockHeight: number, walletAddress: string) => {
      return await sha256Hex(`${blockHeight}:${walletAddress.toLowerCase()}`);
    },
    []
  );

  const refreshProfile = useCallback(() => {
    if (!state.walletAddress) return;
    const profile = findProfileByAddress(state.walletAddress);
    setState((prev) => ({ ...prev, profile }));
  }, [state.walletAddress]);

  const connect = useCallback(async (type: WalletType) => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));
    try {
      let address = "";
      if (type === "unisat") {
        if (!isUnisatAvailable()) {
          throw new Error("Unisat wallet not detected.");
        }
        const accounts = await window.unisat!.requestAccounts();
        if (!accounts?.length) throw new Error("No accounts returned.");
        address = accounts[0];
      } else if (type === "xverse") {
        if (!isXverseAvailable()) {
          throw new Error("Xverse wallet not detected.");
        }
        const result = await window.BitcoinProvider!.connect();
        const paymentAddr = result.addresses.find(
          (a) => a.purpose === "payment"
        );
        if (!paymentAddr) throw new Error("No payment address found.");
        address = paymentAddr.address;
      } else if (type === "leather") {
        if (!isLeatherAvailable()) {
          throw new Error("Leather wallet not detected.");
        }
        const provider = window.LeatherProvider as {
          requestAccounts?: () => Promise<string[]>;
          getAddresses?: () => Promise<string[]>;
        };
        if (provider.requestAccounts) {
          const accounts = await provider.requestAccounts();
          if (!accounts?.length) throw new Error("No accounts returned.");
          address = accounts[0];
        } else if (provider.getAddresses) {
          const accounts = await provider.getAddresses();
          if (!accounts?.length) throw new Error("No accounts returned.");
          address = accounts[0];
        } else {
          throw new Error("Leather wallet API not supported.");
        }
      }

      const profile = address ? findProfileByAddress(address) : null;
      setState((prev) => ({
        ...prev,
        walletAddress: address,
        walletType: type,
        isConnected: true,
        isConnecting: false,
        profile,
        error: null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setState((prev) => ({ ...prev, isConnecting: false, error: message }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState((prev) => ({
      ...prev,
      walletAddress: null,
      walletType: null,
      isConnected: false,
      isConnecting: false,
      profile: null,
    }));
  }, []);

  const signMessage = useCallback(async (message: string) => {
    const nonce = Math.random().toString(36).slice(2, 10);
    return `mock_bip322_${nonce}_${btoa(message).slice(0, 12)}`;
  }, []);

  const getBitmapBlocks = useCallback(async (): Promise<BitmapBlock[]> => {
    if (!state.isConnected || !state.walletType) return [];
    if (state.walletType === "unisat" && isUnisatAvailable()) {
      try {
        const result = await window.unisat!.getInscriptions(0, 100);
        return result.list
          .map((ins) => ({
            inscriptionId: ins.inscriptionId,
            inscriptionNumber: ins.inscriptionNumber,
            content: ins.content,
            blockHeight: parseBitmapHeight(ins.content),
          }))
          .filter((ins) => ins.blockHeight !== null)
          .map((ins) => ({
            ...ins,
            blockHeight: ins.blockHeight as number,
          }));
      } catch {
        return [];
      }
    }
    return [];
  }, [state.isConnected, state.walletType]);

  const updateProfile = useCallback(
    (updates: Partial<AgentProfile> & { handle?: string }) => {
      if (!state.walletAddress || !state.walletType) return null;
      const now = new Date().toISOString();
      const registry = getHandleRegistry();
      const profiles = getProfileRegistry<AgentProfile>();

      if (!state.profile) {
        if (!updates.handle) return null;
        const handle = updates.handle.toLowerCase();
        const existingOwner = registry[handle];
        if (existingOwner && existingOwner !== state.walletAddress) {
          throw new Error("Handle already claimed.");
        }
        const profile: AgentProfile = {
          handle,
          displayName: updates.displayName || handle,
          walletAddress: state.walletAddress,
          walletType: state.walletType,
          bitmapBlock: updates.bitmapBlock ?? 0,
          genomeHash: updates.genomeHash || "",
          avatar: updates.avatar,
          bio: updates.bio,
          links: updates.links,
          createdAt: now,
          updatedAt: now,
        };
        profiles[handle] = profile;
        registry[handle] = state.walletAddress;
        setProfileRegistry(profiles);
        setHandleRegistry(registry);
        setState((prev) => ({ ...prev, profile }));
        return profile;
      }

      const current = state.profile;
      const profile: AgentProfile = {
        ...current,
        ...updates,
        handle: current.handle,
        walletAddress: current.walletAddress,
        walletType: current.walletType,
        updatedAt: now,
      };
      profiles[profile.handle] = profile;
      setProfileRegistry(profiles);
      setState((prev) => ({ ...prev, profile }));
      return profile;
    },
    [state.walletAddress, state.walletType, state.profile]
  );

  const deleteProfile = useCallback(() => {
    if (!state.profile) return;
    const registry = getHandleRegistry();
    const profiles = getProfileRegistry<AgentProfile>();
    delete registry[state.profile.handle];
    delete profiles[state.profile.handle];
    setHandleRegistry(registry);
    setProfileRegistry(profiles);
    setState((prev) => ({ ...prev, profile: null }));
  }, [state.profile]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      connect,
      disconnect,
      signMessage,
      getBitmapBlocks,
      updateProfile,
      deleteProfile,
      refreshProfile,
      clearError,
      generateGenomeHash,
    }),
    [
      state,
      connect,
      disconnect,
      signMessage,
      getBitmapBlocks,
      updateProfile,
      deleteProfile,
      refreshProfile,
      clearError,
      generateGenomeHash,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
