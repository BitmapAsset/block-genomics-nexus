import type { Caveat, IgnoreReason } from './rules.js';

export type Verdict = 'canonical' | 'none' | 'disputed' | 'undetermined';

export type SourceName = 'oci' | 'ord' | 'esplora' | 'rblock' | 'mempool-raw';

export interface SourceReport {
  name: SourceName;
  verdict: 'agree' | 'disagree' | 'unreachable';
  /** ISO time of the last call to this source in the resolve. */
  at: string;
  detail?: string;
}

export interface IgnoredClaim {
  /** Inscription id, or `envelope:<txid>:<input>:<offset>` for an envelope ord never indexed (no OP_ENDIF). */
  id: string;
  reason: IgnoreReason;
  revealHeight?: number;
}

export interface Firstness {
  method: 'oci' | 'walk';
  ociPage?: string;
  satIndex?: number;
  walkedFrom?: number;
  walkedTo?: number;
}

export interface ChallengerResult {
  id: string;
  /** `valid_earlier` disputes the candidate; `valid_later` is a later copy. */
  outcome: 'valid_earlier' | 'valid_later' | 'valid_no_candidate' | IgnoreReason | 'unavailable';
  revealHeight?: number;
}

export interface CanonicalFacts {
  id: string;
  revealTxid: string;
  vin: number;
  /** Inscription index within the reveal transaction (the `i<n>` of the id). */
  envelopeIndex: number;
  revealHeight: number;
  bodyHex: string;
  contentType: string | null;
  contentEncoding: null;
  delegate: null;
  number: number;
  charms: string[];
  sat: string | null;
  satIndex: number | null;
}

export interface ProofHolder {
  satpoint: string;
  outpoint: string;
  address: string;
  unspentPer: ('ord' | 'esplora')[];
}

export interface ProofBundle {
  format: 'bg-bitmap-proof/1';
  rule: string;
  height: number;
  verdict: Verdict;
  canonical: CanonicalFacts | null;
  firstness: {
    method: 'oci' | 'walk';
    ociModule?: string;
    ociPage?: string;
    walked: { height: number; hash: string }[];
  };
  holder: ProofHolder | null;
  ignored: IgnoredClaim[];
  sources: SourceReport[];
  checkedAtHeight: number;
  generatedAt: string;
  /** sha256 of the canonical JSON of the bundle without `generatedAt` and `bundleHash`. */
  bundleHash: string;
}

export interface ResolveResult {
  height: number;
  verdict: Verdict;
  rule: string;
  /** Set only when `verdict` is canonical. */
  canonicalId: string | null;
  /** What the method pointed at (OCI entry or first valid walked claim), whatever the verdict. */
  candidateId: string | null;
  sat: string | null;
  satpoint: string | null;
  holder: string | null;
  firstness: Firstness;
  /** Known copies that do not count. Exhaustive only for walked blocks. */
  ignored: IgnoredClaim[];
  challengers: ChallengerResult[];
  sources: SourceReport[];
  checkedAtHeight: number;
  /** Plain-words reason for any verdict other than canonical, and for a missing holder. */
  reason?: string;
  caveats?: Caveat[];
  /** Next block to scan when a walk stopped at its cap. */
  cursor?: number;
  proof: ProofBundle;
}
