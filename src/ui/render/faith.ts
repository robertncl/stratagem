// Faith symbols, as SVG paths in a 20 × 20 box centred on (10, 10), drawn
// on a disc of the religion's colour: the same shapes on the map canvas
// (via Path2D) and in HTML panels (as inline SVG).

import { RELIGIONS, ReligionId } from '../../core/data/religions';

interface Glyph {
  d: string;
  evenodd?: boolean;
}

const GLYPHS: Record<ReligionId, Glyph[]> = {
  // Latin cross
  catholic: [{ d: 'M8.7 3.2h2.6v3.5h3.5v2.6h-3.5v7.5H8.7V9.3H5.2V6.7h3.5z' }],
  // crescent and star
  islam: [
    { d: 'M12.8 5.4A6 6 0 1 0 12.8 14.6A4.8 4.8 0 1 1 12.8 5.4Z' },
    { d: 'M15.4 7.9l.6 1.3 1.4.15-1.05.95.3 1.4-1.25-.72-1.25.72.3-1.4-1.05-.95 1.4-.15z' },
  ],
  // ringed cross
  protestant: [
    { d: 'M10 4a6 6 0 1 1 0 12a6 6 0 1 1 0-12zm0 1.7a4.3 4.3 0 1 0 0 8.6a4.3 4.3 0 1 0 0-8.6z', evenodd: true },
    { d: 'M9.1 2.6h1.8v14.8H9.1zM2.6 9.1h14.8v1.8H2.6z' },
  ],
};

const INK = '#1d160b';
const paths = new Map<ReligionId, { p: Path2D; rule: CanvasFillRule }[]>();

/** Draw a faith badge of radius `r` centred on (x, y). */
export function drawFaithBadge(ctx: CanvasRenderingContext2D, rel: ReligionId, x: number, y: number, r: number) {
  let list = paths.get(rel);
  if (!list) {
    list = GLYPHS[rel].map((g) => ({ p: new Path2D(g.d), rule: g.evenodd ? 'evenodd' : 'nonzero' }));
    paths.set(rel, list);
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = RELIGIONS[rel].color;
  ctx.fill();
  ctx.translate(x - r, y - r);
  ctx.scale(r / 10, r / 10);
  ctx.fillStyle = INK;
  for (const { p, rule } of list) ctx.fill(p, rule);
  ctx.restore();
}

/** Inline SVG badge for HTML panels, with the faith's name as its tooltip. */
export function faithIcon(rel: ReligionId | undefined, size = 15): string {
  if (!rel) return '';
  const r = RELIGIONS[rel];
  const shapes = GLYPHS[rel].map((g) => `<path d="${g.d}" fill="${INK}"${g.evenodd ? ' fill-rule="evenodd"' : ''}/>`).join('');
  return `<svg class="faith-ico" viewBox="0 0 20 20" width="${size}" height="${size}" role="img" aria-label="${r.name}"><title>${r.name}</title><circle cx="10" cy="10" r="10" fill="${r.color}"/>${shapes}</svg>`;
}
