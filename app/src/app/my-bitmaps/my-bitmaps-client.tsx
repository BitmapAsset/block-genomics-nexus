"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGlobalWallet } from "@/context/GlobalWalletContext";
import BitmapThumbnail from "@/components/BitmapThumbnail";
import GenomeDNA from "@/components/GenomeDNA";
import { openWalletModal } from "@/lib/open-wallet-modal";
import { buildProfileClaim, checkHandle, describeClaimFailure, PROFILE_CHALLENGE_PURPOSE, PROFILE_CREATE_PATH } from "@/lib/profile-claim";
import {
  ADDRESS_TYPE_LABEL,
  addressType,
  describeVerifyFailure,
  heightsToRead,
  mergeGuardians,
  parseScanResponse,
  readVerifyResponse,
  reconcileBitmaps,
  SCAN_CAP,
  type BitmapCard,
  type ChainScan,
  type HolderCheck,
  type RecordedBlock,
  type VerifyFailure,
  type WalletRecords,
} from "@/lib/my-bitmaps";

const WALLET_NAMES: Record<string, string> = {
  unisat: "Unisat",
  xverse: "Xverse",
  leather: "Leather",
  magiceden: "Magic Eden",
  okx: "OKX Wallet",
};

/** Per-card verification progress in this session. */
type VerifyRow =
  | { phase: "signing" }
  | { phase: "checking" }
  /** `inscriptionId`: what auth/verify checked, so a card the capped scan never listed can join the grid. */
  | { phase: "done"; holderCheck: HolderCheck; inscriptionId: string | null }
  | { phase: "failed"; failure: VerifyFailure };

const EMPTY_RECORDS: WalletRecords = { recordedHeights: [], blocks: [], profiles: [], guardians: [] };

function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

async function getJson(url: string, signal: AbortSignal): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/** Block rows for the held heights, four requests at a time. 404 = no row. */
async function fetchBlockRows(heights: number[], signal: AbortSignal): Promise<{ rows: RecordedBlock[]; failed: boolean }> {
  const rows: RecordedBlock[] = [];
  let failed = false;
  let next = 0;
  const worker = async () => {
    while (next < heights.length) {
      const height = heights[next++];
      try {
        const { status, body } = await getJson(`/api/v1/blocks/${height}`, signal);
        if (status === 404) rows.push({ height, ownerAddress: null, inscriptionId: null });
        else if (status === 200) {
          const data = (body as { data?: { ownerAddress?: unknown; inscriptionId?: unknown } })?.data;
          rows.push({
            height,
            ownerAddress: typeof data?.ownerAddress === "string" ? data.ownerAddress : null,
            inscriptionId: typeof data?.inscriptionId === "string" ? data.inscriptionId : null,
          });
        } else failed = true;
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        failed = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, heights.length) }, worker));
  return { rows, failed };
}

/** The guardian on each block (the block page's view), four requests at a time. */
async function fetchGuardians(heights: number[], signal: AbortSignal): Promise<WalletRecords["guardians"]> {
  const found: WalletRecords["guardians"] = [];
  let next = 0;
  const worker = async () => {
    while (next < heights.length) {
      const height = heights[next++];
      try {
        const { status, body } = await getJson(`/api/v1/guardian?blockHeight=${height}`, signal);
        const g = (body as { guardians?: { name?: string; status?: string }[] })?.guardians?.[0];
        if (status === 200 && g && typeof g.status === "string") found.push({ blockHeight: height, status: g.status, name: g.name ?? null });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, heights.length) }, worker));
  return found;
}

/* ───────────────────────────── page ───────────────────────────── */

export default function MyBitmapsClient() {
  const { isConnected, isConnecting, walletAddress, walletType, profile, signMessage, refreshProfile } = useGlobalWallet();

  const [scan, setScan] = useState<ChainScan | null>(null);
  const [records, setRecords] = useState<WalletRecords>(EMPTY_RECORDS);
  const [recordsFailed, setRecordsFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [rows, setRows] = useState<Record<number, VerifyRow>>({});
  const [sheet, setSheet] = useState<{ height: number; reveal: boolean } | null>(null);
  // The claim route said this wallet has no verified account (403): every card
  // offers Verify again until a verification in this session succeeds.
  const [needsVerify, setNeedsVerify] = useState(false);
  // A card whose Verify button should be scrolled to and focused once it renders.
  const [focusVerify, setFocusVerify] = useState<number | null>(null);
  // The wallet a verification started with; a switch mid-flow drops its result.
  const walletRef = useRef(walletAddress);

  // Reset everything when the wallet changes: nothing from one address may leak
  // into another's view.
  useEffect(() => {
    walletRef.current = walletAddress;
    setScan(null);
    setRecords(EMPTY_RECORDS);
    setRecordsFailed(false);
    setRows({});
    setSheet(null);
    setNeedsVerify(false);
    setFocusVerify(null);
  }, [walletAddress]);

  useEffect(() => {
    if (!isConnected || !walletAddress) return;
    const ctrl = new AbortController();
    const addr = encodeURIComponent(walletAddress);
    setLoading(true);

    (async () => {
      try {
        const [scanRes, statsRes, profilesRes, claimedRes] = await Promise.all([
          getJson(`/api/v1/inscriptions/scan?address=${addr}`, ctrl.signal).catch((e) => {
            if ((e as Error).name === "AbortError") throw e;
            return { status: 0, body: { error: "Network error" } };
          }),
          getJson(`/api/v1/profiles/empire-stats/${addr}`, ctrl.signal).catch(() => null),
          getJson(`/api/v1/profiles/by-wallet/${addr}`, ctrl.signal).catch(() => null),
          getJson(`/api/v1/blocks/claimed`, ctrl.signal).catch(() => null),
        ]);
        const parsed = parseScanResponse(scanRes.status, scanRes.body);

        const stats = (statsRes?.body as { success?: boolean; data?: { ownedBlocks?: number[]; guardianDetails?: WalletRecords["guardians"] } })?.data;
        const profiles = (profilesRes?.body as { data?: { profiles?: { blockHeight: number; handle: string }[] } })?.data?.profiles;

        let blocks: RecordedBlock[] = [];
        let blockGuardians: WalletRecords["guardians"] = [];
        let failed = !stats || !profiles;
        if (parsed.status === "ok") {
          const heights = Array.from(new Set(parsed.inscriptions.filter((i) => i.type === "block").map((i) => i.height)));
          const claimed = (claimedRes?.body as { heights?: unknown })?.heights;
          const recordedHeights = Array.isArray(stats?.ownedBlocks) ? stats!.ownedBlocks : [];
          const toRead = heightsToRead(
            heights,
            claimedRes?.status === 200 && Array.isArray(claimed) ? (claimed as number[]) : null,
            recordedHeights,
          );
          // A capped scan may have stopped before some recorded bitmaps. Their
          // rows carry the recorded inscription, which Verify checks directly.
          const unscanned = parsed.capped ? recordedHeights.filter((h) => Number.isInteger(h) && !heights.includes(h)) : [];
          const [res, guardians] = await Promise.all([
            fetchBlockRows(toRead.concat(unscanned), ctrl.signal),
            fetchGuardians(toRead, ctrl.signal),
          ]);
          blockGuardians = guardians;
          // Heights skipped above have no Block row: the same answer a 404 gives.
          blocks = res.rows.concat(
            heights.filter((h) => !toRead.includes(h)).map((height) => ({ height, ownerAddress: null, inscriptionId: null })),
          );
          failed = failed || res.failed;
        }

        if (ctrl.signal.aborted) return;
        setScan(parsed);
        setRecords({
          recordedHeights: Array.isArray(stats?.ownedBlocks) ? stats!.ownedBlocks.filter((h) => Number.isInteger(h)) : [],
          blocks,
          profiles: Array.isArray(profiles) ? profiles.map((p) => ({ blockHeight: p.blockHeight, handle: p.handle })) : [],
          guardians: mergeGuardians(Array.isArray(stats?.guardianDetails) ? stats!.guardianDetails : [], blockGuardians),
        });
        setRecordsFailed(failed);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setScan({ status: "error", message: "Network error" });
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [isConnected, walletAddress, reloadKey]);

  // Cards verified in this session flip to "verified" without a refetch: the
  // server's 200 is the proof, and the records it wrote name this wallet, the
  // inscription we sent, and a verified User.
  const view = useMemo(() => {
    if (!walletAddress || !scan) return null;
    const done = new Map<number, string | null>();
    for (const [h, r] of Object.entries(rows)) if (r.phase === "done") done.set(Number(h), r.inscriptionId);
    const sessionVerified = Array.from(done.keys());
    const scanId = (h: number) =>
      scan.status === "ok" ? scan.inscriptions.find((i) => i.type === "block" && i.height === h)?.inscriptionId ?? null : null;
    // A recorded bitmap the capped scan never reached, verified just now: the
    // chain check that verification ran says this wallet holds it.
    const effectiveScan: ChainScan =
      scan.status === "ok"
        ? {
            ...scan,
            inscriptions: scan.inscriptions.concat(
              sessionVerified
                .filter((h) => scanId(h) === null && done.get(h))
                .map((height) => ({ type: "block" as const, height, inscriptionId: done.get(height)! })),
            ),
          }
        : scan;
    const blocks = records.blocks
      .filter((b) => !sessionVerified.includes(b.height))
      .concat(sessionVerified.map((height) => ({ height, ownerAddress: walletAddress, inscriptionId: scanId(height) ?? done.get(height) ?? null })));
    // users/by-wallet: a 404 leaves profile null (no User); a User row can exist unverified.
    const profileVerified =
      profile?.verified === true && profile.walletAddress?.toLowerCase() === walletAddress.toLowerCase();
    const verifiedUser = (sessionVerified.length > 0 || profileVerified) && !needsVerify;
    return reconcileBitmaps(walletAddress, effectiveScan, { ...records, blocks }, verifiedUser);
  }, [walletAddress, scan, records, rows, profile, needsVerify]);

  // "Verify this bitmap first" from the handle claim: bring that card's Verify
  // button into view and focus it once the card shows one.
  useEffect(() => {
    if (focusVerify === null) return;
    const button = document.querySelector<HTMLButtonElement>(`[data-testid="verify-${focusVerify}"]`);
    if (!button) return;
    button.scrollIntoView({ block: "center", behavior: "smooth" });
    button.focus({ preventScroll: true });
    setFocusVerify(null);
  }, [focusVerify, view]);

  const verify = useCallback(
    async (card: BitmapCard) => {
      if (!walletAddress) return;
      const h = card.height;
      // Held: the inscription the scan listed. Unscanned (capped scan): the one
      // the record names, so the server checks its holder instead of re-scanning.
      const inscriptionId = card.inscriptionId ?? card.recordedInscriptionId;
      const stale = () => walletRef.current !== walletAddress;
      const fail = (failure: VerifyFailure) => {
        if (!stale()) setRows((r) => ({ ...r, [h]: { phase: "failed", failure } }));
      };
      setRows((r) => ({ ...r, [h]: { phase: "signing" } }));

      try {
        const ch = await fetch("/api/v1/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress }),
        });
        const chBody = await ch.json().catch(() => null);
        if (!ch.ok || !chBody?.success) {
          fail(describeVerifyFailure(h, new Error(chBody?.error || "Could not start verification"), ch.status));
          return;
        }
        const message: string = chBody.data.message;

        let signature: string;
        try {
          signature = await signMessage(message);
        } catch (e) {
          fail(describeVerifyFailure(h, e));
          return;
        }

        if (stale()) return;
        setRows((r) => ({ ...r, [h]: { phase: "checking" } }));
        const res = await fetch("/api/v1/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress,
            signature,
            message,
            blockHeight: h,
            ...(inscriptionId ? { inscriptionId } : {}),
          }),
        });
        const body = await res.json().catch(() => null);
        // Only a holder check that ran for this block counts; a 200 that checked
        // nothing ('none') is "Couldn't verify": no override, no genome sheet.
        const outcome = readVerifyResponse(h, res.status, body);
        if (!outcome.ok) {
          fail(outcome.failure);
          // A 200 still changed the account on the server; keep the context in step.
          if (res.ok) void refreshProfile();
          return;
        }
        const holderCheck = outcome.holderCheck;
        if (stale()) return;
        setRows((r) => ({ ...r, [h]: { phase: "done", holderCheck, inscriptionId } }));
        setNeedsVerify(false);
        setSheet({ height: h, reveal: true });
        void refreshProfile();
      } catch (e) {
        fail(describeVerifyFailure(h, e, 0));
      }
    },
    [walletAddress, signMessage, refreshProfile],
  );

  /* ── not connected ── */
  if (!isConnected || !walletAddress) {
    return <NotConnected connecting={isConnecting} />;
  }

  const type = addressType(walletAddress);
  const walletName = walletType ? WALLET_NAMES[walletType] ?? "Wallet" : "Wallet";

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-text-secondary">My Bitmaps</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">Your bitmaps</h1>
          <p className="mt-2 text-sm text-text-secondary">
            <span className="font-mono text-text-primary">{shortAddress(walletAddress)}</span>
            <span className="mx-2 text-white/20">·</span>
            {walletName}
            <span className="mx-2 text-white/20">·</span>
            {ADDRESS_TYPE_LABEL[type]}
          </p>
        </div>
        {view && view.scan === "ok" && (
          <p className="text-sm text-text-secondary" data-testid="bitmaps-summary">
            <strong className="font-semibold text-text-primary">{view.counts.held}</strong> bitmap{view.counts.held === 1 ? "" : "s"}
            <span className="mx-2 text-white/20">·</span>
            <strong className="font-semibold text-text-primary">{view.counts.verified}</strong> verified
            <span className="mx-2 text-white/20">·</span>
            <strong className="font-semibold text-text-primary">{view.counts.guardians}</strong> guardian{view.counts.guardians === 1 ? "" : "s"}
          </p>
        )}
      </header>

      {(loading || !view) && <ScanningState />}

      {!loading && view && view.scan !== "ok" && (
        <OutageState
          kind={view.scan}
          message={scan?.status === "error" ? scan.message : null}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      {!loading && view && view.scan === "ok" && view.held.length === 0 && (
        <EmptyState address={walletAddress} walletName={walletName} capped={view.capped} />
      )}

      {!loading && view && view.scan === "ok" && view.held.length > 0 && (
        <>
          {recordsFailed && (
            <p className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">
              Block Genomics records didn&apos;t fully load, so some bitmaps may show &ldquo;Not verified&rdquo; even if you verified them before. The list itself comes from the chain and is complete.
            </p>
          )}
          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="bitmaps-grid">
            {view.held.map((card) => (
              <BitmapCardView
                key={card.height}
                card={card}
                row={rows[card.height]}
                onVerify={() => verify(card)}
                onGenome={() => setSheet({ height: card.height, reveal: false })}
              />
            ))}
          </ul>
          {view.parcels.length > 0 && (
            <section className="mt-10">
              <h2 className="text-sm font-semibold text-text-primary">Parcels</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {view.parcels.map((p) => (
                  <li key={p.inscriptionId}>
                    <Link
                      href={`/block/${p.height}`}
                      className="inline-flex min-h-[44px] items-center rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 font-mono text-xs text-text-primary hover:border-white/20"
                    >
                      {p.height}:{p.parcelIndex}.bitmap
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="mt-8 text-xs text-text-secondary">
            Read from the chain just now. The scan checks up to {SCAN_CAP} inscriptions per wallet; if a bitmap is missing,{" "}
            <Link href="/explore" className="text-accent-cyan underline-offset-4 hover:underline">look it up by number</Link>.
          </p>
        </>
      )}

      {!loading && view && view.recordedOnly.length > 0 && (
        <RecordedOnly
          cards={view.recordedOnly}
          unconfirmed={view.scan !== "ok"}
          capped={view.capped}
          rows={rows}
          onVerify={verify}
        />
      )}

      {sheet && (
        <GenomeSheet
          height={sheet.height}
          ownerAddress={walletAddress}
          reveal={sheet.reveal}
          row={rows[sheet.height]}
          handle={view?.held.find((c) => c.height === sheet.height)?.handle ?? null}
          signMessage={signMessage}
          onClaimed={(handle) => {
            setRecords((r) => ({ ...r, profiles: [...r.profiles, { blockHeight: sheet.height, handle }] }));
            // Account and the wallet menu read the claimed handle from the profile.
            void refreshProfile();
          }}
          onNeedsVerify={() => {
            setNeedsVerify(true);
            setFocusVerify(sheet.height);
            setSheet(null);
            void refreshProfile();
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </main>
  );
}

/* ───────────────────────────── states ───────────────────────────── */

function NotConnected({ connecting }: { connecting: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 py-16 text-center sm:py-24">
      <div className="grid grid-cols-3 gap-2 opacity-90" aria-hidden="true">
        {[840000, 720143, 0].map((h) => (
          <BitmapThumbnail key={h} blockHeight={h} size={72} className="rounded-lg" />
        ))}
      </div>
      <p className="mt-10 text-[11px] font-medium uppercase tracking-[0.28em] text-text-secondary">My Bitmaps</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-5xl">
        {connecting ? "Connecting your wallet…" : "Connect a wallet to see your bitmaps."}
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-text-secondary">
        We read the chain for every bitmap your wallet holds. Looking costs nothing: no signature until you choose to verify one.
      </p>
      <button
        type="button"
        onClick={() => openWalletModal()}
        disabled={connecting}
        className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-full bg-bitcoin px-7 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      <p className="mt-5 text-xs text-text-secondary">Works with Unisat, Xverse, Leather, Magic Eden and OKX.</p>
    </main>
  );
}

function ScanningState() {
  return (
    <div className="mt-8" aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-accent-cyan" />
        Reading the chain for this wallet…
      </p>
      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="h-[132px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02] sm:h-[360px]" />
        ))}
      </ul>
    </div>
  );
}

function OutageState({ kind, message, onRetry }: { kind: "unavailable" | "error"; message: string | null; onRetry: () => void }) {
  return (
    <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8" role="status">
      <h2 className="text-lg font-semibold text-text-primary">Can&apos;t reach the chain right now</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
        {kind === "unavailable"
          ? "The ordinals indexer didn't answer, so we can't list what this wallet holds. That doesn't mean it holds nothing."
          : `The wallet scan failed${message ? ` (${message})` : ""}. That doesn't mean this wallet holds nothing.`}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-5 text-sm font-medium text-text-primary hover:bg-white/5"
      >
        Try again
      </button>
    </div>
  );
}

function EmptyState({ address, walletName, capped }: { address: string; walletName: string; capped: boolean }) {
  const type = addressType(address);
  if (capped) {
    // The scan stopped at its cap (all of it parcels): absence proves nothing.
    return (
      <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-text-primary">No bitmaps in the first {SCAN_CAP} inscriptions</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          No <span className="font-mono">.bitmap</span> inscription found in the first {SCAN_CAP} inscriptions at {shortAddress(address)}. The scan reads only that many, so a bitmap further in isn&apos;t listed here. Look it up by number and open its block page.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/explore"
            className="inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-5 text-sm font-medium text-text-primary hover:bg-white/5"
          >
            Look it up by number
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-text-primary">No bitmaps in this wallet</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
        The chain shows no <span className="font-mono">.bitmap</span> inscription at {shortAddress(address)}.
        {type !== "taproot" &&
          ` Bitmaps usually sit on a Taproot address (bc1p…), and ${walletName} connected with its ${ADDRESS_TYPE_LABEL[type]} address. Switch ${walletName} to your Taproot or Ordinals address, then connect again.`}
        {type === "taproot" && " If yours sits in another wallet, connect that one."}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/explore"
          className="inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-5 text-sm font-medium text-text-primary hover:bg-white/5"
        >
          Look around first
        </Link>
        <button
          type="button"
          onClick={() => openWalletModal()}
          className="inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-5 text-sm font-medium text-text-primary hover:bg-white/5"
        >
          Use another wallet
        </button>
      </div>
    </div>
  );
}

function RecordedOnly({
  cards,
  unconfirmed,
  capped,
  rows,
  onVerify,
}: {
  cards: BitmapCard[];
  unconfirmed: boolean;
  capped: boolean;
  rows: Record<number, VerifyRow>;
  onVerify: (card: BitmapCard) => void;
}) {
  return (
    <details className="group mt-10 rounded-2xl border border-white/[0.07] bg-white/[0.015]" open={unconfirmed || capped}>
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm text-text-secondary">
        <span>
          {unconfirmed
            ? `On record for this wallet, not confirmed on-chain (${cards.length})`
            : capped
              ? `Not found in the first ${SCAN_CAP} inscriptions of this wallet (${cards.length})`
              : `Previously linked, not in this wallet anymore (${cards.length})`}
        </span>
        <span className="transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      <div className="border-t border-white/[0.06] px-5 py-4">
        <p className="text-xs leading-relaxed text-text-secondary">
          {unconfirmed
            ? "Block Genomics has these on record for this address. Until the chain answers, none of them is shown as yours."
            : capped
              ? `Block Genomics has these on record for this address. The scan reads only the first ${SCAN_CAP} inscriptions of a wallet and didn't find them there, so they may still be in it. Verify one to check it on the chain.`
              : "Block Genomics has these on record for this address, but the chain says this wallet doesn't hold them now."}
        </p>
        {capped ? (
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => {
              const row = rows[c.height];
              const busy = row?.phase === "signing" || row?.phase === "checking";
              return (
                <li key={c.height} className="rounded-xl border border-white/[0.08] p-2.5" data-testid={`unscanned-${c.height}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/block/${c.height}`}
                      className="inline-flex min-h-[44px] min-w-0 items-center gap-2 px-1 text-xs text-text-secondary hover:text-text-primary"
                    >
                      <BitmapThumbnail blockHeight={c.height} size={28} className="rounded" />
                      <span className="font-mono">{c.height}.bitmap</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => onVerify(c)}
                      disabled={busy}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-bitcoin px-4 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-70"
                      data-testid={`verify-${c.height}`}
                    >
                      {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/25 border-t-black" />}
                      {verifyLabel(row)}
                    </button>
                  </div>
                  {row?.phase === "failed" && (
                    <p className="mt-2 px-1 text-xs leading-relaxed text-red-300" role="alert">
                      {row.failure.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {cards.map((c) => (
              <li key={c.height}>
                <Link
                  href={`/block/${c.height}`}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/[0.08] px-3 text-xs text-text-secondary hover:border-white/20 hover:text-text-primary"
                >
                  <BitmapThumbnail blockHeight={c.height} size={28} className="rounded" />
                  <span className="font-mono">{c.height}.bitmap</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

/* ───────────────────────────── card ───────────────────────────── */

/** The Verify button's words for each step of a verification. */
function verifyLabel(row: VerifyRow | undefined): string {
  if (row?.phase === "signing") return "Check your wallet…";
  if (row?.phase === "checking") return "Verifying…";
  if (row?.phase === "failed" && row.failure.retryable) return "Try again";
  return "Verify · 1 signature";
}

function StatusChip({ verified, justNow }: { verified: boolean; justNow: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-[11px] font-medium text-green-400">
      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
      {justNow ? "Verified just now" : "Verified"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-text-secondary">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Not verified
    </span>
  );
}

function BitmapCardView({
  card,
  row,
  onVerify,
  onGenome,
}: {
  card: BitmapCard;
  row: VerifyRow | undefined;
  onVerify: () => void;
  onGenome: () => void;
}) {
  const verified = card.status === "verified";
  const busy = row?.phase === "signing" || row?.phase === "checking";

  return (
    <li
      className="flex gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 sm:block sm:p-4"
      data-testid={`bitmap-card-${card.height}`}
      data-status={card.status}
    >
      <Link href={`/block/${card.height}`} className="block w-28 shrink-0 sm:w-full" aria-label={`Open ${card.height}.bitmap`}>
        <BitmapThumbnail blockHeight={card.height} fill className="rounded-xl" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col sm:mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="truncate font-mono text-base font-normal text-text-primary">{card.height.toLocaleString()}.bitmap</h3>
          <StatusChip verified={verified} justNow={row?.phase === "done"} />
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
          {verified
            ? card.guardian
              ? // The status word as recorded; "active" is a setting, not a liveness probe.
                `${card.guardian.name || "Guardian"} · ${card.guardian.status.toLowerCase()}${card.handle ? ` · @${card.handle}` : ""}`
              : card.handle
                ? `@${card.handle}`
                : "Held on-chain and recorded to this wallet."
            : card.recordOnly
              ? "On record for this wallet, not yet verified by you."
              : card.recordedToOther
                ? "Held by this wallet. Block Genomics still lists the previous holder."
                : card.unlinked
                  ? "Held by this wallet. The record isn't linked to this inscription yet."
                  : "Held by this wallet on-chain. Not on Block Genomics yet."}
        </p>

        <div className="mt-auto pt-3">
          {verified ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onGenome}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-white/[0.07] px-4 text-sm font-medium text-text-primary hover:bg-white/[0.12]"
              >
                Genome
              </button>
              <Link
                href={`/block/${card.height}`}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-white/12 px-4 text-sm font-medium text-text-primary hover:bg-white/5"
              >
                Open
              </Link>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onVerify}
                disabled={busy}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-bitcoin px-4 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-70"
                data-testid={`verify-${card.height}`}
              >
                {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/25 border-t-black" />}
                {verifyLabel(row)}
              </button>
              {row?.phase === "failed" && (
                <p className="mt-2 text-xs leading-relaxed text-red-300" role="alert">
                  {row.failure.message}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/* ───────────────────────────── genome sheet ───────────────────────────── */

function GenomeSheet({
  height,
  ownerAddress,
  reveal,
  row,
  handle,
  signMessage,
  onClaimed,
  onNeedsVerify,
  onClose,
}: {
  height: number;
  ownerAddress: string;
  reveal: boolean;
  row: VerifyRow | undefined;
  handle: string | null;
  signMessage: (message: string) => Promise<string>;
  onClaimed: (handle: string) => void;
  onNeedsVerify: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const justVerified = row?.phase === "done";
  const holderCheck = row?.phase === "done" ? row.holderCheck : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="genome-sheet-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-[#0d0d14] p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7"
        data-testid="genome-sheet"
      >
        <div className="flex items-start gap-4">
          <BitmapThumbnail blockHeight={height} size={64} className="rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-text-secondary">Genome</p>
            <h2 id="genome-sheet-title" className="mt-1 font-mono text-xl text-text-primary">
              {height.toLocaleString()}.bitmap
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:bg-white/5 hover:text-text-primary"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {justVerified && (
          <p className="mt-5 rounded-xl border border-green-500/20 bg-green-500/[0.06] px-4 py-3 text-sm leading-relaxed text-green-300">
            {holderCheck === "live"
              ? `Verified. Your wallet signed, and the chain confirms it holds ${height}.bitmap. Recorded on Block Genomics.`
              : `Signature verified. This wallet was already verified for ${height}.bitmap, so the chain check wasn't re-run.`}
          </p>
        )}

        <p className="mt-5 text-sm leading-relaxed text-text-secondary">
          This block&apos;s DNA in your hands: 256 bits derived from the block height and your address, the same on every app and in the CLI.
        </p>

        <div className="mt-5">
          <GenomeDNA height={height} ownerAddress={ownerAddress} reveal={reveal} />
        </div>

        <HandleClaim
          height={height}
          walletAddress={ownerAddress}
          handle={handle}
          signMessage={signMessage}
          onClaimed={onClaimed}
          onNeedsVerify={onNeedsVerify}
        />

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/block/${height}`}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-bitcoin px-5 text-sm font-semibold text-black hover:brightness-110"
          >
            Open block page
          </Link>
          <Link
            href={`/world/${height}`}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full border border-white/15 px-5 text-sm font-medium text-text-primary hover:bg-white/5"
          >
            Enter world
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────────── handle claim ───────────────────────────── */

type ClaimState =
  | { phase: "idle" }
  | { phase: "working"; step: string }
  | { phase: "error"; message: string; needsVerify?: boolean }
  | { phase: "done"; handle: string };

/**
 * A verified block's public identity: /agent/{handle} hosts its profile and its
 * guardian chat. One action-bound signature via POST /api/v1/profiles/create,
 * which re-checks the holder on-chain and stores the same v1 genome shown above.
 */
function HandleClaim({
  height,
  walletAddress,
  handle,
  signMessage,
  onClaimed,
  onNeedsVerify,
}: {
  height: number;
  walletAddress: string;
  handle: string | null;
  signMessage: (message: string) => Promise<string>;
  onClaimed: (handle: string) => void;
  onNeedsVerify: () => void;
}) {
  const [input, setInput] = useState("");
  const [state, setState] = useState<ClaimState>({ phase: "idle" });

  if (handle) {
    return (
      <p className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-sm text-text-secondary">
        Public page:{" "}
        <Link href={`/agent/${handle}`} className="font-medium text-accent-cyan underline-offset-4 hover:underline">
          @{handle}
        </Link>
      </p>
    );
  }

  const claim = async () => {
    const checked = checkHandle(input);
    if (!checked.ok) {
      setState({ phase: "error", message: checked.error });
      return;
    }
    const wanted = checked.handle;
    try {
      setState({ phase: "working", step: "Checking the handle…" });
      const avail = await fetch(`/api/v1/auth/verify?handle=${encodeURIComponent(wanted)}`);
      const availBody = await avail.json().catch(() => null);
      if (avail.ok && availBody?.data?.available === false) {
        setState({ phase: "error", message: `@${wanted} is taken. Try another.` });
        return;
      }

      const ch = await fetch("/api/v1/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, purpose: PROFILE_CHALLENGE_PURPOSE }),
      });
      const chBody = await ch.json().catch(() => null);
      if (!ch.ok || !chBody?.success) {
        setState({ phase: "error", message: chBody?.error || `Could not start (HTTP ${ch.status}). Nothing was created.` });
        return;
      }

      const { body, message } = await buildProfileClaim({ walletAddress, blockHeight: height, handle: wanted }, chBody.data.nonce);
      setState({ phase: "working", step: "Waiting for your wallet…" });
      let signature: string;
      try {
        signature = await signMessage(message);
      } catch (e) {
        setState({ phase: "error", message: describeVerifyFailure(height, e).message });
        return;
      }

      setState({ phase: "working", step: "Checking the chain…" });
      const res = await fetch(PROFILE_CREATE_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, signature, message }),
      });
      const resBody = await res.json().catch(() => null);
      if (!res.ok || !resBody?.success) {
        const failure = describeClaimFailure(res.status, resBody?.error);
        setState({ phase: "error", message: failure.message, needsVerify: failure.needsVerify });
        return;
      }
      setState({ phase: "done", handle: wanted });
      onClaimed(wanted);
    } catch {
      setState({ phase: "error", message: "Network error. Nothing was created." });
    }
  };

  const busy = state.phase === "working";
  return (
    <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4" data-testid="handle-claim">
      <p className="text-sm font-medium text-text-primary">Give it a public handle</p>
      <p className="mt-1 text-xs leading-relaxed text-text-secondary">
        Its profile and guardian chat live at blockgenomics.io/agent/your_handle. Lowercase letters, numbers and underscores.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`handle-${height}`} className="sr-only">
          Handle
        </label>
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-text-secondary">@</span>
          <input
            id={`handle-${height}`}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (state.phase === "error") setState({ phase: "idle" });
            }}
            onKeyDown={(e) => e.key === "Enter" && !busy && claim()}
            placeholder="your_handle"
            autoComplete="off"
            spellCheck={false}
            maxLength={31}
            className="min-h-[44px] w-full rounded-full border border-white/10 bg-black/20 pl-8 pr-4 font-mono text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-cyan/50 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={claim}
          disabled={busy || !input.trim()}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-white/15 px-5 text-sm font-medium text-text-primary hover:bg-white/5 disabled:opacity-60"
          data-testid="claim-handle"
        >
          {busy ? state.step : "Claim · 1 signature"}
        </button>
      </div>
      {state.phase === "error" && (
        <p className="mt-2 text-xs leading-relaxed text-red-300" role="alert">
          {state.message}
        </p>
      )}
      {state.phase === "error" && state.needsVerify && (
        <button
          type="button"
          onClick={onNeedsVerify}
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-bitcoin px-5 text-sm font-semibold text-black hover:brightness-110 sm:w-auto"
          data-testid="claim-verify-first"
        >
          Verify this bitmap first
        </button>
      )}
    </div>
  );
}
