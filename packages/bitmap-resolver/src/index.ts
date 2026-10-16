// bitmap-resolver: which inscription is the deed for N.bitmap, who holds it,
// and a proof anyone can re-check. See README.md.

import { Context, type ClientOptions } from './context.js';
import { liveHolder } from './facts.js';

export { resolve, type ResolveOptions } from './resolve.js';
export { verifyProof, type VerifyOptions, type VerifyResult } from './verify.js';
export { checkInBrowser, type BrowserCheck, type CheckColor } from './browser.js';
export {
  RULE_ID,
  LIVEOCI_MODULE_ID,
  checkClaim,
  claimedNumber,
  bodyReason,
  expectedBody,
  type IgnoreReason,
  type Caveat,
  type ClaimFacts,
  type RuleCheck,
} from './rules.js';
export {
  OCI_MODULE_ID,
  OCI_LIMIT,
  OCI_PAGES,
  OCI_PAGE_SHA256,
  SAT_INDICES,
  decodeOciPage,
  ociPageFor,
  ociPosition,
  ociSat,
  ociSatIndex,
  type OciPage,
} from './sources/oci.js';
export { OrdClient, SourceUnavailableError, DEFAULT_ORD_ORIGIN, type OrdInscription } from './sources/ord.js';
export { EsploraClient, DEFAULT_ESPLORA_ORIGINS } from './sources/esplora.js';
export { Limiter, HttpError, realClock, type Clock, type FetchResult, type LimiterOptions, type HostPolicy } from './limiter.js';
export { memoryStores, type Stores, type ImmutableStore, type TtlStore } from './stores.js';
export { parseBlock, parseTx, merkleRoot, merkleBranch, rootFromBranch, headerHash, witnessCommitmentOk, type ParsedBlock, type ParsedTx } from './parse/block.js';
export { parseEnvelopes, tapscriptOf, tokenize, type Envelope } from './parse/envelope.js';
export { scanBlockBytes, type BlockScan, type ScanCandidate } from './walk.js';
export { canonicalJson, computeBundleHash, PROOF_FORMAT } from './proof.js';
export { sha256, sha256d } from './sha256.js';
export { DEFAULT_LIMITS, defaultLimiter, type ClientOptions } from './context.js';
export type * from './types.js';

/**
 * Live holder of an inscription: ord and Esplora must agree the output is
 * unspent and pays the address. null otherwise. 'display' may answer from a
 * 60 s cache; 'auth' never does.
 */
export async function holderOf(
  inscriptionId: string,
  freshness: 'auth' | 'display',
  opts: ClientOptions = {},
): Promise<{ address: string; satpoint: string } | null> {
  const ctx = new Context(opts);
  const { holder } = await liveHolder(ctx, inscriptionId, freshness);
  return holder ? { address: holder.address, satpoint: holder.satpoint } : null;
}
