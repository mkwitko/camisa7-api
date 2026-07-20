export type ShareSubject =
  | { kind: "carta" }
  | { kind: "conquista"; key: string; label: string }
  | { kind: "ranking"; groupId: string };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/**
 * Shell HTML servido em `/j/:slug`. Carrega as meta OG (crawlers do WhatsApp/
 * IG/Twitter leem sem executar JS) e um script smart-link: tenta abrir o app
 * (universal/app link) e cai pra loja / web conforme o dispositivo.
 */
export function buildLandingHtml(input: {
  slug: string;
  playerName: string;
  subject: ShareSubject;
  ogImageUrl: string;
  webUrl: string;
  appLink: string;
  iosStore: string;
  androidStore: string;
}): string {
  // Built from raw (unescaped) fields and escaped exactly once below —
  // escaping `playerName` here too (before interpolating) and then escaping
  // the whole `title` again at each use site would double-encode entities
  // (`"` -> `&amp;quot;` instead of `&quot;`).
  const rawTitle =
    input.subject.kind === "conquista"
      ? `${input.playerName} desbloqueou ${input.subject.label}`
      : input.subject.kind === "ranking"
        ? `${input.playerName} no ranking da pelada`
        : `A carta do ${input.playerName}`;
  const title = escapeHtml(rawTitle);
  const desc = "Veja no Camisa7 — o app dos peladeiros.";
  const webUrl = escapeHtml(input.webUrl);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:image" content="${input.ogImageUrl}" />
<meta property="og:url" content="${input.webUrl}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:image" content="${input.ogImageUrl}" />
</head>
<body>
<p>${title}</p>
<!-- Always-working fallback: works even if the redirect script below never
runs (JS disabled, or a CSP that doesn't allow it) — see share.controller.ts's
route-scoped CSP override for /j/:slug that allows the inline script. -->
<p><a href="${webUrl}">Abrir no Camisa7</a></p>
<noscript><p><a href="${webUrl}">Abrir no Camisa7</a></p></noscript>
<script>
(function () {
  var ua = navigator.userAgent || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua);
  var isAndroid = /Android/.test(ua);
  // Try to open the app; if it isn't installed the universal/app link falls
  // through to the web page. On desktop just go to the web profile.
  if (isIOS || isAndroid) {
    window.location.href = ${JSON.stringify(input.appLink)};
    setTimeout(function () {
      window.location.href = isIOS ? ${JSON.stringify(input.iosStore)} : ${JSON.stringify(input.androidStore)};
    }, 1200);
  } else {
    window.location.href = ${JSON.stringify(input.webUrl)};
  }
})();
</script>
</body>
</html>`;
}
