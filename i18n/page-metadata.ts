import { messageCatalogs } from "./messages";
import type { Locale } from "./config";

export function pageMetadata(locale: Locale, origin: string) {
  const messages = messageCatalogs[locale].metadata;
  const canonical = new URL(locale === "en" ? "/?lang=en" : "/", origin).href;
  return {
    ...messages,
    canonical,
    image: new URL(`/og/orbital-${locale}.png`, origin).href,
    imageAlt:
      locale === "en"
        ? "ORBITAL — planetary worlds in remarkable detail"
        : "ORBITAL — планеты в мельчайших деталях",
    ogLocale: locale === "en" ? "en_US" : "ru_RU",
  };
}
