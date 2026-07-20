-- Task 1 (share-carta Fase 1): `Player.slug` — unique, human-friendly id for
-- shareable card URLs (`/j/:slug`, see `player-slug.ts`). Backfills existing
-- rows deterministically (slugified first name + a tail of the row's own
-- uuid, already unique), then enforces NOT NULL + unique going forward. New
-- rows get a real `<name>-<4 hex>` slug from `generateSlug` (repository).
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 1. add nullable
ALTER TABLE "Player" ADD COLUMN "slug" TEXT;

-- 2. backfill: slugified first name + short id-derived suffix (deterministic,
--    unique because the 8-hex tail of the uuid is unique per row).
UPDATE "Player"
SET "slug" = lower(
  regexp_replace(
    split_part(
      trim(both '-' from regexp_replace(unaccent("name"), '[^a-zA-Z0-9]+', '-', 'g')),
      '-', 1
    ),
    '^$', 'jogador'
  )
) || '-' || substr(replace("id"::text, '-', ''), 1, 4)
WHERE "slug" IS NULL;

-- 2b. de-dupe any collisions from the 4-char tail by extending with more of the id
UPDATE "Player" p
SET "slug" = p."slug" || substr(replace(p."id"::text, '-', ''), 5, 4)
WHERE EXISTS (
  SELECT 1 FROM "Player" q WHERE q."slug" = p."slug" AND q."id" <> p."id"
);

-- 3. enforce
ALTER TABLE "Player" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Player_slug_key" ON "Player"("slug");
