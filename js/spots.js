// Finds candidate viewpoints from OpenStreetMap and ranks them by how open the
// horizon is toward the sun on the day.
//
// "Open" is measured from terrain only: elevation is sampled along the compass
// bearing of the sunrise or sunset, and the steepest rise in the ground
// becomes the horizon angle. Buildings and trees are not in the data, so a
// spot can look better here than it does in person.

import { getJSON } from './net.js';
import { distanceM, destination, directionName, clamp, deg } from './geo.js';

export const TYPES = {
  viewpoint: { label: 'Viewpoint', bonus: 1 },
  peak: { label: 'Hill or peak', bonus: 0.9 },
  tower: { label: 'Observation tower', bonus: 0.9 },
  beach: { label: 'Beach', bonus: 0.7 },
  pier: { label: 'Pier', bonus: 0.7 },
};

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const MAX_SPOTS = 16; // 16 spots x 6 elevation samples = 96, under the API's 100 limit
const RAY_DISTANCES = [250, 600, 1200, 2500, 5000]; // metres along the bearing

export function classify(tags) {
  if (tags.tourism === 'viewpoint') return 'viewpoint';
  if (tags.natural === 'peak' || tags.natural === 'hill') return 'peak';
  if (tags.man_made === 'tower' && tags['tower:type'] === 'observation') return 'tower';
  if (tags.natural === 'beach') return 'beach';
  if (tags.man_made === 'pier') return 'pier';
  return null;
}

function buildQuery(lat, lon, radius) {
  const a = `(around:${radius},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:25];(
    node["tourism"="viewpoint"]["name"]${a};
    node["natural"~"^(peak|hill|beach)$"]["name"]${a};
    way["natural"="beach"]["name"]${a};
    node["man_made"="tower"]["tower:type"="observation"]["name"]${a};
    node["man_made"="pier"]["name"]${a};
    way["man_made"="pier"]["name"]${a};
  );out center 150;`;
}

/** Turn raw Overpass elements into a short, de-duplicated, ranked-by-promise list. */
export function pickCandidates(elements, lat, lon) {
  const seen = new Set();
  const spots = [];
  for (const el of elements || []) {
    const tags = el.tags || {};
    const type = classify(tags);
    const sLat = el.lat ?? el.center?.lat;
    const sLon = el.lon ?? el.center?.lon;
    if (!type || !tags.name || sLat == null || sLon == null) continue;
    const key = tags.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    spots.push({
      id: `${el.type}${el.id}`,
      name: tags.name,
      type,
      lat: sLat,
      lon: sLon,
      distanceM: distanceM(lat, lon, sLat, sLon),
    });
  }
  spots.sort(
    (a, b) => TYPES[b.type].bonus - TYPES[a.type].bonus || a.distanceM - b.distanceM
  );
  return spots.slice(0, MAX_SPOTS);
}

export async function fetchSpots(lat, lon, radius = 15000) {
  const query = buildQuery(lat, lon, radius);
  let lastError;
  for (const base of ENDPOINTS) {
    try {
      const json = await getJSON(`${base}?data=${encodeURIComponent(query)}`, {
        timeout: 30000,
        retries: 0,
      });
      return pickCandidates(json.elements, lat, lon);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Terrain openness for each spot toward a compass bearing.
 * Returns a map of spot id to { open (0-1), maxAngle (deg), elevation (m), prominence (0-1) }.
 */
export async function measureHorizon(spots, azimuth) {
  if (!spots.length) return {};
  const lats = [];
  const lons = [];
  for (const s of spots) {
    lats.push(s.lat);
    lons.push(s.lon);
    for (const d of RAY_DISTANCES) {
      const p = destination(s.lat, s.lon, azimuth, d);
      lats.push(p.lat);
      lons.push(p.lon);
    }
  }
  const f = (v) => v.toFixed(5);
  const url =
    'https://api.open-meteo.com/v1/elevation?latitude=' +
    lats.map(f).join(',') +
    '&longitude=' +
    lons.map(f).join(',');
  const json = await getJSON(url);
  return horizonFromElevations(spots, json.elevation);
}

export function horizonFromElevations(spots, elevations) {
  const stride = RAY_DISTANCES.length + 1;
  const out = {};
  spots.forEach((s, i) => {
    const base = i * stride;
    const e0 = elevations[base];
    if (e0 == null) return;
    let maxAngle = -90;
    let sum = 0;
    let n = 0;
    RAY_DISTANCES.forEach((d, k) => {
      const e = elevations[base + 1 + k];
      if (e == null) return;
      sum += e;
      n++;
      // Eye height of 1.7 m above the ground at the spot.
      const angle = deg(Math.atan2(e - (e0 + 1.7), d));
      if (angle > maxAngle) maxAngle = angle;
    });
    if (!n) return;
    out[s.id] = {
      elevation: e0,
      maxAngle,
      open: clamp(1 - Math.max(0, maxAngle) / 6, 0, 1),
      prominence: clamp((e0 - sum / n) / 80, 0, 1),
    };
  });
  return out;
}

/** 0-100 ranking score for how good the place itself is, before the weather. */
export function spotRank(spot, hz) {
  const bonus = TYPES[spot.type].bonus;
  if (!hz) return Math.round(100 * 0.5 * bonus);
  return Math.round(100 * (0.6 * hz.open + 0.2 * hz.prominence + 0.2 * bonus));
}

/** Sky score for a day, reduced when terrain blocks this spot's view of the sun. */
export function spotDayScore(skyScore, hz) {
  if (skyScore == null) return null;
  if (!hz) return skyScore;
  return Math.round(skyScore * (0.4 + 0.6 * hz.open));
}

export function describeView(hz, azimuth) {
  const dir = directionName(azimuth);
  if (!hz) return `Facing ${dir}. View clearance not measured.`;
  if (hz.open >= 0.85) return `Wide-open view toward the ${dir}.`;
  if (hz.open >= 0.5) return `Mostly open toward the ${dir}.`;
  return `Higher ground blocks part of the view toward the ${dir}.`;
}
