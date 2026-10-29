const NASA_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

export async function getPrecipitation() {
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

    WIDTH: "2048",
    HEIGHT: "1024",

    TIME: "default",
  });

  try {
    const response = await fetch(`${NASA_WMS}?${params.toString()}`, {
      next: { revalidate: 3600 },
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok || !contentType.includes("image/png")) {
      return new Response("NASA precipitation map unavailable", {
        status: 502,
      });
    }

    const image = await response.arrayBuffer();

    return new Response(image, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=0, s-maxage=3600",
      },
    });
  } catch {
    return new Response("Could not load precipitation data", { status: 502 });
  }
}
