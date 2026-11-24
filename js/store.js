// Small localStorage wrapper. Storage can be blocked or full (private mode,
// some embedded browsers), so every call is guarded and the app still works
// without it.

const PREFIX = 'goldenspots:';

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** { at, data } for a cached value, or null. Callers decide how old is too old. */
export function getCache(key) {
  const v = load('c:' + key);
  return v && typeof v.at === 'number' ? v : null;
}

export function putCache(key, data) {
  save('c:' + key, { at: Date.now(), data });
}

export const MINUTE = 60000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Fresh cache hit, else fetch and cache, else fall back to stale data if the fetch fails. */
export async function cachedFetch(key, maxAgeMs, fetcher) {
  const hit = getCache(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return { data: hit.data, stale: false };
  try {
    const data = await fetcher();
    putCache(key, data);
    return { data, stale: false };
  } catch (err) {
    if (hit) return { data: hit.data, stale: true };
    throw err;
  }
}
