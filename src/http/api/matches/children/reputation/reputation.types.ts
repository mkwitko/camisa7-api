export const REPUTATION_DIMENSIONS = [
  "pontualidade",
  "educacao",
  "compromisso",
  "respeito",
] as const;

export type ReputationDimension = (typeof REPUTATION_DIMENSIONS)[number];

/** Contagem de tags recebidas por dimensão (default 0 em todas). */
export type ReputationCounts = Record<ReputationDimension, number>;

/** As tags que UM votante deu a UM companheiro numa partida. */
export type VoterTag = { votedPlayerId: string; dimensions: ReputationDimension[] };

/** Contagem zerada — base para agregação. */
export function zeroCounts(): ReputationCounts {
  return { pontualidade: 0, educacao: 0, compromisso: 0, respeito: 0 };
}
