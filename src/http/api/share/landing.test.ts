import { describe, expect, it } from "vitest";
import { buildLandingHtml } from "./landing";

const common = {
  slug: "mauricio-9f3a",
  playerName: "Maurício",
  ogImageUrl: "https://camisa7.app/og/carta/mauricio-9f3a.png",
  webUrl: "https://camisa7.app/j/mauricio-9f3a",
  appLink: "https://camisa7.app/j/mauricio-9f3a",
  iosStore: "https://apps.apple.com/app/id1",
  androidStore: "https://play.google.com/store/apps/details?id=app.camisa7",
};

describe("buildLandingHtml", () => {
  it("embeds the OG image and twitter card meta", () => {
    const html = buildLandingHtml({ ...common, subject: { kind: "carta" } });
    expect(html).toContain('property="og:image" content="https://camisa7.app/og/carta/mauricio-9f3a.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain("Maurício");
  });

  it("includes the store fallbacks in the redirect script", () => {
    const html = buildLandingHtml({ ...common, subject: { kind: "carta" } });
    expect(html).toContain(common.iosStore);
    expect(html).toContain(common.androidStore);
    expect(html).toContain(common.webUrl);
  });

  it("always renders a visible <a href> fallback to the web URL, plus a <noscript> copy", () => {
    const html = buildLandingHtml({ ...common, subject: { kind: "carta" } });
    expect(html).toContain(`<a href="${common.webUrl}">`);
    expect(html).toMatch(new RegExp(`<noscript>.*<a href="${common.webUrl}">.*</noscript>`, "s"));
  });

  it("titles a conquista subject with the achievement label", () => {
    const html = buildLandingHtml({
      ...common,
      subject: { kind: "conquista", key: "primeiro_gol", label: "Primeiro Gol" },
    });
    expect(html).toContain("Maurício desbloqueou Primeiro Gol");
  });

  it("titles a ranking subject", () => {
    const html = buildLandingHtml({
      ...common,
      subject: { kind: "ranking", groupId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(html).toContain("Maurício no ranking da pelada");
  });

  it("escapes HTML-sensitive characters in the player name", () => {
    const html = buildLandingHtml({
      ...common,
      playerName: `<script>alert("x")</script>`,
      subject: { kind: "carta" },
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
