// Super weapons. The Manhattan Project lets a realm build Atomic Bombs and,
// with Rocketry, Nuclear Missiles. A super weapon waits in the city that
// built it until it is launched at a tile in range. Every unit within the
// blast radius dies, whoever it belongs to. Cities in the blast lose
// people and buildings, and land in it is left in fallout that yields
// nothing for FALLOUT_TURNS. Striking a realm you are at peace with means
// war, and a Missile Shield within SHIELD_RANGE may shoot the weapon down.

import { BUILDINGS } from '../data/buildings';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import type { Game } from '../game';
import { distance, tilesInRadius } from '../hex';
import type { City, Unit } from '../types';

export const FALLOUT_TURNS = 20;
/** Turns an AI waits between launches. */
export const AI_LAUNCH_COOLDOWN = 5;

const an = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
export const SHIELD_RANGE = 3;
export const SHIELD_CHANCE = 0.75;
/** Share of its people a city keeps, by distance from ground zero. */
const SURVIVE_POP = [0.4, 0.6, 0.8];
/** Chance each ordinary building survives, by distance from ground zero. */
const SURVIVE_BUILDING = [0.4, 0.7, 0.85];

/** A detonation (or interception) for the UI to show. */
export interface Blast {
  tile: number;
  radius: number;
  by: number;
  intercepted: boolean;
}

export interface StrikePreview {
  tiles: number[];
  /** units destroyed: the launcher's own, and everyone else's */
  ownUnits: number;
  otherUnits: number;
  cities: City[];
  /** realms the launcher is not yet at war with, but would be */
  newWars: number[];
  /** a Missile Shield covers the target */
  shielded: boolean;
}

export function strikePreview(g: Game, u: Unit, target: number): StrikePreview {
  const blast = UNITS[u.type].strike?.blast ?? 0;
  const tiles = tilesInRadius(g.map, target, blast);
  const hit = new Set<number>();
  let ownUnits = 0;
  let otherUnits = 0;
  const cities: City[] = [];
  for (const t of tiles) {
    for (const x of g.unitsAt(t)) {
      if (x.id === u.id) continue;
      if (x.owner === u.owner) ownUnits++;
      else {
        otherUnits++;
        hit.add(x.owner);
      }
    }
    const c = g.cityAt(t);
    if (c) {
      cities.push(c);
      if (c.owner !== u.owner) hit.add(c.owner);
    }
  }
  const targetOwner = g.map.tiles[target].owner;
  if (targetOwner >= 0 && targetOwner !== u.owner) hit.add(targetOwner);
  const newWars = [...hit].filter((p) => g.player(p).alive && !g.atWar(u.owner, p));
  const shielded = g.s.cities.some(
    (c) => c.owner !== u.owner && c.buildings.includes('missileShield') && distance(g.map, c.tile, target) <= SHIELD_RANGE,
  );
  return { tiles, ownUnits, otherUnits, cities, newWars, shielded };
}

/** Why `u` can't be launched at `target`, or null if it can. */
export function cannotStrike(g: Game, u: Unit, target: number): string | null {
  const strike = UNITS[u.type].strike;
  if (!strike) return 'Only super weapons can be launched.';
  if (target < 0 || target >= g.map.tiles.length) return 'No target.';
  const d = distance(g.map, u.tile, target);
  if (d > strike.range) return `Out of range: ${d} tiles away, range ${strike.range}.`;
  for (const p of strikePreview(g, u, target).newWars) {
    if (!g.canDeclareWar(u.owner, p)) return `A peace treaty with ${g.player(p).name} is still in force.`;
  }
  return null;
}

/** Launch a super weapon. Returns what happened, or null if it could not be launched. */
export function launch(g: Game, u: Unit, target: number): Blast | null {
  if (cannotStrike(g, u, target)) return null;
  const by = u.owner;
  const p = g.player(by);
  const preview = strikePreview(g, u, target);
  for (const other of preview.newWars) g.declareWar(by, other);
  const strike = UNITS[u.type].strike!;
  g.removeUnit(u);
  p.stats.nukesLaunched = (p.stats.nukesLaunched ?? 0) + 1;
  p.lastLaunch = g.s.turn;
  const name = UNITS[u.type].name;
  const where = g.cityAt(target)?.name ?? (g.map.tiles[target].owner >= 0 ? `${g.player(g.map.tiles[target].owner).adjective} land` : 'open country');
  const blast: Blast = { tile: target, radius: strike.blast, by, intercepted: false };
  if (preview.shielded && g.rng.chance(SHIELD_CHANCE)) {
    blast.intercepted = true;
    g.log('war', `${p.name} launches ${an(name)} ${name} at ${where}, but a Missile Shield shoots it down!`, [], target);
  } else {
    g.log('war', `☢ ${p.name} detonates ${an(name)} ${name} over ${where}!`, [], target);
    detonate(g, target, strike.blast, by);
  }
  g.blasts.push(blast);
  return blast;
}

function detonate(g: Game, target: number, radius: number, by: number) {
  for (const t of tilesInRadius(g.map, target, radius)) {
    const d = distance(g.map, t, target);
    for (const x of [...g.unitsAt(t)]) {
      g.removeUnit(x);
      g.player(x.owner).stats.unitsLost++;
      if (x.owner !== by) g.player(by).stats.unitsKilled++;
    }
    const tile = g.map.tiles[t];
    if (!TERRAIN[tile.t].water) tile.fallout = FALLOUT_TURNS;
    const city = g.cityAt(t);
    if (city) {
      const before = city.pop;
      city.pop = Math.max(1, Math.floor(city.pop * SURVIVE_POP[Math.min(d, 2)]));
      city.buildings = city.buildings.filter((b) => BUILDINGS[b].wonder || g.rng.chance(SURVIVE_BUILDING[Math.min(d, 2)]));
      city.food = 0;
      city.prod = 0;
      city.unrest = Math.max(city.unrest, 3);
      g.log('city', `${city.name} is devastated: its people fall from ${before} to ${city.pop}.`, [city.owner, by], t);
    }
  }
  g.refreshVisibility();
}

/** Fallout clears a turn at a time. */
export function decayFallout(g: Game) {
  for (const t of g.map.tiles) {
    if (!t.fallout) continue;
    t.fallout--;
    if (t.fallout <= 0) delete t.fallout;
  }
}

/** Realms that have developed the bomb. */
export function nuclearPowers(g: Game): number[] {
  return g.s.players.filter((p) => p.alive && p.projects?.includes('manhattanProject')).map((p) => p.id);
}
