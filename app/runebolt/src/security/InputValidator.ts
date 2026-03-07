import { z } from 'zod';

const BITCOIN_ADDRESS_REGEX = /^(bc1|tb1|bcrt1)[a-zA-HJ-NP-Z0-9]{25,87}$/;
const HEX_REGEX = /^[a-f0-9]+$/;
const TXID_REGEX = /^[a-f0-9]{64}$/;
const PUBKEY_REGEX = /^(02|03)[a-f0-9]{64}$/;

export class InputValidator {
  static validateAddress(address: string, network: string): boolean {
    if (typeof address !== 'string' || address.length === 0 || address.length > 200) return false;
    // Basic prefix check by network
    const prefixes: Record<string, string[]> = {
      mainnet: ['bc1'],
      testnet: ['tb1'],
      regtest: ['bcrt1'],
    };
    const validPrefixes = prefixes[network] || [];
    if (!validPrefixes.some(p => address.startsWith(p))) return false;
    return BITCOIN_ADDRESS_REGEX.test(address);
  }

  static validateTxid(txid: string): boolean {
    return typeof txid === 'string' && TXID_REGEX.test(txid);
  }

  static validateHex(hex: string, expectedLength?: number): boolean {
    if (typeof hex !== 'string' || !HEX_REGEX.test(hex)) return false;
    if (expectedLength !== undefined && hex.length !== expectedLength * 2) return false;
    return true;
  }

  static validatePubkey(pubkey: string): boolean {
    return typeof pubkey === 'string' && PUBKEY_REGEX.test(pubkey);
  }

  static validateAmount(amount: bigint): boolean {
    return typeof amount === 'bigint' && amount > 0n;
  }

  static validatePort(port: number): boolean {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }

  static sanitizeString(input: string, maxLength: number = 1000): string {
    if (typeof input !== 'string') return '';
    return input.slice(0, maxLength).replace(/[^\x20-\x7E]/g, '');
  }

  static validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(data);
    if (result.success) return { success: true, data: result.data };
    return { success: false, error: result.error.issues.map(i => i.message).join(', ') };
  }
}
