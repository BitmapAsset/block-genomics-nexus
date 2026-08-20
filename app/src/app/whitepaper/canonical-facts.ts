// Canonical facts — the figures this project is allowed to state about itself.
//
// WHY THIS EXISTS
// The whitepaper drift guard (see __tests__/whitepaper-drift.test.ts) enforces
// *containment*: the standalone whitepaper may say less than canonical, never
// something canonical does not say. It cannot see a canonical document that
// disagrees with itself. That gap was not hypothetical — §5 said the block supply
// was ~1,000,000 while §10 said ~880,000, and CI was green the whole time,
// because each surface was internally quotable and no one compared the numbers.
//
// THE CONTRACT
// Every figure below has exactly one true value. This file is where it lives. The
// guard reads every truth surface in the repo, extracts the quantities occupying
// each fact's slot, and fails if any surface renders a different value. A figure
// appearing with two conflicting values anywhere is a CI failure, in both
// directions: change the fact here and the surfaces stop matching; change a
// surface and it stops matching the fact.
//
// Fee percentages are NOT restated here. They are imported from the protocol
// constants, because the fee is implemented in code and code is the truth — the
// docs are the thing that can be wrong. `docs/ROADMAP.md` claimed a 5-10%
// delegation fee against a protocol that hardcodes 3%.

import {
  BRAIN_FEE_PERCENT,
  OWNER_SHARE_PERCENT,
  PROTOCOL_FEE_PERCENT,
  PROTOCOL_TREASURY_PERCENT,
} from "@/lib/protocol";

/**
 * Every file that states these facts to a reader. Paths are repo-relative.
 *
 * Adding a public surface that quotes a figure means adding it here; a surface
 * absent from this list is a surface that can drift silently.
 */
export const TRUTH_SURFACES: readonly string[] = [
  "README.md",
  "LICENSING.md",
  "whitepaper.html",
  "app/README.md",
  "app/src/app/layout.tsx",
  "landing/index.html",
  "app/src/app/whitepaper/sections.ts",
  "app/src/app/whitepaper/whitepaper-client.tsx",
  "docs/ROADMAP.md",
  "docs/WHITE-PAPER.md",
  "docs/WHITE-PAPER-PDF.md",
  "docs/WHITE-PAPER-PDF-READY.md",
  "docs/WHITE-PAPER-print.md",
  "docs/flowchart.html",
];

export type QuantityFact = {
  id: string;
  /** What the number means, quoted back in the failure message. */
  what: string;
  /** The one true value. */
  value: number;
  /** How it should read to a human. Failure messages only. */
  display: string;
  /**
   * Locates candidate quantities. Every capture group of every match is treated
   * as a number token occupying this fact's slot.
   */
  pattern: RegExp;
  /**
   * A parsed token outside this band is a different quantity, not a wrong value —
   * "2.1 km" is not a broken block supply. Bands are wide enough that a plausible
   * wrong value still lands inside and gets caught.
   */
  band: [min: number, max: number];
  /**
   * The corpus states this fact at least this often today. Stating it *more* is
   * fine; stating it less means a claim was deleted or drifted so far out of band
   * that the pattern no longer sees it — the one way a wrong number could hide.
   */
  minOccurrences: number;
};

/**
 * A number written for humans: comma-grouped, or carrying a magnitude suffix.
 * Requiring one of those is what separates a stated supply from an example block
 * height (`840128`) or a hex colour (`#909090`), which are not claims about
 * anything.
 *
 * Magnitude suffixes are case-sensitive so the `2b.` in a ROADMAP heading is a
 * section number, not two billion. The `Block N` lookbehind drops the specific
 * heights used as worked examples — `Block 720,143` names one block, it does not
 * count them. The trailing lookahead defers area figures to their own facts.
 */
const HUMAN_QUANTITY =
  /(?<![#$\w.,])(?<![Bb]lock )(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s*(?:M|B|[Mm]illion|[Bb]illion))\b(?!\s*(?:km²|km2|square kilomet))/g;

/** A number carrying an area unit, at any scale. */
const AREA_QUANTITY =
  /(?<![#$\w.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?(?:\s*(?:M|million))?)\s*(?:km²|km2|square kilomet)/g;

/** Both sides of a `N km × N km` dimension, so an asymmetric typo fails too. */
const DIMENSION_PAIR =
  /(\d+(?:\.\d+)?)\s*km\s*(?:×|x|✕)\s*(\d+(?:\.\d+)?)\s*km/gi;

export const QUANTITY_FACTS: readonly QuantityFact[] = [
  {
    id: "tier1-supply",
    what: "Tier 1 supply — one identity per mined Bitcoin block",
    value: 963_000,
    display: "~963,000 (as of August 2026, +~144/day)",
    pattern: HUMAN_QUANTITY,
    // Wide enough to catch any plausible misstatement of the block height, narrow
    // enough to exclude Bitcoin's 21 million supply cap and the 2.3B transactions.
    band: [100_000, 5_000_000],
    minOccurrences: 22,
  },
  {
    id: "tier2-supply",
    what: "Tier 2 supply — one identity per confirmed Bitcoin transaction",
    value: 2_300_000_000,
    display: "~2,300,000,000 (~2.3 billion)",
    pattern: HUMAN_QUANTITY,
    band: [1_000_000_000, 10_000_000_000],
    minOccurrences: 17,
  },
  {
    id: "world-area",
    what: "Total Nexus world area — every district summed",
    value: 4_250_000,
    display: "~4.25 million km²",
    pattern: AREA_QUANTITY,
    // The three area facts partition the same extractor by scale: a district is
    // single-digit km², a day of mining is hundreds, the world is millions.
    band: [1_000, 1_000_000_000],
    minOccurrences: 4,
  },
  {
    id: "world-growth-daily",
    what: "Daily world growth — a day of Bitcoin mining, in new land",
    // 144 blocks/day × 4.41 km². Derived, so it drifts if either input changes.
    value: 635,
    display: "~635 km² per day",
    pattern: AREA_QUANTITY,
    band: [100, 1_000],
    minOccurrences: 2,
  },
  {
    id: "district-area",
    what: "District area — the land one Bitmap block occupies",
    value: 4.41,
    display: "4.41 km²",
    pattern: AREA_QUANTITY,
    band: [0, 100],
    minOccurrences: 5,
  },
  {
    id: "district-edge",
    what: "District edge length — a reference to Bitcoin's 21 million cap",
    value: 2.1,
    display: "2.1 km × 2.1 km",
    pattern: DIMENSION_PAIR,
    band: [0, 1_000],
    minOccurrences: 20,
  },
];

/**
 * The only delegation-fee percentages the docs may state, derived from the
 * constants the protocol actually charges. Not a second copy of the numbers:
 * change `src/lib/protocol.ts` and this set follows.
 */
export const ALLOWED_FEE_PERCENTAGES: readonly number[] = [
  OWNER_SHARE_PERCENT,
  PROTOCOL_FEE_PERCENT,
  PROTOCOL_TREASURY_PERCENT,
  BRAIN_FEE_PERCENT,
];

/** Marks a line as making a claim about the delegation fee. */
export const FEE_CONTEXT =
  /delegation fee|protocol fee|platform fee|fee split|fee on delegation|protocol development fund|protocol treasury|nexus brain wallet|block owner \(delegator\)/i;

/**
 * Percentages on a fee line that are deliberately not ours. Pinned to their exact
 * wording: if the sentence is reworded the entry stops matching and CI fails, so
 * this cannot quietly become a hole. Dashes are normalized before comparison.
 */
export const FEE_CONTEXT_EXCEPTIONS: readonly { text: string; why: string }[] = [
  {
    text: "extractive platform fees (15-30% in app stores)",
    why: "App-store rates quoted as the contrast our 3% is measured against.",
  },
];

/**
 * License claims that were true of the protocol but false of the platform, which
 * is BUSL 1.1. The standalone whitepaper made exactly this mistake before the
 * drift guard landed — it told readers the project was "fully open source under
 * the MIT License" while LICENSE said otherwise.
 */
export const FORBIDDEN_LICENSE_CLAIMS: readonly { text: string; why: string }[] =
  [
    {
      text: "released under mit license",
      why: "Reads as the whole project being MIT; the platform is BUSL 1.1.",
    },
    {
      text: "fully open source under the mit license",
      why: "The exact claim the standalone whitepaper carried before BG28.",
    },
  ];

/** Marks a line as making a claim about licensing. */
export const LICENSE_CONTEXT = /change date|busl|business source|apache 2\.0/i;
