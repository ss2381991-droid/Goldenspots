// Real photos of a place from Wikimedia Commons (free, no key), preferring
// ones taken around sunrise or sunset. Commons has no photo for an exact
// minute at an exact spot, so these are samples of the view, not a live shot.

import { getJSON } from './net.js';

const KEYWORDS = {
  sunset: /sunset|sundown|dusk|golden hour|twilight|evening/i,
  sunrise: /sunrise|sunup|dawn|first light|morning/i,
};

function plainText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export async function fetchPhotos(lat, lon, radius = 1200) {
  const q = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'geosearch',
    ggscoord: `${lat}|${lon}`,
    ggsradius: String(radius),
    ggsnamespace: '6',
    ggslimit: '40',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '480',
    iiextmetadatafilter: 'DateTimeOriginal|ImageDescription|Artist|LicenseShortName',
  });
  const json = await getJSON(`https://commons.wikimedia.org/w/api.php?${q}`);
  const pages = Object.values(json.query?.pages || {});
  const photos = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info || !info.thumburl || !/^image\/(jpeg|png)$/.test(info.mime || '')) continue;
    const meta = info.extmetadata || {};
    photos.push({
      title: String(p.title || '').replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
      thumb: info.thumburl,
      page: info.descriptionurl,
      artist: plainText(meta.Artist?.value),
      license: plainText(meta.LicenseShortName?.value),
      description: plainText(meta.ImageDescription?.value),
      taken: plainText(meta.DateTimeOriginal?.value),
    });
  }
  return photos;
}

function minutesOfDay(takenText) {
  const m = /(\d{1,2}):(\d{2})/.exec(takenText || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Sort photos so ones likely taken near the sun event come first.
 * eventMinutes is the event's local clock time in minutes after midnight.
 * Each photo gains a score and a fit of 'likely' or 'sample'.
 */
export function rankPhotos(photos, kind, eventMinutes) {
  const want = KEYWORDS[kind];
  const other = KEYWORDS[kind === 'sunset' ? 'sunrise' : 'sunset'];
  return photos
    .map((p) => {
      const text = `${p.title} ${p.description}`;
      let score = 0;
      if (want.test(text)) score += 3;
      if (other.test(text) && !want.test(text)) score -= 2;
      const taken = minutesOfDay(p.taken);
      if (taken != null && eventMinutes != null) {
        const diff = Math.abs(taken - eventMinutes);
        const circular = Math.min(diff, 1440 - diff);
        if (circular <= 60) score += 2;
        else if (circular <= 120) score += 1;
      }
      return { ...p, score, fit: score >= 2 ? 'likely' : 'sample' };
    })
    .sort((a, b) => b.score - a.score);
}
