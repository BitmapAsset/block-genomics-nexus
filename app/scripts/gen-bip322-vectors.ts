/**
 * Regenerate `__tests__/fixtures/bip322-vectors.json`.
 *
 * Provenance matters for this fixture: every `expected` verdict is produced by
 * `bip322-js@3.0.0` — the elliptic-backed implementation that `src/lib/bip322-verify.ts`
 * replaced. Freezing its answers is what lets CI prove the migration changed no
 * accept/reject decision without shipping `elliptic` in the dependency tree.
 *
 * `bip322-js` is deliberately NOT a dependency of this package. To re-run:
 *
 *   npm i --no-save bip322-js@3.0.0
 *   npx tsx scripts/gen-bip322-vectors.ts
 *   npm uninstall bip322-js   # or: rm -rf node_modules && npm ci
 *
 * The script fails loudly if the new implementation disagrees with the old one
 * on any vector, so a regression cannot be silently baked into the fixture.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { makeWallet, sign, type AddrKind } from '../__tests__/helpers/wallet-sim';
import { verifyBip322Signature } from '../src/lib/bip322-verify';
import { secp256k1 } from '@noble/curves/secp256k1';

const require_ = createRequire(import.meta.url);
const { Verifier, Signer } = require_('bip322-js');

interface Vector {
  name: string;
  kind: string;
  address: string;
  message: string;
  signature: string;
  expected: boolean;
}

/** The old implementation's verdict. It throws on some inputs; a throw is a reject. */
function oldVerdict(address: string, message: string, signature: string): boolean {
  try {
    return Verifier.verifySignature(address, message, signature) === true;
  } catch {
    return false;
  }
}

const vectors: Vector[] = [];
function add(name: string, kind: string, address: string, message: string, signature: string) {
  vectors.push({ name, kind, address, message, signature, expected: oldVerdict(address, message, signature) });
}

// ── 1. Official BIP-322 test vectors ────────────────────────────────────────
// From the BIP-322 specification (private key L3VFeEujGtevx9w18HD1fhRbCH67Az2dpCymeRE1SoPK6XQtaN2k).
const BIP_ADDR = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';
add(
  'BIP-322 spec: empty message',
  'p2wpkh',
  BIP_ADDR,
  '',
  'AkcwRAIgM2gBAQqvZX15ZiysmKmQpDrG83avLIT492QBzLnQIxYCIBaTpOaD20qRlEylyxFSeEA2ba9YOixpX8z46TSDtS40ASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI='
);
add(
  'BIP-322 spec: "Hello World"',
  'p2wpkh',
  BIP_ADDR,
  'Hello World',
  'AkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI='
);
// The spec's vectors are only meaningful if the reference lib agrees they pass.
for (const v of vectors) {
  if (!v.expected) throw new Error(`reference lib rejected an official BIP-322 vector: ${v.name}`);
}

// ── 2. Per-address-type positives, signed by our noble signer ───────────────
const KINDS: AddrKind[] = ['p2pkh', 'p2sh-p2wpkh', 'p2wpkh', 'p2tr'];
const MESSAGES = [
  '',
  'Hello World',
  'Block Genomics verification: 0000000aababababababababababababababababababababababababababababab',
  'unicode: ⛓️🐸 — em-dash, emoji, accents éü',
  'x'.repeat(1000),
];

// Several independent keys per type: signature shape varies with the key
// (DER length, ECDSA recovery id, taproot Y-parity), so one key per type would
// leave whole branches unexercised.
const WALLETS_PER_KIND = 5;
const walletSets = Object.fromEntries(
  KINDS.map((k) => [k, Array.from({ length: WALLETS_PER_KIND }, () => makeWallet(k))])
) as Record<AddrKind, ReturnType<typeof makeWallet>[]>;
const wallets = Object.fromEntries(KINDS.map((k) => [k, walletSets[k][0]])) as Record<
  AddrKind,
  ReturnType<typeof makeWallet>
>;

for (const kind of KINDS) {
  for (const [w, i] of walletSets[kind].map((x, i) => [x, i] as const)) {
    for (const [j, message] of MESSAGES.entries()) {
      add(`${kind}: valid signature key#${i} msg#${j}`, kind, w.address, message, sign(w.privKey, w.address, message));
    }
  }
}

// ── 2b. High-S (malleated) ECDSA signature ─────────────────────────────────
// `bip322-js` verifies via @bitcoinerlab/secp256k1 with strict=false, which
// accepts high-S. Pinning it here proves the replacement kept that behaviour —
// rejecting high-S would have silently broken signatures that used to verify.
{
  const w = wallets['p2wpkh'];
  const message = 'high-s malleability check';
  const witness = Buffer.from(sign(w.privKey, w.address, message), 'base64');
  // finalScriptWitness: [count][len][DER sig + sighash byte][len][pubkey]
  const sigLen = witness[1];
  const der = witness.subarray(2, 2 + sigLen - 1);
  const parsed = secp256k1.Signature.fromDER(der);
  const highS = new secp256k1.Signature(parsed.r, secp256k1.CURVE.n - parsed.s).toDERRawBytes();
  const rebuilt = Buffer.concat([
    Buffer.from([0x02, highS.length + 1]),
    Buffer.from(highS),
    Buffer.from([0x01]),
    witness.subarray(2 + sigLen),
  ]);
  add('p2wpkh: high-S (malleated) signature', 'p2wpkh', w.address, message, rebuilt.toString('base64'));
}

// ── 3. Signatures produced by the OLD signer, verified by the new code ──────
// Cross-checks the two implementations in the opposite direction: bip322-js
// signs, our verifier must accept. Uses the reference lib's own WIF signer.
const REFERENCE_WIF = 'L3VFeEujGtevx9w18HD1fhRbCH67Az2dpCymeRE1SoPK6XQtaN2k';
for (const [label, address] of [
  ['p2wpkh', BIP_ADDR],
  ['p2sh-p2wpkh', '37qyp7jQAzqb2rCBpMvVtLDuuzKAUCVnJb'],
  ['p2pkh', '14vV3aCHBeStb5bkenkNHbe2YAFinYdXgc'],
  ['p2tr', 'bc1ppv609nr0vr25u07u95waq5lucwfm6tde4nydujnu8npg4q75mr5sxq8lt3'],
] as const) {
  for (const message of ['', 'Hello World', 'nested challenge 42']) {
    const raw = Signer.sign(REFERENCE_WIF, address, message);
    const signature = typeof raw === 'string' ? raw : Buffer.from(raw).toString('base64');
    add(`${label}: signed by bip322-js reference signer ("${message}")`, label, address, message, signature);
  }
}

// ── 4. Negative vectors ────────────────────────────────────────────────────
for (const kind of KINDS) {
  const w = wallets[kind];
  const other = makeWallet(kind);
  const msg = 'Block Genomics verification: deadbeef';
  const good = sign(w.privKey, w.address, msg);

  add(`${kind}: tampered message`, kind, w.address, `${msg} `, good);
  add(`${kind}: wrong address (same type)`, kind, other.address, msg, good);
  add(`${kind}: attacker's own valid signature replayed onto victim address`, kind, w.address, msg, sign(other.privKey, other.address, msg));
  add(`${kind}: empty signature`, kind, w.address, msg, '');
  add(`${kind}: truncated signature`, kind, w.address, msg, good.slice(0, Math.floor(good.length / 2)));
  add(`${kind}: random 65-byte (BIP-137 shape)`, kind, w.address, msg, Buffer.alloc(65, 0x7f).toString('base64'));
  add(`${kind}: all-zero 65-byte`, kind, w.address, msg, Buffer.alloc(65, 0).toString('base64'));
  add(`${kind}: not base64 at all`, kind, w.address, msg, 'not-a-signature!!');

  // Flip one bit inside the signature payload.
  const flipped = Buffer.from(good, 'base64');
  if (flipped.length > 4) {
    flipped[Math.floor(flipped.length / 2)] ^= 0x01;
    add(`${kind}: single-bit-flipped signature`, kind, w.address, msg, flipped.toString('base64'));
  }

  // Present this type's signature against every other address type.
  for (const otherKind of KINDS) {
    if (otherKind === kind) continue;
    add(`${kind} signature presented for ${otherKind} address`, otherKind, wallets[otherKind].address, msg, good);
  }
}

// Malformed / hostile addresses.
const someSig = sign(wallets.p2wpkh.privKey, wallets.p2wpkh.address, 'x');
for (const [label, address] of [
  ['empty', ''],
  ['garbage', 'not-an-address'],
  ['bad bech32 checksum', 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0m'],
  ['p2wsh (unsupported)', 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3'],
] as const) {
  add(`invalid address: ${label}`, 'invalid', address, 'x', someSig);
}

// ── 5. Differential assertion ──────────────────────────────────────────────
let mismatches = 0;
for (const v of vectors) {
  const actual = verifyBip322Signature(v.address, v.message, v.signature);
  if (actual !== v.expected) {
    mismatches++;
    console.error(`MISMATCH [${v.name}] old=${v.expected} new=${actual}`);
  }
}

const positives = vectors.filter((v) => v.expected).length;
console.log(`vectors: ${vectors.length} (${positives} accept / ${vectors.length - positives} reject)`);
if (mismatches > 0) {
  console.error(`\n${mismatches} mismatch(es) — fixture NOT written.`);
  process.exit(1);
}

const out = join(import.meta.dirname, '..', '__tests__', 'fixtures', 'bip322-vectors.json');
writeFileSync(out, `${JSON.stringify({ reference: 'bip322-js@3.0.0', vectors }, null, 2)}\n`);
console.log(`no mismatches — wrote ${out}`);
