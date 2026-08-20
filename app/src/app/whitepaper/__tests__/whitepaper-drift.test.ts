// Whitepaper drift guard.
//
// WHY THIS EXISTS
// The whitepaper prose lives in two places: `sections.ts` (rendered by the
// /whitepaper page) and the standalone repo-root `whitepaper.html`. Nothing kept
// them in agreement, so editing one and forgetting the other was silent — and it
// had already happened. Before this guard landed, the standalone file told the
// public the project was "fully open source under the MIT License" while the
// page, the SatoshiView, and LICENSE all said Business Source License; it also
// claimed Tier 3 required "no Bitcoin purchase" where canonical says a
// delegation fee is paid in Bitcoin, and it was still stamped Version 1.0.
//
// THE CONTRACT
// The standalone file is NOT a generated mirror. It is a hand-built condensation
// with its own section subset, its own layout, and deliberately shorter prose. So
// this does not assert the two files are equal. It asserts something weaker but
// sufficient: the standalone may SAY LESS, never something CANONICAL DOES NOT SAY.
//
// Concretely, every prose fragment in whitepaper.html must be one of:
//   1. verbatim present in the canonical prose, or
//   2. listed in STANDALONE_ONLY — layout text with no canonical counterpart
//      (page title, references, footer), or
//   3. listed in CONDENSATIONS — a deliberate shortening, pinned to the canonical
//      passage it shortens.
//
// CONDENSATIONS is what makes drift un-mergeable in both directions. Change the
// standalone text and its entry stops matching. Change the canonical passage and
// its `canonical` anchor stops resolving. Either way CI fails and a human has to
// look at both texts. Stale entries are rejected too, so the table cannot rot.
//
// Editing the whitepaper: change sections.ts. If CI then fails here, the
// standalone file is carrying a claim canonical no longer makes — reconcile it.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sections, WHITEPAPER_VERSION, WHITEPAPER_DATE } from "../sections";

const STANDALONE_PATH = resolve(__dirname, "../../../../../whitepaper.html");

/**
 * Fold away differences that carry no meaning: entity encoding, curly quotes,
 * dash width, non-breaking and collapsed whitespace. Everything that survives
 * this is prose a reader would notice changing.
 */
function normalize(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/ /g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const canonicalProse = normalize(
  sections.map((s) => `${s.title}\n${s.content}`).join("\n\n"),
);

/** Text-bearing elements of the standalone file, in document order. */
function standaloneFragments(html: string): string[] {
  const body = html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "");

  const blocks = [...body.matchAll(/<(p|h3|td|th)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(
    (m) => m[2],
  );

  const fragments: string[] = [];
  for (const block of blocks) {
    const text = block.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "");
    for (const line of text.split(/\n+/)) {
      const stripped = normalize(line).replace(/^[••]\s*/, "");
      if (!stripped) continue;
      // Split into sentences on a terminator followed by a capital or digit, so a
      // single edited sentence is reported instead of a whole paragraph.
      for (const sentence of stripped.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)) {
        const fragment = normalize(sentence);
        if (fragment) fragments.push(fragment);
      }
    }
  }
  return fragments;
}

/**
 * Layout text that has no canonical counterpart by design. Listed exactly, so
 * editing any of it is a conscious act that has to come back through this file.
 */
const STANDALONE_ONLY: readonly string[] = [
  // Masthead
  "Bitcoin-Anchored Identity for AI Agents and Humans",
  `Version ${WHITEPAPER_VERSION} - ${WHITEPAPER_DATE}`,
  // Fee table scaffolding (the percentages themselves are checked against canonical)
  "Recipient",
  "Share",
  "Purpose",
  "Block Owner (Delegator)",
  "Delegation revenue",
  "Development, security, infrastructure",
  // References
  "[1] Nakamoto, S.",
  "(2008).",
  '"Bitcoin: A Peer-to-Peer Electronic Cash System."',
  "[2] Blockamoto, B.",
  "(2023).",
  '"Bitmap: Claim Your Bitcoin Block." bitmap.land',
  "[3] BIP-322: Generic Signed Message Format.",
  "Bitcoin Improvement Proposals.",
  "[4] Ordinals Protocol. docs.ordinals.com",
  "[5] Block Genomics Protocol. github.com/block-genomics",
  "[6] Bitfeed Project.",
  '"Bitfeed: Live Bitcoin Network Visualization." bitfeed.live, 2021.',
  // Footer
  "© 2026 Block Genomics.",
  "Dual-licensed: MIT protocol - BUSL 1.1 platform.",
  "Built on Bitcoin.",
  "Secured by Proof-of-Work.",
];

/**
 * Deliberate shortenings. `standalone` is the exact fragment as it appears in
 * whitepaper.html; `canonical` is the passage in sections.ts it condenses and
 * must still be present verbatim. Both halves are asserted.
 */
const CONDENSATIONS: readonly { standalone: string; canonical: string }[] = [
  {
    standalone: "More Proof-of-Work stands behind them.",
    canonical:
      "More Proof-of-Work stands behind them, making them more expensive to have ever produced.",
  },
  {
    standalone:
      "Address Format (10%) - Taproot addresses (bc1p) score higher as they represent modern Bitcoin technology.",
    canonical:
      "Address Format (10%) - Taproot addresses (bc1p) score higher as they represent modern, privacy-preserving Bitcoin technology.",
  },
  {
    standalone: "It is built entirely on Bitcoin.",
    canonical:
      "It is built on Bitcoin - the most secure, decentralized, and battle-tested network in existence.",
  },
  {
    standalone: "Every block represents real Proof-of-Work.",
    canonical: "Every block in The Nexus represents real Proof-of-Work.",
  },
  {
    standalone:
      "Within each 2.1 km × 2.1 km district, individual transactions become parcels of land:",
    canonical:
      "Within each 2.1 km × 2.1 km district, individual transactions become parcels of land. Parcel dimensions are derived deterministically from Bitcoin transaction data:",
  },
  {
    standalone:
      "Build height is proportional to transaction value (BTC transferred) - high-value transactions can support taller structures",
    canonical:
      "Parcel build height is proportional to transaction value (BTC transferred) - high-value transactions can support taller structures",
  },
  {
    standalone:
      "Coinbase transaction occupies the central plaza - always the largest and most prominent location",
    canonical:
      "The coinbase transaction (the first transaction in every block, paying the miner) occupies the central plaza - always the largest and most prominent location",
  },
  {
    standalone: "Streets and pathways form naturally in the gaps between parcels",
    canonical:
      "Streets and pathways form naturally in the gaps between parcels, creating walkable spaces",
  },
  {
    standalone:
      "A 2.1 km district is fully traversable on foot in approximately 25 minutes - large enough to wander for hours discovering parcels and buildings, but compact enough to feel alive and populated.",
    canonical:
      "A 2.1 km district is fully traversable on foot in approximately 25 minutes - large enough to wander for hours discovering parcels, buildings, and deployed resources, but compact enough to feel alive and populated.",
  },
  {
    standalone: "Block owners can delegate verification authority to others.",
    canonical:
      "Block owners who accept tenants can delegate verification authority to others.",
  },
  {
    standalone:
      "The CLI supports the complete protocol lifecycle: verification, exploration, building, rental browsing, and autonomous agent mode.",
    canonical: "The CLI supports the complete protocol lifecycle:",
  },
  {
    standalone:
      "All operations produce machine-readable JSON output (via --json flag), making integration seamless.",
    canonical:
      "All CLI operations produce machine-readable JSON output (via --json flag), making integration with other tools, CI/CD pipelines, and agent frameworks seamless.",
  },
  {
    standalone: "Private keys never leave the user's device.",
    canonical:
      "Private keys never leave the user's device - all signing happens locally through wallet bridges.",
  },
];

describe("whitepaper drift guard", () => {
  const html = readFileSync(STANDALONE_PATH, "utf8");
  const fragments = standaloneFragments(html);

  it("finds prose in the standalone whitepaper", () => {
    // Guards the extractor itself: a regex that silently matches nothing would
    // make every assertion below vacuously true.
    expect(fragments.length).toBeGreaterThan(100);
  });

  it("stamps the standalone whitepaper with the canonical version and date", () => {
    expect(normalize(html)).toContain(
      `Version ${WHITEPAPER_VERSION} - ${WHITEPAPER_DATE}`,
    );
  });

  it("numbers and titles every standalone section as canonical does", () => {
    const headings = [
      ...html.matchAll(
        /<h2><span class="section-num">§(\d+)<\/span>\s*([\s\S]*?)<\/h2>/g,
      ),
    ].map((m) => ({ num: m[1], title: normalize(m[2]) }));

    expect(headings.length).toBeGreaterThan(0);

    for (const heading of headings) {
      const canonical = sections.find((s) => s.num === heading.num);
      expect(canonical).toBeDefined();
      expect(`§${heading.num} ${heading.title}`).toBe(
        `§${heading.num} ${normalize(canonical!.title)}`,
      );
    }
  });

  it("keeps every declared condensation anchored to canonical prose", () => {
    const unanchored = CONDENSATIONS.filter(
      (c) => !canonicalProse.includes(normalize(c.canonical)),
    ).map((c) => c.canonical);

    expect(unanchored).toEqual([]);
  });

  it("declares no stale exceptions", () => {
    const present = new Set(fragments);
    const staleCondensations = CONDENSATIONS.map((c) => normalize(c.standalone))
      .filter((s) => !present.has(s));
    const staleStandaloneOnly = STANDALONE_ONLY.map(normalize).filter(
      (s) => !present.has(s),
    );

    expect({ staleCondensations, staleStandaloneOnly }).toEqual({
      staleCondensations: [],
      staleStandaloneOnly: [],
    });
  });

  it("says nothing the canonical whitepaper does not say", () => {
    const allowed = new Set<string>([
      ...STANDALONE_ONLY.map(normalize),
      ...CONDENSATIONS.map((c) => normalize(c.standalone)),
    ]);

    const undeclared = fragments.filter(
      (f) => !allowed.has(f) && !canonicalProse.includes(f),
    );

    expect(undeclared).toEqual([]);
  });
});
