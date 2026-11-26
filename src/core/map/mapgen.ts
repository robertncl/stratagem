// Rasterises the hand-drawn geography of Western Europe onto the hex grid
// and decorates it with terrain, rivers and resources.

import { colOf, distance, hexCenter, index, neighbors, pixelToTile, rowOf, SQRT3, tilesInRadius } from '../hex';
import { fbm, hash2, Rng } from '../rng';
import { RESOURCES, ResourceId, TerrainId, TERRAIN } from '../data/terrain';
import { BOUNDS, FORESTS, LAKES, LANDMASSES, LonLat, MARSHES, RIDGES, RIVERS } from './geography';

export interface Tile {
  t: TerrainId;
  river: boolean;
  res: ResourceId | null;
  /** owning player id, -1 if unclaimed */
  owner: number;
  /** id of the city whose borders include this tile, -1 if none */
  city: number;
}

export interface GameMap {
  width: number;
  height: number;
  /** circumradius of one hex, in km (used for geographic lookups) */
  hexKm: number;
  tiles: Tile[];
  /** river courses as ordered tile paths, for rendering */
  rivers: { name: string; path: number[] }[];
}

export const MAP_COLUMNS = 58;
const MOUNTAIN_SCALE = 0.72;
const HILL_SCALE = 0.58;
const KM_LAT = 111;
const REF_LAT = 47.5;
const KM_LON = KM_LAT * Math.cos((REF_LAT * Math.PI) / 180);

export function mapDimensions(columns = MAP_COLUMNS) {
  const widthKm = (BOUNDS.lonMax - BOUNDS.lonMin) * KM_LON;
  const hexWidth = widthKm / (columns + 0.5);
  const size = hexWidth / SQRT3;
  const heightKm = (BOUNDS.latMax - BOUNDS.latMin) * KM_LAT;
  const rows = Math.floor((heightKm - 2 * size) / (1.5 * size)) + 1;
  return { width: columns, height: rows, hexKm: size };
}

export function lonLatToKm(lon: number, lat: number): [number, number] {
  return [(lon - BOUNDS.lonMin) * KM_LON, (BOUNDS.latMax - lat) * KM_LAT];
}

export function kmToLonLat(x: number, y: number): [number, number] {
  return [BOUNDS.lonMin + x / KM_LON, BOUNDS.latMax - y / KM_LAT];
}

export function lonLatToTile(map: { width: number; height: number; hexKm: number }, lon: number, lat: number): number {
  const [x, y] = lonLatToKm(lon, lat);
  return pixelToTile(map, x, y, map.hexKm);
}

export function tileLonLat(map: { width: number; hexKm: number }, i: number): [number, number] {
  const [x, y] = hexCenter(i % map.width, Math.floor(i / map.width), map.hexKm);
  return kmToLonLat(x, y);
}

function pointInPoly(lon: number, lat: number, poly: readonly LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function isLandPoint(lon: number, lat: number): boolean {
  for (const lake of LAKES) if (pointInPoly(lon, lat, lake.poly)) return false;
  for (const m of LANDMASSES) if (pointInPoly(lon, lat, m.poly)) return true;
  return false;
}

/** Distance in km from a point to a polyline given in lon/lat. */
function distToPolyline(x: number, y: number, pts: readonly LonLat[]): number {
  let best = Infinity;
  const km = pts.map(([lo, la]) => lonLatToKm(lo, la));
  for (let i = 0; i < km.length - 1; i++) {
    const [ax, ay] = km[i];
    const [bx, by] = km[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

function distKm(x: number, y: number, at: LonLat): number {
  const [ax, ay] = lonLatToKm(at[0], at[1]);
  return Math.hypot(x - ax, y - ay);
}

function baseClimate(lon: number, lat: number, n: number): TerrainId {
  // North Africa: dry plains, desert toward the south.
  if (lat < 37.4 && lon > -6.5 && lon < 12 && !(lon > 8 && lat > 37) && lat < 36.0 + (lon < 0 ? 0 : 1.4)) {
    if (lat < 36.0 && n > 0.45) return 'desert';
    return n > 0.75 ? 'grassland' : 'plains';
  }
  // Iberia
  if (lon < 3.4 && lat < 43.9 && lat > 35.9) {
    const green = lat > 42.6 || (lon < -7.6 && lat > 40.4);
    if (green) return n > 0.3 ? 'grassland' : 'plains';
    if (lon > -3 && lon < -0.4 && lat < 38.3 && n > 0.62) return 'desert';
    return n > 0.68 ? 'grassland' : 'plains';
  }
  // Mediterranean France / Italy / Balkan coast
  if (lat < 44.3 || (lon > 7 && lat < 45.2 && lon < 18)) return n > 0.5 ? 'grassland' : 'plains';
  // Pannonian plain
  if (lon > 16.8 && lat < 48 && lat > 45.3) return n > 0.55 ? 'grassland' : 'plains';
  // Atlantic & central Europe
  return n > 0.36 ? 'grassland' : 'plains';
}

function forestDensity(lon: number, lat: number, x: number, y: number): number {
  let d: number;
  if (lat > 56.3 && lon > 7) d = 0.55; // Scandinavia
  else if (lon > 6 && lat > 47 && lat < 55) d = 0.3; // Germany / Poland
  else if (lon > 13 && lat > 43 && lat < 47) d = 0.3; // Balkans
  else if (lon < 3.4 && lat < 43.9 && lat > 35.9) d = lat > 42.6 ? 0.22 : 0.06; // Iberia
  else if (lat < 37.4 && lon > -6.5 && lon < 12) d = 0.02; // Maghreb
  else if (lon < -5.2 && lat > 51.3 && lat < 55.5) d = 0.08; // Ireland
  else if (lat > 55.8 && lon < -1.5) d = 0.12; // Scotland
  else if (lon < 2 && lat > 49.9) d = 0.14; // England
  else if (lat < 45) d = 0.12; // Mediterranean
  else d = 0.2; // France etc.
  for (const f of FORESTS) {
    const dist = distKm(x, y, f.at);
    if (dist < f.radius) d = Math.max(d, f.density * (1 - (dist / f.radius) * 0.4));
  }
  return d;
}

const SHALLOW_SEAS: { lon: [number, number]; lat: [number, number] }[] = [
  { lon: [-2, 9], lat: [50.5, 58] }, // North Sea
  { lon: [-5.5, 2], lat: [49.3, 51.2] }, // English Channel
  { lon: [9, 21], lat: [53.8, 59.5] }, // Baltic
  { lon: [12, 19.5], lat: [40, 45.8] }, // Adriatic
  { lon: [-6.5, -3], lat: [51.5, 55] }, // Irish Sea
];

export interface MapGenOptions {
  seed: number;
  columns?: number;
}

export function generateMap(opts: MapGenOptions): GameMap {
  const { width, height, hexKm } = mapDimensions(opts.columns);
  const g = { width, height };
  const seed = opts.seed;
  const n = width * height;
  const land: boolean[] = new Array(n).fill(false);
  const centers: [number, number][] = [];

  // 1. Land mask: centre counts double, plus six inner samples.
  for (let i = 0; i < n; i++) {
    const [cx, cy] = hexCenter(colOf(g, i), rowOf(g, i), hexKm);
    centers.push([cx, cy]);
    const [lon, lat] = kmToLonLat(cx, cy);
    let score = isLandPoint(lon, lat) ? 2 : 0;
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k;
      const [slon, slat] = kmToLonLat(cx + Math.cos(a) * hexKm * 0.55, cy + Math.sin(a) * hexKm * 0.55);
      if (isLandPoint(slon, slat)) score++;
    }
    land[i] = score >= 4;
  }
  // Small islands always get at least one tile.
  for (const m of LANDMASSES) {
    if (!m.minTile) continue;
    let lonSum = 0;
    let latSum = 0;
    for (const [lo, la] of m.poly) {
      lonSum += lo;
      latSum += la;
    }
    const lon = lonSum / m.poly.length;
    const lat = latSum / m.poly.length;
    if (lon < BOUNDS.lonMin || lon > BOUNDS.lonMax || lat < BOUNDS.latMin || lat > BOUNDS.latMax) continue;
    const t = lonLatToTile({ width, height, hexKm }, lon, lat);
    if (t >= 0) land[t] = true;
  }

  const tiles: Tile[] = [];
  for (let i = 0; i < n; i++) tiles.push({ t: 'ocean', river: false, res: null, owner: -1, city: -1 });

  // 2. Land terrain.
  for (let i = 0; i < n; i++) {
    if (!land[i]) continue;
    const [x, y] = centers[i];
    const [lon, lat] = kmToLonLat(x, y);
    const nz = fbm(x / 90, y / 90, seed);
    const nz2 = fbm(x / 60 + 31.7, y / 60 + 11.3, seed + 101);
    let terrain: TerrainId = baseClimate(lon, lat, nz);

    if (nz2 < 0.06 + forestDensity(lon, lat, x, y) * 1.3) terrain = 'forest';

    for (const m of MARSHES) {
      if (distKm(x, y, m.at) < m.radius && hash2(i, 7, seed) > 0.3) terrain = 'marsh';
    }

    const jitter = 0.75 + 0.5 * fbm(x / 40 + 5, y / 40 + 9, seed + 7);
    for (const r of RIDGES) {
      const d = distToPolyline(x, y, r.points);
      if (d < r.mountain * MOUNTAIN_SCALE * jitter) {
        terrain = hash2(i, 3, seed) < 0.82 ? 'mountains' : 'hills';
        break;
      }
      if (d < r.hills * HILL_SCALE * jitter && hash2(i, 5, seed) < 0.85) terrain = 'hills';
    }
    tiles[i].t = terrain;
  }

  // 3. Water depth via BFS distance from land.
  const dist = new Array<number>(n).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (land[i]) {
    dist[i] = 0;
    queue.push(i);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    for (const j of neighbors(g, i)) {
      if (dist[j] > dist[i] + 1) {
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (land[i]) continue;
    const [x, y] = centers[i];
    const [lon, lat] = kmToLonLat(x, y);
    const shallowSea = SHALLOW_SEAS.some((s) => lon >= s.lon[0] && lon <= s.lon[1] && lat >= s.lat[0] && lat <= s.lat[1]);
    if (LAKES.some((l) => pointInPoly(lon, lat, l.poly))) tiles[i].t = 'lake';
    else if (dist[i] <= 1 || (shallowSea && dist[i] <= 3)) tiles[i].t = 'coast';
    else tiles[i].t = 'ocean';
  }

  // 4. Rivers.
  const rivers: { name: string; path: number[] }[] = [];
  const dims = { width, height, hexKm };
  for (const r of RIVERS) {
    let path: number[] = [];
    const flush = () => {
      if (path.length >= 2) rivers.push({ name: r.name, path });
      path = [];
    };
    for (let s = 0; s < r.points.length - 1; s++) {
      const [ax, ay] = lonLatToKm(r.points[s][0], r.points[s][1]);
      const [bx, by] = lonLatToKm(r.points[s + 1][0], r.points[s + 1][1]);
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 8));
      for (let k = 0; k <= steps; k++) {
        const x = ax + ((bx - ax) * k) / steps;
        const y = ay + ((by - ay) * k) / steps;
        const t = pixelToTile(dims, x, y, hexKm);
        if (t < 0) continue;
        if (!land[t]) {
          flush();
          continue;
        }
        const last = path[path.length - 1];
        if (last === t) continue;
        if (last !== undefined && distance(g, last, t) > 1) flush();
        path.push(t);
        tiles[t].river = true;
      }
    }
    flush();
  }

  // 5. Resources.
  const rng = new Rng(seed ^ 0x5eed);
  const resIds = Object.keys(RESOURCES) as ResourceId[];
  for (let i = 0; i < n; i++) {
    const tile = tiles[i];
    const lat = kmToLonLat(centers[i][0], centers[i][1])[1];
    if (tile.t === 'coast' || tile.t === 'lake') {
      if (dist[i] === 1 && rng.chance(0.1)) tile.res = 'fish';
      continue;
    }
    if (!land[i] || !rng.chance(0.12)) continue;
    const options = resIds.filter((id) => {
      const def = RESOURCES[id];
      if (id === 'fish' || !def.terrains.includes(tile.t)) return false;
      if (id === 'wine' && lat > 50.5) return false;
      if (id === 'olives' && lat > 44.5) return false;
      if (id === 'furs' && lat < 50) return false;
      return true;
    });
    if (options.length) tile.res = rng.pick(options);
  }

  return { width, height, hexKm, tiles, rivers };
}

/** Closest land tile (not mountains) to a geographic point, or -1. */
export function nearestLandTile(map: GameMap, lon: number, lat: number, maxRadius = 3): number {
  const start = lonLatToTile(map, lon, lat);
  if (start < 0) return -1;
  const [x, y] = lonLatToKm(lon, lat);
  let best = -1;
  let bestD = Infinity;
  for (let r = 0; r <= maxRadius && best < 0; r++) {
    for (const t of tilesInRadius(map, start, r)) {
      const def = TERRAIN[map.tiles[t].t];
      if (def.water || map.tiles[t].t === 'mountains') continue;
      const [cx, cy] = hexCenter(t % map.width, Math.floor(t / map.width), map.hexKm);
      const d = Math.hypot(cx - x, cy - y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
  }
  return best;
}

/** Index helper re-exported for convenience. */
export function tileAt(map: GameMap, col: number, row: number): number {
  return index(map, col, row);
}
