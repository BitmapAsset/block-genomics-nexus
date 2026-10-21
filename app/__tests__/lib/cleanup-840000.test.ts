/**
 * The 840000 seed-data cleanup script (app/scripts/cleanup-840000*.ts) is not
 * run against production; Gary decides. This proves, on the in-memory Prisma
 * stand-in, that the dry run writes nothing, apply changes only the planned
 * rows, restore puts them back, and the script refuses when the block carries
 * anything it did not plan for.
 */

import { createMemoryPrisma } from '../helpers/memory-prisma';
import {
  HEIGHT,
  TEST_WALLET,
  applyCleanup,
  describePlan,
  refusals,
  restoreFromBackup,
  takeBackup,
} from '../../scripts/cleanup-840000-core';

/* eslint-disable @typescript-eslint/no-explicit-any */

const OTHER = 'bc1pother000000000000000000000000000000000000000000000000000';

async function seed() {
  const db = createMemoryPrisma();
  await db.user.create({ data: { walletAddress: TEST_WALLET, handle: 'elonmusk', anchorBlock: 745506 } });
  await db.block.create({ data: { height: HEIGHT, ownerAddress: TEST_WALLET, inscriptionId: null, label: '4th Halving Block' } });
  await db.block.create({ data: { height: 745506, ownerAddress: TEST_WALLET, inscriptionId: 'x' } });
  for (const i of [0, 1, 2]) await db.parcel.create({ data: { blockHeight: HEIGHT, txIndex: i, ownerAddress: TEST_WALLET } });
  await db.parcel.create({ data: { blockHeight: 745506, txIndex: 0, ownerAddress: TEST_WALLET } });
  await db.estate.create({
    data: { id: 'est1', name: "Gravity's Domain", ownerAddress: TEST_WALLET, blockHeight: HEIGHT, parcelIndices: '[0,1,2]', glowColor: '#FFD700', createdAt: new Date('2026-02-13T11:12:55Z') },
  });
  await db.delegationListing.create({
    data: { id: 'lst1', blockHeight: HEIGHT, ownerAddress: TEST_WALLET, tier: 3, price30d: 50000, price365d: 500000, active: true },
  });
  await db.chatMessage.create({ data: { id: 'm1', blockHeight: HEIGHT, senderAddress: TEST_WALLET, text: 'Welcome' } });
  return db;
}

const snapshot = (db: any) =>
  JSON.stringify(['user', 'block', 'parcel', 'estate', 'delegationListing', 'chatMessage'].map((m) =>
    db.__rows(m).map((r: any) => { const { updatedAt: _u, ...rest } = r; void _u; return rest; })));

describe('840000 cleanup script', () => {
  it('dry run (backup + plan) writes nothing', async () => {
    const db = await seed();
    const before = snapshot(db);
    const b = await takeBackup(db);
    expect(refusals(b)).toEqual([]);
    expect(describePlan(b).join('\n')).toMatch(/Parcels on 840000 owned by test wallet: 3/);
    expect(snapshot(db)).toBe(before);
  });

  it('apply changes only the planned rows, and restore undoes it', async () => {
    const db = await seed();
    const before = snapshot(db);
    const b = await takeBackup(db);
    await applyCleanup(db, b);

    expect((await db.block.findUnique({ where: { height: HEIGHT } })).ownerAddress).toBeNull();
    expect(await db.parcel.count({ where: { blockHeight: HEIGHT, ownerAddress: TEST_WALLET } })).toBe(0);
    expect(await db.estate.count({ where: { blockHeight: HEIGHT } })).toBe(0);
    expect((await db.delegationListing.findUnique({ where: { id: 'lst1' } })).active).toBe(false);
    // Untouched: the user, the other block and its parcel, chat history.
    expect((await db.user.findUnique({ where: { walletAddress: TEST_WALLET } })).handle).toBe('elonmusk');
    expect((await db.block.findUnique({ where: { height: 745506 } })).ownerAddress).toBe(TEST_WALLET);
    expect(await db.parcel.count({ where: { blockHeight: 745506, ownerAddress: TEST_WALLET } })).toBe(1);
    expect(await db.chatMessage.count({ where: { blockHeight: HEIGHT } })).toBe(1);

    await restoreFromBackup(db, b);
    expect(JSON.parse(snapshot(db))).toEqual(JSON.parse(before)); // same rows back
  });

  it('refuses when the block already moved on, or carries agents', async () => {
    const db = await seed();
    await db.bitmapAgent.create({ data: { id: 'a1', blockHeight: HEIGHT, walletAddress: TEST_WALLET } });
    const b = await takeBackup(db);
    expect(refusals(b).join(' ')).toMatch(/1 agents on block 840000/);
    await expect(applyCleanup(db, b)).rejects.toThrow(/Refusing/);

    const db2 = await seed();
    await db2.block.update({ where: { height: HEIGHT }, data: { ownerAddress: OTHER } });
    expect(refusals(await takeBackup(db2)).join(' ')).toMatch(/not the test wallet/);
  });
});
