// Internal-consistency guard for the project's public figures.
//
// The sibling drift guard (whitepaper-drift.test.ts) compares the standalone
// whitepaper against canonical prose. It is a containment check, so it is blind
// to canonical disagreeing with itself: §5 claiming ~1,000,000 blocks while §10
// claimed ~880,000 passed CI green. This guard closes that.
//
// It reads every file in TRUTH_SURFACES, extracts the quantities occupying each
// fact's slot, and requires them all to render the one value in canonical-facts.
// Fee percentages and the BUSL Change Date are checked against their
// implementations — `src/lib/protocol.ts` and `LICENSE` — rather than against a
// restated copy, because those are the artifacts that actually bind.
//
// Editing a figure: change it in canonical-facts.ts (or in protocol.ts / LICENSE
// for the fee and the Change Date), then update every surface this guard names.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ALLOWED_FEE_PERCENTAGES,
  FEE_CONTEXT,
  FEE_CONTEXT_EXCEPTIONS,
  FORBIDDEN_LICENSE_CLAIMS,
  LICENSE_CONTEXT,
  QUANTITY_FACTS,
  TRUTH_SURFACES,
} from "../canonical-facts";
import {
  BRAIN_FEE_PERCENT,
  OWNER_SHARE_PERCENT,
  PROTOCOL_FEE_PERCENT,
  PROTOCOL_TREASURY_PERCENT,
} from "@/lib/protocol";

const REPO_ROOT = resolve(__dirname, "../../../../../");

/** Fold dash width so an en-dash edit is not a semantic change. */
function normalizeDashes(text: string): string {
  return text.replace(/[–—]/g, "-");
}

type Line = { surface: string; line: number; text: string };

const CORPUS: Line[] = TRUTH_SURFACES.flatMap((surface) =>
  readFileSync(resolve(REPO_ROOT, surface), "utf8")
    .split("\n")
    .map((text, i) => ({ surface, line: i + 1, text: normalizeDashes(text) })),
);

/** `"4.25M"` / `"2.3 billion"` / `"963,000"` -> a number. */
function parseQuantity(token: string): number {
  const match = /^([\d.,]+)\s*(M|B|million|billion)?$/i.exec(token.trim());
  if (!match) return NaN;
  const value = parseFloat(match[1].replace(/,/g, ""));
  const suffix = (match[2] ?? "").toLowerCase();
  if (suffix === "m" || suffix === "million") return value * 1e6;
  if (suffix === "b" || suffix === "billion") return value * 1e9;
  return value;
}

describe("canonical facts", () => {
  it("reads every declared truth surface", () => {
    // Guards the corpus itself: a bad path or an empty read would make every
    // assertion below vacuously true.
    expect(TRUTH_SURFACES.length).toBeGreaterThan(0);
    expect(CORPUS.length).toBeGreaterThan(1000);
  });

  describe.each(QUANTITY_FACTS)("$id — $what", (fact) => {
    const occurrences = CORPUS.flatMap(({ surface, line, text }) =>
      [...text.matchAll(fact.pattern)]
        .flatMap((match) => match.slice(1).filter(Boolean))
        .map((token) => ({ surface, line, token, value: parseQuantity(token) }))
        .filter((q) => q.value >= fact.band[0] && q.value <= fact.band[1]),
    );

    it(`is stated as ${fact.display} everywhere it appears`, () => {
      const conflicting = occurrences
        .filter((q) => q.value !== fact.value)
        .map((q) => `${q.surface}:${q.line} says "${q.token}"`);

      expect(conflicting).toEqual([]);
    });

    it("has not lost the claim", () => {
      expect(occurrences.length).toBeGreaterThanOrEqual(fact.minOccurrences);
    });
  });

  describe("delegation fee", () => {
    it("splits into shares that add up", () => {
      expect(OWNER_SHARE_PERCENT + PROTOCOL_FEE_PERCENT).toBe(100);
      expect(PROTOCOL_TREASURY_PERCENT + BRAIN_FEE_PERCENT).toBe(
        PROTOCOL_FEE_PERCENT,
      );
    });

    it("declares no stale exceptions", () => {
      // An exception whose wording no longer exists is a hole nobody is watching.
      const stale = FEE_CONTEXT_EXCEPTIONS.filter(
        (exception) => !CORPUS.some((l) => l.text.includes(exception.text)),
      ).map((exception) => exception.text);

      expect(stale).toEqual([]);
    });

    it("is never quoted at a rate the protocol does not charge", () => {
      const allowed = new Set(ALLOWED_FEE_PERCENTAGES);

      const wrong = CORPUS.filter((l) => FEE_CONTEXT.test(l.text)).flatMap(
        ({ surface, line, text }) => {
          const scrubbed = FEE_CONTEXT_EXCEPTIONS.reduce(
            (acc, exception) => acc.split(exception.text).join(""),
            text,
          );
          return [...scrubbed.matchAll(/(\d+(?:\.\d+)?)\s*%/g)]
            .map((m) => parseFloat(m[1]))
            .filter((pct) => !allowed.has(pct))
            .map((pct) => `${surface}:${line} quotes ${pct}%`);
        },
      );

      expect(wrong).toEqual([]);
    });
  });

  describe("licensing", () => {
    const changeDate = /Change Date:\s*(\d{4}-\d{2}-\d{2})/.exec(
      readFileSync(resolve(REPO_ROOT, "LICENSE"), "utf8"),
    )?.[1];

    it("has a Change Date in LICENSE", () => {
      expect(changeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("quotes LICENSE's Change Date wherever it names one", () => {
      const wrong = CORPUS.filter((l) => LICENSE_CONTEXT.test(l.text)).flatMap(
        ({ surface, line, text }) =>
          [...text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)]
            .map((m) => m[1])
            .filter((date) => date !== changeDate)
            .map((date) => `${surface}:${line} says ${date}`),
      );

      expect(wrong).toEqual([]);
    });

    it("never calls the platform open source", () => {
      const claims = CORPUS.flatMap(({ surface, line, text }) =>
        FORBIDDEN_LICENSE_CLAIMS.filter((claim) =>
          text.toLowerCase().includes(claim.text),
        ).map((claim) => `${surface}:${line} — ${claim.why}`),
      );

      expect(claims).toEqual([]);
    });
  });
});
