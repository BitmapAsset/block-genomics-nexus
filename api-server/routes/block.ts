// ============================================================================
// GET /api/v1/block/:height — Block data + verification status + genome
// ============================================================================

import { Router } from 'express';
import { agentDAO } from '../lib/db.js';
import { fetchBlockData, toPublic } from './verify.js';
import { generateGenome, GENOME_VERSION } from '../lib/genome.js';
import { validateBlockHeight } from '../middleware/validate.js';
import { generalRateLimiter } from '../middleware/rate-limit.js';
import type { BlockResponse } from '../types.js';

const router = Router();

router.get(
  '/:height',
  generalRateLimiter,
  validateBlockHeight,
  async (req, res) => {
    const height = parseInt(req.params.height, 10);

    // Fetch block data from Bitcoin network
    const block = await fetchBlockData(height);

    if (!block) {
      res.status(404).json({
        error: 'Block not found or could not be fetched',
        code: 'NOT_FOUND',
        status: 404,
      });
      return;
    }

    // Generate genome (always deterministic from block data)
    const genome = generateGenome(block);

    // Find any verified agent for this block from SQLite
    const agents = agentDAO.getByBlockHeight(height);
    const agent = agents.length > 0 ? agents[0] : null;

    const response: BlockResponse = {
      height: block.height,
      hash: block.hash,
      timestamp: block.timestamp,
      txCount: block.txCount,
      size: block.size,
      weight: block.weight,
      genome,
      genomeVersion: GENOME_VERSION,
      verified: !!agent,
      agent: agent ? toPublic(agent) : null,
    };

    // Cache block data for 5 minutes (it's immutable once confirmed)
    res.set('Cache-Control', 'public, max-age=300');
    res.json(response);
  },
);

export default router;
