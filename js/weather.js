// Seven-day hourly cloud, visibility, humidity and rain-chance forecast from
// Open-Meteo (free, no key). Times come back in the place's own timezone.

import { getJSON } from './net.js';

export function fetchForecast(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: [
      'cloud_cover_low',
      'cloud_cover_mid',
      'cloud_cover_high',
      'visibility',
      'relative_humidity_2m',
      'precipitation_probability',
    ].join(','),
    forecast_days: '7',
    timezone: 'auto',
  });
  return getJSON(`https://api.open-meteo.com/v1/forecast?${q}`);
}
