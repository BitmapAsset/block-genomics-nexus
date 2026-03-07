/**
 * Brain Heartbeat Hash Chain
 * 
 * Every scan cycle is recorded as a link in a verifiable hash chain,
 * anchored to Bitcoin block heights. This creates an immutable,
 * publicly auditable record of the Brain's consciousness.
 */

import crypto from 'crypto';
import prisma from '@/lib/prisma';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export interface HeartbeatEntry {
  blockHeight: number;
  scanCycle: number;
  itemsScanned: number;
  flagsRaised: number;
  appealsProcessed: number;
  previousHash: string;
  hash: string;
}

/**
 * Deterministic SHA-256 hash: blockHeight:scanCycle:itemsScanned:flagsRaised:previousHash
 */
export function buildHeartbeatHash(
  blockHeight: number,
  scanCycle: number,
  itemsScanned: number,
  flagsRaised: number,
  previousHash: string,
): string {
  const preimage = `${blockHeight}:${scanCycle}:${itemsScanned}:${flagsRaised}:${previousHash}`;
  return crypto.createHash('sha256').update(preimage).digest('hex');
}

/**
 * Get the latest entry in the chain (the "tip").
 */
export async function getChainTip() {
  return prisma.brainHeartbeat.findFirst({
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Append a new heartbeat entry to the chain.
 */
export async function appendToChain(data: {
  blockHeight: number;
  scanCycle: number;
  itemsScanned: number;
  flagsRaised: number;
  appealsProcessed: number;
}) {
  const tip = await getChainTip();
  const previousHash = tip?.hash ?? GENESIS_HASH;

  const hash = buildHeartbeatHash(
    data.blockHeight,
    data.scanCycle,
    data.itemsScanned,
    data.flagsRaised,
    previousHash,
  );

  return prisma.brainHeartbeat.create({
    data: {
      blockHeight: data.blockHeight,
      scanCycle: data.scanCycle,
      itemsScanned: data.itemsScanned,
      flagsRaised: data.flagsRaised,
      appealsProcessed: data.appealsProcessed,
      previousHash,
      hash,
    },
  });
}

/**
 * Verify an array of entries forms a valid hash chain.
 * Entries must be in chronological order (oldest first).
 */
export function verifyChain(entries: HeartbeatEntry[]): boolean {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const expectedHash = buildHeartbeatHash(
      e.blockHeight,
      e.scanCycle,
      e.itemsScanned,
      e.flagsRaised,
      e.previousHash,
    );
    if (expectedHash !== e.hash) return false;
    if (i > 0 && e.previousHash !== entries[i - 1].hash) return false;
  }
  return true;
}

/**
 * Get the full chain for public export.
 */
export async function getChainForExport(options?: {
  limit?: number;
  fromBlockHeight?: number;
}) {
  const limit = Math.min(options?.limit ?? 100, 1000);

  const where = options?.fromBlockHeight
    ? { blockHeight: { gte: options.fromBlockHeight } }
    : {};

  return prisma.brainHeartbeat.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

/**
 * Fetch current Bitcoin block height from mempool.space.
 */
export async function getCurrentBlockHeight(): Promise<number> {
  try {
    const res = await fetch('https://mempool.space/api/blocks/tip/height', {
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`mempool.space returned ${res.status}`);
    return parseInt(await res.text(), 10);
  } catch (err) {
    console.error('[HeartbeatChain] Failed to fetch block height:', err);
    // Fallback: return 0 so chain still records (block height is informational)
    return 0;
  }
}
