// Movement costs, passability and A* pathfinding.

import { distance, neighbors } from '../hex';
import { TERRAIN } from '../data/terrain';
import { UNITS, isMilitary } from '../data/units';
import type { Game } from '../game';
import type { Unit } from '../types';

/** Sentinel cost meaning "uses all remaining movement" (embarking / disembarking). */
export const ALL_MOVES = 99;

export function isWaterTile(g: Game, tile: number): boolean {
  return TERRAIN[g.s.map.tiles[tile].t].water;
}

/** Can units of this player stand on this tile's terrain at all? */
export function terrainAllowed(g: Game, owner: number, tile: number): boolean {
  const t = g.s.map.tiles[tile].t;
  if (!TERRAIN[t].water) return true;
  if (t === 'ocean') return g.hasTech(owner, 'navigation');
  return g.hasTech(owner, 'sailing');
}

export function moveCost(g: Game, unit: Unit, from: number, to: number): number {
  const fromWater = isWaterTile(g, from);
  const toWater = isWaterTile(g, to);
  if (fromWater !== toWater) return ALL_MOVES;
  if (toWater) return 1;
  const def = UNITS[unit.type];
  const terrain = g.s.map.tiles[to].t;
  if (def.cls === 'recon') return terrain === 'mountains' ? 2 : 1;
  // Rivers through both tiles act as a highway.
  if (g.s.map.tiles[from].river && g.s.map.tiles[to].river && terrain !== 'mountains') return 1;
  return TERRAIN[terrain].moveCost;
}

export type EnterKind = 'move' | 'attack' | 'capture' | null;

/**
 * What would happen if `unit` tried to step onto `tile`?
 * 'attack' = enemy military there, 'capture' = undefended enemy city or civilians.
 */
export function enterKind(g: Game, unit: Unit, tile: number): EnterKind {
  if (!terrainAllowed(g, unit.owner, tile)) return null;
  const def = UNITS[unit.type];
  const others = g.unitsAt(tile).filter((u) => u.owner !== unit.owner);
  const city = g.cityAt(tile);
  const foreignCity = city && city.owner !== unit.owner ? city : undefined;
  if (others.length === 0 && !foreignCity) return 'move';
  const owner = others.length ? others[0].owner : foreignCity!.owner;
  if (!g.atWar(unit.owner, owner)) return null;
  if (!isMilitary(def) || isWaterTile(g, unit.tile)) return null; // civilians & embarked units can't fight
  const military = others.some((u) => isMilitary(UNITS[u.type]));
  if (military) return 'attack';
  if (isWaterTile(g, tile)) return null;
  if (def.cls === 'siege' || def.cls === 'ranged') return foreignCity ? null : 'capture';
  return 'capture';
}

interface Node {
  tile: number;
  turn: number;
  left: number;
  key: number;
  f: number;
}

class Heap {
  items: Node[] = [];
  push(n: Node) {
    const a = this.items;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): Node | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

export interface PathOptions {
  /** give up after exploring this many nodes */
  maxNodes?: number;
  /** stop when adjacent to the target instead of on it */
  adjacent?: boolean;
}

export interface PathStep {
  tile: number;
  /** 0 = reached this turn, 1 = next turn… */
  turn: number;
}

/**
 * A* over (turns, remaining moves). Returns the steps after the start tile, or
 * null if unreachable. The final step may be an attack/capture onto an enemy.
 */
export function findPath(g: Game, unit: Unit, target: number, opts: PathOptions = {}): PathStep[] | null {
  if (target === unit.tile) return [];
  if (opts.adjacent && distance(g.s.map, unit.tile, target) <= 1) return [];
  const map = g.s.map;
  const maxMoves = UNITS[unit.type].moves;
  const maxNodes = opts.maxNodes ?? 8000;
  const best = new Map<number, number>();
  const parent = new Map<number, number>();
  const turnAt = new Map<number, number>();
  const heap = new Heap();
  const h = (t: number) => {
    const d = distance(map, t, target) - (opts.adjacent ? 1 : 0);
    return Math.max(0, Math.ceil(d / maxMoves) - 1) * 100;
  };
  const startLeft = unit.moves > 0 ? unit.moves : maxMoves;
  const startTurn = unit.moves > 0 ? 0 : 1;
  const startKey = startTurn * 100 - startLeft;
  best.set(unit.tile, startKey);
  heap.push({ tile: unit.tile, turn: startTurn, left: startLeft, key: startKey, f: startKey + h(unit.tile) });
  let explored = 0;
  let goal = -1;
  while (heap.size) {
    const cur = heap.pop()!;
    if (cur.key !== best.get(cur.tile)) continue;
    if (cur.tile === target || (opts.adjacent && distance(map, cur.tile, target) <= 1 && cur.tile !== unit.tile)) {
      goal = cur.tile;
      break;
    }
    if (++explored > maxNodes) break;
    for (const nb of neighbors(map, cur.tile)) {
      const kind = enterKind(g, unit, nb);
      if (kind === null) continue;
      if (kind !== 'move' && nb !== target) continue; // only fight at the destination
      let turn = cur.turn;
      let left = cur.left;
      if (left <= 0) {
        turn++;
        left = maxMoves;
      }
      const c = moveCost(g, unit, cur.tile, nb);
      left = c >= ALL_MOVES ? 0 : Math.max(0, left - c);
      const key = turn * 100 - left;
      const prev = best.get(nb);
      if (prev !== undefined && prev <= key) continue;
      best.set(nb, key);
      parent.set(nb, cur.tile);
      turnAt.set(nb, turn);
      heap.push({ tile: nb, turn, left, key, f: key + h(nb) });
    }
  }
  if (goal < 0) return null;
  const steps: PathStep[] = [];
  for (let t = goal; t !== unit.tile; t = parent.get(t)!) steps.push({ tile: t, turn: turnAt.get(t)! });
  return steps.reverse();
}

/** Tiles this unit can reach (or attack) this turn, with moves remaining after arrival. */
export function reachableThisTurn(g: Game, unit: Unit): Map<number, number> {
  const out = new Map<number, number>();
  if (unit.moves <= 0) return out;
  const map = g.s.map;
  const best = new Map<number, number>([[unit.tile, unit.moves]]);
  const queue: number[] = [unit.tile];
  while (queue.length) {
    queue.sort((a, b) => best.get(b)! - best.get(a)!);
    const cur = queue.shift()!;
    const left = best.get(cur)!;
    if (left <= 0) continue;
    for (const nb of neighbors(map, cur)) {
      const kind = enterKind(g, unit, nb);
      if (kind === null) continue;
      if (kind !== 'move') {
        if (!out.has(nb)) out.set(nb, -1);
        continue;
      }
      const c = moveCost(g, unit, cur, nb);
      const nl = c >= ALL_MOVES ? 0 : Math.max(0, left - c);
      if ((best.get(nb) ?? -1) >= nl) continue;
      best.set(nb, nl);
      out.set(nb, nl);
      queue.push(nb);
    }
  }
  out.delete(unit.tile);
  return out;
}
