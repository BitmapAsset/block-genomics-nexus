"use client";

import { useState } from "react";
import { genomeBases, genomeHues, genomeTraits, genomeV1, genomeV1Formula, type Base } from "@/lib/genome-dna";

const BASE_COLOR: Record<Base, string> = { A: "#4ade80", T: "#f87171", C: "#60a5fa", G: "#facc15" };

/**
 * The genome of one block in one wallet's hands, drawn as DNA.
 *
 * The helix is CSS only: each rung flips on the Y axis with a phase offset, so
 * the strip reads as a turning double helix without WebGL. Every visual is a
 * pure function of the 64-hex genome (whitepaper §4): rung colours come from
 * the bytes, the sequence maps each hex digit to a base, and the traits read
 * the eight 32-bit words.
 */
export default function GenomeDNA({
  height,
  ownerAddress,
  reveal = false,
  compact = false,
}: {
  height: number;
  ownerAddress: string;
  /** Animate the rungs in, once, for the moment right after a verification. */
  reveal?: boolean;
  /** Helix only, for a card preview. */
  compact?: boolean;
}) {
  const genome = genomeV1(height, ownerAddress);
  const hues = genomeHues(genome);
  const [copied, setCopied] = useState(false);

  const helix = (
    <div
      className="genome-helix flex h-14 items-center justify-between gap-[2px]"
      role="img"
      aria-label={`Genome helix for ${height}.bitmap`}
    >
      {hues.map((hue, i) => (
        <span
          key={i}
          className={`genome-rung relative block h-full w-[4px] ${reveal ? "genome-rung-in" : ""}`}
          style={{ animationDelay: reveal ? `${i * 28}ms, ${-i * 90}ms` : `${-i * 90}ms` }}
        >
          <span className="absolute left-1/2 top-[4px] bottom-[4px] w-px -translate-x-1/2 bg-white/15" />
          <span
            className="absolute left-1/2 top-0 h-[7px] w-[7px] -translate-x-1/2 rounded-full"
            style={{ background: `hsl(${hue}, 80%, 60%)` }}
          />
          <span
            className="absolute left-1/2 bottom-0 h-[7px] w-[7px] -translate-x-1/2 rounded-full"
            style={{ background: `hsl(${(hue + 180) % 360}, 70%, 55%)` }}
          />
        </span>
      ))}
    </div>
  );

  if (compact) return helix;

  const bases = genomeBases(genome);
  const traits = genomeTraits(genome);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(genome);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; the value is on screen to select by hand */
    }
  };

  return (
    <div className={reveal ? "genome-panel-in" : undefined}>
      {helix}

      <p className="mt-4 font-mono text-[13px] leading-relaxed tracking-[0.12em]" aria-label="DNA sequence">
        {Array.from({ length: 8 }, (_, g) => (
          <span key={g} className="mr-2 inline-block whitespace-nowrap">
            {bases.slice(g * 8, g * 8 + 8).map((b, i) => (
              <span key={i} style={{ color: BASE_COLOR[b] }}>
                {b}
              </span>
            ))}
          </span>
        ))}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-4">
        {traits.map((t) => (
          <div key={t.name}>
            <dt className="flex items-baseline justify-between text-[11px] text-text-secondary">
              <span>{t.name}</span>
              <span className="tabular-nums text-text-primary">{t.value}</span>
            </dt>
            <dd className="mt-1 h-1 rounded-full bg-white/[0.06]">
              <span
                className="block h-1 rounded-full"
                style={{ width: `${Math.max(t.value, 2)}%`, background: "linear-gradient(90deg, #66ccff, #a855f7)" }}
              />
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.07] bg-black/20 p-3">
        <code className="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed text-text-secondary">{genome}</code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-text-primary hover:bg-white/5 min-h-[44px] min-w-[64px]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-text-secondary">
        {genomeV1Formula(height, ownerAddress)}
      </p>
    </div>
  );
}
