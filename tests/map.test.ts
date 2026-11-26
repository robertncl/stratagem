import { describe, expect, it } from 'vitest';
import { generateMap, lonLatToTile, nearestLandTile, tileLonLat } from '../src/core/map/mapgen';
import { TERRAIN } from '../src/core/data/terrain';
import { distance, neighbors, tilesInRadius, pixelToTile, tileCenter } from '../src/core/hex';

const map = generateMap({ seed: 1 });
const at = (lon: number, lat: number) => map.tiles[lonLatToTile(map, lon, lat)];
const isLand = (lon: number, lat: number) => !TERRAIN[at(lon, lat).t].water;

function component(start: number): Set<number> {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const i = q.pop()!;
    for (const j of neighbors(map, i)) {
      if (!seen.has(j) && !TERRAIN[map.tiles[j].t].water) {
        seen.add(j);
        q.push(j);
      }
    }
  }
  return seen;
}

describe('hex math', () => {
  it('round-trips tile centres through pixel lookup', () => {
    for (const i of [0, 57, 58, 1000, 2345, map.tiles.length - 1]) {
      const [x, y] = tileCenter(map, i, 30);
      expect(pixelToTile(map, x, y, 30)).toBe(i);
    }
  });
  it('neighbours are at distance 1 and radius sets have hex counts', () => {
    const c = 40 * map.width + 30;
    for (const n of neighbors(map, c)) expect(distance(map, c, n)).toBe(1);
    expect(tilesInRadius(map, c, 1)).toHaveLength(7);
    expect(tilesInRadius(map, c, 2)).toHaveLength(19);
  });
});

describe('Western Europe map', () => {
  it('places major cities on land', () => {
    const cities: [string, number, number][] = [
      ['Paris', 2.35, 48.86], ['London', -0.13, 51.5], ['Madrid', -3.7, 40.42], ['Rome', 12.5, 41.9],
      ['Vienna', 16.37, 48.21], ['Copenhagen', 12.57, 55.68], ['Lisbon', -9.14, 38.72], ['Dublin', -6.26, 53.35],
      ['Tunis', 10.18, 36.8], ['Stockholm', 18.07, 59.33], ['Edinburgh', -3.19, 55.95], ['Palermo', 13.36, 38.12],
    ];
    for (const [name, lon, lat] of cities) {
      const t = nearestLandTile(map, lon, lat);
      expect(t, name).toBeGreaterThanOrEqual(0);
      expect(distance(map, t, lonLatToTile(map, lon, lat)), name).toBeLessThanOrEqual(1);
    }
    expect(isLand(2.35, 48.86)).toBe(true);
    expect(isLand(-3.7, 40.42)).toBe(true);
  });

  it('has seas where seas belong', () => {
    expect(isLand(-10, 46)).toBe(false); // Bay of Biscay
    expect(isLand(-1, 50.2)).toBe(false); // English Channel
    expect(isLand(5, 40)).toBe(false); // Balearic Sea
    expect(isLand(3, 55)).toBe(false); // North Sea
    expect(isLand(17, 43.0)).toBe(false); // Adriatic
    expect(at(5, 40).t).toBe('ocean');
    expect(at(-1, 50.2).t).toBe('coast');
  });

  it('separates islands from the mainland', () => {
    const mainland = component(lonLatToTile(map, 2.35, 48.86));
    expect(mainland.has(lonLatToTile(map, 12.5, 41.9))).toBe(true); // Rome
    expect(mainland.has(lonLatToTile(map, -3.7, 40.42))).toBe(true); // Madrid
    expect(mainland.has(lonLatToTile(map, -0.13, 51.5))).toBe(false); // London
    expect(mainland.has(lonLatToTile(map, -6.26, 53.35))).toBe(false); // Dublin
    expect(mainland.has(lonLatToTile(map, 9.11, 39.3))).toBe(false); // Sardinia
  });

  it('puts the Alps and Pyrenees in the mountains', () => {
    expect(['mountains', 'hills']).toContain(at(8.0, 46.3).t);
    expect(['mountains', 'hills']).toContain(at(0.5, 42.7).t);
  });

  it('traces rivers through their cities', () => {
    const seine = map.rivers.find((r) => r.name === 'Seine')!;
    const paris = lonLatToTile(map, 2.35, 48.86);
    expect(seine.path.some((t) => distance(map, t, paris) <= 1)).toBe(true);
    for (const r of map.rivers) for (let k = 1; k < r.path.length; k++) expect(distance(map, r.path[k - 1], r.path[k])).toBe(1);
  });

  it('has a plausible amount of land and is deterministic', () => {
    const land = map.tiles.filter((t) => !TERRAIN[t.t].water).length;
    expect(land / map.tiles.length).toBeGreaterThan(0.35);
    expect(land / map.tiles.length).toBeLessThan(0.65);
    expect(JSON.stringify(generateMap({ seed: 1 }))).toBe(JSON.stringify(map));
  });

  it('maps tiles back to coordinates', () => {
    const [lon, lat] = tileLonLat(map, lonLatToTile(map, 2.35, 48.86));
    expect(Math.abs(lon - 2.35)).toBeLessThan(0.5);
    expect(Math.abs(lat - 48.86)).toBeLessThan(0.4);
  });
});
