// ============================================================================
// GET /api/v1/agent/:id — Public agent profile
// GET /api/v1/search?q=query — Search agents and blocks
// ============================================================================

import { Router } from 'express';
import { agentDAO } from '../lib/db.js';
import { toPublic } from './verify.js';
import { validateAgentId, validateSearchQuery } from '../middleware/validate.js';
import { generalRateLimiter } from '../middleware/rate-limit.js';
import type { SearchResult } from '../types.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/agent/:id
// ---------------------------------------------------------------------------

router.get(
  '/:id',
  generalRateLimiter,
  validateAgentId,
  (req, res) => {
    const agent = agentDAO.getById(req.params.id);

    if (!agent) {
      res.status(404).json({
        error: 'Agent not found',
        code: 'NOT_FOUND',
        status: 404,
      });
      return;
    }

    res.json(toPublic(agent));
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/search?q=query
// ---------------------------------------------------------------------------

router.get(
  '/',
  generalRateLimiter,
  validateSearchQuery,
  (req, res) => {
    const query = (req.query.q as string).toLowerCase().trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const agents = agentDAO.search(query, limit);

    const results: SearchResult[] = agents.map((agent) => {
      let matchField = 'name';
      if (String(agent.blockHeight) === query) matchField = 'blockHeight';
      else if (agent.genome.startsWith(query)) matchField = 'genome';

      return {
        type: 'agent' as const,
        id: agent.id,
        name: agent.name,
        blockHeight: agent.blockHeight,
        genome: agent.genome,
        trustScore: agent.trustScore,
        matchField,
      };
    });

    // Also check if query is a block height number
    const heightQuery = parseInt(query, 10);
    if (!isNaN(heightQuery) && heightQuery >= 0) {
      const blockAgents = agentDAO.getByBlockHeight(heightQuery);
      if (blockAgents.length > 0 && !results.find(r => r.blockHeight === heightQuery && r.type === 'block')) {
        results.push({
          type: 'block',
          id: String(heightQuery),
          name: `Block #${heightQuery}`,
          blockHeight: heightQuery,
          genome: blockAgents[0].genome,
          trustScore: blockAgents[0].trustScore,
          matchField: 'blockHeight',
        });
      }
    }

    res.json({
      query,
      count: results.length,
      results,
    });
  },
);

export default router;
