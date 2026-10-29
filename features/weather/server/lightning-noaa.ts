import { readFile } from "node:fs/promises";
import path from "node:path";

export async function getNoaaLightning() {
  try {
    const file = path.join(process.cwd(), "data", "noaa-lightning.json");

    const content = await readFile(file, "utf-8");
    const data = JSON.parse(content);

    const age = Date.now() - Date.parse(data.updatedAt);

    return Response.json(
      {
        ...data,
        stale: age > 10 * 60 * 1000,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      {
        error: "NOAA data not available",
        flashes: [],
        stale: true,
      },
      { status: 503 },
    );
  }
}
