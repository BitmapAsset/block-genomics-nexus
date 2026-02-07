import { z } from 'zod';

// === Request/Response Schemas ===

export const RegisterRequestSchema = z.object({
  bitmapId: z.number().int().positive(),
  btcAddress: z.string().min(1),
  signature: z.string().min(1), // BIP322 signature
  message: z.string().min(1),   // Signed message
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const VerifyResponseSchema = z.object({
  id: z.string().uuid(),
  bitmapId: z.number(),
  status: z.enum(['pending', 'verified', 'failed']),
  createdAt: z.string().datetime(),
  verifiedAt: z.string().datetime().nullable(),
});

export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

export const GenomeResponseSchema = z.object({
  id: z.string().uuid(),
  bitmapId: z.number(),
  genome: z.object({
    dna: z.string(),
    traits: z.record(z.string(), z.unknown()),
    rarity: z.number(),
  }),
  generatedAt: z.string().datetime(),
});

export type GenomeResponse = z.infer<typeof GenomeResponseSchema>;

// === Database Types ===

export interface Registration {
  id: string;
  bitmap_id: number;
  btc_address: string;
  signature: string;
  message: string;
  status: 'pending' | 'verified' | 'failed';
  created_at: Date;
  verified_at: Date | null;
}

export interface Genome {
  id: string;
  registration_id: string;
  bitmap_id: number;
  dna: string;
  traits: Record<string, unknown>;
  rarity: number;
  generated_at: Date;
}

// === API Types ===

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}
