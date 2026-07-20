/**
 * Slug público do jogador para URLs compartilháveis (`/j/:slug`). Formato
 * `<primeiro-nome-slugificado>-<4 hex>` (ex.: `mauricio-9f3a`). O sufixo hex
 * é injetado (`randomHex`) para o gerador ser determinístico em teste; o
 * chamador faz retry em colisão de unicidade (P2002).
 */
export function slugifyName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "jogador";
}

export function generateSlug(name: string, randomHex: () => string): string {
  const first = slugifyName(name).split("-")[0] || "jogador";
  return `${first}-${randomHex()}`;
}

/** 4 lowercase hex chars (default random source for production). */
export function randomHex4(): string {
  return Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, "0");
}
