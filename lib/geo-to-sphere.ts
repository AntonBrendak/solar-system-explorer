const DEG = Math.PI / 180;

export function geoToSphere(
  latitude: number,
  longitude: number,
  radius = 2.08
): [number, number, number] {
  const lat = latitude * DEG;
  const lon = longitude * DEG;

  return [
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lon),
  ];
}