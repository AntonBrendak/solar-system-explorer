import { decode, encode } from "fast-png";

const NASA_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";
const NASA_PALETTE =
  "https://gibs.earthdata.nasa.gov/colormaps/v1.3/GPM_Precipitation_Rate.xml";

const WIDTH = 2048;
const HEIGHT = 1024;

function attribute(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
}

type ColorEntry = { r: number; g: number; b: number; intensity: number };

function readPalette(xml: string): ColorEntry[] {
  const entries: ColorEntry[] = [];
  const tags = xml.match(/<ColorMapEntry\b[^>]*\/?>/g) ?? [];

  for (const tag of tags) {
    if (attribute(tag, "transparent") === "true") continue;
    if (attribute(tag, "nodata") === "true") continue;

    const rgb = attribute(tag, "rgb")?.split(",").map(Number);
    const value = attribute(tag, "value");
    const start = value?.match(/^[[(]\s*(\d+(?:\.\d+)?)/)?.[1];

    if (!rgb || rgb.length !== 3 || start === undefined) continue;

    const rainMmPerHour = Number(start);
    if (!Number.isFinite(rainMmPerHour)) continue;

    // Artistic strength: 0.1 mm/h -> almost black, 25+ mm/h -> white.
    const intensity = Math.round(
      255 * Math.min(1, Math.log1p(rainMmPerHour) / Math.log1p(25)),
    );
    entries.push({ r: rgb[0], g: rgb[1], b: rgb[2], intensity });
  }

  if (entries.length < 20) {
    throw new Error(`Unexpected NASA color map: ${entries.length} entries`);
  }

  return entries;
}

export async function getPrecipitationMask() {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    LAYERS: "IMERG_Precipitation_Rate_30min",
    STYLES: "",
    FORMAT: "image/png",
    TRANSPARENT: "TRUE",
    SRS: "EPSG:4326",
    BBOX: "-180,-90,180,90",
    WIDTH: String(WIDTH),
    HEIGHT: String(HEIGHT),
    TIME: "default",
  });

  try {
    const [imageResponse, paletteResponse] = await Promise.all([
      fetch(`${NASA_WMS}?${params}`, { next: { revalidate: 3600 } }),
      fetch(NASA_PALETTE, { next: { revalidate: 86400 } }),
    ]);

    if (
      !imageResponse.ok ||
      !imageResponse.headers.get("content-type")?.includes("image/png")
    ) {
      throw new Error(`NASA WMS HTTP ${imageResponse.status}`);
    }
    if (!paletteResponse.ok) {
      throw new Error(`NASA palette HTTP ${paletteResponse.status}`);
    }

    const palette = readPalette(await paletteResponse.text());
    const image = decode(new Uint8Array(await imageResponse.arrayBuffer()));
    if (image.depth !== 8 && !image.palette)
      throw new Error("Unsupported precipitation PNG depth");
    const info = { width: image.width, height: image.height };

    const lookup = new Map<number, number>();
    const nearestCache = new Map<number, number>();
    for (const { r, g, b, intensity } of palette) {
      lookup.set((r << 16) | (g << 8) | b, intensity);
    }

    // Grayscale output, 0=no precipitation, 255=strong precipitation.
    const mask = new Uint8Array(info.width * info.height);
    let visible = 0;
    let matched = 0;

    for (let i = 0; i < mask.length; i++) {
      const p = i * image.channels;
      const indexed = image.palette?.[image.data[i]];
      const alpha =
        indexed?.[3] ??
        (image.channels === 4
          ? image.data[p + 3]
          : image.channels === 2
            ? image.data[p + 1]
            : 255);
      if (alpha < 16) continue;

      visible++;
      const r = indexed?.[0] ?? image.data[p];
      const g = indexed?.[1] ?? image.data[p + (image.channels >= 3 ? 1 : 0)];
      const b = indexed?.[2] ?? image.data[p + (image.channels >= 3 ? 2 : 0)];
      const key = (r << 16) | (g << 8) | b;
      const value = lookup.get(key);

      if (value !== undefined) {
        mask[i] = value;
        matched++;
        continue;
      }

      const cached = nearestCache.get(key);
      if (cached !== undefined) {
        mask[i] = cached;
        if (cached > 0) matched++;
        continue;
      }

      // Small RGB differences can come from resampling at image edges.
      let minDistance = Infinity;
      let nearest = 0;
      for (const c of palette) {
        const distance = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
        if (distance < minDistance) {
          minDistance = distance;
          nearest = c.intensity;
        }
      }

      if (minDistance <= 20 * 20) {
        mask[i] = nearest;
        matched++;
        nearestCache.set(key, nearest);
      } else {
        nearestCache.set(key, 0);
      }
    }

    // Don't quietly display a wrong/empty intensity mask if the WMS palette changed.
    if (visible > 100 && matched / visible < 0.8) {
      throw new Error(
        `WMS colors don't match NASA GPM palette (${matched}/${visible})`,
      );
    }

    const png = encode({
      width: info.width,
      height: info.height,
      channels: 1,
      depth: 8,
      data: mask,
    });

    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600",
      },
    });
  } catch {
    return new Response("Unable to build precipitation mask", { status: 502 });
  }
}
