
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SolarSystemLoader } from "@/widgets/solar-system/SolarSystemLoader";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ui");

  return {
    title: `${t("mapEntry3dMap")} — ORBITAL`,
    description: t("mapEntrySubtitle"),
  };
}

export default function SolarSystemPage() {
  return (
    <main>
      <SolarSystemLoader />
    </main>
  );
}