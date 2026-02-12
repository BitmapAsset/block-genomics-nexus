import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧬 Seeding Block Genomics Nexus database...\n');

  // Clear all tables
  await prisma.chatMessage.deleteMany();
  await prisma.delegation.deleteMany();
  await prisma.delegationListing.deleteMany();
  await prisma.estate.deleteMany();
  await prisma.parcel.deleteMany();
  await prisma.block.deleteMany();
  await prisma.user.deleteMany();

  // Users
  const gravity = await prisma.user.create({
    data: {
      walletAddress: 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978',
      handle: 'Gravity',
      tier: 1,
      verified: true,
    },
  });

  const alice = await prisma.user.create({
    data: {
      walletAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      handle: 'Alice',
      tier: 2,
      verified: true,
    },
  });

  const bob = await prisma.user.create({
    data: {
      walletAddress: 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l',
      handle: 'Bob',
      tier: 3,
      verified: true,
    },
  });

  console.log('  👤 Created 3 users');

  // Blocks
  const block0 = await prisma.block.create({
    data: {
      height: 0,
      hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
      ownerAddress: gravity.walletAddress,
      label: 'Genesis Block',
      groundColor: '#1a1a2e',
      skyColor: '#0f0f23',
    },
  });

  const block840k = await prisma.block.create({
    data: {
      height: 840000,
      hash: '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5',
      ownerAddress: gravity.walletAddress,
      label: '4th Halving Block',
      groundColor: '#FFD700',
      skyColor: '#4B0082',
    },
  });

  const block100k = await prisma.block.create({
    data: {
      height: 100000,
      hash: '000000000003ba27aa200b1cecaad478d2b00432346c3f1f3986da1afd33e506',
      ownerAddress: alice.walletAddress,
      label: 'Milestone 100k',
    },
  });

  console.log('  ⛏️  Created 3 blocks');

  // Parcels
  for (let i = 0; i < 5; i++) {
    await prisma.parcel.create({
      data: {
        blockHeight: 840000,
        txIndex: i,
        ownerAddress: i < 3 ? gravity.walletAddress : alice.walletAddress,
        customColor: i === 0 ? '#FF6B6B' : i === 1 ? '#4ECDC4' : null,
        pattern: i === 0 ? 'checkerboard' : null,
        emissive: i === 0,
      },
    });
  }
  console.log('  📦 Created 5 parcels on block 840000');

  // Delegation Listing
  const listing = await prisma.delegationListing.create({
    data: {
      blockHeight: 840000,
      ownerAddress: gravity.walletAddress,
      tier: 3,
      spotsTotal: 10,
      spotsUsed: 1,
      price30d: 50000,    // 50k sats/month
      price365d: 500000,  // 500k sats/year
    },
  });

  // Delegation
  await prisma.delegation.create({
    data: {
      blockHeight: 840000,
      ownerAddress: gravity.walletAddress,
      delegateeAddress: bob.walletAddress,
      tier: 3,
      durationDays: 30,
      priceSats: 50000,
      protocolFeeSats: 1500,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      txId: 'mock_tx_abc123',
    },
  });
  console.log('  🤝 Created listing + delegation');

  // Chat Messages
  const msgs = [
    { sender: gravity, text: 'Welcome to the Genesis Block! 🧬' },
    { sender: alice, text: 'This is amazing, first time here!' },
    { sender: bob, text: 'gm frens 🐸' },
  ];
  for (const m of msgs) {
    await prisma.chatMessage.create({
      data: {
        blockHeight: 840000,
        senderAddress: m.sender.walletAddress,
        senderHandle: m.sender.handle,
        text: m.text,
        type: 'text',
      },
    });
  }
  console.log('  💬 Created 3 chat messages');

  // Estate
  await prisma.estate.create({
    data: {
      name: "Gravity's Domain",
      ownerAddress: gravity.walletAddress,
      blockHeight: 840000,
      parcelIndices: JSON.stringify([0, 1, 2]),
      glowColor: '#FFD700',
    },
  });
  console.log('  🏰 Created 1 estate');

  console.log('\n🎉 Seed complete!\n');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
