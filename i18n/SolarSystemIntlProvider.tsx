import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { Locale } from "./config";

/** Send only the selected locale and the namespaces used by this route. */
export async function SolarSystemIntlProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const messages = await getMessages({ locale });
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={{
        map: messages.map,
        ui: messages.ui,
        planets: messages.planets,
        solarSystem: messages.solarSystem,
      }}
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>
  );
}
