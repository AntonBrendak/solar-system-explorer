type NOAAStorm = {
  id: string;
  name: string;
  latitudeNumeric: number;
  longitudeNumeric: number;
  intensity: string;
  lastUpdate: string;
};

export async function GET() {
  try {
    const response = await fetch(
      "https://www.nhc.noaa.gov/CurrentStorms.json",
      { next: { revalidate: 900 } }
    );

    if (!response.ok) {
      return Response.json(
        { error: "NOAA unavailable" },
        { status: 502 }
      );
    }

    const data = await response.json();

    const storms: NOAAStorm[] = data.activeStorms ?? [];

    return Response.json({
      source: "NOAA NHC",
      storms: storms.map((storm) => ({
        id: storm.id,
        name: storm.name,
        lat: storm.latitudeNumeric,
        lon: storm.longitudeNumeric,
        intensity: storm.intensity,
        updatedAt: storm.lastUpdate,
      })),
    });
  } catch {
    return Response.json(
      { error: "Failed to fetch cyclones" },
      { status: 502 }
    );
  }
}