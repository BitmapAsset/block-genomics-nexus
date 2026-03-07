import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

export async function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey) {
    return reply.status(401).send({
      error: 'Missing API key',
      code: 'UNAUTHORIZED',
    });
  }

  if (apiKey !== config.API_SECRET) {
    return reply.status(403).send({
      error: 'Invalid API key',
      code: 'FORBIDDEN',
    });
  }

  // Auth passed - continue to route handler
}
