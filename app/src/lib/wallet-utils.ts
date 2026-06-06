/**
 * Shared wallet detection, connection, and signing utilities.
 * Extracted from verify page so both GlobalWalletContext and verify page can use them.
 * Uses official sats-connect package for Xverse wallet interactions.
 */

import { AddressPurpose, MessageSigningProtocols } from 'sats-connect';

export type WalletType = 'unisat' | 'xverse' | 'leather';

interface WalletAddress {
  address: string;
  publicKey?: string;
  purpose?: string;
  type?: string;
}

interface ProviderResponse {
  status?: string;
  result?: { addresses?: WalletAddress[]; signature?: string } | WalletAddress[];
  error?: { message: string };
  addresses?: WalletAddress[];
}

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

/**
 * Pick the canonical Xverse address. The ORDINALS (taproot, bc1p) address is the
 * identity for this app because .bitmap inscriptions live on the ordinals address,
 * and Tier-1 on-chain ownership scans that address. connect, the refresh poll, and
 * signing must ALL resolve to this same address — otherwise BIP-322 is signed with
 * one key while the server verifies against another, which is the Xverse mobile
 * "wrong address type" signing failure.
 */
function extractXverseAddress(addrs: WalletAddress[]): string | null {
  if (!Array.isArray(addrs) || addrs.length === 0) return null;
  const ordinals = addrs.find((a) => a.purpose === 'ordinals' || a.purpose === AddressPurpose.Ordinals);
  const payment = addrs.find((a) => a.purpose === 'payment' || a.purpose === AddressPurpose.Payment);
  return ordinals?.address || payment?.address || addrs[0]?.address || null;
}

/** Normalize a getAddresses RpcResponse (raw provider OR sats-connect wrapper) to an address list. */
function addressesFromResponse(response: ProviderResponse): WalletAddress[] {
  const result = response?.result;
  if (Array.isArray(result)) return result;
  if (result?.addresses) return result.addresses;
  if (response?.addresses) return response.addresses;
  return [];
}

/** Connect to Xverse wallet — always uses direct provider to avoid adapter validation errors */
export async function connectXverse(): Promise<string> {
  const provider = window.BitcoinProvider;

  // Path 1: Direct provider.request (works on both mobile in-app AND desktop extension)
  if (provider?.request) {
    console.log('[Xverse] Using direct BitcoinProvider.request');
    try {
      const response = await provider.request('getAddresses', {
        purposes: [AddressPurpose.Ordinals, AddressPurpose.Payment],
        message: 'Block Genomics needs your Bitcoin address for verification.',
      }) as ProviderResponse;
      const addr = extractXverseAddress(addressesFromResponse(response));
      if (addr) return addr;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.includes('reject') || errMsg.includes('cancel')) throw e;
      console.error('[Xverse provider.request getAddresses failed]', errMsg);
    }
  }

  // Path 2: Legacy provider.connect fallback — extract the SAME canonical address
  // (ordinals/taproot preferred) so a fallback connect does not silently switch the
  // identity to the payment address.
  if (provider?.connect) {
    console.log('[Xverse] Falling back to legacy provider.connect');
    try {
      const response = await provider.connect();
      const addr = extractXverseAddress(response?.addresses || []);
      if (addr) return addr;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.includes('reject') || errMsg.includes('cancel')) throw e;
      console.error('[Xverse legacy connect failed]', errMsg);
    }
  }

  throw new Error('Could not connect to Xverse. Please make sure the extension is installed and unlocked.');
}

/**
 * Silently re-read the current Xverse address using the SAME canonical extractor as
 * connectXverse. Used by the account-change poll. Returns null on any error (locked,
 * permission revoked, unavailable) so the caller can ignore it. Crucially this must
 * NOT take the legacy `connect()[0]` payment address — doing so flips the stored
 * identity from the ordinals address to the payment address and breaks signing.
 */
export async function refreshXverseAddress(): Promise<string | null> {
  const provider = window.BitcoinProvider;
  if (!provider?.request) return null;
  try {
    const response = await provider.request('getAddresses', {
      purposes: [AddressPurpose.Ordinals, AddressPurpose.Payment],
    }) as ProviderResponse;
    return extractXverseAddress(addressesFromResponse(response));
  } catch {
    return null;
  }
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

    // Always use direct provider — Wallet class adapter causes "Error validating request".
    // The injected provider returns a raw RpcResponse ({ result } | { error }); the
    // sats-connect wrapper would add { status }. Handle both shapes.
    if (provider?.request) {
      console.log('[Xverse] Signing via direct BitcoinProvider.request');
      try {
        const resp = await provider.request('signMessage', {
          address,
          message,
          protocol: MessageSigningProtocols.BIP322,
        }) as ProviderResponse;
        if (resp?.status === 'error') {
          throw new Error(resp?.error?.message || 'Xverse signing failed');
        }
        const result = resp?.result && !Array.isArray(resp.result) ? resp.result : null;
        if (result?.signature) return result.signature;
        throw new Error(resp?.error?.message || 'Xverse signing returned no signature');
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (errMsg.includes('reject') || errMsg.includes('cancel')) throw e;
        console.error('[Xverse direct sign failed]', errMsg);
        throw new Error(errMsg || 'Xverse signing failed');
      }
    }

    throw new Error('Xverse provider not available — please make sure the extension is installed and unlocked');
  }
  if (walletType === 'leather') {
    if (!window.LeatherProvider) throw new Error('Leather not available');
    // Sign with the key matching the connected address so the BIP-322 signature
    // verifies against the exact ownerAddress we send the server. Taproot (bc1p)
    // → p2tr; native segwit (bc1q…) and everything else → p2wpkh. Hardcoding p2tr
    // would mismatch whenever connectLeather fell back to a non-taproot address.
    const paymentType = address?.startsWith('bc1p') ? 'p2tr' : 'p2wpkh';
    const resp = await window.LeatherProvider.request('signMessage', {
      message,
      paymentType,
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
