
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ui");

  return {
    title: `${t("mapEntry3dMap")} — ORBITAL`,
    description: t("mapEntrySubtitle"),
  };
}

export default async function SolarSystemPage() {
  const locale = await getLocale();
  const t = await getTranslations("ui");

  return (
    <main className="relative flex min-h-dvh flex-col bg-[#070a0f] text-[#edf2f7]">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-6 md:px-12">
        <Link
          href={`/?lang=${locale}`}
          className="text-lg font-semibold tracking-[0.16em]"
          aria-label="ORBITAL"
        >
          ORBITAL
          <span className="text-[#a5cae8]">.</span>
        </Link>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="mb-5 font-mono text-xs tracking-[0.2em] text-[#8ca8bf]">
          {t("mapEntrySubtitle")}
        </p>

        <h1 className="text-5xl font-semibold tracking-tight md:text-7xl">
          {t("mapEntry3dMap")}
        </h1>

        <p className="mt-6 text-sm text-[#91a9bf]">
          {t("mapEntryPreviewTitle")}
        </p>
      </section>
    </main>
  );
}
