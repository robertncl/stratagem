// The space race. National projects are built once per realm and belong
// to the realm, not a city. The Apollo Program lets a realm's Spaceports
// build the three parts of the colony ship. The ship launches as soon as
// the last part is done and reaches its new world FLIGHT_TURNS later,
// winning the game, unless its home capital falls first.

import { BUILDINGS, BUILDING_LIST } from '../data/buildings';
import type { Game } from '../game';
import type { City } from '../types';

export const FLIGHT_TURNS = 10;
export const SHIP_PARTS = BUILDING_LIST.filter((b) => b.spaceship).map((b) => b.id);

export function hasProject(g: Game, pid: number, id: string): boolean {
  return g.player(pid).projects?.includes(id) ?? false;
}

/** A national project is finished: record it, and launch the ship once it is whole. */
export function completeProject(g: Game, city: City, id: string) {
  const p = g.player(city.owner);
  (p.projects ??= []).push(id);
  const b = BUILDINGS[id];
  if (b.spaceship) {
    const have = SHIP_PARTS.filter((x) => p.projects!.includes(x)).length;
    g.log('wonder', `${p.name} completes the ${b.name} in ${city.name} (colony ship ${have}/${SHIP_PARTS.length}).`, [p.id], city.tile);
    if (have === SHIP_PARTS.length && !p.spaceship) {
      p.spaceship = { launched: g.s.turn, arrives: g.s.turn + FLIGHT_TURNS };
      g.log('victory', `${p.name} launches its colony ship from ${city.name}! It reaches its new world in ${FLIGHT_TURNS} turns, unless ${g.capitalOf(p.id)?.name ?? 'its capital'} falls first.`, [], city.tile);
    }
  } else if (id === 'manhattanProject') {
    g.log('wonder', `☢ ${p.name} completes the Manhattan Project in ${city.name}: it can now build the bomb.`, [p.id], city.tile);
  } else {
    g.log('wonder', `${p.name} completes the ${b.name}.`, [p.id], city.tile);
  }
}

/** The capital fell while the ship was in flight: mission control is lost, and so is the ship. */
export function onCapitalLost(g: Game, pid: number) {
  const p = g.player(pid);
  if (!p.spaceship) return;
  p.spaceship = null;
  p.projects = (p.projects ?? []).filter((x) => !SHIP_PARTS.includes(x));
  g.log('victory', `With its capital fallen, ${p.name} loses contact with its colony ship. The ship is lost.`, []);
}

/** The first ship to arrive wins. */
export function spaceArrival(g: Game): number | null {
  let best: { pid: number; arrives: number } | null = null;
  for (const p of g.s.players) {
    if (!p.alive || !p.spaceship || g.s.turn < p.spaceship.arrives) continue;
    if (!best || p.spaceship.arrives < best.arrives) best = { pid: p.id, arrives: p.spaceship.arrives };
  }
  return best?.pid ?? null;
}

/** Where a realm stands in the space race, for the UI. */
export function spaceStatus(g: Game, pid: number): string | null {
  const p = g.player(pid);
  if (p.spaceship) return `Colony ship in flight: arrives in ${Math.max(0, p.spaceship.arrives - g.s.turn)} turns`;
  if (!hasProject(g, pid, 'apolloProgram')) return null;
  const have = SHIP_PARTS.filter((x) => hasProject(g, pid, x)).length;
  return `Space race: ${have}/${SHIP_PARTS.length} colony ship parts`;
}
