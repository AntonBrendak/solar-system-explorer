
export const runtime = "nodejs";

const WMS_URL =
  "https://view.eumetsat.int/geoserver/wms";

export async function GET() {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",

    LAYERS: "mtg_fd:li_afa",
    STYLES: "",

    FORMAT: "image/png",
    TRANSPARENT: "TRUE",

    SRS: "EPSG:4326",
    BBOX: "-180,-90,180,90",

    WIDTH: "2048",
    HEIGHT: "1024",
  });

  try {
    const response = await fetch(
      `${WMS_URL}?${params}`,
      {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(15000),
      }
    );

    const contentType =
      response.headers.get("content-type") ?? "";

    if (
      !response.ok ||
      !contentType.includes("image/png")
    ) {
      console.error(
        "EUMETSAT WMS:",
        response.status,
        (await response.text()).slice(0, 500)
      );

      return new Response(
        "Lightning WMS unavailable",
        { status: 502 }
      );
    }

    return new Response(
      await response.arrayBuffer(),
      {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control":
            "public, s-maxage=300",
        },
      }
    );
  } catch (error) {
    console.error("EUMETSAT error:", error);

    return new Response(
      "Lightning source unavailable",
      { status: 502 }
    );
  }
}
