import Link from "next/link";
import BitmapThumbnail from "@/components/BitmapThumbnail";
import { HomeCta, BlockCountFact } from "@/components/home/HomeClient";
import { FAMOUS_BLOCKS } from "@/lib/famous-blocks";

// Static shell: the only live values (wallet state, chain height) render client-side.
export const dynamic = "force-static";


const FACTS = [
  {
    title: <BlockCountFact />,
    copy: "Each one is a bitmap: a plot of digital land, numbered by its height, with one owner at a time.",
  },
  {
    title: "Proof of work",
    copy: "Each one was mined with real energy. None can be copied, forged or issued again.",
  },
  {
    title: "Your wallet is the deed",
    copy: "Ownership is an ordinals inscription. Whoever holds it holds the block.",
  },
];

const DEV_PATHS = [
  {
    name: "MCP",
    line: "https://blockgenomics.io/mcp",
    copy: "Point any MCP client at it: blocks, owners, genomes and verification as tools.",
    href: "/mcp",
    cta: "Tools and config",
  },
  {
    name: "SDK",
    line: "npm i block-genomics-connect",
    copy: "Typed client for agents: verify a wallet, read blocks, run a session.",
    href: "https://www.npmjs.com/package/block-genomics-connect",
    cta: "npm",
  },
  {
    name: "API",
    line: "GET /api/v1/blocks/840000",
    copy: "Plain REST with an OpenAPI spec. Reads are public; writes are signed.",
    href: "/openapi.json",
    cta: "OpenAPI",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      {/* ── Hero: one promise, one action ── */}
      <section className="grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="order-2 lg:order-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-text-secondary">Block Genomics</p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.02] tracking-[-0.035em] text-text-primary sm:text-7xl">
            Your bitmap,
            <br />
            alive.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary">
            Connect a wallet to see every bitmap it holds. Verify one with a single signature, get its genome, and walk
            through its world.
          </p>
          <div className="mt-8">
            <HomeCta />
          </div>
          <p className="mt-6 text-sm text-text-secondary">
            Works with Unisat, Xverse, Leather, Magic Eden and OKX. Looking needs no signature.
          </p>
        </div>

        {/* Real art, server-rendered from each block's transactions */}
        <div className="order-1 lg:order-2" aria-label="Bitmap art of famous blocks">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Link
              href="/block/840000"
              className="col-span-2 row-span-2 block overflow-hidden rounded-2xl border border-white/[0.08]"
              aria-label="840000.bitmap, the fourth halving"
            >
              <BitmapThumbnail blockHeight={840000} fill className="rounded-none" />
            </Link>
            {[0, 210000].map((h) => (
              <Link
                key={h}
                href={`/block/${h}`}
                className="block overflow-hidden rounded-2xl border border-white/[0.08]"
                aria-label={`${h}.bitmap`}
              >
                <BitmapThumbnail blockHeight={h} fill className="rounded-none" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── The three Bitmap facts ── */}
      <section className="border-t border-white/[0.06] py-14 sm:py-20" aria-labelledby="facts-title">
        <h2 id="facts-title" className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          What a bitmap is
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {FACTS.map((f, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
              <h3 className="text-lg font-semibold text-text-primary">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{f.copy}</p>
            </div>
          ))}
        </div>
        <a
          href="https://github.com/Blockamoto/gitbook"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex min-h-[44px] items-center text-sm font-medium text-accent-cyan underline-offset-4 hover:underline"
        >
          The Bitmap standard ↗
        </a>
      </section>

      {/* ── Look around ── */}
      <section className="border-t border-white/[0.06] py-14 sm:py-20" aria-labelledby="history-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="history-title" className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Start with history
          </h2>
          <Link
            href="/explore"
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-text-primary underline-offset-4 hover:underline"
          >
            Explore all blocks →
          </Link>
        </div>
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {FAMOUS_BLOCKS.map((b) => (
            <li key={b.height}>
              <Link href={`/block/${b.height}`} className="group block">
                <BitmapThumbnail blockHeight={b.height} fill className="rounded-xl transition-opacity group-hover:opacity-90" />
                <p className="mt-3 font-mono text-sm text-text-primary">{b.height.toLocaleString("en-US")}</p>
                <p className="text-xs text-text-secondary">{b.label}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Developers: the secondary path ── */}
      <section className="border-t border-white/[0.06] py-14 sm:py-20" aria-labelledby="dev-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-text-secondary">For developers</p>
            <h2 id="dev-title" className="mt-2 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              Build on it
            </h2>
          </div>
          <Link
            href="/docs"
            className="inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-5 text-sm font-medium text-text-primary hover:bg-white/5"
          >
            Developer docs
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {DEV_PATHS.map((d) => (
            <div key={d.name} className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
              <h3 className="text-base font-semibold text-text-primary">{d.name}</h3>
              <code className="mt-3 block overflow-x-auto whitespace-nowrap rounded-lg bg-black/30 px-3 py-2 font-mono text-xs text-accent-cyan">
                {d.line}
              </code>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-text-secondary">{d.copy}</p>
              <a
                href={d.href}
                {...(d.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="mt-4 inline-flex min-h-[44px] items-center text-sm font-medium text-text-primary underline-offset-4 hover:underline"
              >
                {d.cta} {d.href.startsWith("http") ? "↗" : "→"}
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
