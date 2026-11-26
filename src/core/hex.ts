// Hex grid helpers. The map is a pointy-top hex grid stored in "odd-r"
// offset coordinates (odd rows shoved right by half a hex). Tiles are
// addressed by a flat index: row * width + col.

export const SQRT3 = Math.sqrt(3);

export interface GridSize {
  width: number;
  height: number;
}

/** Axial directions in edge order: E, SE, SW, W, NW, NE (screen y grows downward). */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

export function colOf(g: GridSize, i: number): number {
  return i % g.width;
}

export function rowOf(g: GridSize, i: number): number {
  return Math.floor(i / g.width);
}

export function index(g: GridSize, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= g.width || row >= g.height) return -1;
  return row * g.width + col;
}

export function offsetToAxial(col: number, row: number): [number, number] {
  return [col - ((row - (row & 1)) >> 1), row];
}

export function axialToOffset(q: number, r: number): [number, number] {
  return [q + ((r - (r & 1)) >> 1), r];
}

export function neighbor(g: GridSize, i: number, dir: number): number {
  const [q, r] = offsetToAxial(colOf(g, i), rowOf(g, i));
  const d = DIRS[dir];
  const [c, rr] = axialToOffset(q + d[0], r + d[1]);
  return index(g, c, rr);
}

const neighborCache = new WeakMap<GridSize, number[][]>();

/** In-bounds neighbours of tile i (cached per grid object). */
export function neighbors(g: GridSize, i: number): number[] {
  let cache = neighborCache.get(g);
  if (!cache) {
    cache = [];
    neighborCache.set(g, cache);
  }
  let n = cache[i];
  if (!n) {
    n = [];
    for (let d = 0; d < 6; d++) {
      const j = neighbor(g, i, d);
      if (j >= 0) n.push(j);
    }
    cache[i] = n;
  }
  return n;
}

export function distance(g: GridSize, a: number, b: number): number {
  const [aq, ar] = offsetToAxial(colOf(g, a), rowOf(g, a));
  const [bq, br] = offsetToAxial(colOf(g, b), rowOf(g, b));
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** All in-bounds tiles within `radius` of `center` (including center). */
export function tilesInRadius(g: GridSize, center: number, radius: number): number[] {
  const out: number[] = [];
  const [cq, cr] = offsetToAxial(colOf(g, center), rowOf(g, center));
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) {
      const [c, r] = axialToOffset(cq + dq, cr + dr);
      const i = index(g, c, r);
      if (i >= 0) out.push(i);
    }
  }
  return out;
}

/** Centre of a hex in world pixels for a given circumradius. */
export function hexCenter(col: number, row: number, size: number): [number, number] {
  return [size * SQRT3 * (col + 0.5 * (row & 1)) + (size * SQRT3) / 2, size * 1.5 * row + size];
}

export function tileCenter(g: GridSize, i: number, size: number): [number, number] {
  return hexCenter(colOf(g, i), rowOf(g, i), size);
}

/** World pixel → tile index (or -1). */
export function pixelToTile(g: GridSize, x: number, y: number, size: number): number {
  const px = x - (size * SQRT3) / 2;
  const py = y - size;
  const q = ((SQRT3 / 3) * px - (1 / 3) * py) / size;
  const r = ((2 / 3) * py) / size;
  // cube rounding
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  const [c, row] = axialToOffset(rq, rr);
  return index(g, c, row);
}

/** Corner k (0..5) of a pointy-top hex, starting upper-right and going clockwise. */
export function hexCorner(cx: number, cy: number, size: number, k: number): [number, number] {
  const a = (Math.PI / 180) * (60 * k - 30);
  return [cx + size * Math.cos(a), cy + size * Math.sin(a)];
}
