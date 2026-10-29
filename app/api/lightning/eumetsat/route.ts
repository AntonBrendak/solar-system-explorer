import { getEumetsatLightning } from "@/features/weather/server/lightning-eumetsat";

export const runtime = "nodejs";

export async function GET() {
  return getEumetsatLightning();
}
