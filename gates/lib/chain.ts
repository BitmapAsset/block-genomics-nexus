// The chain's own transaction count of a block, read from blockstream.info. The site builds
// its layouts from another source, so this is an independent count.
import type { Client } from './http.ts';
import { NotRunError } from './types.ts';

const BS = 'https://blockstream.info';

export async function chainTxCount(http: Client, height: number): Promise<number> {
  const h = await http.get(`${BS}/api/block-height/${height}`);
  const hash = h.text.trim();
  if (h.status !== 200 || !/^[0-9a-f]{64}$/.test(hash)) {
    throw new NotRunError(`blockstream.info gave no block hash for ${height}.`);
  }
  const b = await http.get(`${BS}/api/block/${hash}`);
  let count: unknown;
  try {
    count = (b.json() as { tx_count?: unknown }).tx_count;
  } catch {
    count = undefined;
  }
  if (b.status !== 200 || typeof count !== 'number' || !Number.isInteger(count)) {
    throw new NotRunError(`blockstream.info gave no transaction count for ${height}.`);
  }
  return count;
}

// Parses an answer's JSON body; a body that is not JSON reads as null.
export function jsonOf(answer: { json(): unknown }): unknown {
  try {
    return answer.json();
  } catch {
    return null;
  }
}
