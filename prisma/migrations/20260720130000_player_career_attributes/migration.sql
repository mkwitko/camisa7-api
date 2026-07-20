ALTER TABLE "PlayerCareer" DROP COLUMN "overall";
ALTER TABLE "PlayerCareer" ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '{}';
