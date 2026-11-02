
import { defaultLocale, type Locale } from "./config";
import { messageCatalogs } from "./messages";

/**
 * Build the homepage URL for any supported locale.
 *
 * ru -> https://example.com/
 * en -> https://example.com/?lang=en
 * de -> https://example.com/?lang=de
 */
export function homeUrl(
  locale: Locale,
  origin: string,
): string {
  const url = new URL("/", origin);

  if (locale !== defaultLocale) {
    url.searchParams.set("lang", locale);
  }

  return url.href;
}

/**
 * Generate an Open Graph locale identifier.
 *
 * ru -> ru_RU
 * en -> en_US
 * de -> de_DE
 * uk -> uk_UA
 */
function getOpenGraphLocale(locale: Locale): string {
  const expanded = new Intl.Locale(locale).maximize();

  const language = expanded.language;
  const region = expanded.region;

  return region
    ? `${language}_${region}`
    : language;
}

/**
 * Build localized metadata for the homepage.
 */
export function pageMetadata(
  locale: Locale,
  origin: string,
) {
  const metadata = messageCatalogs[locale].metadata;

  const canonical = homeUrl(locale, origin);

  // Use an existing image until a localized OG image exists.
  const imageLocale = locale === "ru" ? "ru" : "en";

  const image = new URL(
    `/og/orbital-${imageLocale}.png`,
    origin,
  ).href;

  const imageAlt =
    locale === "ru"
      ? "ORBITAL — планеты в мельчайших деталях"
      : locale === "en"
        ? "ORBITAL — planetary worlds in remarkable detail"
        : metadata.title;

  return {
    ...metadata,
    canonical,
    image,
    imageAlt,
    ogLocale: getOpenGraphLocale(locale),
  };
}
