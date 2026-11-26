// Procedural terrain textures. Each terrain gets a seamless, tiling noise
// texture that is used as a canvas pattern anchored in world space, so
// neighbouring hexes of the same terrain join up without visible seams.

import type { TerrainId } from '../../core/data/terrain';

/** Texture size in pixels and the world units it covers. */
const SIZE = 384;
export const TEXTURE_WORLD = 192;

type RGB = [number, number, number];

const hex = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Integer hash → [0,1). */
function h(x: number, y: number, seed: number): number {
  let v = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise that wraps every `px` cells horizontally and `py` vertically. */
function periodicNoise(u: number, v: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = smooth(u - x0);
  const fy = smooth(v - y0);
  const xa = ((x0 % px) + px) % px;
  const xb = (xa + 1) % px;
  const ya = ((y0 % py) + py) % py;
  const yb = (ya + 1) % py;
  const a = h(xa, ya, seed);
  const b = h(xb, ya, seed);
  const c = h(xa, yb, seed);
  const d = h(xb, yb, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Fractal noise over a texture coordinate in [0,1)², periodic at the edges. */
function fbm(s: number, t: number, cellsX: number, cellsY: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const kx = cellsX << o;
    const ky = cellsY << o;
    sum += periodicNoise(s * kx, t * ky, kx, ky, seed + o * 31) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

interface Style {
  dark: string;
  light: string;
  /** base noise cells across the texture (x, y) */
  cells: [number, number];
  octaves: number;
  /** per-pixel grain strength */
  grain: number;
  /** optional extra colour mixed in where a second noise field is high */
  accent?: { color: string; threshold: number; cells: [number, number] };
  /** desert ripples */
  ripples?: number;
}

const STYLES: Record<TerrainId, Style> = {
  ocean: { dark: '#132c48', light: '#1f4570', cells: [3, 3], octaves: 4, grain: 0.025 },
  coast: { dark: '#24557d', light: '#3a7fae', cells: [3, 3], octaves: 4, grain: 0.03 },
  lake: { dark: '#2a6390', light: '#4590c0', cells: [3, 3], octaves: 3, grain: 0.03 },
  grassland: {
    dark: '#55803a',
    light: '#7eaa50',
    cells: [4, 4],
    octaves: 4,
    grain: 0.1,
    accent: { color: '#8db45a', threshold: 0.66, cells: [6, 6] },
  },
  plains: {
    dark: '#a08f4f',
    light: '#c7b872',
    cells: [2, 8],
    octaves: 3,
    grain: 0.09,
    accent: { color: '#b9a35a', threshold: 0.6, cells: [3, 12] },
  },
  forest: { dark: '#26492a', light: '#3f6a37', cells: [5, 5], octaves: 4, grain: 0.12 },
  hills: {
    dark: '#7b7449',
    light: '#a39b63',
    cells: [4, 4],
    octaves: 4,
    grain: 0.1,
    accent: { color: '#6e8a45', threshold: 0.62, cells: [5, 5] },
  },
  mountains: { dark: '#6a645d', light: '#97908a', cells: [6, 6], octaves: 5, grain: 0.14 },
  marsh: {
    dark: '#4b6a4f',
    light: '#678a64',
    cells: [5, 5],
    octaves: 4,
    grain: 0.1,
    accent: { color: '#3d6774', threshold: 0.6, cells: [7, 7] },
  },
  desert: { dark: '#c6aa6e', light: '#e2cd96', cells: [3, 3], octaves: 3, grain: 0.06, ripples: 22 },
};

function generate(style: Style, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;
  const dark = hex(style.dark);
  const light = hex(style.light);
  const accent = style.accent ? hex(style.accent.color) : null;
  for (let y = 0; y < SIZE; y++) {
    const t = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const s = x / SIZE;
      let n = fbm(s, t, style.cells[0], style.cells[1], style.octaves, seed);
      n = Math.min(1, Math.max(0, (n - 0.5) * 1.6 + 0.5));
      if (style.ripples) {
        const warp = fbm(s, t, 3, 3, 2, seed + 101) * 6;
        n = n * 0.6 + 0.4 * (0.5 + 0.5 * Math.sin((t * style.ripples + warp) * Math.PI * 2));
      }
      let r = dark[0] + (light[0] - dark[0]) * n;
      let g = dark[1] + (light[1] - dark[1]) * n;
      let b = dark[2] + (light[2] - dark[2]) * n;
      if (accent && style.accent) {
        const a = fbm(s, t, style.accent.cells[0], style.accent.cells[1], 3, seed + 57);
        const k = Math.min(1, Math.max(0, (a - style.accent.threshold) * 6));
        r += (accent[0] - r) * k * 0.8;
        g += (accent[1] - g) * k * 0.8;
        b += (accent[2] - b) * k * 0.8;
      }
      const grain = 1 + (h(x, y, seed + 9) - 0.5) * 2 * style.grain;
      const i = (y * SIZE + x) * 4;
      d[i] = r * grain;
      d[i + 1] = g * grain;
      d[i + 2] = b * grain;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

let cache: Record<TerrainId, HTMLCanvasElement> | null = null;

/** Terrain texture canvases, generated once per page. */
export function terrainTextures(): Record<TerrainId, HTMLCanvasElement> {
  if (!cache) {
    const out = {} as Record<TerrainId, HTMLCanvasElement>;
    let seed = 1;
    for (const id of Object.keys(STYLES) as TerrainId[]) out[id] = generate(STYLES[id], seed++ * 7919);
    cache = out;
  }
  return cache;
}

/** Patterns for one drawing context, mapped so one texture spans TEXTURE_WORLD world units. */
export function terrainPatterns(ctx: CanvasRenderingContext2D): Record<TerrainId, CanvasPattern> {
  const tex = terrainTextures();
  const k = TEXTURE_WORLD / SIZE;
  const m = new DOMMatrix([k, 0, 0, k, 0, 0]);
  const out = {} as Record<TerrainId, CanvasPattern>;
  for (const id of Object.keys(tex) as TerrainId[]) {
    const p = ctx.createPattern(tex[id], 'repeat')!;
    p.setTransform(m);
    out[id] = p;
  }
  return out;
}
