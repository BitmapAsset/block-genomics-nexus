"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

// ─── Types ─────────────────────────────────────────────────────────────────

export type WalletType = "unisat" | "xverse";

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  walletType: WalletType | null;
  error: string | null;
}

interface WalletContextValue extends WalletState {
  connect: (type: WalletType) => Promise<void>;
  disconnect: () => void;
  signMessage: (message: string) => Promise<string>;
  getInscriptions: () => Promise<BitmapInscription[]>;
  clearError: () => void;
}

export interface BitmapInscription {
  inscriptionId: string;
  inscriptionNumber: number;
  content: string;
  blockHeight: number | null; // parsed from bitmap name
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseBitmapHeight(content: string): number | null {
  // Bitmap inscriptions are typically named like "840000.bitmap"
  const match = content.match(/^(\d+)\.bitmap$/i);
  return match ? parseInt(match[1], 10) : null;
}

function isUnisatAvailable(): boolean {
  return typeof window !== "undefined" && !!window.unisat;
}

function isXverseAvailable(): boolean {
  return typeof window !== "undefined" && !!window.BitcoinProvider;
}

// ─── Initial State ─────────────────────────────────────────────────────────

const initialState: WalletState = {
  address: null,
  isConnected: false,
  isConnecting: false,
  walletType: null,
  error: null,
};

// ─── Context ───────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

// ─── Provider ──────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(initialState);

  // Reconnect on mount if session persists (Unisat keeps connection)
  useEffect(() => {
    const tryReconnect = async () => {
      if (isUnisatAvailable()) {
        try {
          const accounts = await window.unisat!.getAccounts();
          if (accounts.length > 0) {
            setState({
              address: accounts[0],
              isConnected: true,
              isConnecting: false,
              walletType: "unisat",
              error: null,
            });
          }
        } catch {
          // Silent fail on reconnect — user hasn't connected yet
        }
      }
    };
    tryReconnect();
  }, []);

  // ─── Connect ───────────────────────────────────────────────────────

  const connect = useCallback(async (type: WalletType) => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      let address: string;

      if (type === "unisat") {
        if (!isUnisatAvailable()) {
          throw new Error(
            "Unisat wallet not detected. Please install the Unisat extension."
          );
        }
        const accounts = await window.unisat!.requestAccounts();
        if (!accounts || accounts.length === 0) {
          throw new Error("No accounts returned from Unisat.");
        }
        address = accounts[0];
      } else if (type === "xverse") {
        if (!isXverseAvailable()) {
          throw new Error(
            "Xverse wallet not detected. Please install the Xverse extension."
          );
        }
        const result = await window.BitcoinProvider!.connect();
        const paymentAddr = result.addresses.find(
          (a) => a.purpose === "payment"
        );
        if (!paymentAddr) {
          throw new Error("No payment address found in Xverse wallet.");
        }
        address = paymentAddr.address;
      } else {
        throw new Error(`Unknown wallet type: ${type}`);
      }

      setState({
        address,
        isConnected: true,
        isConnecting: false,
        walletType: type,
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect wallet";
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: message,
      }));
    }
  }, []);

  // ─── Disconnect ────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    setState(initialState);
  }, []);

  // ─── Sign Message ──────────────────────────────────────────────────

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!state.isConnected || !state.walletType) {
        throw new Error("Wallet not connected");
      }

      if (state.walletType === "unisat") {
        if (!isUnisatAvailable()) {
          throw new Error("Unisat wallet not available");
        }
        // Unisat returns base64-encoded signature
        return await window.unisat!.signMessage(message, "ecdsa");
      } else if (state.walletType === "xverse") {
        if (!isXverseAvailable()) {
          throw new Error("Xverse wallet not available");
        }
        return await window.BitcoinProvider!.signMessage(message, {
          address: state.address!,
        });
      }

      throw new Error("Unknown wallet type");
    },
    [state.isConnected, state.walletType, state.address]
  );

  // ─── Get Inscriptions (bitmap detection) ───────────────────────────

  const getInscriptions = useCallback(async (): Promise<
    BitmapInscription[]
  > => {
    if (!state.isConnected || !state.walletType) {
      return [];
    }

    try {
      if (state.walletType === "unisat" && isUnisatAvailable()) {
        const result = await window.unisat!.getInscriptions(0, 100);
        return result.list
          .filter((ins) =>
            ins.contentType?.includes("text") &&
            ins.content?.toLowerCase().includes("bitmap")
          )
          .map((ins) => ({
            inscriptionId: ins.inscriptionId,
            inscriptionNumber: ins.inscriptionNumber,
            content: ins.content,
            blockHeight: parseBitmapHeight(ins.content),
          }))
          .filter((b) => b.blockHeight !== null);
      }
      // Xverse inscription fetching would need separate API calls
      // For now, return empty for Xverse
      return [];
    } catch {
      // Silently fail — inscriptions are optional
      return [];
    }
  }, [state.isConnected, state.walletType]);

  // ─── Clear Error ───────────────────────────────────────────────────

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // ─── Account change listener ───────────────────────────────────────

  useEffect(() => {
    if (!isUnisatAvailable() || state.walletType !== "unisat") return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accts = accounts as string[];
      if (accts.length === 0) {
        setState(initialState);
      } else {
        setState((prev) => ({ ...prev, address: accts[0] }));
      }
    };

    window.unisat!.on("accountsChanged", handleAccountsChanged);
    return () => {
      window.unisat!.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, [state.walletType]);

  return (
    <WalletContext.Provider
      value={{
        ...state,
        connect,
        disconnect,
        signMessage,
        getInscriptions,
        clearError,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
