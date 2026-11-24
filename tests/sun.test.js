import test from 'node:test';
import assert from 'node:assert/strict';
import { sunEvents, sunPosition } from '../js/sun.js';
import { qualityScore, labelFor, buildOutlook } from '../js/score.js';
import { destination, distanceM, directionName } from '../js/geo.js';

const minutesOfDay = (ms, offsetSec = 0) => {
  const d = new Date(ms + offsetSec * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const within = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: got ${actual}, expected ${expected} +/- ${tol}`);

test('London, 24 Nov 2026: sunrise ~07:33 and sunset ~16:00 (GMT)', () => {
  const ev = sunEvents(2026, 11, 24, 51.5074, -0.1278, 0);
  within(minutesOfDay(ev.sunrise), 7 * 60 + 33, 3, 'sunrise');
  within(minutesOfDay(ev.sunset), 16 * 60, 3, 'sunset');
});

test('London, 21 Jun 2026: sunrise ~04:43 and sunset ~21:21 (BST)', () => {
  const ev = sunEvents(2026, 6, 21, 51.5074, -0.1278, 3600);
  within(minutesOfDay(ev.sunrise, 3600), 4 * 60 + 43, 4, 'sunrise');
  within(minutesOfDay(ev.sunset, 3600), 21 * 60 + 21, 4, 'sunset');
});

test('Pune, 24 Nov 2026: sunrise ~06:49 and sunset ~17:57 (IST)', () => {
  const ev = sunEvents(2026, 11, 24, 18.5204, 73.8567, 19800);
  within(minutesOfDay(ev.sunrise, 19800), 6 * 60 + 49, 4, 'sunrise');
  within(minutesOfDay(ev.sunset, 19800), 17 * 60 + 57, 4, 'sunset');
});

test('Sun rises in the east-ish and sets in the west-ish at the equinox', () => {
  const ev = sunEvents(2026, 3, 20, 40.7128, -74.006, -14400);
  within(ev.azimuth.sunrise, 90, 3, 'sunrise azimuth');
  within(ev.azimuth.sunset, 270, 3, 'sunset azimuth');
});

test('Golden hour ends after sunrise and starts before sunset', () => {
  const ev = sunEvents(2026, 11, 24, 51.5074, -0.1278, 0);
  assert.ok(ev.goldenMorningEnd > ev.sunrise);
  assert.ok(ev.goldenEveningStart < ev.sunset);
  assert.ok(ev.civilDawn < ev.sunrise);
  assert.ok(ev.civilDusk > ev.sunset);
});

test('Polar night returns no sunrise', () => {
  const ev = sunEvents(2026, 12, 21, 78.22, 15.65, 3600); // Svalbard
  assert.equal(ev.sunrise, null);
  assert.equal(ev.sunset, null);
});

test('Sun is below the horizon at local midnight', () => {
  const ms = Date.UTC(2026, 11, 24, 0, 0);
  assert.ok(sunPosition(ms, 51.5, -0.13).elevation < 0);
});

test('Quality score: high cloud with a clear horizon beats low cloud', () => {
  const good = qualityScore({ low: 5, mid: 20, high: 50, visibilityM: 24000, humidity: 60, precipProb: 0 });
  const bad = qualityScore({ low: 90, mid: 80, high: 80, visibilityM: 24000, humidity: 60, precipProb: 0 });
  assert.ok(good.score >= 70, `good was ${good.score}`);
  assert.ok(bad.score <= 20, `bad was ${bad.score}`);
});

test('Quality score: score is always within 0-100 and labelled', () => {
  for (const low of [0, 50, 100]) {
    for (const high of [0, 50, 100]) {
      const q = qualityScore({ low, mid: 50, high, visibilityM: 10000, humidity: 95, precipProb: 70 });
      assert.ok(q.score >= 0 && q.score <= 100);
      assert.ok(q.label);
    }
  }
  assert.equal(labelFor(90), 'Iconic');
  assert.equal(labelFor(10), 'Poor');
});

test('Outlook builds one entry per day from an Open-Meteo-shaped forecast', () => {
  const times = [];
  for (const day of ['2026-11-24', '2026-11-25']) {
    for (let h = 0; h < 24; h++) times.push(`${day}T${String(h).padStart(2, '0')}:00`);
  }
  const fill = (v) => times.map(() => v);
  const forecast = {
    utc_offset_seconds: 0,
    hourly: {
      time: times,
      cloud_cover_low: fill(10),
      cloud_cover_mid: fill(20),
      cloud_cover_high: fill(50),
      visibility: fill(20000),
      relative_humidity_2m: fill(60),
      precipitation_probability: fill(0),
    },
  };
  const out = buildOutlook(forecast, 51.5074, -0.1278, 'sunset', 7);
  assert.equal(out.length, 2);
  assert.ok(out[0].score >= 60);
  within(minutesOfDay(out[0].eventMs), 16 * 60, 3, 'outlook sunset');
});

test('Geometry: destination and distance agree, compass names are right', () => {
  const p = destination(51.5, 0, 90, 5000);
  within(distanceM(51.5, 0, p.lat, p.lon), 5000, 5, 'round-trip distance');
  assert.equal(directionName(226), 'south-west');
  assert.equal(directionName(359), 'north');
});
