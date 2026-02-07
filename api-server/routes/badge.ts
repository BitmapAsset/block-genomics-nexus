// ============================================================================
// GET /api/v1/badge/:id.svg — Dynamic SVG badge for an agent
// ============================================================================

import { Router } from 'express';
import { agentDAO } from '../lib/db.js';
import { generalRateLimiter } from '../middleware/rate-limit.js';
import type { AgentRecord } from '../types.js';

const router = Router();

router.get(
  '/:id.svg',
  generalRateLimiter,
  (req, res) => {
    // Strip .svg if it's in the id param
    const id = req.params.id.replace(/\.svg$/, '');
    const agent = agentDAO.getById(id);

    if (!agent) {
      const svg = renderBadge(null);
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=60');
      res.send(svg);
      return;
    }

    const svg = renderBadge(agent);
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(svg);
  },
);

// ---------------------------------------------------------------------------
// SVG Renderer
// ---------------------------------------------------------------------------

function renderBadge(agent: AgentRecord | null): string {
  if (!agent) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="30" viewBox="0 0 240 30">
  <rect width="240" height="30" rx="4" fill="#555"/>
  <text x="120" y="19" font-family="monospace" font-size="11" fill="#fff" text-anchor="middle">
    Agent Not Found
  </text>
</svg>`;
  }

  const trustColor = getTrustColor(agent.trustScore);
  const genomeShort = agent.genome.slice(0, 8);
  const totalWidth = 260;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="56" viewBox="0 0 ${totalWidth} 56">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
    <linearGradient id="trust" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${trustColor}"/>
      <stop offset="100%" stop-color="${trustColor}88"/>
    </linearGradient>
  </defs>

  <rect width="${totalWidth}" height="56" rx="6" fill="url(#bg)"/>
  <rect x="1" y="1" width="${totalWidth - 2}" height="54" rx="5" fill="none" stroke="${trustColor}44" stroke-width="1"/>

  <text x="10" y="18" font-family="monospace" font-size="10" fill="#888">BLOCK GENOMICS</text>

  <text x="10" y="34" font-family="monospace" font-size="12" fill="#fff" font-weight="bold">
    ${escapeXml(agent.name)}
  </text>

  <text x="10" y="48" font-family="monospace" font-size="10" fill="#aaa">
    #${agent.blockHeight} · ${genomeShort}…
  </text>

  <rect x="${totalWidth - 68}" y="6" width="58" height="20" rx="10" fill="url(#trust)"/>
  <text x="${totalWidth - 39}" y="20" font-family="monospace" font-size="11" fill="#fff" text-anchor="middle" font-weight="bold">
    ${agent.trustScore}/100
  </text>

  <text x="${totalWidth - 24}" y="48" font-family="sans-serif" font-size="14" fill="${trustColor}">✓</text>
  <text x="${totalWidth - 68}" y="48" font-family="monospace" font-size="9" fill="#888">VERIFIED</text>
</svg>`;
}

function getTrustColor(score: number): string {
  if (score >= 80) return '#00d26a';
  if (score >= 60) return '#f5a623';
  if (score >= 40) return '#f5a623';
  return '#ff4444';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default router;
