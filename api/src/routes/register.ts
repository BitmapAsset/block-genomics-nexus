import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { RegisterRequestSchema, type RegisterRequest } from '../types/index.js';
import { verifyBip322Signature } from '../services/signature.js';
import { verifyBitmapOwnership } from '../services/bitmap.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /v1/register
   * Register a bitmap for genome generation
   */
  fastify.post<{ Body: RegisterRequest }>('/v1/register', async (request, reply) => {
    // Validate request body
    const parsed = RegisterRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      });
    }

    const { bitmapId, btcAddress, signature, message } = parsed.data;

    // Verify BIP322 signature
    const sigResult = await verifyBip322Signature(btcAddress, message, signature);
    if (!sigResult.valid) {
      return reply.status(400).send({
        error: sigResult.error || 'Invalid signature',
        code: 'INVALID_SIGNATURE',
      });
    }

    // Verify bitmap ownership
    const ownershipResult = await verifyBitmapOwnership(bitmapId, btcAddress);
    if (!ownershipResult.owned) {
      return reply.status(403).send({
        error: ownershipResult.error || 'Address does not own this bitmap',
        code: 'NOT_OWNER',
      });
    }

    // TODO: Store registration in database
    const registration = {
      id: randomUUID(),
      bitmapId,
      btcAddress,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };

    fastify.log.info({ registration }, 'New registration created');

    return reply.status(201).send({
      id: registration.id,
      bitmapId: registration.bitmapId,
      status: registration.status,
      createdAt: registration.createdAt,
      message: 'Registration received. Genome generation will begin shortly.',
    });
  });
}
