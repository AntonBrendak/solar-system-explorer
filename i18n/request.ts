import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { resolveLocale } from "./config";

export default getRequestConfig(async () => {
  const locale = resolveLocale(
    (await headers()).get("x-orbital-locale") ??
      (await cookies()).get("ORBITAL_LOCALE")?.value,
  );
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "UTC",
  };
});
