import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

function generateGenome(blockHash: string): { sequence: string; integrity: number; complexity: number; signature: string } {
  const sequence = createHash('sha256').update(`block-genomics:${blockHash}`).digest('hex');
  const integrity = parseInt(sequence.slice(0, 8), 16) / 0xffffffff;
  const complexity = parseInt(sequence.slice(8, 16), 16) / 0xffffffff;
  const signature = createHash('sha256').update(`sig:${sequence}`).digest('hex');
  return { sequence, integrity, complexity, signature };
}

async function main() {
  console.log('🧬 Seeding Block Genomics database...\n');

  // Clear in order (respect FK constraints)
  await prisma.verification.deleteMany();
  await prisma.genome.deleteMany();
  await prisma.challenge.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.block.deleteMany();

  // Create agents first (Genome references Agent via generatedBy)
  const agents = [
    {
      id: 'bg_genesis',
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      displayName: 'Genesis Agent',
      trustScore: 100,
      totalVerifications: 1,
      successfulVerifications: 1,
      failedVerifications: 0,
      rank: 1,
      badges: ['genesis', 'pioneer', 'verified'],
      lastActiveAt: new Date(),
    },
    {
      id: 'bg_pepe',
      address: `bc1q${randomBytes(20).toString('hex').slice(0, 38)}`,
      displayName: 'Pepe 🐸',
      trustScore: 85,
      totalVerifications: 3,
      successfulVerifications: 3,
      failedVerifications: 0,
      rank: 2,
      badges: ['verified', 'ai-agent', 'builder'],
      lastActiveAt: new Date(),
    },
    {
      id: 'bg_demo',
      address: `bc1q${randomBytes(20).toString('hex').slice(0, 38)}`,
      displayName: 'Demo Explorer',
      trustScore: 42,
      totalVerifications: 2,
      successfulVerifications: 1,
      failedVerifications: 1,
      rank: 3,
      badges: ['verified'],
      lastActiveAt: new Date(),
    },
  ];

  for (const agent of agents) {
    await prisma.agent.create({ data: agent });
    console.log(`  🤖 Agent "${agent.displayName}" (trust: ${agent.trustScore})`);
  }

  // Real Bitcoin blocks
  const blocks = [
    {
      height: 0,
      hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
      previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
      merkleRoot: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
      timestamp: 1231006505,
      nonce: 2083236893,
      difficulty: 1,
      txCount: 1,
      size: 285,
      weight: 816,
      version: 1,
      verificationStatus: 'verified',
      verifiedAt: new Date(),
    },
    {
      height: 100000,
      hash: '000000000003ba27aa200b1cecaad478d2b00432346c3f1f3986da1afd33e506',
      previousHash: '000000000002d01c1fccc21636b607dfd930d31d01c3a62104612a1719011250',
      merkleRoot: 'f3e94742aca4b5ef85488dc37c06c3282295ffec960994b2c0d5ac2a25a95766',
      timestamp: 1293623863,
      nonce: 274148111,
      difficulty: 14484,
      txCount: 4,
      size: 957,
      weight: 3828,
      version: 1,
      verificationStatus: 'verified',
      verifiedAt: new Date(),
    },
    {
      height: 500000,
      hash: '00000000000000000024fb37364cbf81fd49cc2d51c09c75c35433c3a1945d04',
      previousHash: '0000000000000000001c8018d9cb3b742ef25114f27563e3fc4a1902167f9893',
      merkleRoot: '0ba0e3c27e5b3a12a3c18aece22afaf65c4d09a74cfb0e0f3a5cc2ef2ef7c262',
      timestamp: 1513622125,
      nonce: 1560058197,
      difficulty: 1873105475222,
      txCount: 2018,
      size: 1000000,
      weight: 3999556,
      version: 536870912,
      verificationStatus: 'unverified',
    },
    {
      height: 840000,
      hash: '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5',
      previousHash: '00000000000000000002229b3c26fe58dc9d7b37a0e25e4a4039552db1e52a95',
      merkleRoot: 'aaeb33d22f6785efd7670a77e10e33b0a34f2370cafb2ccc92eef1e53b72218e',
      timestamp: 1713571767,
      nonce: 2147483647, // capped for INT4
      difficulty: 86388558925171,
      txCount: 3050,
      size: 1579645,
      weight: 3993429,
      version: 704643072,
      verificationStatus: 'unverified',
    },
  ];

  for (const block of blocks) {
    await prisma.block.create({ data: block });
    console.log(`  ⛏️  Block #${block.height} (${block.hash.slice(0, 16)}...)`);
  }

  // Create genomes for verified blocks
  for (const block of blocks.filter(b => b.verificationStatus === 'verified')) {
    const g = generateGenome(block.hash);
    const agentId = block.height === 0 ? 'bg_genesis' : 'bg_pepe';
    await prisma.genome.create({
      data: {
        blockHeight: block.height,
        blockHash: block.hash,
        sequence: g.sequence,
        integrity: g.integrity,
        complexity: g.complexity,
        generatedBy: agentId,
        signature: g.signature,
      },
    });
    console.log(`  🧬 Genome for block #${block.height}: ${g.sequence.slice(0, 16)}...`);
  }

  // Create a sample verification
  await prisma.verification.create({
    data: {
      blockHeight: 0,
      blockHash: blocks[0].hash,
      agentId: 'bg_genesis',
      challengeId: 'challenge_genesis',
      status: 'verified',
      completedAt: new Date(),
      duration: 1200,
      scoreAwarded: 25,
    },
  });
  console.log(`  ✅ Sample verification created`);

  console.log('\n🎉 Seed complete! Database ready.\n');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
