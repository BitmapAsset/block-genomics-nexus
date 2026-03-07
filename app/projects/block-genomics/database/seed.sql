-- Block Genomics MVP Seed Data
-- Sample data for development and testing

-- ============================================
-- SAMPLE BLOCKS
-- ============================================
INSERT INTO blocks (block_height, owner_address, bitmap_inscription_id, registered_at)
VALUES 
    (840000, 'bc1qtest1address000000000000000000000000', 'i0abc123def456789abc123def456789abc123def456789abc123def456789abcd', '2024-04-20 00:00:00+00'),
    (840001, 'bc1qtest2address111111111111111111111111', 'i1def456abc789012def456abc789012def456abc789012def456abc789012efgh', '2024-04-20 00:10:00+00'),
    (840002, 'bc1qtest3address222222222222222222222222', 'i2ghi789def012345ghi789def012345ghi789def012345ghi789def012345ijkl', '2024-04-20 00:20:00+00'),
    (100000, 'bc1qtest4address333333333333333333333333', NULL, '2024-01-01 00:00:00+00'),
    (500000, 'bc1qtest5address444444444444444444444444', 'i3jkl012ghi345678jkl012ghi345678jkl012ghi345678jkl012ghi345678mnop', '2024-03-15 12:00:00+00')
ON CONFLICT (block_height) DO NOTHING;

-- ============================================
-- SAMPLE GENOMES
-- ============================================
INSERT INTO genomes (id, genome_hash, block_id, signature, visual_data)
VALUES 
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 
     '0x8f4a2b1c9e7d6f3a5b8c2e1d4f7a9b3c6e8d1f4a7b2c5e8d1f4a7b2c5e8d1f4a', 
     1, 
     'H8kL2mN4pQ6rS8tU0vW2xY4zA6bC8dE0fG2hI4jK6lM8nO0pQ2rS4tU6vW8xY0zA2b',
     '{"colors": ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4"], "pattern": "helix", "complexity": 0.75}'::jsonb),
    
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 
     '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b', 
     2, 
     'J9lM3nP5qR7sT9uV1wX3yZ5aB7cD9eF1gH3iJ5kL7mN9oP1qR3sT5uV7wX9yZ1aB3c',
     '{"colors": ["#9B59B6", "#3498DB", "#E74C3C", "#2ECC71"], "pattern": "matrix", "complexity": 0.88}'::jsonb),
    
    ('c3d4e5f6-a7b8-9012-cdef-123456789012', 
     '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c', 
     3, 
     NULL,
     '{"colors": ["#F39C12", "#1ABC9C", "#E91E63", "#00BCD4"], "pattern": "spiral", "complexity": 0.62}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SAMPLE AGENTS
-- ============================================
INSERT INTO agents (id, name, description, owner_address, block_id, genome_id, metadata)
VALUES 
    ('11111111-1111-1111-1111-111111111111',
     'Genesis Agent',
     'The first verified AI agent on Block Genomics',
     'bc1qtest1address000000000000000000000000',
     1,
     'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
     '{"version": "1.0.0", "capabilities": ["text", "code"], "model": "gpt-4"}'::jsonb),
    
    ('22222222-2222-2222-2222-222222222222',
     'Claw Assistant',
     'Personal AI assistant with verified genome',
     'bc1qtest2address111111111111111111111111',
     2,
     'b2c3d4e5-f6a7-8901-bcde-f12345678901',
     '{"version": "2.1.0", "capabilities": ["text", "code", "vision"], "model": "claude-3"}'::jsonb),
    
    ('33333333-3333-3333-3333-333333333333',
     'Trading Bot Alpha',
     'Autonomous trading agent',
     'bc1qtest3address222222222222222222222222',
     3,
     'c3d4e5f6-a7b8-9012-cdef-123456789012',
     '{"version": "0.9.0", "capabilities": ["trading", "analysis"], "risk_level": "medium"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SAMPLE VERIFICATIONS
-- ============================================
INSERT INTO verifications (genome_id, requester_ip, verified_at, result)
VALUES 
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '192.168.1.100', '2024-04-21 10:30:00+00', TRUE),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '10.0.0.50', '2024-04-21 14:45:00+00', TRUE),
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', '172.16.0.25', '2024-04-22 09:15:00+00', TRUE),
    ('c3d4e5f6-a7b8-9012-cdef-123456789012', '203.0.113.42', '2024-04-22 16:00:00+00', FALSE),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '198.51.100.77', '2024-04-23 11:20:00+00', TRUE);

-- ============================================
-- SAMPLE API KEYS
-- (In production, use properly hashed keys)
-- ============================================
INSERT INTO api_keys (id, key_hash, owner_email, rate_limit)
VALUES 
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
     'admin@blockgenomics.io',
     10000),
    
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     'sha256:d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
     'developer@example.com',
     1000),
    
    ('cccccccc-cccc-cccc-cccc-cccccccccccc',
     'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
     'test@example.com',
     100)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- VERIFY SEED DATA
-- ============================================
DO $$
BEGIN
    RAISE NOTICE 'Seed data loaded successfully!';
    RAISE NOTICE 'Blocks: %', (SELECT COUNT(*) FROM blocks);
    RAISE NOTICE 'Genomes: %', (SELECT COUNT(*) FROM genomes);
    RAISE NOTICE 'Agents: %', (SELECT COUNT(*) FROM agents);
    RAISE NOTICE 'Verifications: %', (SELECT COUNT(*) FROM verifications);
    RAISE NOTICE 'API Keys: %', (SELECT COUNT(*) FROM api_keys);
END $$;
