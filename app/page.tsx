
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { Observatory } from "@/widgets/observatory";
import { isPlanetId } from "@/entities/planet/types";

import {
  defaultLocale,
  locales,
  resolveLocale,
} from "@/i18n/config";

import {
  pageMetadata,
  homeUrl,
} from "@/i18n/page-metadata";

import { siteOrigin } from "./_lib/site-origin";

type SearchParams = Record<
  string,
  string | string[] | undefined
>;

type HomePageProps = {
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = resolveLocale(await getLocale());
  const origin = await siteOrigin();

  const metadata = pageMetadata(locale, origin);

  const languageAlternates = Object.fromEntries(
    locales.map((language) => [
      language,
      homeUrl(language, origin),
    ]),
  );

  return {
    title: metadata.title,
    description: metadata.description,

    metadataBase: new URL(origin),

    alternates: {
      canonical: metadata.canonical,

      languages: {
        ...languageAlternates,
        "x-default": homeUrl(defaultLocale, origin),
      },
    },

    icons: {
      icon: "/icon.svg",
    },

    openGraph: {
      title: metadata.title,
      description: metadata.description,
      url: metadata.canonical,

      siteName: "ORBITAL",

      locale: metadata.ogLocale,

      images: [
        {
          url: metadata.image,
          width: 1200,
          height: 630,
          alt: metadata.imageAlt,
        },
      ],

      type: "website",
    },

    twitter: {
      card: "summary_large_image",

      title: metadata.title,
      description: metadata.description,

      images: [
        {
          url: metadata.image,
          alt: metadata.imageAlt,
        },
      ],
    },
  };
}

export default async function HomePage({
  searchParams,
}: HomePageProps) {
  const params = await searchParams;

  const locale = resolveLocale(
    params.lang ?? (await getLocale()),
  );

  const origin = await siteOrigin();

  return (
    <Observatory
      initialLocale={locale}
      siteOrigin={origin}
      initialPlanet={
        isPlanetId(params.planet)
          ? params.planet
          : null
      }
      initialFocus={
        isPlanetId(params.focus)
          ? params.focus
          : "mercury"
      }
    />
  );
}
