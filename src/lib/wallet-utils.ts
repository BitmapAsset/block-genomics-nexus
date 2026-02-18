/**
 * Shared wallet detection, connection, and signing utilities.
 * Extracted from verify page so both GlobalWalletContext and verify page can use them.
 * Uses official sats-connect package for Xverse wallet interactions.
 */

import Wallet, { AddressPurpose, MessageSigningProtocols } from 'sats-connect';

export type WalletType = 'unisat' | 'xverse' | 'leather';

/** Detect which wallets are installed */
export function detectWallets(): Record<WalletType, boolean> {
  if (typeof window === 'undefined') return { unisat: false, xverse: false, leather: false };
  return {
    unisat: !!window.unisat,
    xverse: !!window.BitcoinProvider,
    leather: !!window.LeatherProvider,
  };
}

/** Connect to Unisat wallet — returns address */
export async function connectUnisat(): Promise<string> {
  if (!window.unisat) throw new Error('Unisat wallet not installed');
  const accounts = await window.unisat.requestAccounts();
  if (!accounts.length) throw new Error('No accounts returned');
  return accounts[0];
}

/** Connect to Xverse wallet — returns address (uses official sats-connect Wallet class) */
export async function connectXverse(): Promise<string> {
  // Use Wallet.request() — the high-level API that handles provider selection + validation
  try {
    const response = await Wallet.request('getAddresses', {
      purposes: [AddressPurpose.Ordinals, AddressPurpose.Payment],
      message: 'Block Genomics needs your Bitcoin address for verification.',
    });
    if (response.status === 'success') {
      const result = response.result as any;
      const addrs = result?.addresses || result;
      if (Array.isArray(addrs) && addrs.length > 0) {
        const ordinals = addrs.find((a: any) => a.purpose === 'ordinals' || a.purpose === AddressPurpose.Ordinals);
        const payment = addrs.find((a: any) => a.purpose === 'payment' || a.purpose === AddressPurpose.Payment);
        const addr = ordinals?.address || payment?.address || addrs[0]?.address;
        if (addr) return addr;
      }
    }
    // If response was error, throw with details
    if (response.status === 'error') {
      throw new Error((response.error as any)?.message || 'Xverse connection rejected');
    }
  } catch (e: any) {
    // Re-throw user rejections
    if (e?.message?.includes('reject') || e?.message?.includes('cancel')) throw e;
    console.error('[Xverse Wallet.request getAddresses failed]', e?.message || e);
  }

  // Fallback: direct provider for very old extensions without Wallet support
  const provider = window.BitcoinProvider;
  if (provider) {
    try {
      const response = await provider.connect();
      if (response?.addresses?.length) {
        const taproot = response.addresses.find((a: any) => a.address?.startsWith('bc1p'));
        return taproot?.address || response.addresses[0].address;
      }
    } catch {
      // ignore
    }
  }

  throw new Error('Could not connect to Xverse. Please try from the Xverse in-app browser.');
}

/** Connect to Leather wallet — returns address */
export async function connectLeather(): Promise<string> {
  if (!window.LeatherProvider) throw new Error('Leather wallet not installed');
  const resp = await window.LeatherProvider.request('getAddresses');
  if (resp.error) throw new Error(resp.error.message);
  const addrs = resp.result?.addresses || [];
  const taproot = addrs.find((a: { type: string }) => a.type === 'p2tr');
  const addr = taproot?.address || addrs[0]?.address;
  if (!addr) throw new Error('No address returned from Leather');
  return addr;
}

/** Connect to any supported wallet by type — returns address */
export async function connectWalletByType(type: WalletType): Promise<string> {
  if (type === 'unisat') return connectUnisat();
  if (type === 'xverse') return connectXverse();
  if (type === 'leather') return connectLeather();
  throw new Error('Unknown wallet type');
}

/** Sign message with wallet */
export async function signWithWallet(walletType: WalletType, message: string, address?: string): Promise<string> {
  if (walletType === 'unisat') {
    if (!window.unisat) throw new Error('Unisat not available');
    return await window.unisat.signMessage(message, 'bip322-simple');
  }
  if (walletType === 'xverse') {
    if (!address) throw new Error('Xverse signing requires an address — reconnect your wallet');
    // Use Wallet.request() — high-level API with proper provider routing
    try {
      const resp = await Wallet.request('signMessage', {
        address,
        message,
        protocol: MessageSigningProtocols.BIP322,
      });
      if (resp.status === 'success') {
        const sig = (resp.result as any)?.signature;
        if (sig) return sig;
      }
      if (resp.status === 'error') {
        throw new Error((resp.error as any)?.message || 'Xverse signing rejected');
      }
    } catch (e: any) {
      // If Wallet.request fails entirely, try direct provider as last resort
      const provider = window.BitcoinProvider;
      if (provider?.request) {
        console.warn('[Xverse Wallet.request failed, trying direct provider]', e?.message);
        const directResp: any = await provider.request('signMessage', {
          address,
          message,
          protocol: 'BIP322',
        });
        if (directResp?.status === 'success' && directResp.result?.signature) {
          return directResp.result.signature;
        }
      }
      throw new Error(e?.message || 'Xverse signing failed');
    }
    throw new Error('Xverse signing failed — no signature returned');
  }
  if (walletType === 'leather') {
    if (!window.LeatherProvider) throw new Error('Leather not available');
    const resp = await window.LeatherProvider.request('signMessage', {
      message,
      paymentType: 'p2tr',
    });
    if (resp.error) throw new Error(resp.error.message);
    const sig = resp.result?.signature || resp.result?.hex;
    if (!sig) throw new Error('No signature returned from Leather');
    return sig;
  }
  throw new Error('Unknown wallet');
}

const STORAGE_KEY = 'bg_wallet';

export interface SavedWalletSession {
  type: WalletType;
  address: string;
}

export function getSavedSession(): SavedWalletSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.type && parsed.address) return parsed as SavedWalletSession;
    return null;
  } catch {
    return null;
  }
}

export function saveSession(type: WalletType, address: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ type, address }));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Get stored wallet address, handling both JSON and raw string formats */
export function getStoredAddress(): string {
  if (typeof window === 'undefined') return '';
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return parsed.address || '';
  } catch {
    return raw;
  }
}

/** Get stored wallet type */
export function getStoredType(): WalletType | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.type || null;
  } catch {
    return null;
  }
}
