import type { PublicProfileResponse } from "@/http/api/players/public-profile/public-profile.schema";
import { ERRORS } from "@/shared/errors/catalog";
import { renderToSvg, svgToPng } from "./to-png";

/** Badge de uma conquista desbloqueada, compartilhável. */
export async function renderConquista(profile: PublicProfileResponse, key: string): Promise<Buffer> {
  const a = profile.achievements.find((x) => x.key === key && x.unlocked);
  if (!a) throw ERRORS.PLR.NOT_FOUND();
  const svg = await renderToSvg({
    type: "div",
    props: {
      style: {
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 40,
        background: "#0b0f14", color: "#f5f7fa", padding: 96,
        fontFamily: "Saira Condensed", border: "16px solid #d4af37", textAlign: "center",
      },
      children: [
        { type: "div", props: { style: { fontSize: 260 }, children: a.icon } },
        { type: "div", props: { style: { fontSize: 96, fontWeight: 700, textTransform: "uppercase" }, children: a.label } },
        { type: "div", props: { style: { fontSize: 48, fontWeight: 600, color: "#c2cbd4" }, children: a.description } },
        { type: "div", props: { style: { fontSize: 40, fontWeight: 600, color: "#7c8794" }, children: `${profile.name} · Camisa7` } },
      ],
    },
  });
  return svgToPng(svg);
}
