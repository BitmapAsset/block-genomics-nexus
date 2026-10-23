import type { Metadata } from "next";
import Link from "next/link";
import prisma from "@/lib/prisma";
import BitmapThumbnail from "@/components/BitmapThumbnail";
import GlobalSearch from "@/components/GlobalSearch";
import { countVerifiedAgents } from "@/lib/directory-counts";
import { FAMOUS_BLOCKS } from "@/lib/famous-blocks";
import { formatNumber } from "@/lib/genome-utils";

export const metadata: Metadata = {
  title: "Explore — Block Genomics",
  description:
    "Look up any Bitcoin block and see its bitmap art, then browse the blocks people have verified and built on.",
};

// Recent blocks are database state; render per request rather than baking the
// build machine's (empty) answer into a static page.
export const dynamic = "force-dynamic";

const RECENT_LIMIT = 12;

/** Blocks with an owner on record, newest first: what people verified lately. */
async function fetchRecent(): Promise<{ blocks: { height: number; label: string | null }[]; onRecord: number; agents: number } | null> {
  try {
    const [blocks, onRecord, agents] = await Promise.all([
      prisma.block.findMany({
        where: { ownerAddress: { not: null } },
        orderBy: { createdAt: "desc" },
        take: RECENT_LIMIT,
        select: { height: true, label: true },
      }),
      prisma.block.count({ where: { ownerAddress: { not: null } } }),
      countVerifiedAgents(),
    ]);
    return { blocks, onRecord, agents };
  } catch {
    return null;
  }
}

export default async function ExplorePage() {
  const recent = await fetchRecent();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-text-secondary">Explore</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl">Every block has a page.</h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-text-secondary">
        Look one up by number or by its owner&apos;s @handle, or start with the blocks below.
      </p>
      <div className="mt-8 max-w-2xl">
        <GlobalSearch size="page" />
      </div>

      <section className="mt-14" aria-labelledby="history-title">
        <h2 id="history-title" className="text-xl font-semibold tracking-tight text-text-primary">
          Start with history
        </h2>
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {FAMOUS_BLOCKS.map((b) => (
            <li key={b.height}>
              <Link href={`/block/${b.height}`} className="group block">
                <BitmapThumbnail blockHeight={b.height} fill className="rounded-xl transition-opacity group-hover:opacity-90" />
                <p className="mt-3 font-mono text-sm text-text-primary">{formatNumber(b.height)}</p>
                <p className="text-xs text-text-secondary">{b.label}</p>
                <p className="text-xs text-text-secondary">{b.note}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16" aria-labelledby="recent-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="recent-title" className="text-xl font-semibold tracking-tight text-text-primary">
            Recently on Block Genomics
          </h2>
          {recent && (
            <p className="text-sm text-text-secondary">
              {formatNumber(recent.onRecord)} blocks on record · {formatNumber(recent.agents)} verified agents
            </p>
          )}
        </div>
        {recent === null ? (
          <p className="mt-6 rounded-2xl border border-dashed border-white/[0.09] px-6 py-10 text-center text-sm text-text-secondary">
            The Block Genomics records couldn&apos;t be loaded right now. Search still works.
          </p>
        ) : recent.blocks.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-white/[0.09] px-6 py-10 text-center text-sm text-text-secondary">
            Nobody has verified a block yet.{" "}
            <Link href="/my-bitmaps" className="text-accent-cyan hover:underline">
              Be the first
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {recent.blocks.map((b) => (
              <li key={b.height}>
                <Link href={`/block/${b.height}`} className="group block" aria-label={`${b.height}.bitmap`}>
                  <BitmapThumbnail blockHeight={b.height} fill className="rounded-xl transition-opacity group-hover:opacity-90" />
                  <p className="mt-2 truncate font-mono text-xs text-text-primary">{b.height}.bitmap</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-14 flex flex-wrap gap-3">
        <Link
          href="/nexus"
          className="inline-flex min-h-[48px] items-center rounded-full bg-bitcoin px-6 text-sm font-semibold text-black hover:brightness-110"
        >
          See every block on the World map
        </Link>
        <Link
          href="/directory"
          className="inline-flex min-h-[48px] items-center rounded-full border border-white/15 px-6 text-sm font-medium text-text-primary hover:bg-white/5"
        >
          Agent directory
        </Link>
      </div>
    </main>
  );
}
