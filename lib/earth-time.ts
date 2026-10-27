import { Vector3 } from "three";

const DEG = Math.PI / 180;
const DAY_MS = 86400000;

export function getDayOfYear(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const now = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );

  return Math.floor((now - start) / DAY_MS);
}

function getUTCHours(date: Date) {
  return (
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3600000
  );
}

/** NOAA's approximate solar position: https://gml.noaa.gov/grad/solcalc/solareqns.PDF */
export function getSubsolarPoint(date = new Date()) {
  const year = date.getUTCFullYear();
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
  const utcHours = getUTCHours(date);
  const gamma =
    ((2 * Math.PI) / daysInYear) *
    (getDayOfYear(date) - 1 + (utcHours - 12) / 24);
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const longitude = 180 - utcHours * 15 - equationOfTime / 4;
  return {
    latitude: declination / DEG,
    longitude: ((((longitude + 180) % 360) + 360) % 360) - 180,
  };
}

/** Earth-fixed direction for Three.js SphereGeometry and a -180°..180° world map. */
export function getSunDirection(date = new Date(), target = new Vector3()) {
  const { latitude, longitude } = getSubsolarPoint(date);
  const lat = latitude * DEG;
  const lon = longitude * DEG;
  return target.set(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    -Math.cos(lat) * Math.sin(lon),
  );
}

export function getEarthRotationY(date = new Date(), textureOffset = 0) {
  return (getUTCHours(date) / 24) * Math.PI * 2 + textureOffset;
}
