// City economy: tile yields, worked tiles, growth and what can be built.

import { BUILDINGS, BuildingEffects } from '../data/buildings';
import { MAJOR_NATIONS, NationTraits } from '../data/nations';
import { RESOURCES, TERRAIN } from '../data/terrain';
import { UNITS, UNIT_LIST } from '../data/units';
import { BUILDING_LIST } from '../data/buildings';
import { neighbors, tilesInRadius } from '../hex';
import type { Game } from '../game';
import { faithYields, inDissent } from './religion';
import type { BuildItem, City, CityFocus } from '../types';

export const WORK_RADIUS = 2;
export const MAX_BORDER_RADIUS = 3;
const traitsById = new Map(MAJOR_NATIONS.map((n) => [n.id, n.traits]));

export function traitsOf(g: Game, pid: number): NationTraits {
  return traitsById.get(g.player(pid).nation) ?? {};
}

export interface Yield {
  food: number;
  prod: number;
  gold: number;
}

export function tileYield(g: Game, tile: number, city?: City): Yield {
  const t = g.s.map.tiles[tile];
  const def = TERRAIN[t.t];
  let food = def.food;
  let prod = def.prod;
  let gold = def.gold;
  if (t.res) {
    const r = RESOURCES[t.res];
    food += r.food;
    prod += r.prod;
    gold += r.gold;
  }
  if (t.river) gold += 1;
  if (def.water && city) for (const b of city.buildings) food += BUILDINGS[b].effects.waterFood ?? 0;
  return { food, prod, gold };
}

export const CITY_FOCUSES: CityFocus[] = ['balanced', 'food', 'production', 'gold'];

/** How much each yield is worth when a city picks tiles to work. */
export function focusWeights(focus: CityFocus | undefined, pop: number): Yield {
  switch (focus) {
    case 'food':
      return { food: 4, prod: 1.2, gold: 0.8 };
    case 'production':
      return { food: 1.5, prod: 3.5, gold: 1 };
    case 'gold':
      return { food: 1.5, prod: 1.2, gold: 3 };
    default:
      return { food: pop < 4 ? 3 : 2.2, prod: 2, gold: 1.3 };
  }
}

export interface TileChoice {
  t: number;
  y: Yield;
}

/**
 * Pick `pop` tiles to work: the best by the focus weights, then trade tiles
 * for more food while the city would otherwise starve.
 */
export function chooseWorkedTiles(candidates: TileChoice[], pop: number, weights: Yield, foodBase: number, foodNeed: number): TileChoice[] {
  const score = (y: Yield) => y.food * weights.food + y.prod * weights.prod + y.gold * weights.gold;
  const sorted = [...candidates].sort((a, b) => score(b.y) - score(a.y));
  const worked = sorted.slice(0, pop);
  const spare = sorted.slice(pop);
  let food = foodBase + worked.reduce((s, w) => s + w.y.food, 0);
  while (food < foodNeed) {
    let best: [number, number] | null = null;
    let bestGain = 0;
    let bestLoss = Infinity;
    for (let i = 0; i < worked.length; i++) {
      for (let j = 0; j < spare.length; j++) {
        const gain = spare[j].y.food - worked[i].y.food;
        if (gain <= 0) continue;
        const loss = score(worked[i].y) - score(spare[j].y);
        if (gain > bestGain || (gain === bestGain && loss < bestLoss)) {
          best = [i, j];
          bestGain = gain;
          bestLoss = loss;
        }
      }
    }
    if (!best) break;
    const [i, j] = best;
    [worked[i], spare[j]] = [spare[j], worked[i]];
    food += bestGain;
  }
  return worked;
}

export function growthThreshold(pop: number): number {
  return 15 + 7 * pop + Math.floor(Math.pow(pop, 1.6));
}

export function borderThreshold(radius: number): number {
  return radius <= 1 ? 12 : radius === 2 ? 90 : Infinity;
}

export function difficultyMult(g: Game, pid: number): number {
  const p = g.player(pid);
  if (p.isHuman) return 1;
  return g.s.difficulty === 'easy' ? 0.85 : g.s.difficulty === 'hard' ? 1.25 : 1;
}

export function cityEffects(city: City): Required<Omit<BuildingEffects, 'veteran'>> & { veteran: boolean } {
  const e = { food: 0, prod: 0, gold: 0, sci: 0, culture: 0, prodPct: 0, goldPct: 0, sciPct: 0, defense: 0, waterFood: 0, militaryPct: 0, faith: 0, veteran: false };
  for (const id of city.buildings) {
    const b = BUILDINGS[id].effects;
    e.food += b.food ?? 0;
    e.prod += b.prod ?? 0;
    e.gold += b.gold ?? 0;
    e.sci += b.sci ?? 0;
    e.culture += b.culture ?? 0;
    e.prodPct += b.prodPct ?? 0;
    e.goldPct += b.goldPct ?? 0;
    e.sciPct += b.sciPct ?? 0;
    e.defense += b.defense ?? 0;
    e.waterFood += b.waterFood ?? 0;
    e.militaryPct += b.militaryPct ?? 0;
    e.faith += b.faith ?? 0;
    if (b.veteran) e.veteran = true;
  }
  return e;
}

export interface CityYields {
  food: number;
  foodUpkeep: number;
  surplus: number;
  prod: number;
  gold: number;
  sci: number;
  culture: number;
  worked: number[];
  /** every tile the city could work, with its yield */
  tiles: TileChoice[];
  /** citizens with no tile left to work */
  idle: number;
  /** the city does not share its owner's state religion */
  dissent: boolean;
}

/** Tiles the city could work: its own claimed tiles within the work radius, not occupied by enemies. */
export function workableTiles(g: Game, city: City): number[] {
  return tilesInRadius(g.s.map, city.tile, WORK_RADIUS).filter((t) => {
    if (t === city.tile) return false;
    const tile = g.s.map.tiles[t];
    if (tile.owner !== city.owner || tile.city !== city.id) return false;
    return !g.unitsAt(t).some((u) => g.atWar(u.owner, city.owner));
  });
}

export function computeCityYields(g: Game, city: City): CityYields {
  const fx = cityEffects(city);
  const traits = traitsOf(g, city.owner);
  const center = tileYield(g, city.tile, city);
  let food = Math.max(2, center.food) + (city.isCapital ? 1 : 0);
  let prod = Math.max(1, center.prod) + 1 + (city.isCapital ? 1 : 0);
  let gold = Math.max(1, center.gold) + (city.isCapital ? 3 : 0);

  const candidates = workableTiles(g, city).map((t) => ({ t, y: tileYield(g, t, city) }));
  const foodMult = 1 + (traits.foodPct ?? 0);
  // food the city needs from its worked tiles, before the trait bonus
  const foodNeed = Math.ceil((city.pop * 2) / foodMult) - (food + fx.food);
  const worked = chooseWorkedTiles(candidates, city.pop, focusWeights(city.focus, city.pop), 0, foodNeed);
  for (const w of worked) {
    food += w.y.food;
    prod += w.y.prod;
    gold += w.y.gold;
  }
  food += fx.food;
  food = Math.floor(food * foodMult);
  const mult = difficultyMult(g, city.owner);
  const faith = faithYields(g, city);
  prod = Math.round((prod + fx.prod) * Math.max(0.1, 1 + fx.prodPct + (traits.prodPct ?? 0) + faith.prodPct) * mult);
  gold = Math.round((gold + fx.gold + faith.gold) * (1 + fx.goldPct + (traits.goldPct ?? 0)) * mult);
  let sci = Math.round((1 + city.pop * 0.6 + fx.sci + faith.sci + (city.isCapital ? 3 : 0)) * (1 + fx.sciPct + (traits.sciPct ?? 0)) * mult);
  const culture = Math.round((1 + fx.culture + faith.culture + (city.isCapital ? 2 : 0)) * (1 + (traits.culturePct ?? 0)));
  if (city.unrest > 0) {
    prod = 0;
    gold = 0;
    sci = 0;
  }
  const foodUpkeep = city.pop * 2;
  return {
    food,
    foodUpkeep,
    surplus: food - foodUpkeep,
    prod,
    gold,
    sci,
    culture,
    worked: worked.map((w) => w.t),
    tiles: candidates,
    idle: Math.max(0, city.pop - candidates.length),
    dissent: inDissent(g, city),
  };
}

export function isCoastal(g: Game, tile: number): boolean {
  return neighbors(g.s.map, tile).some((n) => {
    const t = g.s.map.tiles[n].t;
    return t === 'coast' || t === 'ocean';
  });
}

export function buildCost(item: BuildItem): number {
  if (item.kind === 'unit') return UNITS[item.id].cost;
  if (item.kind === 'building') return BUILDINGS[item.id].cost;
  return 0;
}

export function buildName(item: BuildItem | null): string {
  if (!item) return 'Nothing';
  if (item.kind === 'unit') return UNITS[item.id].name;
  if (item.kind === 'building') return BUILDINGS[item.id].name;
  return 'Wealth';
}

export function canBuild(g: Game, city: City, item: BuildItem): boolean {
  const pid = city.owner;
  if (item.kind === 'wealth') return true;
  if (item.kind === 'unit') {
    const def = UNITS[item.id];
    if (!def) return false;
    if (def.tech && !g.hasTech(pid, def.tech)) return false;
    if (def.id === 'settler' && g.player(pid).isMinor) return false;
    // missionaries preach the faith of the city that trains them
    if (def.id === 'missionary' && (g.player(pid).isMinor || !city.religion)) return false;
    // hide units replaced by something we can build
    for (const other of UNIT_LIST) {
      if (other.replaces?.includes(def.id) && (!other.tech || g.hasTech(pid, other.tech))) return false;
    }
    return true;
  }
  const b = BUILDINGS[item.id];
  if (!b || city.buildings.includes(b.id)) return false;
  if (b.tech && !g.hasTech(pid, b.tech)) return false;
  if (b.requires && !city.buildings.includes(b.requires)) return false;
  if (b.coastal && !isCoastal(g, city.tile)) return false;
  if (b.wonder) {
    if (g.s.wonders[b.id] !== undefined) return false;
    if (g.player(pid).isMinor) return false;
  }
  return true;
}

export function availableBuilds(g: Game, city: City): BuildItem[] {
  const out: BuildItem[] = [];
  for (const u of UNIT_LIST) {
    const item: BuildItem = { kind: 'unit', id: u.id };
    if (canBuild(g, city, item)) out.push(item);
  }
  for (const b of BUILDING_LIST) {
    const item: BuildItem = { kind: 'building', id: b.id };
    if (canBuild(g, city, item)) out.push(item);
  }
  out.push({ kind: 'wealth' });
  return out;
}

/** Production per turn applied to a specific item (military bonus etc). */
export function effectiveProd(g: Game, city: City, item: BuildItem | null, baseProd?: number): number {
  const prod = baseProd ?? computeCityYields(g, city).prod;
  if (item?.kind === 'unit' && UNITS[item.id].cls !== 'civilian') {
    return Math.round(prod * (1 + cityEffects(city).militaryPct));
  }
  return prod;
}

export function buyCost(_g: Game, city: City): number | null {
  const item = city.build;
  if (!item || item.kind === 'wealth' || city.unrest > 0) return null;
  if (item.kind === 'building' && BUILDINGS[item.id].wonder) return null;
  const remaining = Math.max(0, buildCost(item) - city.prod);
  if (remaining === 0) return null;
  return Math.round(remaining * 2.2 + 10);
}

export function buildingUpkeep(city: City): number {
  return city.buildings.reduce((s, b) => s + BUILDINGS[b].upkeep, 0);
}
