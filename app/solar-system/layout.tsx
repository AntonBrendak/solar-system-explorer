import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { resolveLocale } from "@/i18n/config";
import { SolarSystemIntlProvider } from "@/i18n/SolarSystemIntlProvider";

export default async function SolarSystemLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = resolveLocale(await getLocale());
  return (
    <SolarSystemIntlProvider locale={locale}>
      {children}
    </SolarSystemIntlProvider>
  );
}
