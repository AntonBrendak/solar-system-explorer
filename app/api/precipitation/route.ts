import { getPrecipitation } from "@/features/weather/server/precipitation";

export async function GET() {
  return getPrecipitation();
}
