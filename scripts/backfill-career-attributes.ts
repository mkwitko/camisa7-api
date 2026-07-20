import { prisma } from "@/infra/db/client";
import { createPlayerCareerRepository } from "@/http/api/players/children/career/career.repository";

/**
 * One-off: recompute every player's career through the attribute-growth
 * engine so `PlayerCareer.attributes` is populated for pre-existing players.
 * Idempotent — safe to re-run. Run once after the `player_career_attributes`
 * migration deploys.
 */
async function main() {
  const repo = createPlayerCareerRepository(prisma);
  const players = await prisma.player.findMany({ select: { id: true } });
  let ok = 0;
  for (const { id } of players) {
    try {
      await repo.recomputeForPlayer(id);
      ok += 1;
    } catch (err) {
      console.error(`[backfill] player ${id} failed:`, err);
    }
  }
  console.log(`[backfill] recomputed ${ok}/${players.length} careers`);
  await prisma.$disconnect();
}

void main();
