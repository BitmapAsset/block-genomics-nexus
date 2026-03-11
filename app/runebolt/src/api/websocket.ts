import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { RuneBolt } from '../core/RuneBolt';
import { createLogger } from '../utils/logger';

const log = createLogger('WebSocket');

export function setupWebSocket(server: http.Server, bolt: RuneBolt): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    log.info('WebSocket client connected');

    ws.on('error', (err) => {
      log.error({ err }, 'WebSocket error');
    });

    ws.on('close', () => {
      log.info('WebSocket client disconnected');
    });
  });

  // Forward wallet events to all connected clients
  bolt.onUpdate((update) => {
    const message = JSON.stringify({
      event: update.event,
      data: update.data,
      timestamp: update.timestamp.toISOString(),
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  log.info('WebSocket server initialized');
  return wss;
}
