-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('futsal', 'society', 'campo');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "modality" "Modality" NOT NULL DEFAULT 'campo';
