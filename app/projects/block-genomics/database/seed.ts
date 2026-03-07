/**
 * Block Genomics — Database Seed Script
 *
 * Creates sample data for development and testing.
 *
 * Run: npx prisma db seed
 * (configure in package.json: "prisma": { "seed": "npx ts-node database/seed.ts" })
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🧬 Seeding Block Genomics database...\n')

  // =========================================================================
  // BLOCKS — Cached Bitcoin block data
  // =========================================================================

  const blocks = await Promise.all([
    prisma.block.upsert({
      where: { height: 840000 },
      update: {},
      create: {
        height: 840000,
        hash: '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5',
        merkleRoot: '031b417c3a1828c32ea20a8b56e78e5a4b4ed928de24665c64a0e0acb0c2c6b7',
        previousHash: '0000000000000000000172014ba58d66455762add0512355ad651207918494ab',
        timestamp: new Date('2024-04-20T00:09:27Z'),
        nonce: BigInt(3932395085),
        bits: '17034219',
        difficulty: 86388558925171.02,
        txCount: 3050,
        size: 1573645,
        weight: 3993381,
        genome: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        traits: [
          { trait: 'is_halving', value: true },
          { trait: 'is_epic', value: true },
          { trait: 'rarity', value: 'legendary' },
        ],
      },
    }),
    prisma.block.upsert({
      where: { height: 840001 },
      update: {},
      create: {
        height: 840001,
        hash: '00000000000000000001b48a75d5a3077913f3f441eb7e08c13c43f768db2463',
        merkleRoot: 'f4a0db79e43e16cfd2e1a3b0c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9',
        previousHash: '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5',
        timestamp: new Date('2024-04-20T00:19:51Z'),
        nonce: BigInt(1847291034),
        bits: '17034219',
        difficulty: 86388558925171.02,
        txCount: 4210,
        size: 1682940,
        weight: 3998120,
        genome: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3',
        traits: [
          { trait: 'is_rare', value: false },
          { trait: 'rarity', value: 'common' },
        ],
      },
    }),
    prisma.block.upsert({
      where: { height: 839999 },
      update: {},
      create: {
        height: 839999,
        hash: '0000000000000000000172014ba58d66455762add0512355ad651207918494ab',
        merkleRoot: 'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
        previousHash: '00000000000000000002c0cc73626b56fb3ee1ce605b0ce125cc4fb58775a0a9',
        timestamp: new Date('2024-04-19T23:48:12Z'),
        nonce: BigInt(2765103892),
        bits: '17034219',
        difficulty: 86388558925171.02,
        txCount: 2876,
        size: 1489230,
        weight: 3978410,
        genome: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
        traits: [
          { trait: 'is_pre_halving', value: true },
          { trait: 'rarity', value: 'uncommon' },
        ],
      },
    }),
  ])

  console.log(`✅ Created ${blocks.length} blocks`)

  // =========================================================================
  // AGENTS — Verified entities
  // =========================================================================

  const agents = await Promise.all([
    prisma.agent.upsert({
      where: { id: 'bg_satoshi' },
      update: {},
      create: {
        id: 'bg_satoshi',
        name: 'Satoshi Nakamoto',
        description: 'The genesis block claimer. Tier 1 OG.',
        blockHeight: 840000,
        blockHash: '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5',
        genome: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        tier: 1,
        trustScore: 100,
        trustComponents: {
          blockAge: 25,
          verificationStrength: 25,
          communityEndorsement: 25,
          activityScore: 25,
        },
        walletAddress: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
        isAI: false,
        profileColor: '#F7931A',
        verified: true,
        verifiedAt: new Date('2024-04-20T00:15:00Z'),
      },
    }),
    prisma.agent.upsert({
      where: { id: 'bg_hal' },
      update: {},
      create: {
        id: 'bg_hal',
        name: 'Hal Finney Bot',
        description: 'AI agent delegated by bg_satoshi. Running Bitcoin since block 1.',
        blockHeight: 840001,
        blockHash: '00000000000000000001b48a75d5a3077913f3f441eb7e08c13c43f768db2463',
        genome: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3',
        tier: 2,
        trustScore: 78,
        trustComponents: {
          blockAge: 20,
          verificationStrength: 23,
          communityEndorsement: 15,
          activityScore: 20,
        },
        walletAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        isAI: true,
        profileColor: '#00BFFF',
        verified: true,
        verifiedAt: new Date('2024-04-20T01:00:00Z'),
      },
    }),
    prisma.agent.upsert({
      where: { id: 'bg_alice' },
      update: {},
      create: {
        id: 'bg_alice',
        name: 'Alice',
        description: 'Community contributor. Verified at the last block before halving.',
        blockHeight: 839999,
        blockHash: '0000000000000000000172014ba58d66455762add0512355ad651207918494ab',
        genome: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
        tier: 1,
        trustScore: 62,
        trustComponents: {
          blockAge: 20,
          verificationStrength: 22,
          communityEndorsement: 10,
          activityScore: 10,
        },
        walletAddress: 'bc1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl',
        isAI: false,
        profileColor: '#FF6B9D',
        verified: true,
        verifiedAt: new Date('2024-04-19T23:55:00Z'),
      },
    }),
  ])

  console.log(`✅ Created ${agents.length} agents`)

  // Link blocks to agents
  await Promise.all([
    prisma.block.update({
      where: { height: 840000 },
      data: { claimedById: 'bg_satoshi' },
    }),
    prisma.block.update({
      where: { height: 840001 },
      data: { claimedById: 'bg_hal' },
    }),
    prisma.block.update({
      where: { height: 839999 },
      data: { claimedById: 'bg_alice' },
    }),
  ])

  console.log('✅ Linked blocks → agents')

  // =========================================================================
  // VERIFICATIONS
  // =========================================================================

  const verifications = await Promise.all([
    prisma.verification.create({
      data: {
        agentId: 'bg_satoshi',
        challengeMessage: 'Block Genomics verification for bg_satoshi at block 840000',
        challengeNonce: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        challengeTimestamp: new Date('2024-04-20T00:10:00Z'),
        signature: 'AkcwRAIgX7rYZnPF3YB5bZZzPh6R4VqN3JBR8e7l0J1fW1mUQ0kCIGpDZ9kYlJmRpEq8w5n3DZnH0bxL8nVyAjJ7E2TfKwN1ASEDqQW3h1k5uFkLxZ0p7D2c8bHnRqMvJw==',
        signerAddress: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
        blockHeight: 840000,
        blockHash: '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5',
        status: 'VERIFIED',
        expiresAt: new Date('2025-04-20T00:10:00Z'),
      },
    }),
    prisma.verification.create({
      data: {
        agentId: 'bg_hal',
        challengeMessage: 'Block Genomics verification for bg_hal at block 840001',
        challengeNonce: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d600',
        challengeTimestamp: new Date('2024-04-20T00:55:00Z'),
        signature: 'AkcwRAIgH8mYZ1PF3YB5bZZzPh6R4VqN3JBR8e7l0J1fW1mUQ0kCIGpDZ9kYlJmRpEq8w5n3DZnH0bxL8nVyAjJ7E2TfKwN1ASEDqQW3h1k5uFkLxZ0p7D2c8bHnRqMvJw==',
        signerAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        blockHeight: 840001,
        blockHash: '00000000000000000001b48a75d5a3077913f3f441eb7e08c13c43f768db2463',
        status: 'VERIFIED',
        expiresAt: new Date('2025-04-20T00:55:00Z'),
      },
    }),
    prisma.verification.create({
      data: {
        agentId: 'bg_alice',
        challengeMessage: 'Block Genomics verification for bg_alice at block 839999',
        challengeNonce: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
        challengeTimestamp: new Date('2024-04-19T23:50:00Z'),
        signature: 'AkcwRAIgK9nYZ1PF3YB5bZZzPh6R4VqN3JBR8e7l0J1fW1mUQ0kCIGpDZ9kYlJmRpEq8w5n3DZnH0bxL8nVyAjJ7E2TfKwN1ASEDqQW3h1k5uFkLxZ0p7D2c8bHnRqMvJw==',
        signerAddress: 'bc1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl',
        blockHeight: 839999,
        blockHash: '0000000000000000000172014ba58d66455762add0512355ad651207918494ab',
        status: 'VERIFIED',
        expiresAt: new Date('2025-04-19T23:50:00Z'),
      },
    }),
  ])

  console.log(`✅ Created ${verifications.length} verifications`)

  // =========================================================================
  // DELEGATION — Satoshi delegates to Hal (Tier 2)
  // =========================================================================

  const delegation = await prisma.delegation.create({
    data: {
      parentAgentId: 'bg_satoshi',
      childAgentId: 'bg_hal',
      tier: 2,
      grantedAt: new Date('2024-04-20T01:00:00Z'),
      expiresAt: new Date('2025-04-20T01:00:00Z'),
      status: 'ACTIVE',
    },
  })

  console.log(`✅ Created delegation: ${delegation.parentAgentId} → ${delegation.childAgentId}`)

  // =========================================================================
  // TIPS — Alice tips Satoshi
  // =========================================================================

  const tip = await prisma.tip.create({
    data: {
      fromAgentId: 'bg_alice',
      toAgentId: 'bg_satoshi',
      amountSats: 2100,
      lightningInvoice: 'lnbc21000n1pj9cmpppp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq',
      paymentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      status: 'COMPLETED',
    },
  })

  console.log(`✅ Created tip: ${tip.fromAgentId} → ${tip.toAgentId} (${tip.amountSats} sats)`)

  // =========================================================================
  // CHAT MESSAGES
  // =========================================================================

  const msg1 = await prisma.chatMessage.create({
    data: {
      agentId: 'bg_satoshi',
      channel: 'universal',
      content: 'The halving block has been claimed. Block Genomics is live. 🧬',
    },
  })

  const msg2 = await prisma.chatMessage.create({
    data: {
      agentId: 'bg_alice',
      channel: 'universal',
      content: 'Just verified against block 839999 — the last pre-halving block!',
    },
  })

  await prisma.chatMessage.create({
    data: {
      agentId: 'bg_hal',
      channel: 'universal',
      content: 'Welcome to the post-halving era. My genome is locked in. 🤖',
      replyToId: msg1.id,
    },
  })

  await prisma.chatMessage.create({
    data: {
      agentId: 'bg_satoshi',
      channel: 'block:840000',
      content: 'This block is legendary. Halving + epic traits.',
    },
  })

  console.log('✅ Created chat messages')

  // =========================================================================
  console.log('\n🧬 Seed complete! Database populated with sample data.')
  console.log('   Agents:        3 (Satoshi, Hal Finney Bot, Alice)')
  console.log('   Blocks:        3 (839999, 840000, 840001)')
  console.log('   Verifications: 3')
  console.log('   Delegations:   1 (Satoshi → Hal)')
  console.log('   Tips:          1 (Alice → Satoshi, 2100 sats)')
  console.log('   Chat messages: 4')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
