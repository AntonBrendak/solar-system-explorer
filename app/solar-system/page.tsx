import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { SolarSystemPage } from "@/widgets/solar-system";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: locale === "ru" ? "Солнечная система 3D — ORBITAL" : "Solar System 3D — ORBITAL",
    description: locale === "ru"
      ? "Исследуйте Солнечную систему в интерактивной космической обсерватории."
      : "Explore the Solar System inside an interactive digital observatory.",
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const locale = params.lang === "en" ? "en" : params.lang === "ru" ? "ru" : await getLocale();
  return <SolarSystemPage locale={locale} />;
}
