import enUS from "./i18n/en-US.json" with { type: "json" };
import esES from "./i18n/es-ES.json" with { type: "json" };
import ptBR from "./i18n/pt-BR.json" with { type: "json" };

export type Locale = "pt-BR" | "en-US" | "es-ES";

const DEFAULT_LOCALE: Locale = "pt-BR";

const BUNDLES: Record<Locale, Record<string, string>> = {
  "pt-BR": ptBR,
  "en-US": enUS,
  "es-ES": esES,
};

// Fallback por subtag primário quando o Accept-Language não é um dos 3 exatos
// suportados: pt-PT -> pt-BR, en-GB -> en-US, es-MX -> es-ES (ver ERRORS.md).
const FALLBACK_BY_PRIMARY_SUBTAG: Record<string, Locale> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
};

function normalizeLocale(tag: string): Locale | undefined {
  const exactMatch = (Object.keys(BUNDLES) as Locale[]).find(
    (locale) => locale.toLowerCase() === tag.toLowerCase(),
  );
  if (exactMatch) return exactMatch;

  const primarySubtag = tag.split("-")[0]?.toLowerCase();
  return primarySubtag ? FALLBACK_BY_PRIMARY_SUBTAG[primarySubtag] : undefined;
}

/** Resolves the best supported locale from a raw `Accept-Language` header value. */
export function resolveLocale(acceptLanguage: string | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const candidates = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0]?.trim())
    .filter((tag): tag is string => Boolean(tag));

  for (const tag of candidates) {
    const locale = normalizeLocale(tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

/** Translates an error `code` (e.g. `AUTH-T0001`) against the caller's `Accept-Language`. */
export function translateErrorMessage(code: string, acceptLanguage: string | undefined): string {
  const locale = resolveLocale(acceptLanguage);
  return BUNDLES[locale][code] ?? BUNDLES[DEFAULT_LOCALE][code] ?? code;
}
