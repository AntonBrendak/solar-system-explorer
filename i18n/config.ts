export const locales = ["ru", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ru";
export function resolveLocale(value: unknown): Locale {
  return value === "en" ? "en" : defaultLocale;
}
