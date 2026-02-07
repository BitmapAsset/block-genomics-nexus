import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateGenome } from '../services/genome.js';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function genomeRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /v1/genome/:id
   * Get generated genome for a registration
   */
  fastify.get<{ Params: { id: string } }>('/v1/genome/:id', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid registration ID',
        code: 'VALIDATION_ERROR',
      });
    }

    const { id } = parsed.data;

    // TODO: Lookup registration and genome in database
    // For now, generate mock genome
    
    const mockBitmapId = 42069; // Would come from registration lookup
    const genome = generateGenome(mockBitmapId);

    return reply.send({
      id,
      bitmapId: genome.bitmap_id,
      genome: {
        dna: genome.dna,
        traits: genome.traits,
        rarity: genome.rarity,
      },
      generatedAt: new Date().toISOString(),
    });
  });

  /**
   * GET /v1/genome/preview/:bitmapId
   * Preview genome for a bitmap (no registration required)
   */
  fastify.get<{ Params: { bitmapId: string } }>('/v1/genome/preview/:bitmapId', async (request, reply) => {
    const bitmapId = parseInt(request.params.bitmapId, 10);
    
    if (isNaN(bitmapId) || bitmapId < 0) {
      return reply.status(400).send({
        error: 'Invalid bitmap ID',
        code: 'VALIDATION_ERROR',
      });
    }

    const genome = generateGenome(bitmapId);

    return reply.send({
      bitmapId: genome.bitmap_id,
      preview: true,
      genome: {
        dna: genome.dna,
        traits: genome.traits,
        rarity: genome.rarity,
      },
      note: 'This is a preview. Register your bitmap to claim this genome.',
    });
  });
}
