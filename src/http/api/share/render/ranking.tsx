import { renderToSvg, svgToPng } from "./to-png";

export type RankingCardInput = {
  groupName: string;
  playerName: string;
  rank: number;
  category: string;
  value: number;
};

/** Card da posição no ranking da pelada — "#1 Artilheiro". */
export async function renderRanking(input: RankingCardInput): Promise<Buffer> {
  const svg = await renderToSvg({
    type: "div",
    props: {
      style: {
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 32,
        background: "#0b0f14", color: "#f5f7fa", padding: 96,
        fontFamily: "Saira Condensed", border: "16px solid #d4af37", textAlign: "center",
      },
      children: [
        { type: "div", props: { style: { fontSize: 300, fontWeight: 700, lineHeight: 1 }, children: `#${input.rank}` } },
        { type: "div", props: { style: { fontSize: 88, fontWeight: 700, textTransform: "uppercase" }, children: input.category } },
        { type: "div", props: { style: { fontSize: 56, fontWeight: 600 }, children: `${input.value}` } },
        { type: "div", props: { style: { fontSize: 44, fontWeight: 600, color: "#c2cbd4" }, children: input.playerName } },
        { type: "div", props: { style: { fontSize: 40, fontWeight: 600, color: "#7c8794" }, children: `${input.groupName} · Camisa7` } },
      ],
    },
  });
  return svgToPng(svg);
}
