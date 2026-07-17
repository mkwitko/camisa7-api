import { z } from "zod/v4";

export const RankingParams = z.object({ id: z.uuid() });
export type RankingParams = z.infer<typeof RankingParams>;

const RankRow = z.object({
  playerId: z.uuid(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  value: z.number().int().min(0),
});

export const GroupRankingResponse = z.object({
  goals: z.array(RankRow),
  assists: z.array(RankRow),
  cleanSheets: z.array(RankRow),
  mvp: z.array(RankRow),
  presence: z.array(RankRow),
  points: z.array(RankRow),
});
export type GroupRankingResponse = z.infer<typeof GroupRankingResponse>;
