-- Additive, backward-compatible: nullable API-key columns for BitmapAgent.
-- Nullable + no default => Postgres 11+ catalog-only change (no table rewrite,
-- no long lock). Legacy rows keep apiKeyHash = NULL (grace path).
-- AlterTable
ALTER TABLE "BitmapAgent" ADD COLUMN     "apiKeyCreatedAt" TIMESTAMP(3),
ADD COLUMN     "apiKeyHash" TEXT;
