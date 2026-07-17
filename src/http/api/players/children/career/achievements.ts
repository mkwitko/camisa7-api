/**
 * Conquistas (achievements) — badges derivados PURAMENTE dos contadores de
 * carreira já computados (`ComputedCareer`/`PlayerCareer`). Sem storage próprio:
 * `unlockedAchievements` recalcula toda vez a partir dos números. `icon` é um
 * emoji (o app renderiza direto). Ordem = ordem de exibição.
 *
 * NOTA: "hat-trick" e "nunca faltou" pedem dado a nível de partida/presença que
 * a carreira agregada não guarda — ficam pra depois (contador no engine +
 * histórico de presença). Só entram aqui métricas já agregadas.
 */
export type AchievementCounters = {
  matchesPlayed: number;
  wins: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  mvpCount: number;
  bestStreak: number;
};

export type AchievementDef = {
  key: string;
  label: string;
  description: string;
  icon: string;
  test: (c: AchievementCounters) => boolean;
};

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { key: "primeiro_gol", label: "Primeiro gol", description: "Marque seu primeiro gol", icon: "⚽", test: (c) => c.goals >= 1 },
  { key: "goleador_10", label: "Goleador", description: "10 gols na carreira", icon: "🎯", test: (c) => c.goals >= 10 },
  { key: "artilheiro_50", label: "Artilheiro", description: "50 gols na carreira", icon: "🥅", test: (c) => c.goals >= 50 },
  { key: "matador_100", label: "Matador", description: "100 gols na carreira", icon: "🔥", test: (c) => c.goals >= 100 },
  { key: "garcom_25", label: "Garçom", description: "25 assistências", icon: "🅰️", test: (c) => c.assists >= 25 },
  { key: "paredao_10", label: "Paredão", description: "10 jogos sem sofrer gol", icon: "🧤", test: (c) => c.cleanSheets >= 10 },
  { key: "jogos_50", label: "Veterano", description: "50 jogos disputados", icon: "🎖️", test: (c) => c.matchesPlayed >= 50 },
  { key: "jogos_100", label: "Lenda da pelada", description: "100 jogos disputados", icon: "🏅", test: (c) => c.matchesPlayed >= 100 },
  { key: "vitorias_100", label: "Vencedor", description: "100 vitórias", icon: "🏆", test: (c) => c.wins >= 100 },
  { key: "invicto_10", label: "Muralha invicta", description: "10 jogos seguidos sem perder", icon: "🛡️", test: (c) => c.bestStreak >= 10 },
  { key: "mvp_1", label: "Craque da pelada", description: "Eleito MVP uma vez", icon: "⭐", test: (c) => c.mvpCount >= 1 },
  { key: "mvp_10", label: "Ídolo", description: "Eleito MVP 10 vezes", icon: "🌟", test: (c) => c.mvpCount >= 10 },
];

export type Achievement = {
  key: string;
  label: string;
  description: string;
  icon: string;
  unlocked: boolean;
};

/** O catálogo inteiro com o flag `unlocked` por conquista, na ordem de exibição. */
export function unlockedAchievements(counters: AchievementCounters): Achievement[] {
  return ACHIEVEMENTS.map((a) => ({
    key: a.key,
    label: a.label,
    description: a.description,
    icon: a.icon,
    unlocked: a.test(counters),
  }));
}
