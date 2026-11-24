// Sunrise, sunset and sun position, calculated on the device.
// Based on the NOAA solar calculator equations; accurate to about a minute
// between roughly 70 degrees north and south. No network and no API key.

import { rad, deg, mod, clamp } from './geo.js';

const DAY_MS = 86400000;

function solarParams(ms) {
  const jd = ms / DAY_MS + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = rad(M);
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 =
    23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))); // radians
  const y = Math.tan(rad(eps) / 2) ** 2;
  const L0r = rad(L0);
  const eqTime =
    4 *
    deg(
      y * Math.sin(2 * L0r) -
        2 * e * Math.sin(Mr) +
        4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
        0.5 * y * y * Math.sin(4 * L0r) -
        1.25 * e * e * Math.sin(2 * Mr)
    ); // minutes
  return { decl, eqTime };
}

/** Sun azimuth (degrees clockwise from north) and elevation (degrees) at an instant. */
export function sunPosition(ms, lat, lon) {
  const { decl, eqTime } = solarParams(ms);
  const minutesUtc = mod(ms, DAY_MS) / 60000;
  const trueSolarTime = mod(minutesUtc + eqTime + 4 * lon, 1440);
  const hourAngle = trueSolarTime / 4 - 180;
  const latR = rad(lat);
  const haR = rad(hourAngle);
  const cosZ = clamp(
    Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(haR),
    -1,
    1
  );
  const zenith = Math.acos(cosZ);
  const elevation = 90 - deg(zenith);
  const denom = Math.cos(latR) * Math.sin(zenith);
  let azimuth;
  if (Math.abs(denom) < 1e-9) {
    azimuth = lat > 0 ? 180 : 0;
  } else {
    const c = clamp((Math.sin(latR) * cosZ - Math.sin(decl)) / denom, -1, 1);
    const a = deg(Math.acos(c));
    azimuth = hourAngle > 0 ? mod(a + 180, 360) : mod(540 - a, 360);
  }
  return { azimuth, elevation };
}

/**
 * Instant (ms since epoch) when the sun crosses a given altitude on the solar
 * day nearest to approxNoonMs. side is 'rise' or 'set'. Returns null when the
 * sun never reaches that altitude that day (polar day or polar night).
 */
export function sunTimeAtAltitude(approxNoonMs, lat, lon, altitudeDeg, side) {
  const base = 720 - 4 * lon; // solar noon in minutes UTC, before the equation of time
  const dayIndex = Math.round((approxNoonMs - base * 60000) / DAY_MS);
  let noon = dayIndex * DAY_MS + base * 60000;
  for (let i = 0; i < 3; i++) {
    noon = dayIndex * DAY_MS + (base - solarParams(noon).eqTime) * 60000;
  }
  const sign = side === 'rise' ? -1 : 1;
  let t = noon;
  for (let i = 0; i < 4; i++) {
    const { decl } = solarParams(t);
    const cosH =
      (Math.sin(rad(altitudeDeg)) - Math.sin(rad(lat)) * Math.sin(decl)) /
      (Math.cos(rad(lat)) * Math.cos(decl));
    if (cosH > 1 || cosH < -1) return null;
    t = noon + sign * deg(Math.acos(cosH)) * 4 * 60000;
  }
  return t;
}

/**
 * Sun events for a local calendar day (y, m, d) at a place whose UTC offset on
 * that day is offsetSec. All times are ms since epoch, or null when the event
 * does not happen.
 */
export function sunEvents(y, m, d, lat, lon, offsetSec = 0) {
  const noon = Date.UTC(y, m - 1, d, 12) - offsetSec * 1000;
  const at = (alt, side) => sunTimeAtAltitude(noon, lat, lon, alt, side);
  const sunrise = at(-0.833, 'rise');
  const sunset = at(-0.833, 'set');
  return {
    sunrise,
    sunset,
    goldenMorningEnd: at(6, 'rise'),
    goldenEveningStart: at(6, 'set'),
    civilDawn: at(-6, 'rise'),
    civilDusk: at(-6, 'set'),
    azimuth: {
      sunrise: sunrise == null ? null : sunPosition(sunrise, lat, lon).azimuth,
      sunset: sunset == null ? null : sunPosition(sunset, lat, lon).azimuth,
    },
  };
}
