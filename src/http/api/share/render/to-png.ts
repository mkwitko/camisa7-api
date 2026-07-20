import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { SAIRA_FONTS } from "./fonts";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/** Render a satori node tree to an SVG string using the app font. */
export async function renderToSvg(node: Parameters<typeof satori>[0]): Promise<string> {
  return satori(node, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: SAIRA_FONTS });
}

/** Rasterize an SVG string to a PNG buffer at CARD_WIDTH. */
export function svgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } });
  return Buffer.from(resvg.render().asPng());
}
