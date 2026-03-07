// ============================================================================
// SQLite Database Layer (better-sqlite3)
// ============================================================================
// Persistent storage for agents and challenges.
// Uses WAL mode for concurrent reads during API requests.
// ============================================================================

import Database from 'better-sqlite3';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AgentRecord, ChallengeRecord, TrustFactors } from '../types.js';

// ---------------------------------------------------------------------------
// Database path
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH ?? join(DB_DIR, 'block-genomics.db');

// Ensure data directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

// ---------------------------------------------------------------------------
// Initialize database
// ---------------------------------------------------------------------------

const db = new Database(DB_PATH);

// Performance settings for local API server
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB
db.pragma('foreign_keys = ON');
db.pragma('temp_store = MEMORY');

// ---------------------------------------------------------------------------
// Schema creation
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    wallet_address      TEXT NOT NULL,
    block_height        INTEGER NOT NULL,
    genome              TEXT NOT NULL,
    genome_version      INTEGER NOT NULL DEFAULT 1,
    trust_score         REAL NOT NULL DEFAULT 0,
    trust_factors       TEXT NOT NULL DEFAULT '{}',
    verified_at         TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    signature_type      TEXT NOT NULL DEFAULT 'legacy',
    bitmap_inscription_id TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_wallet_block 
    ON agents(wallet_address, block_height);
  CREATE INDEX IF NOT EXISTS idx_agents_block_height 
    ON agents(block_height);
  CREATE INDEX IF NOT EXISTS idx_agents_name 
    ON agents(name);
  CREATE INDEX IF NOT EXISTS idx_agents_genome 
    ON agents(genome);

  CREATE TABLE IF NOT EXISTS challenges (
    id              TEXT PRIMARY KEY,
    nonce           TEXT NOT NULL,
    message         TEXT NOT NULL,
    block_height    INTEGER NOT NULL,
    agent_name      TEXT NOT NULL,
    wallet_address  TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    used            INTEGER NOT NULL DEFAULT 0,
    ip              TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_challenges_expires 
    ON challenges(expires_at);
`);

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const insertAgent = db.prepare(`
  INSERT INTO agents (id, name, wallet_address, block_height, genome, genome_version,
    trust_score, trust_factors, verified_at, created_at, updated_at, signature_type, bitmap_inscription_id)
  VALUES (@id, @name, @walletAddress, @blockHeight, @genome, @genomeVersion,
    @trustScore, @trustFactors, @verifiedAt, @createdAt, @updatedAt, @signatureType, @bitmapInscriptionId)
`);

const updateAgent = db.prepare(`
  UPDATE agents SET
    name = @name,
    genome = @genome,
    genome_version = @genomeVersion,
    trust_score = @trustScore,
    trust_factors = @trustFactors,
    verified_at = @verifiedAt,
    updated_at = @updatedAt,
    signature_type = @signatureType,
    bitmap_inscription_id = @bitmapInscriptionId
  WHERE id = @id
`);

const getAgentById = db.prepare(`SELECT * FROM agents WHERE id = ?`);
const getAgentByWalletBlock = db.prepare(
  `SELECT * FROM agents WHERE wallet_address = ? AND block_height = ?`,
);
const getAllAgents = db.prepare(`SELECT * FROM agents ORDER BY created_at DESC`);
const searchAgents = db.prepare(
  `SELECT * FROM agents WHERE name LIKE ? OR CAST(block_height AS TEXT) = ? OR genome LIKE ? LIMIT ?`,
);
const getAgentsByBlock = db.prepare(`SELECT * FROM agents WHERE block_height = ?`);

const insertChallenge = db.prepare(`
  INSERT INTO challenges (id, nonce, message, block_height, agent_name, wallet_address,
    created_at, expires_at, used, ip)
  VALUES (@id, @nonce, @message, @blockHeight, @agentName, @walletAddress,
    @createdAt, @expiresAt, @used, @ip)
`);

const getChallengeById = db.prepare(`SELECT * FROM challenges WHERE id = ?`);
const markChallengeUsed = db.prepare(`UPDATE challenges SET used = 1 WHERE id = ?`);
const deleteExpiredChallenges = db.prepare(
  `DELETE FROM challenges WHERE expires_at <= ?`,
);

// ---------------------------------------------------------------------------
// Agent DAO
// ---------------------------------------------------------------------------

function rowToAgent(row: any): AgentRecord {
  return {
    id: row.id,
    name: row.name,
    walletAddress: row.wallet_address,
    blockHeight: row.block_height,
    genome: row.genome,
    genomeVersion: row.genome_version,
    trustScore: row.trust_score,
    trustFactors: JSON.parse(row.trust_factors) as TrustFactors,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    signatureType: row.signature_type,
    bitmapInscriptionId: row.bitmap_inscription_id,
  };
}

export const agentDAO = {
  create(agent: AgentRecord): void {
    insertAgent.run({
      id: agent.id,
      name: agent.name,
      walletAddress: agent.walletAddress,
      blockHeight: agent.blockHeight,
      genome: agent.genome,
      genomeVersion: agent.genomeVersion,
      trustScore: agent.trustScore,
      trustFactors: JSON.stringify(agent.trustFactors),
      verifiedAt: agent.verifiedAt,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      signatureType: agent.signatureType,
      bitmapInscriptionId: agent.bitmapInscriptionId,
    });
  },

  update(agent: AgentRecord): void {
    updateAgent.run({
      id: agent.id,
      name: agent.name,
      genome: agent.genome,
      genomeVersion: agent.genomeVersion,
      trustScore: agent.trustScore,
      trustFactors: JSON.stringify(agent.trustFactors),
      verifiedAt: agent.verifiedAt,
      updatedAt: agent.updatedAt,
      signatureType: agent.signatureType,
      bitmapInscriptionId: agent.bitmapInscriptionId,
    });
  },

  getById(id: string): AgentRecord | null {
    const row = getAgentById.get(id);
    return row ? rowToAgent(row) : null;
  },

  getByWalletAndBlock(walletAddress: string, blockHeight: number): AgentRecord | null {
    const row = getAgentByWalletBlock.get(walletAddress, blockHeight);
    return row ? rowToAgent(row) : null;
  },

  getByBlockHeight(blockHeight: number): AgentRecord[] {
    const rows = getAgentsByBlock.all(blockHeight) as any[];
    return rows.map(rowToAgent);
  },

  getAll(): AgentRecord[] {
    const rows = getAllAgents.all() as any[];
    return rows.map(rowToAgent);
  },

  search(query: string, limit: number = 20): AgentRecord[] {
    const rows = searchAgents.all(`%${query}%`, query, `${query}%`, limit) as any[];
    return rows.map(rowToAgent);
  },

  count(): number {
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM agents`).get() as any;
    return row.cnt;
  },
};

// ---------------------------------------------------------------------------
// Challenge DAO
// ---------------------------------------------------------------------------

function rowToChallenge(row: any): ChallengeRecord {
  return {
    id: row.id,
    nonce: row.nonce,
    message: row.message,
    blockHeight: row.block_height,
    agentName: row.agent_name,
    walletAddress: row.wallet_address,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    used: !!row.used,
    ip: row.ip,
  };
}

export const challengeDAO = {
  create(challenge: ChallengeRecord): void {
    insertChallenge.run({
      id: challenge.id,
      nonce: challenge.nonce,
      message: challenge.message,
      blockHeight: challenge.blockHeight,
      agentName: challenge.agentName,
      walletAddress: challenge.walletAddress,
      createdAt: challenge.createdAt,
      expiresAt: challenge.expiresAt,
      used: challenge.used ? 1 : 0,
      ip: challenge.ip,
    });
  },

  getById(id: string): ChallengeRecord | null {
    const row = getChallengeById.get(id);
    return row ? rowToChallenge(row) : null;
  },

  markUsed(id: string): void {
    markChallengeUsed.run(id);
  },

  purgeExpired(): number {
    const result = deleteExpiredChallenges.run(new Date().toISOString());
    return result.changes;
  },
};

// ---------------------------------------------------------------------------
// Cleanup timer
// ---------------------------------------------------------------------------

const cleanupTimer = setInterval(() => {
  challengeDAO.purgeExpired();
}, 30_000);
cleanupTimer.unref();

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function getStats() {
  const agentCount = agentDAO.count();
  const challengeRow = db.prepare(`SELECT COUNT(*) as cnt FROM challenges WHERE used = 0`).get() as any;
  return {
    agents: agentCount,
    activeChallenges: challengeRow.cnt,
    dbPath: DB_PATH,
  };
}

export { db };
export default db;
