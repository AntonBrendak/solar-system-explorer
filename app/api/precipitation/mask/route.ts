import { getPrecipitationMask } from "@/features/weather/server/precipitation-mask";

export const runtime = "nodejs";

export async function GET() {
  return getPrecipitationMask();
}
