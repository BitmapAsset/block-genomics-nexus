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

/** Detect if running inside Xverse in-app browser */
function isXverseInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('xverse') || (!!window.BitcoinProvider && /android|iphone|ipad|mobile/i.test(ua));
}

/** Helper: extract address from Xverse response */
function extractXverseAddress(addrs: any[]): string | null {
  if (!Array.isArray(addrs) || addrs.length === 0) return null;
  const ordinals = addrs.find((a: any) => a.purpose === 'ordinals' || a.purpose === AddressPurpose.Ordinals);
  const payment = addrs.find((a: any) => a.purpose === 'payment' || a.purpose === AddressPurpose.Payment);
  return ordinals?.address || payment?.address || addrs[0]?.address || null;
}

/** Connect to Xverse wallet — always uses direct provider to avoid adapter validation errors */
export async function connectXverse(): Promise<string> {
  const provider = window.BitcoinProvider;

  // Path 1: Direct provider.request (works on both mobile in-app AND desktop extension)
  if (provider?.request) {
    console.log('[Xverse] Using direct BitcoinProvider.request');
    try {
      const response: any = await provider.request('getAddresses', {
        purposes: [AddressPurpose.Ordinals, AddressPurpose.Payment],
        message: 'Block Genomics needs your Bitcoin address for verification.',
      });
      if (response?.status === 'success') {
        const addrs = response.result?.addresses || response.result || [];
        const addr = extractXverseAddress(addrs);
        if (addr) return addr;
      }
      // Some versions return addresses directly without status wrapper
      if (response?.result) {
        const addrs = Array.isArray(response.result) ? response.result : response.result.addresses || [];
        const addr = extractXverseAddress(addrs);
        if (addr) return addr;
      }
    } catch (e: any) {
      if (e?.message?.includes('reject') || e?.message?.includes('cancel')) throw e;
      console.error('[Xverse provider.request getAddresses failed]', e?.message || e);
    }
  }

  // Path 2: Legacy provider.connect fallback
  if (provider?.connect) {
    console.log('[Xverse] Falling back to legacy provider.connect');
    try {
      const response = await provider.connect();
      if (response?.addresses?.length) {
        const taproot = response.addresses.find((a: any) => a.address?.startsWith('bc1p'));
        return taproot?.address || response.addresses[0].address;
      }
    } catch (e: any) {
      if (e?.message?.includes('reject') || e?.message?.includes('cancel')) throw e;
      console.error('[Xverse legacy connect failed]', e?.message || e);
    }
  }

  throw new Error('Could not connect to Xverse. Please make sure the extension is installed and unlocked.');
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
    const provider = window.BitcoinProvider;

    // Always use direct provider — Wallet class adapter causes "Error validating request"
    if (provider?.request) {
      console.log('[Xverse] Signing via direct BitcoinProvider.request');
      try {
        const resp: any = await provider.request('signMessage', {
          address,
          message,
          protocol: 'BIP322',
        });
        if (resp?.status === 'success' && resp.result?.signature) {
          return resp.result.signature;
        }
        if (resp?.result?.signature) return resp.result.signature;
        throw new Error(resp?.error?.message || 'Xverse signing returned no signature');
      } catch (e: any) {
        if (e?.message?.includes('reject') || e?.message?.includes('cancel')) throw e;
        console.error('[Xverse direct sign failed]', e?.message || e);
        throw new Error(e?.message || 'Xverse signing failed');
      }
    }

    throw new Error('Xverse provider not available — please make sure the extension is installed and unlocked');
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
