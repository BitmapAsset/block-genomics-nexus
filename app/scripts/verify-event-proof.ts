/**
 * Offline checker for Living Block events (`bg-event/1`). No network, no
 * database, no trust in blockgenomics.io: it re-derives every hash and checks
 * every signature from files you saved yourself.
 *
 *   # 1. Save the inputs (once; pin the keys file):
 *   curl -s https://blockgenomics.io/.well-known/bg-event-keys.json > keys.json
 *   curl -s https://blockgenomics.io/api/v1/blocks/718840/events/<id>/proof > proof.json
 *   curl -s 'https://blockgenomics.io/api/v1/blocks/718840/events?after=0&limit=200' > events.json
 *
 *   # 2. Check one proof: payload hash, signature (BIP-322 or ed25519), that
 *   #    the signed message names the event's block and kind, the event hash,
 *   #    and the system attestation over the event hash under a pinned key.
 *   #    OK only when all of them pass; a missing attestation is a FAIL.
 *   npx tsx scripts/verify-event-proof.ts proof.json --keys keys.json
 *
 *   # 3. Check a chain window: seq has no gaps, each `prev` is the previous
 *   #    event's hash, each `hash` matches its body. A window that does not start
 *   #    at seq 1 needs the hash of the event before it.
 *   npx tsx scripts/verify-event-proof.ts --chain events.json [--from-seq 41 --from-prev sha256:…]
 *
 * Exit 0 when everything checks, 1 when anything fails, 2 on bad usage. It
 * imports only `src/lib/block-event-core.ts` (pure: hashing, ed25519, BIP-322),
 * the same module the server hashes with, so the two cannot drift.
 */

import { readFileSync } from 'node:fs';
import {
  verifyChain,
  verifyEventProof,
  type ChainRow,
  type EventProof,
  type PublishedKey,
} from '../src/lib/block-event-core';

export interface CliResult {
  code: 0 | 1 | 2;
  lines: string[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const USAGE = 'usage: verify-event-proof.ts <proof.json> [--keys keys.json] | --chain <events.json> [--from-seq N --from-prev sha256:…]';

/** The whole CLI as a function, so tests run it without spawning a process. */
export function run(argv: string[]): CliResult {
  const lines: string[] = [];
  try {
    const chainPath = flag(argv, '--chain');
    if (chainPath) {
      const doc = readJson(chainPath) as { events?: ChainRow[] } | ChainRow[];
      const rows = Array.isArray(doc) ? doc : (doc.events ?? []);
      const fromSeq = flag(argv, '--from-seq');
      const fromPrev = flag(argv, '--from-prev');
      const from = fromSeq && fromPrev ? { seq: Number(fromSeq), prev: fromPrev } : undefined;
      const res = verifyChain(rows, from);
      if (res.ok) {
        lines.push(`OK chain: ${res.checked} events, head ${res.head}`);
        return { code: 0, lines };
      }
      lines.push(`FAIL chain at seq ${res.brokenAt}: ${res.reason} (${res.checked} verified before it)`);
      return { code: 1, lines };
    }

    const proofPath = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
    if (!proofPath) {
      lines.push(USAGE);
      return { code: 2, lines };
    }
    const proof = readJson(proofPath) as EventProof;
    const keysPath = flag(argv, '--keys');
    const keys = keysPath ? ((readJson(keysPath) as { keys?: PublishedKey[] }).keys ?? []) : [];
    const res = verifyEventProof(proof, keys);
    for (const [name, v] of Object.entries(res.checks)) lines.push(`  ${v ? 'ok  ' : 'FAIL'} ${name}`);
    lines.unshift(
      `${res.ok ? 'OK authenticated' : 'FAIL not authenticated'} ${proof.event?.kind ?? '?'} block ${proof.event?.block ?? '?'} seq ${proof.event?.seq ?? '?'} (${proof.scheme}${proof.address ? ' ' + proof.address : ''})`,
    );
    if (!res.ok) {
      lines.push(`  reason: ${res.reason ?? 'a check failed'}`);
      if (res.integrity) lines.push('  note: the hashes agree, but that alone proves nothing (anyone can recompute them)');
    }
    if (!keysPath) lines.push('  note: no --keys given; a proof is authenticated only under a pinned published key');
    return { code: res.ok ? 0 : 1, lines };
  } catch (err) {
    lines.push(`error: ${err instanceof Error ? err.message : String(err)}`);
    return { code: 2, lines };
  }
}

const isMain =
  typeof require !== 'undefined' && typeof module !== 'undefined'
    ? require.main === module
    : /verify-event-proof\.ts$/.test(process.argv[1] ?? '');
if (isMain) {
  const { code, lines } = run(process.argv.slice(2));
  for (const l of lines) console.log(l);
  process.exit(code);
}
