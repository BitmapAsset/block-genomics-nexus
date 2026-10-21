/**
 * Block 840000 seed-data cleanup: the logic, separate from the CLI so a test
 * can drive it against the in-memory Prisma stand-in.
 *
 * What it does, in one transaction, guarded by the backup taken first:
 *   - Block 840000: ownerAddress → null (the seed recorded our test wallet; the
 *     chain says another wallet holds the deed; no inscription id on file).
 *   - Parcels on 840000 recorded to the test wallet: ownerAddress → null.
 *   - Estates on 840000 owned by the test wallet: deleted (full rows backed up).
 *   - Delegation listings on 840000 owned by the test wallet: active → false.
 *
 * What it never touches: the test wallet's User row and handle, its other
 * blocks, its block profiles, chat history on 840000. It refuses to run when
 * anything it did not plan for hangs off the block (agents, guardians,
 * experiences, VPS links, active delegations), because those need the full
 * ownership-sync release, not this script.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export const HEIGHT = 840000;
/** The wallet seeded on 2026-02-13 by prisma/seed.ts (handle today: elonmusk). */
export const TEST_WALLET = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';

type Db = any;

export interface Backup {
  takenAt: string;
  height: number;
  testWallet: string;
  block: Record<string, unknown> | null;
  parcels: Record<string, unknown>[];
  estates: Record<string, unknown>[];
  listings: Record<string, unknown>[];
  /** Read-only context: counted so the script can refuse; never written. */
  blockers: Record<string, number>;
  /** Read-only context: shown so Gary sees what stays. */
  untouched: { blockProfilesOnBlock: number; chatMessagesOnBlock: number; testUserAnchorBlock: number | null };
}

export async function takeBackup(db: Db, now = new Date()): Promise<Backup> {
  const where = { blockHeight: HEIGHT, ownerAddress: TEST_WALLET };
  const [block, parcels, estates, listings] = await Promise.all([
    db.block.findUnique({ where: { height: HEIGHT } }),
    db.parcel.findMany({ where }),
    db.estate.findMany({ where }),
    db.delegationListing.findMany({ where }),
  ]);
  const [agents, vpsLinks, experiences, guardians, activeDelegations] = await Promise.all([
    db.bitmapAgent.count({ where: { blockHeight: HEIGHT } }),
    db.vPSLink.count({ where: { blockHeight: HEIGHT } }),
    db.experience.count({ where: { blockHeight: HEIGHT } }),
    db.guardianAgent.count({ where: { blockHeight: HEIGHT } }),
    db.delegation.count({ where: { blockHeight: HEIGHT, active: true } }),
  ]);
  const [blockProfilesOnBlock, chatMessagesOnBlock, testUser] = await Promise.all([
    db.blockProfile.count({ where: { blockHeight: HEIGHT } }),
    db.chatMessage.count({ where: { blockHeight: HEIGHT } }),
    db.user.findUnique({ where: { walletAddress: TEST_WALLET } }),
  ]);
  // JSON round-trip: the backup is a snapshot (dates become ISO strings, the
  // same shape the CLI writes to disk), never a live reference to a row.
  return JSON.parse(JSON.stringify({
    takenAt: now.toISOString(),
    height: HEIGHT,
    testWallet: TEST_WALLET,
    block,
    parcels,
    estates,
    listings,
    blockers: { agents, vpsLinks, experiences, guardians, activeDelegations },
    untouched: {
      blockProfilesOnBlock,
      chatMessagesOnBlock,
      testUserAnchorBlock: testUser?.anchorBlock ?? null,
    },
  })) as Backup;
}

/** Reasons the cleanup must not run; empty means safe to apply. */
export function refusals(b: Backup): string[] {
  const out: string[] = [];
  if (!b.block) out.push(`Block ${HEIGHT} does not exist`);
  else {
    if (b.block.ownerAddress !== TEST_WALLET) out.push(`Block ${HEIGHT} owner is not the test wallet (already changed?)`);
    if (b.block.inscriptionId != null) out.push(`Block ${HEIGHT} now has an inscription id: let ownership sync handle it`);
  }
  for (const [k, n] of Object.entries(b.blockers)) {
    if (n > 0) out.push(`${n} ${k} on block ${HEIGHT}: needs the full ownership-sync release, not this script`);
  }
  if (b.untouched.testUserAnchorBlock === HEIGHT) out.push(`Test user is anchored to ${HEIGHT}: decide that separately`);
  return out;
}

export function describePlan(b: Backup): string[] {
  return [
    `Block ${HEIGHT}: ownerAddress ${b.block?.ownerAddress ?? 'null'} → null`,
    `Parcels on ${HEIGHT} owned by test wallet: ${b.parcels.length} → ownerAddress null (txIndex ${b.parcels.map((p) => p.txIndex).join(', ') || 'none'})`,
    `Estates on ${HEIGHT} owned by test wallet: ${b.estates.length} → deleted (${b.estates.map((e) => `${e.id} "${e.name}"`).join(', ') || 'none'})`,
    `Listings on ${HEIGHT} owned by test wallet: ${b.listings.length} → active false (${b.listings.map((l) => `${l.id} active=${l.active}`).join(', ') || 'none'})`,
    `Untouched: test User row and handle, ${b.untouched.blockProfilesOnBlock} block profile(s) on ${HEIGHT}, ${b.untouched.chatMessagesOnBlock} chat message(s) on ${HEIGHT}`,
  ];
}

/** Apply inside one transaction. Re-checks the block row first; aborts on drift. */
export async function applyCleanup(db: Db, b: Backup): Promise<void> {
  const blocked = refusals(b);
  if (blocked.length) throw new Error(`Refusing: ${blocked.join('; ')}`);
  await db.$transaction(async (tx: Db) => {
    const now = await tx.block.findUnique({ where: { height: HEIGHT } });
    if (!now || now.ownerAddress !== TEST_WALLET || now.inscriptionId != null) {
      throw new Error('Block row changed since the backup; aborting, nothing written');
    }
    await tx.parcel.updateMany({ where: { blockHeight: HEIGHT, ownerAddress: TEST_WALLET }, data: { ownerAddress: null } });
    await tx.estate.deleteMany({ where: { blockHeight: HEIGHT, ownerAddress: TEST_WALLET } });
    await tx.delegationListing.updateMany({
      where: { blockHeight: HEIGHT, ownerAddress: TEST_WALLET, active: true },
      data: { active: false },
    });
    // Owner last, mirroring ownership-sync: if anything above fails, the block
    // still reads as before.
    await tx.block.update({ where: { height: HEIGHT }, data: { ownerAddress: null } });
  });
}

/** Undo from a backup file. Restores exactly the columns the cleanup changed. */
export async function restoreFromBackup(db: Db, b: Backup): Promise<void> {
  if (b.height !== HEIGHT || b.testWallet !== TEST_WALLET || !b.block) throw new Error('Not a 840000 cleanup backup');
  await db.$transaction(async (tx: Db) => {
    await tx.block.update({ where: { height: HEIGHT }, data: { ownerAddress: b.block!.ownerAddress } });
    for (const p of b.parcels) {
      await tx.parcel.updateMany({
        where: { blockHeight: HEIGHT, txIndex: p.txIndex },
        data: { ownerAddress: p.ownerAddress },
      });
    }
    for (const e of b.estates) {
      const exists = await tx.estate.findUnique({ where: { id: e.id } });
      if (!exists) {
        await tx.estate.create({
          data: {
            id: e.id,
            name: e.name,
            ownerAddress: e.ownerAddress,
            blockHeight: e.blockHeight,
            parcelIndices: e.parcelIndices,
            glowColor: e.glowColor ?? null,
            createdAt: new Date(e.createdAt as string),
          },
        });
      }
    }
    for (const l of b.listings) {
      await tx.delegationListing.updateMany({ where: { id: l.id }, data: { active: l.active } });
    }
  });
}
