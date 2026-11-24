// An illustrated sky for one moment: the predicted colours for the day's
// score, with the sun placed where it will be at that time. It is an
// illustration of what to expect, not a photograph.

import { skyColors } from './sky.js';
import { clamp } from './geo.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

let counter = 0;

export function skyScene({ score, kind, elevation, label }) {
  const id = `scene${++counter}`;
  const W = 240;
  const H = 150;
  const horizon = 108;
  const dim = clamp(-(elevation + 0.8) / 7, 0, 0.85);
  const [top, mid, low] = skyColors(score, kind, dim);
  const strength = score == null ? 0.3 : 0.3 + 0.6 * (score / 100);

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': label,
    preserveAspectRatio: 'xMidYMid slice',
  });

  const defs = el('defs');
  const sky = el('linearGradient', { id: `${id}s`, x1: 0, y1: 0, x2: 0, y2: 1 });
  [[0, top], [0.58, mid], [1, low]].forEach(([o, c]) =>
    sky.append(el('stop', { offset: o, 'stop-color': c }))
  );
  const glow = el('radialGradient', { id: `${id}g` });
  glow.append(el('stop', { offset: 0, 'stop-color': '#ffd9a0', 'stop-opacity': strength }));
  glow.append(el('stop', { offset: 1, 'stop-color': '#ffd9a0', 'stop-opacity': 0 }));
  const clip = el('clipPath', { id: `${id}c` });
  clip.append(el('rect', { x: 0, y: 0, width: W, height: horizon }));
  defs.append(sky, glow, clip);
  svg.append(defs);

  svg.append(el('rect', { width: W, height: H, fill: `url(#${id}s)` }));

  const cy = horizon - elevation * 16;
  const cx = W / 2;
  if (elevation > -4) {
    const g = el('g', { 'clip-path': `url(#${id}c)` });
    g.append(el('circle', { cx, cy, r: 54, fill: `url(#${id}g)` }));
    g.append(el('circle', { cx, cy, r: 10, fill: '#fff1d6', opacity: elevation > -1 ? 1 : 0.5 }));
    svg.append(g);
  }

  svg.append(el('rect', { x: 0, y: horizon, width: W, height: H - horizon, fill: '#10122a' }));
  svg.append(
    el('path', {
      d: `M0 ${horizon} C40 ${horizon - 5} 80 ${horizon - 1} 120 ${horizon - 4} S200 ${horizon - 2} ${W} ${horizon - 5} L${W} ${horizon} Z`,
      fill: '#10122a',
    })
  );
  return svg;
}
