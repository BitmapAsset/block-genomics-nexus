-- Federated (self-hosted) experiences: manifest versioning + signed-manifest integrity.
--
-- Additive column adds on a single table. Every column is nullable or has a
-- constant default, so Postgres records the default in the catalog rather than
-- rewriting the heap — no long ACCESS EXCLUSIVE lock, safe on a live table.
--
-- Existing rows keep NULL integrity fields on purpose: they were registered
-- through the bare-challenge flow, which proved ownership but never bound the
-- manifest. They stay valid and simply report signed:false. Backfilling a hash
-- for them would be a lie — we cannot manufacture an owner signature.

ALTER TABLE "Experience" ADD COLUMN     "manifestVersion" INTEGER NOT NULL DEFAULT 1,
                         ADD COLUMN     "contentHash" TEXT,
                         ADD COLUMN     "manifestHash" TEXT,
                         ADD COLUMN     "manifestMessage" TEXT,
                         ADD COLUMN     "manifestSignature" TEXT,
                         ADD COLUMN     "signedAt" TIMESTAMP(3);
