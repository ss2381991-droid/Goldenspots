// Turns a weather forecast into a 0-100 "sky score" for each sunrise and sunset.
//
// The rule of thumb behind it: colour needs something to catch the light, and
// a clear path for the light to reach it. High and mid-level cloud is the
// canvas (best at roughly half cover), low cloud on the horizon is the lid,
// and haze, thick humidity or rain mute everything.

import { sunEvents } from './sun.js';
import { clamp } from './geo.js';

export function labelFor(score) {
  if (score == null) return null;
  if (score < 30) return 'Poor';
  if (score < 50) return 'Fair';
  if (score < 70) return 'Good';
  if (score < 85) return 'Great';
  return 'Iconic';
}

/** weather: { low, mid, high (cloud %), visibilityM, humidity (%), precipProb (%) } */
export function qualityScore(weather) {
  const low = weather.low ?? 0;
  const mid = weather.mid ?? 0;
  const high = weather.high ?? 0;
  const visKm = weather.visibilityM == null ? 20 : weather.visibilityM / 1000;
  const humidity = weather.humidity ?? 0;
  const precip = weather.precipProb ?? 0;

  const canvas = clamp(high + 0.6 * mid, 0, 100);
  const canvasFactor =
    canvas <= 55 ? 0.35 + 0.65 * (canvas / 55) : 1 - 0.75 * ((canvas - 55) / 45);
  const lowFactor = 1 - 0.9 * clamp((low - 20) / 60, 0, 1);
  const visFactor = 0.5 + 0.5 * clamp((visKm - 4) / 16, 0, 1);
  const humidityFactor = humidity > 90 ? 0.85 : 1;
  const precipFactor = precip >= 60 ? 0.6 : precip >= 30 ? 0.85 : 1;

  const score = Math.round(
    100 * canvasFactor * lowFactor * visFactor * humidityFactor * precipFactor
  );

  const reasons = [];
  if (low > 50) reasons.push('Low cloud is likely to hide the horizon.');
  else if (canvas >= 25 && canvas <= 80) reasons.push('High and mid-level cloud should catch the colour.');
  else if (canvas < 10) reasons.push('Clear sky: clean light but little drama.');
  else if (canvas > 80) reasons.push('Thick cloud overhead may mute the colour.');
  if (precip >= 50) reasons.push('Rain is likely.');
  if (visKm < 6) reasons.push('Haze or mist will reduce visibility.');
  else if (humidity > 90) reasons.push('Very humid air can flatten the colours.');

  return {
    score,
    label: labelFor(score),
    headline: reasons[0] || 'Mixed conditions.',
    reasons,
  };
}

/** Parse Open-Meteo's local 'YYYY-MM-DDTHH:MM' strings into epoch ms. */
export function parseLocal(str, offsetSec) {
  const m = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(str);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - offsetSec * 1000;
}

export function prepareHourly(forecast) {
  const offset = forecast.utc_offset_seconds || 0;
  const h = forecast.hourly;
  return {
    offset,
    t: h.time.map((s) => parseLocal(s, offset)),
    series: {
      low: h.cloud_cover_low,
      mid: h.cloud_cover_mid,
      high: h.cloud_cover_high,
      visibilityM: h.visibility,
      humidity: h.relative_humidity_2m,
      precipProb: h.precipitation_probability,
    },
  };
}

function sampleAt(prep, key, ms) {
  const { t } = prep;
  const values = prep.series[key];
  if (!values || ms < t[0] || ms > t[t.length - 1]) return null;
  let i = 0;
  while (i < t.length - 2 && t[i + 1] < ms) i++;
  const a = values[i];
  const b = values[i + 1];
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  const f = (ms - t[i]) / (t[i + 1] - t[i]);
  return a + (b - a) * f;
}

export function weatherAt(prep, ms) {
  const low = sampleAt(prep, 'low', ms);
  if (low == null) return null;
  return {
    low,
    mid: sampleAt(prep, 'mid', ms),
    high: sampleAt(prep, 'high', ms),
    visibilityM: sampleAt(prep, 'visibilityM', ms),
    humidity: sampleAt(prep, 'humidity', ms),
    precipProb: sampleAt(prep, 'precipProb', ms),
  };
}

/** One entry per forecast day for a sunrise or sunset ('sunrise' | 'sunset'). */
export function buildOutlook(forecast, lat, lon, kind, maxDays = 7) {
  const prep = prepareHourly(forecast);
  const dates = [...new Set(forecast.hourly.time.map((s) => s.slice(0, 10)))].slice(0, maxDays);
  return dates.map((date) => {
    const [y, m, d] = date.split('-').map(Number);
    const ev = sunEvents(y, m, d, lat, lon, prep.offset);
    const eventMs = kind === 'sunrise' ? ev.sunrise : ev.sunset;
    if (eventMs == null) return { date, kind, eventMs: null, polar: true, score: null };
    const weather = weatherAt(prep, eventMs);
    const q = weather ? qualityScore(weather) : null;
    return {
      date,
      kind,
      eventMs,
      azimuth: ev.azimuth[kind],
      goldenMs: kind === 'sunrise' ? ev.goldenMorningEnd : ev.goldenEveningStart,
      weather,
      score: q ? q.score : null,
      label: q ? q.label : null,
      headline: q ? q.headline : '',
      reasons: q ? q.reasons : [],
    };
  });
}
