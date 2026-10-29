import { headers } from "next/headers";

export async function siteOrigin() {
  if (process.env.ORBITAL_SITE_URL)
    return new URL(process.env.ORBITAL_SITE_URL).origin;
  const request = await headers();
  const host =
    request.get("x-forwarded-host")?.split(",")[0].trim() ??
    request.get("host") ??
    "localhost:3000";
  const protocol =
    request.get("x-forwarded-proto")?.split(",")[0].trim() ??
    (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return new URL(`${protocol}://${host}`).origin;
}
