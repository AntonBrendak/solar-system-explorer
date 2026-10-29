import { Observatory } from "@/widgets/observatory";
import { isPlanetId } from "@/entities/planet/types";
import { getLocale } from "next-intl/server";
import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/page-metadata";
import { siteOrigin } from "./_lib/site-origin";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const origin = await siteOrigin();
  const metadata = pageMetadata(locale, origin);
  return {
    title: metadata.title,
    description: metadata.description,
    metadataBase: new URL(origin),
    alternates: {
      canonical: metadata.canonical,
      languages: {
        ru: `${origin}/`,
        en: `${origin}/?lang=en`,
        "x-default": `${origin}/`,
      },
    },
    icons: { icon: "/icon.svg" },
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      url: metadata.canonical,
      siteName: "ORBITAL",
      images: [
        {
          url: metadata.image,
          width: 1200,
          height: 630,
          alt: metadata.imageAlt,
        },
      ],
      type: "website",
      locale: locale === "ru" ? "ru_RU" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: metadata.title,
      description: metadata.description,
      images: [{ url: metadata.image, alt: metadata.imageAlt }],
    },
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const locale =
    params.lang === "en"
      ? "en"
      : params.lang === "ru"
        ? "ru"
        : await getLocale();
  return (
    <Observatory
      initialLocale={locale}
      siteOrigin={await siteOrigin()}
      initialPlanet={isPlanetId(params.planet) ? params.planet : null}
      initialFocus={isPlanetId(params.focus) ? params.focus : "mercury"}
    />
  );
}
