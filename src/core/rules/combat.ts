// Combat resolution. Strength ratios drive damage; ranged attacks take no
// retaliation. Units have 100 HP.

import { BUILDINGS } from '../data/buildings';
import { MAJOR_NATIONS } from '../data/nations';
import { TERRAIN } from '../data/terrain';
import { UNITS, isMilitary } from '../data/units';
import type { Game } from '../game';
import type { Unit } from '../types';
import { isWaterTile } from './movement';

const nationTraits = new Map(MAJOR_NATIONS.map((n) => [n.id, n.traits]));

function hpFactor(u: Unit): number {
  return 0.5 + (0.5 * u.hp) / 100;
}

function combatTrait(g: Game, owner: number): number {
  return nationTraits.get(g.player(owner).nation)?.combatPct ?? 0;
}

export function cityDefenseBonus(g: Game, tile: number): number {
  const city = g.cityAt(tile);
  if (!city) return 0;
  let bonus = 0.25 + Math.min(0.25, city.pop * 0.03);
  for (const b of city.buildings) bonus += BUILDINGS[b].effects.defense ?? 0;
  return bonus;
}

export function attackStrength(g: Game, att: Unit, def: Unit, ranged: boolean): number {
  const a = UNITS[att.type];
  const d = UNITS[def.type];
  const s = ranged ? (a.ranged ?? 0) : a.attack;
  let mult = 1 + combatTrait(g, att.owner) + (att.veteran ? 0.25 : 0);
  if (d.cls === 'mounted' && a.vsMounted) mult += a.vsMounted;
  if (g.cityAt(def.tile) && a.vsCity) mult += a.vsCity;
  return s * mult * hpFactor(att);
}

export function defenseStrength(g: Game, def: Unit, att: Unit | null): number {
  const d = UNITS[def.type];
  if (isWaterTile(g, def.tile)) return 2 * hpFactor(def);
  const tile = g.s.map.tiles[def.tile];
  let mult = 1 + combatTrait(g, def.owner) + (def.veteran ? 0.25 : 0);
  const inCity = !!g.cityAt(def.tile);
  if (d.cls !== 'mounted' || inCity) mult += TERRAIN[tile.t].defense;
  if (def.fortified || inCity) mult += 0.25;
  mult += cityDefenseBonus(g, def.tile);
  if (att && UNITS[att.type].cls === 'mounted' && d.vsMounted) mult += d.vsMounted;
  if (!isMilitary(d)) return 0.1;
  return Math.max(0.5, d.defense * Math.max(0.2, mult) * hpFactor(def));
}

/** The unit on `tile` that would defend best against `att`. */
export function bestDefender(g: Game, tile: number, att: Unit | null): Unit | null {
  let best: Unit | null = null;
  let bestS = -1;
  for (const u of g.unitsAt(tile)) {
    if (!isMilitary(UNITS[u.type])) continue;
    if (att && u.owner === att.owner) continue;
    const s = defenseStrength(g, u, att);
    if (s > bestS) {
      bestS = s;
      best = u;
    }
  }
  return best;
}

export interface CombatPreview {
  attack: number;
  defense: number;
  /** expected damage to the defender / attacker */
  toDefender: number;
  toAttacker: number;
}

const BASE = 32;

export function previewCombat(g: Game, att: Unit, def: Unit, ranged: boolean): CombatPreview {
  const a = attackStrength(g, att, def, ranged);
  const d = defenseStrength(g, def, att);
  const r = a / d;
  const toDefender = Math.min(100, BASE * Math.pow(r, 1.2) * (ranged ? 0.85 : 1));
  const toAttacker = ranged ? 0 : Math.min(100, BASE * Math.pow(1 / r, 1.2));
  return { attack: a, defense: d, toDefender, toAttacker };
}

export interface CombatResult {
  attacker: Unit;
  defender: Unit;
  dmgToDefender: number;
  dmgToAttacker: number;
  defenderDied: boolean;
  attackerDied: boolean;
  ranged: boolean;
}

export function resolveCombat(g: Game, att: Unit, def: Unit, ranged: boolean): CombatResult {
  const p = previewCombat(g, att, def, ranged);
  const dd = Math.max(1, Math.round(p.toDefender * g.rng.range(0.8, 1.2)));
  const da = ranged ? 0 : Math.max(0, Math.round(p.toAttacker * g.rng.range(0.8, 1.2)));
  def.hp -= dd;
  att.hp -= da;
  const defenderDied = def.hp <= 0;
  const attackerDied = att.hp <= 0;
  if (!attackerDied) gainXp(att);
  if (!defenderDied) gainXp(def);
  return { attacker: att, defender: def, dmgToDefender: dd, dmgToAttacker: da, defenderDied, attackerDied, ranged };
}

function gainXp(u: Unit) {
  u.xp++;
  if (u.xp >= 4) u.veteran = true;
}
