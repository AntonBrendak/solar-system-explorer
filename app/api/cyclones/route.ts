import { getCyclones } from "@/features/weather/server/cyclones";

export async function GET() {
  return getCyclones();
}
