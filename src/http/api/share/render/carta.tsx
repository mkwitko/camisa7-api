import type { PublicProfileResponse } from "@/http/api/players/public-profile/public-profile.schema";
import { renderToSvg, svgToPng } from "./to-png";

const TIER_COLOR: Record<string, string> = {
  bronze: "#a97142",
  prata: "#9ca3af",
  ouro: "#d4af37",
};

/**
 * Carta compartilhável — espelha o `PlayerCard` (variante full) do app:
 * overall grande, tier, posição, stats e a marca Camisa7 no rodapé. NÃO
 * compartilha código com o RN (satori usa flexbox-CSS, não NativeWind).
 */
export async function renderCarta(profile: PublicProfileResponse): Promise<Buffer> {
  const tier = TIER_COLOR[profile.level] ?? TIER_COLOR.bronze;
  const position = profile.bestPosition ?? "—";
  const svg = await renderToSvg({
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#0b0f14",
        color: "#f5f7fa",
        padding: 72,
        fontFamily: "Saira Condensed",
        justifyContent: "space-between",
        border: `16px solid ${tier}`,
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 8 },
            children: [
              {
                type: "div",
                props: {
                  style: { fontSize: 40, fontWeight: 600, color: tier, textTransform: "uppercase" },
                  children: profile.level,
                },
              },
              {
                type: "div",
                props: {
                  style: { fontSize: 320, fontWeight: 700, lineHeight: 1 },
                  children: String(profile.bestOverall),
                },
              },
              {
                type: "div",
                props: {
                  style: { fontSize: 64, fontWeight: 600, textTransform: "uppercase" },
                  children: position,
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { fontSize: 88, fontWeight: 700, textTransform: "uppercase" },
            children: profile.name,
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              justifyContent: "space-between",
              fontSize: 44,
              fontWeight: 600,
            },
            children: [
              { type: "div", props: { children: `${profile.matchesPlayed} jogos` } },
              { type: "div", props: { children: `${profile.wins} vitórias` } },
              { type: "div", props: { children: `${profile.goals} gols` } },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { fontSize: 36, fontWeight: 600, color: "#7c8794", textTransform: "uppercase" },
            children: "Camisa7",
          },
        },
      ],
    },
  });
  return svgToPng(svg);
}
