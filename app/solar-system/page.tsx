
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SolarSystemExperience } from "@/widgets/solar-system/SolarSystemExperience";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ui");

  return {
    title: `${t("mapEntry3dMap")} — ORBITAL`,
    description: t("mapEntrySubtitle"),
  };
}

export default function SolarSystemPage() {
  return <SolarSystemExperience />;
}
