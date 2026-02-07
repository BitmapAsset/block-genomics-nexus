import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { registerRoutes } from './routes/register.js';
import { verifyRoutes } from './routes/verify.js';
import { genomeRoutes } from './routes/genome.js';

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
});

// Plugins
await fastify.register(cors, {
  origin: true, // TODO: Restrict in production
});

// Health check
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// API routes
await fastify.register(registerRoutes);
await fastify.register(verifyRoutes);
await fastify.register(genomeRoutes);

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'] as const;
for (const signal of signals) {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    await fastify.close();
    await disconnectDb();
    process.exit(0);
  });
}

// Start server
async function start(): Promise<void> {
  try {
    await connectDb();
    await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
    fastify.log.info(`🧬 Block Genomics API running on http://localhost:${config.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
