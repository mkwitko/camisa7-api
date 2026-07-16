-- AlterTable
ALTER TABLE "GroupMember" ALTER COLUMN "primaryPos" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "affinity" JSONB NOT NULL DEFAULT '{}';

