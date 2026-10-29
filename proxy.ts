import { NextResponse, type NextRequest } from "next/server";
import { resolveLocale } from "@/i18n/config";

export function proxy(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("lang");
  const locale = resolveLocale(
    requested ?? request.cookies.get("ORBITAL_LOCALE")?.value,
  );
  const headers = new Headers(request.headers);
  headers.set("x-orbital-locale", locale);
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/", "/planet-lab"] };
