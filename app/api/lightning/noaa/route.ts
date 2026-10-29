import { getNoaaLightning } from "@/features/weather/server/lightning-noaa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return getNoaaLightning();
}
