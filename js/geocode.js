// City search, the device's location, and a place name for a coordinate.
// Open-Meteo geocoding and BigDataCloud's client reverse geocoder are both
// free and need no API key.

import { getJSON } from './net.js';

export async function searchCities(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    'https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=' +
    encodeURIComponent(q);
  const json = await getJSON(url, { retries: 0 });
  return (json.results || []).map((r) => ({
    name: r.name,
    region: r.admin1 || '',
    country: r.country || '',
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export async function reverseName(lat, lon) {
  try {
    const url =
      'https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en' +
      `&latitude=${lat}&longitude=${lon}`;
    const j = await getJSON(url, { retries: 0, timeout: 8000 });
    const name = j.city || j.locality || j.principalSubdivision;
    if (name) {
      return { name, region: j.principalSubdivision || '', country: j.countryName || '' };
    }
  } catch {
    /* fall through to the generic name */
  }
  return { name: 'Your location', region: '', country: '' };
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Location is not available on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60000 }
    );
  });
}
