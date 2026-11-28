// Computer opponents. Each AI turn: diplomacy → research → units → production → gold.
// The AI sees the whole map (no fog) but limits its plans by distance.

import { BUILDINGS } from '../data/buildings';
import { TECH_LIST } from '../data/techs';
import { TERRAIN } from '../data/terrain';
import { UNITS, UNIT_LIST, UnitDef, isMilitary, isRanged } from '../data/units';
import type { Game } from '../game';
import { distance, tilesInRadius } from '../hex';
import { availableBuilds, buyCost, canBuild, computeCityYields, isCoastal, tileYield } from '../rules/cities';
import { bestDefender, previewCombat } from '../rules/combat';
import { enterKind, findPath } from '../rules/movement';
import { cannotPreach, holyReligion } from '../rules/religion';
import { AI_LAUNCH_COOLDOWN, cannotStrike, nuclearPowers, strikePreview } from '../rules/nuclear';
import type { BuildItem, City, Player, Unit } from '../types';

interface Ctx {
  g: Game;
  pid: number;
  p: Player;
  cities: City[];
  enemies: number[];
  threat: Map<number, number>;
  myStrength: number;
  /** tiles already claimed by settlers this turn */
  reserved: number[];
  /** garrison assignments: unit id → city tile */
  garrison: Map<number, number>;
}

const MAX_PATH_NODES = 2500;
const SPACE_TECHS = ['spaceFlight', 'satellites', 'robotics', 'fusion'];
/** Space race builds, in order: the program, a Spaceport, then the ship. */
const SPACE_BUILDS = ['apolloProgram', 'spaceport', 'launchBooster', 'orbitalHabitat', 'fusionDrive'];

export function runAI(g: Game, pid: number) {
  const p = g.player(pid);
  if (!p.alive) return;
  const ctx: Ctx = {
    g,
    pid,
    p,
    cities: g.citiesOf(pid),
    enemies: g.enemiesOf(pid),
    threat: new Map(),
    myStrength: g.militaryStrength(pid),
    reserved: [],
    garrison: new Map(),
  };
  computeThreat(ctx);
  if (!p.isMinor) diplomacy(ctx);
  else minorDiplomacy(ctx);
  ctx.enemies = g.enemiesOf(pid);
  research(ctx);
  moveUnits(ctx);
  nuclearStrikes(ctx);
  ctx.cities = g.citiesOf(pid);
  for (const city of ctx.cities) production(ctx, city);
  spendGold(ctx);
}

// ------------------------------------------------------------------ helpers

function militaryOn(g: Game, tile: number, owner: number): Unit[] {
  return g.unitsAt(tile).filter((u) => u.owner === owner && isMilitary(UNITS[u.type]) && UNITS[u.type].cls !== 'recon');
}

function computeThreat(ctx: Ctx) {
  const { g } = ctx;
  for (const c of ctx.cities) ctx.threat.set(c.id, 0);
  if (!ctx.enemies.length) return;
  for (const u of g.s.units) {
    if (!ctx.enemies.includes(u.owner)) continue;
    const d = UNITS[u.type];
    if (!isMilitary(d) || d.cls === 'recon') continue;
    for (const c of ctx.cities) {
      if (distance(g.map, u.tile, c.tile) <= 4) ctx.threat.set(c.id, ctx.threat.get(c.id)! + Math.max(d.attack, d.ranged ?? 0));
    }
  }
}

function frontier(ctx: Ctx, city: City, range = 6): boolean {
  return ctx.g.s.cities.some((c) => c.owner !== ctx.pid && distance(ctx.g.map, c.tile, city.tile) <= range);
}

function desiredDefenders(ctx: Ctx, city: City): number {
  if (ctx.p.isMinor) return city.pop >= 3 ? 3 : 2;
  let n = 1;
  const threat = ctx.threat.get(city.id) ?? 0;
  if (city.isCapital && (threat > 0 || !ctx.enemies.length)) n++;
  if (threat > 0) n += Math.min(3, Math.floor(threat / 12));
  return Math.min(n, 4);
}

function buildable(ctx: Ctx, city: City, filter: (d: UnitDef) => boolean): UnitDef[] {
  return UNIT_LIST.filter((d) => filter(d) && canBuild(ctx.g, city, { kind: 'unit', id: d.id }));
}

function bestBy(defs: UnitDef[], score: (d: UnitDef) => number): UnitDef | undefined {
  let best: UnitDef | undefined;
  for (const d of defs) if (!best || score(d) > score(best)) best = d;
  return best;
}

function moveAlong(g: Game, u: Unit, target: number, adjacent = false): boolean {
  if (u.moves <= 0) return false;
  const path = findPath(g, u, target, { adjacent, maxNodes: MAX_PATH_NODES });
  if (!path || !path.length) return false;
  for (const step of path) {
    if (u.moves <= 0) break;
    const k = enterKind(g, u, step.tile);
    if (k !== 'move' && k !== 'capture') break;
    g.stepUnit(u, step.tile);
    if (!g.unit(u.id)) return true;
  }
  return true;
}

/** Walk toward `target`, stopping once within `stopAt` tiles of it. */
function stepToward(g: Game, u: Unit, target: number, stopAt: number): boolean {
  if (u.moves <= 0) return false;
  const path = findPath(g, u, target, { adjacent: true, maxNodes: MAX_PATH_NODES });
  if (!path) return false;
  for (const step of path) {
    if (u.moves <= 0 || distance(g.map, u.tile, target) <= stopAt) break;
    const k = enterKind(g, u, step.tile);
    if (k !== 'move' && k !== 'capture') break;
    g.stepUnit(u, step.tile);
    if (!g.unit(u.id)) return true;
  }
  return true;
}

function nearestOwnCity(ctx: Ctx, tile: number): City | undefined {
  let best: City | undefined;
  let bd = Infinity;
  for (const c of ctx.g.citiesOf(ctx.pid)) {
    const d = distance(ctx.g.map, c.tile, tile);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

// --------------------------------------------------------------- diplomacy

/** Would AI `aiId` accept peace with `other` right now? */
export function acceptsPeace(g: Game, aiId: number, other: number): boolean {
  const r = g.relation(aiId, other);
  if (!r.war) return false;
  const duration = g.s.turn - r.since;
  if (g.player(aiId).isMinor) return duration >= 4;
  if (duration < 5) return false;
  const mine = g.militaryStrength(aiId);
  const theirs = g.militaryStrength(other);
  if (mine < theirs * 0.9) return true;
  if (duration > 30) return true;
  if (duration < 10) return false;
  // winning AIs are reluctant
  return g.rng.chance(mine > theirs * 1.5 ? 0.04 : 0.15);
}

function proposePeace(ctx: Ctx, other: number) {
  const { g } = ctx;
  if (g.player(other).isHuman) {
    if (!g.s.proposals.some((x) => x.from === ctx.pid && x.to === other)) g.s.proposals.push({ from: ctx.pid, to: other, kind: 'peace' });
  } else if (acceptsPeace(g, other, ctx.pid)) {
    g.makePeace(ctx.pid, other);
  }
}

function diplomacy(ctx: Ctx) {
  const { g, pid, p } = ctx;
  for (const e of ctx.enemies) {
    const r = g.relation(pid, e);
    const duration = g.s.turn - r.since;
    if (duration < 8) continue;
    const theirs = g.militaryStrength(e);
    const losing = ctx.myStrength < theirs * 0.8;
    if (losing || (duration > 20 && g.rng.chance(0.12)) || (g.player(e).isMinor && duration > 15 && g.rng.chance(0.1))) {
      proposePeace(ctx, e);
    }
  }
  const majorWars = ctx.enemies.filter((e) => !g.player(e).isMinor).length;
  if (majorWars > 0 || ctx.enemies.length > 1 || g.s.turn < 12) return;
  if (!g.rng.chance(0.03 + p.aggression * 0.07 + (p.gold > 300 ? 0.05 : 0))) return;
  // pick a weak neighbour
  let best: { id: number; ratio: number } | null = null;
  for (const other of g.s.players) {
    if (!other.alive || other.id === pid || !g.canDeclareWar(pid, other.id)) continue;
    const near = g.citiesOf(other.id).some((c) => ctx.cities.some((m) => distance(g.map, m.tile, c.tile) <= 8));
    if (!near) continue;
    const theirs = Math.max(1, g.militaryStrength(other.id));
    const ratio = ctx.myStrength / theirs;
    const needed = other.isMinor ? 1.6 : 1.25;
    if (ratio < needed || ctx.myStrength < 15) continue;
    // humans are slightly more tempting targets on hard, and other faiths always are
    const bias =
      (other.isHuman && g.s.difficulty === 'hard' ? 1.2 : 1) *
      (p.religion && other.religion && other.religion !== p.religion ? 1.15 : 1) *
      // realms that have used the bomb make themselves enemies
      (other.stats.nukesLaunched ? 1.25 : 1);
    if (!best || ratio * bias > best.ratio) best = { id: other.id, ratio: ratio * bias };
  }
  if (best) g.declareWar(pid, best.id);
}

function minorDiplomacy(ctx: Ctx) {
  for (const e of ctx.enemies) {
    const duration = ctx.g.s.turn - ctx.g.relation(ctx.pid, e).since;
    if (duration >= 10 && ctx.g.rng.chance(0.08)) proposePeace(ctx, e);
  }
}

// ----------------------------------------------------------------- research

function research(ctx: Ctx) {
  const { g, p, pid } = ctx;
  if (p.research) return;
  const options = g.availableTechs(pid);
  if (!options.length) return;
  const militaryTechs = new Set(UNIT_LIST.filter((u) => u.tech).map((u) => u.tech!));
  let best: string | null = null;
  let bestScore = Infinity;
  for (const id of options) {
    const t = TECH_LIST.find((x) => x.id === id)!;
    let s = t.cost * g.rng.range(0.75, 1.25);
    if (militaryTechs.has(id)) s /= 1 + p.aggression * 0.6;
    if (id === 'sailing' && ctx.cities.some((c) => isCoastal(g, c.tile))) s *= 0.8;
    if (SPACE_TECHS.includes(id)) s *= 0.7;
    if (s < bestScore) {
      bestScore = s;
      best = id;
    }
  }
  if (best) g.setResearch(pid, best);
}

// -------------------------------------------------------------------- units

function moveUnits(ctx: Ctx) {
  const { g, pid } = ctx;
  const units = g.unitsOf(pid);
  for (const u of units) if (g.unit(u.id) && u.type === 'settler') settlerTurn(ctx, u);
  for (const u of units) if (g.unit(u.id) && u.type === 'missionary') missionaryTurn(ctx, u);
  const military = units.filter((u) => g.unit(u.id) && isMilitary(UNITS[u.type]) && UNITS[u.type].cls !== 'recon');
  for (const u of military) u.ai = undefined;
  for (const u of units) if (g.unit(u.id) && UNITS[u.type].cls === 'recon') scoutTurn(ctx, u);

  // 1. opportunistic strikes
  for (const u of military) if (g.unit(u.id)) tryAttack(ctx, u, 'opportunistic');

  // 2. garrisons
  assignGarrisons(ctx, military.filter((u) => g.unit(u.id)));

  // 3. offence
  const free = military.filter((u) => g.unit(u.id) && !ctx.garrison.has(u.id));
  if (ctx.enemies.length && !ctx.p.isMinor) offensive(ctx, free);

  // 4. everyone left: garrison duty or return home
  for (const u of military) {
    if (!g.unit(u.id) || u.moves <= 0) continue;
    const post = ctx.garrison.get(u.id);
    if (post !== undefined) {
      if (u.tile !== post) moveAlong(g, u, post);
      if (u.tile === post) g.fortify(u);
      continue;
    }
    if (u.ai?.role === 'attack') continue;
    const city = g.cityAt(u.tile);
    if (city && city.owner === pid) {
      g.fortify(u);
      continue;
    }
    const home = weakestCity(ctx) ?? nearestOwnCity(ctx, u.tile);
    if (home && !moveAlong(g, u, home.tile)) g.fortify(u);
  }
}

function weakestCity(ctx: Ctx): City | undefined {
  let best: City | undefined;
  let bestScore = Infinity;
  for (const c of ctx.cities) {
    if (!ctx.g.city(c.id) || c.owner !== ctx.pid) continue;
    const s = militaryOn(ctx.g, c.tile, ctx.pid).length - desiredDefenders(ctx, c) - (frontier(ctx, c) ? 1 : 0);
    if (s < bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

function assignGarrisons(ctx: Ctx, units: Unit[]) {
  const { g, pid } = ctx;
  const pool = new Set(units);
  const cities = g.citiesOf(pid).sort((a, b) => (ctx.threat.get(b.id) ?? 0) - (ctx.threat.get(a.id) ?? 0));
  // units already inside stay first
  for (const c of cities) {
    let need = desiredDefenders(ctx, c);
    const inside = militaryOn(g, c.tile, pid).sort((a, b) => UNITS[b.type].defense - UNITS[a.type].defense);
    for (const u of inside) {
      if (need <= 0) break;
      if (!pool.has(u)) continue;
      ctx.garrison.set(u.id, c.tile);
      pool.delete(u);
      need--;
    }
  }
  for (const c of cities) {
    let need = desiredDefenders(ctx, c) - militaryOn(g, c.tile, pid).filter((u) => ctx.garrison.get(u.id) === c.tile).length;
    while (need > 0) {
      let best: Unit | null = null;
      let bd = Infinity;
      for (const u of pool) {
        const d = distance(g.map, u.tile, c.tile);
        if (d < bd && d <= (ctx.enemies.length ? 5 : 10)) {
          bd = d;
          best = u;
        }
      }
      if (!best) break;
      ctx.garrison.set(best.id, c.tile);
      pool.delete(best);
      need--;
    }
  }
}

/** Attack something adjacent / in range if the odds are good. */
function tryAttack(ctx: Ctx, u: Unit, mode: 'opportunistic' | 'siege'): boolean {
  const { g } = ctx;
  if (u.moves <= 0) return false;
  const def = UNITS[u.type];
  const range = isRanged(def) ? def.range ?? 1 : 1;
  let best: { tile: number; score: number } | null = null;
  for (const t of tilesInRadius(g.map, u.tile, range)) {
    if (t === u.tile || !g.canAttack(u, t)) continue;
    const target = bestDefender(g, t, u)!;
    const pr = previewCombat(g, u, target, isRanged(def));
    const kills = pr.toDefender >= target.hp;
    const city = g.cityAt(t);
    let score: number;
    if (isRanged(def)) score = pr.toDefender >= 6 ? pr.toDefender + (city ? 10 : 0) : -1;
    else {
      const safe = pr.toAttacker < u.hp * 0.7;
      const favourable = pr.toDefender > pr.toAttacker * (mode === 'siege' ? 0.75 : 1.35);
      if (!safe || (!kills && !favourable)) score = -1;
      else score = pr.toDefender - pr.toAttacker + (kills ? 30 : 0) + (city && kills ? 50 : 0);
      if (mode === 'opportunistic' && u.hp < 50 && !kills) score = -1;
    }
    if (score > 0 && (!best || score > best.score)) best = { tile: t, score };
  }
  if (!best) return false;
  g.attack(u, best.tile);
  return true;
}

function chooseTarget(ctx: Ctx): City | null {
  const { g, p } = ctx;
  if (p.aiTarget !== undefined) {
    const prev = g.city(p.aiTarget);
    if (prev && ctx.enemies.includes(prev.owner)) return prev;
    p.aiTarget = undefined;
  }
  let best: City | null = null;
  let bestScore = Infinity;
  for (const e of ctx.enemies) {
    for (const c of g.citiesOf(e)) {
      let near = Infinity;
      for (const m of ctx.cities) near = Math.min(near, distance(g.map, m.tile, c.tile));
      if (near > 12) continue;
      const cap = g.capitalOf(ctx.pid);
      const fromCapital = cap ? distance(g.map, cap.tile, c.tile) : near;
      const defenders = g.unitsAt(c.tile).filter((u) => isMilitary(UNITS[u.type])).length;
      const walls = c.buildings.filter((b) => BUILDINGS[b].effects.defense).length;
      const score = near + fromCapital * 0.6 + defenders * 2.5 + walls * 3 - (c.isCapital ? 1 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }
  p.aiTarget = best?.id;
  return best;
}

function offensive(ctx: Ctx, units: Unit[]) {
  const { g } = ctx;
  const target = chooseTarget(ctx);
  if (!target) return;
  for (const u of units) u.ai = { role: 'attack', target: target.tile };
  const defenders = g.unitsAt(target.tile).filter((u) => isMilitary(UNITS[u.type])).length;
  const needed = Math.max(3, defenders * 2);
  const atFront = units.filter((u) => distance(g.map, u.tile, target.tile) <= 2).length;
  const assault = atFront >= needed;
  // ranged/siege fire first, then melee
  const order = [...units].sort((a, b) => Number(isRanged(UNITS[b.type])) - Number(isRanged(UNITS[a.type])));
  for (const u of order) {
    if (!g.unit(u.id) || u.moves <= 0) continue;
    if (u.hp < 40) {
      const home = nearestOwnCity(ctx, u.tile);
      if (home) moveAlong(g, u, home.tile);
      continue;
    }
    const d = distance(g.map, u.tile, target.tile);
    const ranged = isRanged(UNITS[u.type]);
    if (ranged && d <= (UNITS[u.type].range ?? 2) && g.canAttack(u, target.tile)) {
      g.attack(u, target.tile);
      continue;
    }
    if (d <= 1) {
      if (target.owner !== ctx.pid && g.city(target.id) && g.cityAt(target.tile)?.owner !== ctx.pid) {
        if (enterKind(g, u, target.tile) === 'capture') {
          g.stepUnit(u, target.tile);
          continue;
        }
        if (assault && tryAttack(ctx, u, 'siege')) continue;
      }
      if (!tryAttack(ctx, u, 'opportunistic')) g.fortify(u);
      continue;
    }
    if (ranged) {
      // siege & archers close to firing range and shoot every turn
      if (stepToward(g, u, target.tile, UNITS[u.type].range ?? 2) && g.unit(u.id) && u.moves > 0) {
        if (g.canAttack(u, target.tile)) g.attack(u, target.tile);
        else if (!tryAttack(ctx, u, 'opportunistic')) g.fortify(u);
      }
      continue;
    }
    // gather 2-3 tiles out until the army is big enough, then close in
    if (!assault && d <= 3) {
      if (!tryAttack(ctx, u, 'opportunistic')) g.fortify(u);
      continue;
    }
    if (!stepToward(g, u, target.tile, assault ? 1 : 3)) {
      u.ai = undefined;
      continue;
    }
    if (g.unit(u.id) && u.moves > 0) {
      if (assault && distance(g.map, u.tile, target.tile) <= 1 && enterKind(g, u, target.tile) === 'capture') g.stepUnit(u, target.tile);
      else if (!tryAttack(ctx, u, assault ? 'siege' : 'opportunistic') && distance(g.map, u.tile, target.tile) <= 3) g.fortify(u);
    }
  }
}

function scoutTurn(ctx: Ctx, u: Unit) {
  const { g } = ctx;
  if (g.s.turn > 30) {
    const home = nearestOwnCity(ctx, u.tile);
    if (home && u.tile !== home.tile) moveAlong(g, u, home.tile);
    else g.fortify(u);
    return;
  }
  const land = tilesInRadius(g.map, u.tile, 7).filter((t) => !TERRAIN[g.map.tiles[t].t].water && g.unitsAt(t).length === 0);
  if (!land.length) return;
  moveAlong(g, u, g.rng.pick(land));
}

// ------------------------------------------------------------------ settlers

function siteValue(ctx: Ctx, t: number): number {
  const { g, pid } = ctx;
  let v = 0;
  for (const n of tilesInRadius(g.map, t, 2)) {
    const tile = g.map.tiles[n];
    if (tile.owner !== -1 && tile.owner !== pid) continue;
    if (tile.owner === pid && tile.city !== -1) {
      v += 0.3;
      continue;
    }
    const y = tileYield(g, n);
    v += y.food * 1.4 + y.prod + y.gold * 0.6;
  }
  if (isCoastal(g, t)) v += 3;
  if (g.map.tiles[t].river) v += 2;
  if (g.map.tiles[t].t === 'hills') v += 2;
  return v;
}

function validSite(ctx: Ctx, t: number): boolean {
  const { g, pid } = ctx;
  const tile = g.map.tiles[t];
  if (TERRAIN[tile.t].water || tile.t === 'mountains') return false;
  if (tile.owner !== -1 && tile.owner !== pid) return false;
  for (const c of g.s.cities) if (distance(g.map, c.tile, t) < 3) return false;
  if (g.unitsAt(t).some((u) => u.owner !== pid)) return false;
  return true;
}

function bestCitySite(ctx: Ctx, from: number, exclude: number[] = []): number {
  const { g } = ctx;
  let best = -1;
  let bestScore = -Infinity;
  const own = g.citiesOf(ctx.pid);
  for (const t of tilesInRadius(g.map, from, 9)) {
    if (!validSite(ctx, t)) continue;
    if (exclude.some((x) => distance(g.map, x, t) < 3)) continue;
    let near = Infinity;
    for (const c of own) near = Math.min(near, distance(g.map, c.tile, t));
    if (near > 7) continue;
    const s = siteValue(ctx, t) - distance(g.map, from, t) * 1.5 - Math.max(0, near - 4) * 2;
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return bestScore > 18 ? best : -1;
}

function settlerTurn(ctx: Ctx, u: Unit) {
  const { g } = ctx;
  const reservedByOthers = g
    .unitsOf(ctx.pid)
    .filter((o) => o.type === 'settler' && o.id !== u.id && o.ai?.target !== undefined)
    .map((o) => o.ai!.target!);
  let target = u.ai?.target;
  if (target === undefined || !validSite(ctx, target)) {
    target = bestCitySite(ctx, u.tile, [...ctx.reserved, ...reservedByOthers]);
    if (target < 0) {
      // nowhere to settle: wait at home, or settle on the spot if possible
      if (!g.canFoundCity(u)) g.foundCity(u);
      else g.sleep(u);
      return;
    }
    u.ai = { target, role: 'settle' };
  }
  ctx.reserved.push(target);
  if (u.tile === target) {
    g.foundCity(u);
    return;
  }
  if (!moveAlong(g, u, target)) {
    u.ai = undefined;
    return;
  }
  if (g.unit(u.id) && u.tile === target && u.moves >= 0) g.foundCity(u);
}

// ------------------------------------------------------------ super weapons

/**
 * Launch at an enemy great power's city when the war has gone on a while,
 * the blast spares our own cities and armies, and it would not drag in
 * another great power. More likely when losing.
 */
function nuclearStrikes(ctx: Ctx) {
  const { g, pid } = ctx;
  const weapons = g.unitsOf(pid).filter((u) => UNITS[u.type].strike);
  if (!weapons.length || !ctx.enemies.length) return;
  if (g.s.turn - (ctx.p.lastLaunch ?? -Infinity) < AI_LAUNCH_COOLDOWN) return;
  for (const u of weapons) {
    let best: { tile: number; score: number } | null = null;
    for (const e of ctx.enemies) {
      if (g.player(e).isMinor || g.s.turn - g.relation(pid, e).since < 4) continue;
      const desperate = ctx.myStrength < g.militaryStrength(e) * 1.1;
      for (const c of g.citiesOf(e)) {
        if (cannotStrike(g, u, c.tile)) continue;
        const pv = strikePreview(g, u, c.tile);
        if (pv.cities.some((x) => x.owner === pid) || pv.ownUnits > 1) continue;
        if (pv.newWars.some((x) => !g.player(x).isMinor)) continue;
        const score = pv.otherUnits * 3 + c.pop + (c.isCapital ? 6 : 0) - (pv.shielded ? 8 : 0) + (desperate ? 6 : 0);
        if (!best || score > best.score) best = { tile: c.tile, score };
      }
    }
    if (best && best.score >= 12 && g.rng.chance(0.35)) {
      g.launch(u, best.tile);
      return; // one launch at a time
    }
  }
}

// -------------------------------------------------------------- missionaries

/** Can a missionary of `rel` hope to convert this city (ignoring where it stands)? */
function convertible(ctx: Ctx, c: City, rel: string): boolean {
  if (!c.religion || c.religion === rel) return false;
  const holy = holyReligion(ctx.g, c);
  if (holy && holy === c.religion) return false;
  return !ctx.g.atWar(ctx.pid, c.owner);
}

/**
 * Where to preach: our own cities of another faith first (they lose
 * production to dissent), then nearby foreign ones. Returns a city tile or -1.
 */
function missionaryTarget(ctx: Ctx, from: number, rel: string, foreign: boolean): number {
  const { g, pid } = ctx;
  let best = -1;
  let bestScore = Infinity;
  for (const c of g.s.cities) {
    if (!convertible(ctx, c, rel)) continue;
    const mine = c.owner === pid;
    if (!mine && (!foreign || g.player(c.owner).isHuman)) continue;
    const d = distance(g.map, from, c.tile);
    if (d > (mine ? 14 : 8)) continue;
    const score = d + (mine ? 0 : 6) - c.pop * 0.5 - (c.isCapital ? 3 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = c.tile;
    }
  }
  return best;
}

function missionaryTurn(ctx: Ctx, u: Unit) {
  const { g } = ctx;
  const rel = u.religion ?? ctx.p.religion;
  if (!rel) return g.sleep(u);
  let target = u.ai?.target;
  const city = target !== undefined ? g.cityAt(target) : undefined;
  if (!city || !convertible(ctx, city, rel)) {
    target = missionaryTarget(ctx, u.tile, rel, true);
    if (target < 0) return g.sleep(u);
    u.ai = { target, role: 'preach' };
  }
  const goal = g.cityAt(target!)!;
  if (!cannotPreach(g, u, goal)) {
    g.preach(u, goal);
    return;
  }
  if (!moveAlong(g, u, goal.tile, true)) {
    u.ai = undefined;
    return;
  }
  if (g.unit(u.id) && !cannotPreach(g, u, goal)) g.preach(u, goal);
}

// ---------------------------------------------------------------- production

function production(ctx: Ctx, city: City) {
  const { g, pid } = ctx;
  const defenders = militaryOn(g, city.tile, pid).length;
  const desired = desiredDefenders(ctx, city);
  const urgent = defenders < desired && (ctx.threat.get(city.id) ?? 0) > 0;
  const current = city.build;
  if (current && current.kind !== 'wealth' && !urgent && canBuild(g, city, current)) return;
  if (current && current.kind === 'unit' && isMilitary(UNITS[current.id]) && urgent) return;
  const item = chooseBuild(ctx, city, defenders, desired);
  g.setBuild(city, item);
}

function chooseBuild(ctx: Ctx, city: City, defenders: number, desired: number): BuildItem {
  const { g, pid, p } = ctx;
  const unit = (d: UnitDef | undefined): BuildItem | null => (d ? { kind: 'unit', id: d.id } : null);
  const bestDef = () => unit(bestBy(buildable(ctx, city, (d) => d.cls === 'melee'), (d) => d.defense + d.attack * 0.2));
  if (defenders < desired) {
    const d = bestDef();
    if (d) return d;
  }
  const building = (id: string): BuildItem | null => (canBuild(g, city, { kind: 'building', id }) ? { kind: 'building', id } : null);

  if (p.isMinor) {
    for (const id of ['walls', 'granary', 'library', 'market', 'temple', 'castle', 'harbor', 'aqueduct', 'workshop']) {
      const b = building(id);
      if (b) return b;
    }
    return { kind: 'wealth' };
  }

  const allUnits = g.unitsOf(pid);
  const military = allUnits.filter((u) => isMilitary(UNITS[u.type]) && UNITS[u.type].cls !== 'recon').length;
  const settlers = allUnits.filter((u) => u.type === 'settler').length;
  const settlersBuilding = ctx.cities.filter((c) => c.build?.kind === 'unit' && c.build.id === 'settler').length;
  const atWar = ctx.enemies.length > 0;
  const yields = computeCityYields(g, city);

  // expansion
  const targetCities = 9 + Math.round(p.aggression * 4);
  if (
    g.s.turn < 160 &&
    city.pop >= 2 &&
    ctx.cities.length + settlers + settlersBuilding < targetCities &&
    settlers + settlersBuilding < 2 &&
    !(atWar && (ctx.threat.get(city.id) ?? 0) > 0) &&
    bestCitySite(ctx, city.tile) >= 0
  ) {
    return { kind: 'unit', id: 'settler' };
  }

  // missionaries to win back our own cities of another faith, now and then foreign ones
  const missionary: BuildItem = { kind: 'unit', id: 'missionary' };
  if (city.religion && city.religion === p.religion && canBuild(g, city, missionary)) {
    const busy = allUnits.some((u) => u.type === 'missionary') || ctx.cities.some((c) => c.build?.kind === 'unit' && c.build.id === 'missionary');
    if (!busy) {
      const ownTarget = missionaryTarget(ctx, city.tile, city.religion, false) >= 0;
      if (ownTarget || (!atWar && g.rng.chance(0.08) && missionaryTarget(ctx, city.tile, city.religion, true) >= 0)) return missionary;
    }
  }

  // war footing
  const warTarget = Math.ceil(ctx.cities.length * 2.2 + p.aggression * 3);
  if (atWar && military < warTarget) {
    const roll = g.rng.next();
    const siege = buildable(ctx, city, (d) => d.cls === 'siege');
    const mounted = buildable(ctx, city, (d) => d.cls === 'mounted');
    const ranged = buildable(ctx, city, (d) => d.cls === 'ranged');
    let pick: UnitDef | undefined;
    if (roll < 0.22 && siege.length) pick = bestBy(siege, (d) => d.ranged ?? 0);
    else if (roll < 0.45 && mounted.length) pick = bestBy(mounted, (d) => d.attack);
    else if (roll < 0.6 && ranged.length) pick = bestBy(ranged, (d) => d.ranged ?? 0);
    else pick = bestBy(buildable(ctx, city, (d) => d.cls === 'melee'), (d) => d.attack + d.defense * 0.5);
    const u = unit(pick);
    if (u) return u;
  }

  // the space race, run from the realm's best workshop
  if (canBuild(g, city, { kind: 'building', id: 'apolloProgram' }) || g.player(pid).projects?.includes('apolloProgram')) {
    // the two best workshops each get a Spaceport, so ship parts go up side by side
    const top = [...ctx.cities].sort((a, b) => computeCityYields(g, b).prod - computeCityYields(g, a).prod).slice(0, 2);
    if (top.includes(city) || city.buildings.includes('spaceport')) {
      for (const id of SPACE_BUILDS) {
        if (id === 'apolloProgram' && city !== top[0]) continue;
        const item: BuildItem = { kind: 'building', id };
        if (!canBuild(g, city, item)) continue;
        if (ctx.cities.some((c) => c !== city && c.build?.kind === 'building' && c.build.id === id)) continue;
        return item;
      }
    }
  }

  // super weapons: develop the bomb once a rival has it or a great war is on, then keep a couple ready
  const majorWar = ctx.enemies.some((e) => !g.player(e).isMinor);
  const manhattan: BuildItem = { kind: 'building', id: 'manhattanProject' };
  if (
    canBuild(g, city, manhattan) &&
    yields.prod >= 20 &&
    (majorWar || nuclearPowers(g).length > 0 || g.rng.chance(0.05)) &&
    !ctx.cities.some((c) => c !== city && c.build?.kind === 'building' && c.build.id === manhattan.id)
  ) {
    return manhattan;
  }
  if (majorWar && g.rng.chance(0.3)) {
    const stock = allUnits.filter((u) => UNITS[u.type].strike).length + ctx.cities.filter((c) => c.build?.kind === 'unit' && UNITS[c.build.id].strike).length;
    const weapon = unit(bestBy(buildable(ctx, city, (d) => !!d.strike), (d) => d.strike!.blast * 100 + d.strike!.range));
    if (stock < 2 && weapon) return weapon;
  }

  // wonders in productive cities
  if (yields.prod >= 9 && g.rng.chance(0.35)) {
    const wonders = availableBuilds(g, city).filter(
      (b) => b.kind === 'building' && BUILDINGS[b.id].wonder && !ctx.cities.some((c) => c !== city && c.build?.kind === 'building' && c.build.id === b.id),
    );
    if (wonders.length) return g.rng.pick(wonders);
  }

  // infrastructure
  const front = frontier(ctx, city);
  const priorities: [string, boolean][] = [
    ['granary', city.pop >= 2],
    ['walls', front && (atWar || g.s.turn > 40)],
    ['library', true],
    ['market', true],
    ['harbor', true],
    ['temple', city.pop >= 3],
    ['barracks', atWar && p.aggression > 0.5],
    ['aqueduct', city.pop >= 5],
    ['workshop', true],
    ['university', true],
    ['bank', true],
    ['castle', front],
    ['printingHouse', true],
    ['observatory', true],
    ['arsenal', atWar],
    ['missileShield', (city.isCapital || city.pop >= 10) && nuclearPowers(g).some((x) => x !== pid)],
    ['publicSchool', true],
    ['factory', true],
    ['railwayStation', true],
    ['hospital', city.pop >= 6],
    ['powerPlant', true],
    ['stockExchange', true],
    ['researchLab', true],
    ['supermarket', city.pop >= 8],
    ['broadcastTower', city.pop >= 8],
    ['nuclearPlant', true],
  ];
  const peaceTarget = Math.ceil(ctx.cities.length * 1.4 + p.aggression * 2);
  if (military < peaceTarget * 0.7) {
    const d = bestDef();
    if (d) return d;
  }
  for (const [id, cond] of priorities) {
    if (!cond) continue;
    const b = building(id);
    if (b) return b;
  }
  if (military < (p.gold > 300 ? warTarget : peaceTarget)) {
    const pick = bestBy(buildable(ctx, city, (d) => d.cls === 'melee' || d.cls === 'mounted'), (d) => d.attack + d.defense);
    const u = unit(pick);
    if (u) return u;
  }
  return { kind: 'wealth' };
}

// --------------------------------------------------------------------- gold

function spendGold(ctx: Ctx) {
  const { g, p } = ctx;
  for (const city of [...ctx.cities].sort((a, b) => (ctx.threat.get(b.id) ?? 0) - (ctx.threat.get(a.id) ?? 0))) {
    const cost = buyCost(g, city);
    if (cost === null || !city.build) continue;
    const threatened = (ctx.threat.get(city.id) ?? 0) > 0 && city.build.kind === 'unit';
    const reserve = threatened ? 20 : 150;
    if (p.gold - cost >= reserve) g.buy(city);
  }
}
