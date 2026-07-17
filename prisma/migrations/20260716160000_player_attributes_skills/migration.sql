-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "attributes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];
