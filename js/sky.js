// Paints a predicted sky: a dull grey-blue at a score of 0, rich colour at 100.
// Colours are mixed in RGB so the blend never passes through green.

const PALETTE = {
  sunset: {
    top: [[20, 22, 48], [30, 26, 70]],
    mid: [[52, 58, 84], [170, 60, 128]],
    low: [[96, 106, 124], [250, 168, 66]],
  },
  sunrise: {
    top: [[38, 48, 92], [46, 58, 116]],
    mid: [[86, 100, 140], [214, 110, 150]],
    low: [[150, 168, 186], [255, 196, 130]],
  },
};

const NIGHT = { top: [8, 10, 26], mid: [14, 16, 38], low: [26, 26, 52] };

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

/**
 * Three sky colours (top, middle, horizon) for a score. dim (0 to 1) darkens
 * the sky towards night, used for the minutes when the sun is below the horizon.
 */
export function skyColors(score, kind = 'sunset', dim = 0) {
  const t = score == null ? 0 : Math.max(0, Math.min(1, score / 100));
  const p = PALETTE[kind] || PALETTE.sunset;
  const pick = (band) => {
    const c = mix(p[band][0], p[band][1], t);
    return rgb(dim > 0 ? mix(c, NIGHT[band], dim) : c);
  };
  return [pick('top'), pick('mid'), pick('low')];
}

export function skyGradient(score, kind = 'sunset') {
  const [top, mid, low] = skyColors(score, kind);
  return `linear-gradient(180deg, ${top} 0%, ${mid} 58%, ${low} 100%)`;
}
