// ============================================================================
// Block Genomics — Verification API Server
// ============================================================================
// Challenge-response verification with BIP-322 signatures for Bitcoin
// block ownership via Bitmap inscriptions.
//
// Features:
//   ✓ SQLite persistence (WAL mode)
//   ✓ Challenge-response with 5min TTL + replay protection
//   ✓ BIP-322 signature verification (legacy + segwit)
//   ✓ Bitmap ownership check via Hiro Ordinals API
//   ✓ Deterministic genome generation from block headers
//   ✓ Trust score calculation
//   ✓ Dynamic SVG badge generation
//   ✓ Rate limiting + input validation + CORS + Helmet
//
// Usage:
//   npm run dev      — development with hot reload
//   npm run build    — compile TypeScript
//   npm start        — run compiled JS
// ============================================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import challengeRouter from './routes/challenge.js';
import verifyRouter from './routes/verify.js';
import agentRouter from './routes/agent.js';
import blockRouter from './routes/block.js';
import badgeRouter from './routes/badge.js';
import { getStats } from './lib/db.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? '3100', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3100,http://localhost:5173')
  .split(',')
  .map(o => o.trim());

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS — restricted to our origins
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Body parsing
app.use(express.json({ limit: '10kb' }));

// Trust proxy for accurate IP (rate limiting)
app.set('trust proxy', 1);

// Request logging
app.use((req, _res, next) => {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} → ${_res.statusCode} (${duration}ms)`,
    );
  });
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/v1/challenge', challengeRouter);
app.use('/api/v1/verify', verifyRouter);
app.use('/api/v1/agent', agentRouter);
app.use('/api/v1/search', agentRouter);
app.use('/api/v1/block', blockRouter);
app.use('/api/v1/badge', badgeRouter);

// Health check
app.get('/health', (_req, res) => {
  const stats = getStats();
  res.json({
    status: 'ok',
    service: 'block-genomics-api',
    version: '0.1.0',
    uptime: process.uptime(),
    storage: 'sqlite',
    stats,
  });
});

// API info
app.get('/api/v1', (_req, res) => {
  const stats = getStats();
  res.json({
    name: 'Block Genomics Verification API',
    version: 'v1',
    stats: {
      verifiedAgents: stats.agents,
      activeChallenges: stats.activeChallenges,
    },
    endpoints: {
      'POST /api/v1/challenge': 'Generate a verification challenge',
      'POST /api/v1/verify': 'Verify BIP-322 signature + bitmap ownership',
      'GET /api/v1/agent/:id': 'Get agent public profile',
      'GET /api/v1/block/:height': 'Get block data + genome + verification status',
      'GET /api/v1/badge/:id.svg': 'Dynamic SVG badge for an agent',
      'GET /api/v1/search?q=query': 'Search agents and blocks',
      'GET /health': 'Health check + stats',
    },
    security: {
      storage: 'SQLite with WAL mode',
      rateLimiting: 'Per-IP sliding window (10/min challenge, 5/min verify, 60/min general)',
      challengeExpiry: '5 minutes',
      challengeReplay: 'One-time use (consumed on verify)',
      cors: 'Restricted to configured origins',
      headers: 'Helmet security headers',
      validation: 'Strict input validation on all endpoints',
    },
  });
});

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
    status: 404,
  });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message);

  if (err.message.startsWith('CORS:')) {
    res.status(403).json({
      error: err.message,
      code: 'CORS_REJECTED',
      status: 403,
    });
    return;
  }

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    status: 500,
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, HOST, () => {
  const stats = getStats();
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║        Block Genomics — Verification API        ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Server:   http://${HOST}:${PORT}                  ║`);
  console.log(`║  API:      http://${HOST}:${PORT}/api/v1           ║`);
  console.log(`║  Health:   http://${HOST}:${PORT}/health           ║`);
  console.log('║                                                  ║');
  console.log(`║  Agents:   ${String(stats.agents).padEnd(37)}║`);
  console.log(`║  Storage:  SQLite (WAL)                          ║`);
  console.log('║                                                  ║');
  console.log('║  Security:                                       ║');
  console.log('║    ✓ SQLite persistence (survives restarts)      ║');
  console.log('║    ✓ Rate limiting (per-IP sliding window)       ║');
  console.log('║    ✓ Challenge expiry (5 min TTL)                ║');
  console.log('║    ✓ One-time use challenges                     ║');
  console.log('║    ✓ Input validation (all endpoints)            ║');
  console.log('║    ✓ CORS restricted                             ║');
  console.log('║    ✓ Helmet security headers                     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});

export default app;
