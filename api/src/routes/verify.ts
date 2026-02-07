import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function verifyRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /v1/verify/:id
   * Check registration status
   */
  fastify.get<{ Params: { id: string } }>('/v1/verify/:id', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid registration ID',
        code: 'VALIDATION_ERROR',
      });
    }

    const { id } = parsed.data;

    // TODO: Lookup registration in database
    // For now, return mock data
    
    // Simulate: 50% chance verified, 50% pending
    const mockStatus = Math.random() > 0.5 ? 'verified' : 'pending';

    return reply.send({
      id,
      bitmapId: 12345, // Mock
      status: mockStatus,
      createdAt: new Date(Date.now() - 60000).toISOString(),
      verifiedAt: mockStatus === 'verified' ? new Date().toISOString() : null,
    });
  });
}
