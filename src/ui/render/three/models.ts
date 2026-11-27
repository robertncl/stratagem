// Entry point of the lazily loaded 3D model code: bakes sprites on demand
// and caches them by model and resolution.

import type { ResourceId } from '../../../core/data/terrain';
import { Baker, Sprite } from './baker';
import { resourceModel, resourceOnWater, RESOURCE_FRAME } from './resources';
import { unitModel, UNIT_FRAME } from './units';

export type { Sprite };

/** Resolutions sprites are baked at, in pixels per model unit. */
const BUCKETS = [0.75, 1, 1.5, 2, 3, 4, 6, 8];
/** Pixel budget for all cached sprites. */
const PIXEL_BUDGET = 24e6;

let baker: Baker | null = null;
const cache = new Map<string, Sprite>();
let pixels = 0;

export function bucketFor(ppu: number): number {
  for (const b of BUCKETS) if (b >= ppu * 0.92) return b;
  return BUCKETS[BUCKETS.length - 1];
}

function remember(key: string, s: Sprite) {
  cache.set(key, s);
  pixels += s.canvas.width * s.canvas.height;
  // least recently used first
  for (const [k, old] of cache) {
    if (pixels <= PIXEL_BUDGET) break;
    cache.delete(k);
    pixels -= old.canvas.width * old.canvas.height;
  }
}

function lookup(key: string): Sprite | undefined {
  const s = cache.get(key);
  if (s) {
    cache.delete(key);
    cache.set(key, s);
  }
  return s;
}

/**
 * A sprite for `id` at the bucket for `ppu`. When `bake` is false and that
 * bucket is missing, the nearest cached bucket is returned instead (or
 * nothing), and the caller should ask again in a later frame.
 */
function sprite(id: string, ppu: number, bake: boolean, make: (ppu: number) => Sprite): { sprite: Sprite | null; exact: boolean } {
  const want = bucketFor(ppu);
  const hit = lookup(`${id}@${want}`);
  if (hit) return { sprite: hit, exact: true };
  if (bake) {
    const s = make(want);
    remember(`${id}@${want}`, s);
    return { sprite: s, exact: true };
  }
  let best: Sprite | null = null;
  for (const b of BUCKETS) {
    const s = cache.get(`${id}@${b}`);
    if (s && (!best || Math.abs(Math.log(b / want)) < Math.abs(Math.log(best.ppu / want)))) best = s;
  }
  return { sprite: best, exact: false };
}

export function unitSprite(type: string, team: string, embarked: boolean, ppu: number, bake: boolean) {
  return sprite(`u:${type}:${team}:${embarked ? 1 : 0}`, ppu, bake, (b) => {
    baker ??= new Baker();
    return baker.bake(unitModel(type, team, embarked), b, UNIT_FRAME);
  });
}

/** Resource sprites are few, so they are always baked on the spot. */
export function resourceSprite(res: ResourceId, ppu: number): Sprite {
  return sprite(`r:${res}`, ppu, true, (b) => {
    baker ??= new Baker();
    return baker.bake(resourceModel(res), b, RESOURCE_FRAME, { shadow: !resourceOnWater(res) });
  }).sprite!;
}
