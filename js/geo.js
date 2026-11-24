// Small geometry helpers shared by the sun maths, spot ranking and the UI.

const EARTH_RADIUS = 6371000;

export const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;
export const mod = (n, m) => ((n % m) + m) % m;
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Great-circle distance in metres. */
export function distanceM(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Point reached by travelling distM metres from (lat, lon) on a compass bearing. */
export function destination(lat, lon, bearingDeg, distM) {
  const br = rad(bearingDeg);
  const dr = distM / EARTH_RADIUS;
  const la1 = rad(lat);
  const lo1 = rad(lon);
  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(dr) + Math.cos(la1) * Math.sin(dr) * Math.cos(br)
  );
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(br) * Math.sin(dr) * Math.cos(la1),
      Math.cos(dr) - Math.sin(la1) * Math.sin(la2)
    );
  return { lat: deg(la2), lon: mod(deg(lo2) + 540, 360) - 180 };
}

const NAMES_8 = [
  'north', 'north-east', 'east', 'south-east',
  'south', 'south-west', 'west', 'north-west',
];

/** 'south-west' for 226 degrees. */
export function directionName(azimuth) {
  return NAMES_8[Math.round(mod(azimuth, 360) / 45) % 8];
}

export function fmtDistance(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
