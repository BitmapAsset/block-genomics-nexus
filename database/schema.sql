-- Block Genomics MVP Database Schema
-- Created: 2026-02-05
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. BLOCKS - Registered Bitcoin blocks
-- ============================================
CREATE TABLE IF NOT EXISTS blocks (
    id SERIAL PRIMARY KEY,
    block_height INTEGER UNIQUE NOT NULL,
    owner_address TEXT NOT NULL,
    bitmap_inscription_id TEXT,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_blocks_owner ON blocks(owner_address);
CREATE INDEX idx_blocks_height ON blocks(block_height);

-- ============================================
-- 3. GENOMES - Unique genome fingerprints
-- (Created before agents due to FK dependency)
-- ============================================
CREATE TABLE IF NOT EXISTS genomes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    genome_hash TEXT UNIQUE NOT NULL,
    block_id INTEGER REFERENCES blocks(id) ON DELETE SET NULL,
    signature TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    visual_data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_genomes_hash ON genomes(genome_hash);
CREATE INDEX idx_genomes_block ON genomes(block_id);

-- ============================================
-- 2. AGENTS - Verified AI agents
-- ============================================
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    owner_address TEXT NOT NULL,
    block_id INTEGER REFERENCES blocks(id) ON DELETE SET NULL,
    genome_id UUID REFERENCES genomes(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_agents_owner ON agents(owner_address);
CREATE INDEX idx_agents_block ON agents(block_id);
CREATE INDEX idx_agents_genome ON agents(genome_id);

-- ============================================
-- 4. VERIFICATIONS - Verification request logs
-- ============================================
CREATE TABLE IF NOT EXISTS verifications (
    id SERIAL PRIMARY KEY,
    genome_id UUID REFERENCES genomes(id) ON DELETE CASCADE,
    requester_ip TEXT,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    result BOOLEAN NOT NULL
);

CREATE INDEX idx_verifications_genome ON verifications(genome_id);
CREATE INDEX idx_verifications_date ON verifications(verified_at);

-- ============================================
-- 5. API_KEYS - API authentication
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash TEXT UNIQUE NOT NULL,
    owner_email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    rate_limit INTEGER DEFAULT 1000
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_email ON api_keys(owner_email);

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE blocks IS 'Registered Bitcoin blocks with Bitmap ownership';
COMMENT ON TABLE agents IS 'Verified AI agents linked to genomes';
COMMENT ON TABLE genomes IS 'Unique 256-bit genome fingerprints';
COMMENT ON TABLE verifications IS 'Audit log of genome verification requests';
COMMENT ON TABLE api_keys IS 'API authentication keys for external access';
