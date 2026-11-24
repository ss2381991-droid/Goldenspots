import { h, clear } from './dom.js';
import { sunPosition } from './sun.js';
import { buildOutlook } from './score.js';
import { skyGradient } from './sky.js';
import { skyScene } from './scene.js';
import { directionName, fmtDistance } from './geo.js';
import { searchCities, reverseName, getPosition } from './geocode.js';
import { fetchForecast } from './weather.js';
import { fetchSpots, measureHorizon, spotRank, spotDayScore, describeView, TYPES } from './spots.js';
import { fetchPhotos, rankPhotos } from './photos.js';
import { labelFor } from './score.js';
import { load, save, cachedFetch, MINUTE, HOUR, DAY } from './store.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  place: null,
  kind: 'sunset',
  day: 0,
  tz: 'UTC',
  outlook: { sunrise: [], sunset: [] },
  forecastStatus: 'idle', // idle | loading | ready | error
  spots: [],
  spotsStatus: 'idle', // idle | loading | ready | empty | error
  horizon: { sunrise: null, sunset: null }, // map of spot id to measurement, per kind
  horizonFailed: { sunrise: false, sunset: false },
  token: 0, // bumped whenever the place changes, so late responses are ignored
};

/* ---------- formatting ---------- */

const timeFmt = (tz) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz });

function fmtTime(ms, tz) {
  return ms == null ? '' : timeFmt(tz).format(ms);
}

function clockMinutes(ms, tz) {
  const [hh, mm] = fmtTime(ms, tz).split(':').map(Number);
  return hh * 60 + mm;
}

function dayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

const fmtLong = (dateStr) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(dayDate(dateStr));
const fmtShort = (dateStr) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dayDate(dateStr));
const fmtWeekday = (dateStr) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(dayDate(dateStr));
const fmtDayNum = (dateStr) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' }).format(dayDate(dateStr));

const kindWord = (k) => (k === 'sunrise' ? 'sunrise' : 'sunset');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function placeLabel(p) {
  return p ? p.name : '';
}

function placeKey(p) {
  return `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
}

/* ---------- notices ---------- */

function notice(message, actionLabel, action) {
  const box = $('#notice');
  clear(box);
  if (!message) {
    box.hidden = true;
    return;
  }
  box.append(message);
  if (actionLabel) {
    box.append(h('button', { type: 'button', class: 'link-button', onclick: action, text: actionLabel }));
  }
  box.hidden = false;
}

/* ---------- loading data ---------- */

async function usePlace(place, { remember = true, keepView = false } = {}) {
  const token = ++state.token;
  state.place = place;
  if (remember) save('place', place);
  state.outlook = { sunrise: [], sunset: [] };
  state.spots = [];
  state.spotsStatus = 'idle';
  state.horizon = { sunrise: null, sunset: null };
  state.horizonFailed = { sunrise: false, sunset: false };
  state.forecastStatus = 'loading';
  notice('');
  renderAll();

  try {
    const { data: fc, stale } = await cachedFetch(`fc:${placeKey(place)}`, 45 * MINUTE, () =>
      fetchForecast(place.lat, place.lon)
    );
    if (token !== state.token) return;
    state.tz = fc.timezone || 'UTC';
    state.outlook.sunrise = buildOutlook(fc, place.lat, place.lon, 'sunrise');
    state.outlook.sunset = buildOutlook(fc, place.lat, place.lon, 'sunset');
    if (!keepView) chooseNextEvent();
    state.forecastStatus = 'ready';
    if (stale) notice('You are offline, so this is the last forecast saved on your phone.');
  } catch {
    if (token !== state.token) return;
    state.forecastStatus = 'error';
    notice('Could not load the forecast. Check your connection.', 'Try again', () => refresh());
  }
  renderAll();
  loadSpots(place, token);
}

/** Open on the next sun event: sunset by day, sunrise after dark. */
function chooseNextEvent() {
  const now = Date.now();
  const options = [];
  for (const kind of ['sunrise', 'sunset']) {
    state.outlook[kind].forEach((d, i) => {
      if (d.eventMs != null && d.eventMs > now) options.push({ kind, day: i, ms: d.eventMs });
    });
  }
  options.sort((a, b) => a.ms - b.ms);
  if (options[0]) {
    state.kind = options[0].kind;
    state.day = options[0].day;
  } else {
    state.day = 0;
  }
}

async function loadSpots(place, token) {
  state.spotsStatus = 'loading';
  renderSpots();
  try {
    const { data } = await cachedFetch(`spots:${placeKey(place)}`, 7 * DAY, () =>
      fetchSpots(place.lat, place.lon)
    );
    if (token !== state.token) return;
    state.spots = data;
    state.spotsStatus = data.length ? 'ready' : 'empty';
  } catch {
    if (token !== state.token) return;
    state.spotsStatus = 'error';
  }
  renderSpots();
  if (state.spotsStatus === 'ready') loadHorizon(token);
}

async function loadHorizon(token = state.token) {
  const kind = state.kind;
  const today = state.outlook[kind][0];
  if (!state.spots.length || !today || today.azimuth == null) return;
  if (state.horizon[kind]) return;
  const az = Math.round(today.azimuth / 3) * 3;
  try {
    const { data } = await cachedFetch(`hz:${placeKey(state.place)}:${kind}:${az}`, 7 * DAY, () =>
      measureHorizon(state.spots, az)
    );
    if (token !== state.token) return;
    state.horizon[kind] = data;
  } catch {
    if (token !== state.token) return;
    state.horizonFailed[kind] = true;
  }
  renderSpots();
}

async function refresh() {
  const btn = $('#refresh');
  btn.classList.add('spinning');
  try {
    // Forget cached forecast so the next fetch is fresh.
    save('c:fc:' + placeKey(state.place), null);
    await usePlace(state.place, { keepView: true });
  } finally {
    btn.classList.remove('spinning');
  }
}

/* ---------- rendering ---------- */

function currentDay() {
  return state.outlook[state.kind][state.day] || null;
}

function renderAll() {
  $('#city-name').textContent = state.place ? placeLabel(state.place) : 'Finding your location';
  for (const b of document.querySelectorAll('.kind button')) {
    b.setAttribute('aria-checked', String(b.dataset.kind === state.kind));
  }
  renderHero();
  renderDays();
  renderSpots();
}

function compass(azimuth) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-32 -32 64 64');
  svg.setAttribute('class', 'compass');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Compass pointing ${directionName(azimuth)}`);
  const ring = document.createElementNS(NS, 'circle');
  ring.setAttribute('r', '29');
  ring.setAttribute('fill', 'rgba(255,255,255,0.12)');
  ring.setAttribute('stroke', 'rgba(255,255,255,0.7)');
  ring.setAttribute('stroke-width', '1.5');
  const arrow = document.createElementNS(NS, 'path');
  arrow.setAttribute('d', 'M0 -22 L8 8 L0 3 L-8 8 Z');
  arrow.setAttribute('fill', '#fff');
  arrow.setAttribute('transform', `rotate(${azimuth.toFixed(1)})`);
  svg.append(ring, arrow);
  return svg;
}

function renderHero() {
  const hero = $('#hero');
  clear(hero);
  const day = currentDay();

  if (state.forecastStatus === 'loading' || state.forecastStatus === 'idle') {
    hero.style.background = '#3a3f63';
    hero.append(h('p', { class: 'hero-empty', text: state.place ? 'Reading the sky…' : 'Finding your location…' }));
    return;
  }
  if (state.forecastStatus === 'error' || !day) {
    hero.style.background = '#3a3f63';
    hero.append(h('p', { class: 'hero-empty', text: 'No forecast available yet.' }));
    return;
  }
  hero.style.background = skyGradient(day.score, state.kind);

  if (day.polar) {
    hero.append(
      h('p', { class: 'hero-empty', text: `There is no ${kindWord(state.kind)} on ${fmtLong(day.date)} at this latitude.` })
    );
    return;
  }

  const word = kindWord(state.kind);
  const arrive = day.eventMs - 30 * MINUTE;
  hero.append(
    h('div', {},
      h('p', { class: 'hero-when', text: `${cap(word)}, ${fmtLong(day.date)}` }),
      h('p', { class: 'hero-time', text: fmtTime(day.eventMs, state.tz) })
    ),
    h('div', { class: 'hero-row' },
      h('div', {},
        h('p', { class: 'hero-score', text: day.score == null ? 'Forecast not available' : `${day.label}, ${day.score} out of 100` }),
        day.score == null ? null : h('p', { class: 'hero-headline', text: day.headline }),
        h('p', { class: 'hero-detail',
          text: `Be there by ${fmtTime(arrive, state.tz)}. Golden light ${state.kind === 'sunrise' ? 'until' : 'from'} ${fmtTime(day.goldenMs, state.tz)}.` })
      ),
      h('div', {}, compass(day.azimuth), h('p', { class: 'compass-label', text: `${directionName(day.azimuth)}, ${Math.round(day.azimuth)}°` }))
    )
  );
}

const isUpcoming = (d) => d.eventMs == null || d.eventMs > Date.now();

function bestDayIndex(list) {
  let best = -1;
  let bestScore = -1;
  list.forEach((d, i) => {
    if (!isUpcoming(d)) return; // a sunrise or sunset that has already happened can't be "best"
    if (d.score != null && d.score > bestScore) {
      best = i;
      bestScore = d.score;
    }
  });
  return best;
}

function renderDays() {
  const box = $('#days');
  clear(box);
  const list = state.outlook[state.kind];
  if (!list.length) return;
  const best = bestDayIndex(list);
  list.forEach((d, i) => {
    const name = i === 0 ? 'Today' : fmtWeekday(d.date);
    box.append(
      h('button', {
        type: 'button', class: 'day', 'aria-pressed': String(i === state.day),
        'aria-label': `${fmtShort(d.date)}, ${d.score == null ? 'no forecast' : `${d.label}, ${d.score} out of 100`}${i === best ? ', best day' : ''}`,
        onclick: () => { state.day = i; renderAll(); },
      },
        h('span', { class: 'day-sky', style: `background:${skyGradient(d.score, state.kind)}`, text: d.score == null ? '–' : String(d.score) }),
        h('span', { class: 'day-name', text: `${name} ${fmtDayNum(d.date)}` }),
        h('span', { class: 'day-best', text: i === best ? 'Best' : '' })
      )
    );
  });
}

/** Spots with their rank score, best first, for the current kind. */
function rankedSpots() {
  const hz = state.horizon[state.kind];
  return state.spots
    .map((spot) => ({ spot, hz: hz ? hz[spot.id] : null }))
    .map((row) => ({ ...row, rank: spotRank(row.spot, row.hz) }))
    .sort((a, b) => b.rank - a.rank || a.spot.distanceM - b.spot.distanceM);
}

function bestDayFor(row) {
  const list = state.outlook[state.kind];
  let best = null;
  list.forEach((d, i) => {
    if (!isUpcoming(d)) return;
    const s = spotDayScore(d.score, row.hz);
    if (s != null && (!best || s > best.score)) best = { index: i, score: s, date: d.date };
  });
  return best;
}

function renderSpots() {
  const box = $('#spots');
  clear(box);
  const word = kindWord(state.kind);
  $('#spots-title').textContent = `Best spots for ${word}${state.place ? ` in ${placeLabel(state.place)}` : ''}`;

  if (state.spotsStatus === 'loading') {
    box.append(h('p', { class: 'state', text: 'Finding viewpoints near you…' }),
      h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
    return;
  }
  if (state.spotsStatus === 'error') {
    box.append(h('p', { class: 'state', text: 'Could not load viewpoints. OpenStreetMap may be busy.' }),
      h('button', { type: 'button', class: 'link-button', text: 'Try again', onclick: () => loadSpots(state.place, state.token) }));
    return;
  }
  if (state.spotsStatus === 'empty') {
    box.append(h('p', { class: 'state', text: 'No named viewpoints, hills, beaches or piers are mapped near here. Try a nearby larger city.' }));
    return;
  }
  if (state.spotsStatus !== 'ready') return;

  const hzLoaded = !!state.horizon[state.kind];
  if (!hzLoaded && !state.horizonFailed[state.kind]) {
    box.append(h('p', { class: 'state', text: 'Checking which spots have a clear view toward the sun…' }));
  } else if (state.horizonFailed[state.kind]) {
    box.append(h('p', { class: 'state', text: 'Could not measure how open each view is, so spots are ranked by type only.' }));
  }

  const today = state.outlook[state.kind][0];
  const az = today && today.azimuth != null ? today.azimuth : null;
  const list = h('ol', { class: 'spots' });
  rankedSpots().forEach((row, i) => {
    const best = bestDayFor(row);
    list.append(
      h('li', { class: 'spot' },
        h('button', { type: 'button', onclick: () => openSpot(row) },
          h('span', { class: 'spot-rank', text: String(i + 1) }),
          h('span', {},
            h('span', { class: 'spot-name', text: row.spot.name }), h('br'),
            h('span', { class: 'spot-type', text: `${TYPES[row.spot.type].label}, ${fmtDistance(row.spot.distanceM)} away` })
          ),
          h('span', { class: 'spot-score', text: String(row.rank) }, h('small', { text: 'view' })),
          az == null ? null : h('p', { class: 'spot-view', text: describeView(row.hz, az) }),
          best ? h('p', { class: 'spot-best',
            text: best.index === 0 ? `Today is its best day in the forecast: ${labelFor(best.score)}.`
              : `Best day: ${fmtShort(best.date)}, ${labelFor(best.score)}.` }) : null
        )
      )
    );
  });
  box.append(list);
}

/* ---------- spot detail ---------- */

function openSpot(row) {
  const dialog = $('#spot-dialog');
  const body = $('#spot-body');
  clear(body);
  const day = currentDay();
  const word = kindWord(state.kind);
  const spot = row.spot;

  body.append(
    h('div', { class: 'sheet-head' },
      h('h2', { id: 'spot-title', text: spot.name }),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onclick: () => dialog.close() },
        iconClose())
    ),
    h('p', { class: 'detail-type', text: `${TYPES[spot.type].label}, ${fmtDistance(spot.distanceM)} from the centre of ${placeLabel(state.place)}` })
  );

  if (!day || day.polar || day.eventMs == null) {
    body.append(h('p', { class: 'state', text: `No ${word} to preview on this day.` }));
  } else {
    const score = spotDayScore(day.score, row.hz);
    const before = day.eventMs - 5 * MINUTE;
    const after = day.eventMs + 5 * MINUTE;
    const elev = (ms) => sunPosition(ms, spot.lat, spot.lon).elevation;
    const panel = (ms, caption) =>
      h('figure', { class: 'scene' },
        skyScene({ score, kind: state.kind, elevation: elev(ms), label: `Illustrated sky ${caption} the ${word}` }),
        h('figcaption', {}, `${caption} `, h('strong', { text: fmtTime(ms, state.tz) })));
    body.append(
      h('p', { class: 'detail-note', text: `Predicted sky for ${fmtLong(day.date)}. These are illustrations, not photographs.` }),
      h('div', { class: 'scenes' }, panel(before, '5 minutes before'), panel(after, '5 minutes after')),
      h('ul', { class: 'facts' },
        fact(`${cap(word)}`, fmtTime(day.eventMs, state.tz)),
        fact('Sun direction', `${directionName(day.azimuth)}, ${Math.round(day.azimuth)}°`),
        fact('Sky for this spot', score == null ? 'Not available' : `${labelFor(score)}, ${score}`),
        fact('View toward the sun', row.hz ? `${Math.round(row.hz.open * 100)}% open` : 'Not measured'),
        row.hz ? fact('Height above sea level', `${Math.round(row.hz.elevation)} m`) : null
      ),
      h('p', { class: 'detail-note', text: describeView(row.hz, day.azimuth) + ' Buildings and trees are not included, so check the view in person.' })
    );
  }

  const photosBox = h('div', {}, h('h3', { class: 'section-title', text: 'Photos of this area' }),
    h('p', { class: 'state', text: 'Looking for photos…' }));
  body.append(photosBox,
    h('a', { class: 'maps-link', target: '_blank', rel: 'noopener',
      href: `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`, text: 'Open in maps' }));

  if (!dialog.open) dialog.showModal();
  loadPhotos(spot, day, photosBox);
}

function fact(label, value) {
  return h('li', {}, h('span', { text: label }), h('span', { text: value }));
}

function iconClose() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M6 6l12 12M18 6 6 18');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round');
  svg.append(p);
  return svg;
}

async function loadPhotos(spot, day, box) {
  const heading = box.firstChild;
  const status = box.lastChild;
  try {
    const { data } = await cachedFetch(`ph:${spot.id}`, 30 * DAY, () => fetchPhotos(spot.lat, spot.lon));
    const eventMinutes = day && day.eventMs ? clockMinutes(day.eventMs, state.tz) : null;
    const ranked = rankPhotos(data, state.kind, eventMinutes).slice(0, 4);
    if (!ranked.length) {
      status.textContent = 'No freely licensed photos are tagged at this exact place. Try the maps link below.';
      return;
    }
    const likely = ranked.some((p) => p.fit === 'likely');
    heading.textContent = likely ? `Photos taken around ${kindWord(state.kind)}` : 'Photos of this area';
    status.replaceWith(
      h('ul', { class: 'photos' }, ranked.map((p) =>
        h('li', {},
          h('a', { href: p.page || p.thumb, target: '_blank', rel: 'noopener' },
            h('img', { src: p.thumb, alt: p.title || 'Photo near this spot', loading: 'lazy', width: 480, height: 360 })),
          h('p', { class: 'photo-credit', style: 'margin:4px 0 0;font-size:12px;color:var(--muted)',
            text: [p.artist, p.license, 'Wikimedia Commons'].filter(Boolean).join(', ') })
        )))
    );
  } catch {
    status.textContent = 'Could not load photos right now.';
  }
}

/* ---------- city search ---------- */

function openCityDialog(message = '') {
  const dialog = $('#city-dialog');
  $('#city-message').textContent = message;
  clear($('#city-results'));
  if (!dialog.open) dialog.showModal();
  $('#city-input').focus();
}

async function runSearch(event) {
  event.preventDefault();
  const q = $('#city-input').value;
  const msg = $('#city-message');
  const list = $('#city-results');
  clear(list);
  if (q.trim().length < 2) {
    msg.textContent = 'Type at least two letters.';
    return;
  }
  msg.textContent = 'Searching…';
  try {
    const results = await searchCities(q);
    if (!results.length) {
      msg.textContent = `No city found for “${q.trim()}”. Check the spelling or try a larger nearby city.`;
      return;
    }
    msg.textContent = '';
    for (const r of results) {
      list.append(
        h('li', {},
          h('button', { type: 'button', onclick: () => { $('#city-dialog').close(); usePlace(r); } },
            h('span', { text: r.name }),
            h('span', { class: 'sub', text: [r.region, r.country].filter(Boolean).join(', ') })))
      );
    }
  } catch {
    msg.textContent = 'Search failed. Check your connection and try again.';
  }
}

async function useMyLocation({ fromDialog = false } = {}) {
  const msg = $('#city-message');
  if (fromDialog) msg.textContent = 'Getting your location…';
  try {
    const pos = await getPosition();
    const name = await reverseName(pos.lat, pos.lon);
    if (fromDialog) $('#city-dialog').close();
    await usePlace({ ...name, lat: pos.lat, lon: pos.lon });
  } catch (err) {
    const denied = err && err.code === 1;
    const text = denied
      ? 'Location is switched off for this app. Search for your city instead.'
      : 'Could not get your location. Search for your city instead.';
    if (fromDialog) msg.textContent = text;
    else openCityDialog(text);
  }
}

/* ---------- startup ---------- */

function wire() {
  $('#city-button').addEventListener('click', () => openCityDialog());
  $('#refresh').addEventListener('click', () => state.place && refresh());
  $('#city-form').addEventListener('submit', runSearch);
  $('#use-location').addEventListener('click', () => useMyLocation({ fromDialog: true }));
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close();
      if (e.target.closest && e.target.closest('[data-close]')) d.close();
    });
  }
  for (const b of document.querySelectorAll('.kind button')) {
    b.addEventListener('click', () => {
      if (state.kind === b.dataset.kind) return;
      state.kind = b.dataset.kind;
      renderAll();
      loadHorizon();
    });
  }
}

function registerWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

async function start() {
  wire();
  registerWorker();
  renderAll();
  const saved = load('place');
  if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number') {
    usePlace(saved, { remember: false });
  } else {
    await useMyLocation();
  }
}

start();
