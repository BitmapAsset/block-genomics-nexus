import express from 'express';
import cors from 'cors';
import http from 'http';
import { RuneBolt } from '../core/RuneBolt';
import { createRouter, errorHandler } from './routes';
import { setupWebSocket } from './websocket';
import { loadConfig } from '../utils/config';
import { createLogger } from '../utils/logger';

const log = createLogger('Server');

async function main(): Promise<void> {
  const config = loadConfig();
  const bolt = new RuneBolt(config);

  const app = express();

  app.use(cors({ origin: config.server.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));
  app.disable('x-powered-by');

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use('/api/v1', createRouter(bolt));
  app.use(errorHandler);

  const server = http.createServer(app);
  setupWebSocket(server, bolt);

  // Connect to daemons
  try {
    await bolt.connect();
  } catch (err) {
    log.warn({ err }, 'Daemon connection issues (LND/tapd may not be available)');
  }

  server.listen(config.server.port, config.server.host, () => {
    log.info(
      { port: config.server.port, host: config.server.host },
      'RuneBolt API server started',
    );
    log.info(`REST API: http://${config.server.host}:${config.server.port}/api/v1`);
    log.info(`WebSocket: ws://${config.server.host}:${config.server.port}/ws`);
    log.info('No telemetry. No tracking. Self-sovereign.');
  });

  const shutdown = async () => {
    log.info('Shutting down...');
    bolt.lock();
    await bolt.disconnect();
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error({ err }, 'Fatal error');
  process.exit(1);
});
