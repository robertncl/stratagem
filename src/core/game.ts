// The Game wraps a serialisable GameState with lookup caches and all the
// actions players (human or AI) can take.

import { BUILDINGS } from './data/buildings';
import { MAJOR_NATIONS } from './data/nations';
import { TECHS, TECH_LIST } from './data/techs';
import { TERRAIN } from './data/terrain';
import { UNITS, isMilitary, isRanged } from './data/units';
import { GAZETTEER } from './map/geography';
import { lonLatToKm } from './map/mapgen';
import { distance, hexCenter, neighbors, tilesInRadius } from './hex';
import { Rng } from './rng';
import {
  borderThreshold,
  buildCost,
  buildName,
  buildingUpkeep,
  buyCost,
  canBuild,
  cityEffects,
  computeCityYields,
  effectiveProd,
  growthThreshold,
  MAX_BORDER_RADIUS,
} from './rules/cities';
import { bestDefender, CombatResult, resolveCombat } from './rules/combat';
import { DISSENT_UNREST } from './data/religions';
import { completeProject, onCapitalLost, spaceArrival } from './rules/space';
import { migrateReligion, onTechDiscovered, preach, seedCityFaith, spreadReligion, syncStateReligion } from './rules/religion';
import { enterKind, findPath, isWaterTile, moveCost, ALL_MOVES, terrainAllowed } from './rules/movement';
import type { BuildItem, City, CityFocus, GameState, LogEntry, LogKind, Player, Relation, Unit } from './types';

export type AIHook = (g: Game, pid: number) => void;

export const YEARS_PER_TURN = 2;
export const PEACE_TREATY_TURNS = 10;
const LOG_LIMIT = 400;

export interface MoveOutcome {
  moved: boolean;
  combat?: CombatResult;
  capturedCity?: City;
}

export class Game {
  s: GameState;
  rng: Rng;
  ai: AIHook | null = null;
  private listeners: ((e: LogEntry) => void)[] = [];
  private byTile = new Map<number, Unit[]>();
  private cityByTile = new Map<number, City>();
  private unitIndex = new Map<number, Unit>();
  private cityIndex = new Map<number, City>();
  /** tiles currently visible to the human player (not serialised) */
  visible: Uint8Array;

  constructor(state: GameState) {
    this.s = state;
    this.rng = new Rng(state.rng);
    this.visible = new Uint8Array(state.map.tiles.length);
    this.rebuildCaches();
    if (!state.religions) migrateReligion(this);
    // saves from before the Space Age ended in 1800; they now run on to 2050
    if (state.maxTurns === 200) state.maxTurns = 325;
    this.refreshVisibility();
  }

  // ---------------------------------------------------------------- caches

  rebuildCaches() {
    this.byTile.clear();
    this.cityByTile.clear();
    this.unitIndex.clear();
    this.cityIndex.clear();
    for (const u of this.s.units) {
      this.unitIndex.set(u.id, u);
      this.addToTile(u);
    }
    for (const c of this.s.cities) {
      this.cityIndex.set(c.id, c);
      this.cityByTile.set(c.tile, c);
    }
  }

  private addToTile(u: Unit) {
    let list = this.byTile.get(u.tile);
    if (!list) this.byTile.set(u.tile, (list = []));
    list.push(u);
  }

  private removeFromTile(u: Unit) {
    const list = this.byTile.get(u.tile);
    if (!list) return;
    const i = list.indexOf(u);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) this.byTile.delete(u.tile);
  }

  // --------------------------------------------------------------- queries

  get map() {
    return this.s.map;
  }

  player(id: number): Player {
    return this.s.players[id];
  }

  unit(id: number): Unit | undefined {
    return this.unitIndex.get(id);
  }

  city(id: number): City | undefined {
    return this.cityIndex.get(id);
  }

  unitsAt(tile: number): Unit[] {
    return this.byTile.get(tile) ?? [];
  }

  cityAt(tile: number): City | undefined {
    return this.cityByTile.get(tile);
  }

  citiesOf(pid: number): City[] {
    return this.s.cities.filter((c) => c.owner === pid);
  }

  unitsOf(pid: number): Unit[] {
    return this.s.units.filter((u) => u.owner === pid);
  }

  get humanId(): number {
    const p = this.s.players.find((x) => x.isHuman);
    return p ? p.id : -1;
  }

  year(turn = this.s.turn): number {
    return this.s.startYear + (turn - 1) * YEARS_PER_TURN;
  }

  capitalOf(pid: number): City | undefined {
    return this.s.cities.find((c) => c.owner === pid && c.isCapital);
  }

  hasTech(pid: number, tech: string): boolean {
    return this.s.players[pid].techs.includes(tech);
  }

  nextId(): number {
    return this.s.nextId++;
  }

  // ------------------------------------------------------------- diplomacy

  private relKey(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  }

  relation(a: number, b: number): Relation {
    const k = this.relKey(a, b);
    let r = this.s.relations[k];
    if (!r) r = this.s.relations[k] = { war: false, since: -100 };
    return r;
  }

  atWar(a: number, b: number): boolean {
    if (a === b) return false;
    return this.relation(a, b).war;
  }

  enemiesOf(pid: number): number[] {
    return this.s.players.filter((p) => p.alive && p.id !== pid && this.atWar(pid, p.id)).map((p) => p.id);
  }

  canDeclareWar(a: number, b: number): boolean {
    if (a === b || !this.player(a).alive || !this.player(b).alive) return false;
    const r = this.relation(a, b);
    return !r.war && this.s.turn - r.since >= PEACE_TREATY_TURNS;
  }

  declareWar(a: number, b: number): boolean {
    if (!this.canDeclareWar(a, b)) return false;
    const r = this.relation(a, b);
    r.war = true;
    r.since = this.s.turn;
    this.s.proposals = this.s.proposals.filter((p) => !(this.relKey(p.from, p.to) === this.relKey(a, b)));
    this.log('war', `${this.player(a).name} declares war on ${this.player(b).name}!`, [a, b]);
    return true;
  }

  makePeace(a: number, b: number): boolean {
    const r = this.relation(a, b);
    if (!r.war) return false;
    r.war = false;
    r.since = this.s.turn;
    this.s.proposals = this.s.proposals.filter((p) => !(this.relKey(p.from, p.to) === this.relKey(a, b)));
    this.log('peace', `${this.player(a).name} and ${this.player(b).name} sign a peace treaty.`, [a, b]);
    return true;
  }

  /** Military strength used by AI and the diplomacy screen. */
  militaryStrength(pid: number): number {
    let s = 0;
    for (const u of this.s.units) {
      if (u.owner !== pid) continue;
      const d = UNITS[u.type];
      if (!isMilitary(d) || d.cls === 'recon') continue;
      s += ((Math.max(d.attack, d.ranged ?? 0) + d.defense) / 2) * (u.hp / 100) * (u.veteran ? 1.25 : 1);
    }
    return Math.round(s);
  }

  // ----------------------------------------------------------------- units

  createUnit(type: string, owner: number, tile: number): Unit {
    const def = UNITS[type];
    const u: Unit = {
      id: this.nextId(),
      type,
      owner,
      tile,
      hp: 100,
      moves: def.moves,
      xp: 0,
      veteran: false,
      fortified: false,
      sleeping: false,
      goto: null,
      acted: false,
    };
    this.s.units.push(u);
    this.unitIndex.set(u.id, u);
    this.addToTile(u);
    if (this.player(owner).isHuman) this.refreshVisibility();
    return u;
  }

  removeUnit(u: Unit) {
    this.removeFromTile(u);
    this.unitIndex.delete(u.id);
    const i = this.s.units.indexOf(u);
    if (i >= 0) this.s.units.splice(i, 1);
  }

  private placeUnit(u: Unit, tile: number) {
    this.removeFromTile(u);
    u.tile = tile;
    this.addToTile(u);
  }

  /** Move along a path toward `target`, attacking/capturing at the end if needed. */
  moveUnit(u: Unit, target: number): MoveOutcome {
    const out: MoveOutcome = { moved: false };
    if (u.moves <= 0 || target === u.tile) return out;
    const path = findPath(this, u, target);
    if (!path || !path.length) {
      u.goto = null;
      return out;
    }
    for (let k = 0; k < path.length; k++) {
      if (u.moves <= 0) break;
      const next = path[k].tile;
      const kind = enterKind(this, u, next);
      if (kind === null) break;
      if (kind === 'attack') {
        if (k === path.length - 1) out.combat = this.attack(u, next) ?? undefined;
        break;
      }
      const captured = this.stepUnit(u, next);
      out.moved = true;
      if (captured) out.capturedCity = captured;
      if (!this.unit(u.id)) return out;
    }
    u.goto = u.tile === target || out.combat ? null : target;
    return out;
  }

  /** Single step; returns a captured city if one changed hands. */
  stepUnit(u: Unit, to: number): City | undefined {
    const cost = moveCost(this, u, u.tile, to);
    u.moves = cost >= ALL_MOVES ? 0 : Math.max(0, u.moves - cost);
    u.acted = true;
    u.fortified = false;
    u.sleeping = false;
    // capture enemy civilians
    for (const other of [...this.unitsAt(to)]) {
      if (other.owner !== u.owner && this.atWar(u.owner, other.owner) && !isMilitary(UNITS[other.type])) {
        if (other.type === 'settler') {
          this.log('combat', `${this.player(u.owner).adjective} forces capture a ${this.player(other.owner).adjective} settler.`, [u.owner, other.owner], to);
          other.owner = u.owner;
          other.moves = 0;
          other.goto = null;
        } else this.removeUnit(other);
      }
    }
    this.placeUnit(u, to);
    let captured: City | undefined;
    const city = this.cityAt(to);
    if (city && city.owner !== u.owner && this.atWar(u.owner, city.owner)) {
      this.captureCity(city, u.owner);
      captured = city;
    }
    if (this.player(u.owner).isHuman) this.refreshVisibility();
    return captured;
  }

  canAttack(u: Unit, tile: number): boolean {
    const def = UNITS[u.type];
    if (u.moves <= 0 || !isMilitary(def)) return false;
    if (isRanged(def)) {
      if (distance(this.map, u.tile, tile) > (def.range ?? 0) || isWaterTile(this, u.tile)) return false;
      const d = bestDefender(this, tile, u);
      return !!d && this.atWar(u.owner, d.owner);
    }
    if (distance(this.map, u.tile, tile) !== 1) return false;
    return enterKind(this, u, tile) === 'attack';
  }

  /** Melee or ranged attack on an adjacent/in-range tile. */
  attack(u: Unit, tile: number): CombatResult | null {
    if (!this.canAttack(u, tile)) return null;
    const def = bestDefender(this, tile, u);
    if (!def) return null;
    const ranged = isRanged(UNITS[u.type]);
    const res = resolveCombat(this, u, def, ranged);
    u.moves = 0;
    u.acted = true;
    u.fortified = false;
    def.fortified = def.fortified && !res.defenderDied;
    const an = `${this.player(u.owner).adjective} ${UNITS[u.type].name}`;
    const dn = `${this.player(def.owner).adjective} ${UNITS[def.type].name}`;
    if (res.defenderDied) {
      this.removeUnit(def);
      this.player(u.owner).stats.unitsKilled++;
      this.player(def.owner).stats.unitsLost++;
      this.log('combat', `${an} destroys ${dn}.`, [u.owner, def.owner], tile);
    } else if (res.attackerDied) {
      this.log('combat', `${dn} repels and destroys ${an}.`, [u.owner, def.owner], tile);
    } else {
      this.log('combat', `${an} attacks ${dn} (−${res.dmgToDefender} / −${res.dmgToAttacker} HP).`, [u.owner, def.owner], tile);
    }
    if (res.attackerDied) {
      this.removeUnit(u);
      this.player(u.owner).stats.unitsLost++;
      this.player(def.owner).stats.unitsKilled++;
    } else if (res.defenderDied && !ranged && !bestDefender(this, tile, u)) {
      // melee winner advances into the tile (capturing cities and civilians)
      const city = this.cityAt(tile);
      if (enterKind(this, u, tile) === 'capture' || enterKind(this, u, tile) === 'move') {
        if (city || !isWaterTile(this, tile)) {
          this.stepUnit(u, tile);
          u.moves = 0;
        }
      }
    }
    if (this.player(u.owner).isHuman || this.player(def.owner).isHuman) this.refreshVisibility();
    return res;
  }

  fortify(u: Unit) {
    if (!isMilitary(UNITS[u.type])) return this.sleep(u);
    u.fortified = true;
    u.goto = null;
  }

  sleep(u: Unit) {
    u.sleeping = true;
    u.goto = null;
  }

  wake(u: Unit) {
    u.sleeping = false;
    u.fortified = false;
  }

  disband(u: Unit) {
    this.removeUnit(u);
  }

  /** A missionary converts a city in or next to its tile. */
  preach(u: Unit, city: City): boolean {
    return preach(this, u, city);
  }

  // ---------------------------------------------------------------- cities

  canFoundCity(u: Unit): string | null {
    if (u.type !== 'settler') return 'Only settlers can found cities.';
    const tile = this.map.tiles[u.tile];
    if (TERRAIN[tile.t].water) return 'Cannot found a city at sea.';
    if (tile.t === 'mountains') return 'Cannot found a city on mountains.';
    if (tile.owner >= 0 && tile.owner !== u.owner) return 'This land belongs to another nation.';
    for (const c of this.s.cities) if (distance(this.map, c.tile, u.tile) < 3) return 'Too close to another city.';
    return null;
  }

  foundCity(u: Unit): City | null {
    if (this.canFoundCity(u)) return null;
    const city = this.createCity(u.owner, u.tile, 1);
    this.removeUnit(u);
    this.player(city.owner).stats.citiesFounded++;
    this.log('city', `${this.player(city.owner).adjective} settlers found ${city.name}.`, [city.owner], city.tile);
    return city;
  }

  createCity(owner: number, tile: number, pop: number, name?: string): City {
    const city: City = {
      id: this.nextId(),
      name: name ?? this.cityNameFor(owner, tile),
      owner,
      founder: owner,
      tile,
      pop,
      food: 0,
      prod: 0,
      culture: 0,
      borderRadius: 1,
      buildings: [],
      build: null,
      isCapital: !this.capitalOf(owner),
      founded: this.s.turn,
      unrest: 0,
    };
    seedCityFaith(this, city);
    this.s.cities.push(city);
    this.cityIndex.set(city.id, city);
    this.cityByTile.set(tile, city);
    const t = this.map.tiles[tile];
    t.owner = owner;
    t.city = city.id;
    this.claimTiles(city);
    if (this.player(owner).isHuman) this.refreshVisibility();
    return city;
  }

  /** Name a new city after the nearest real town that isn't taken. */
  cityNameFor(owner: number, tile: number): string {
    const used = new Set(this.s.cities.map((c) => c.name));
    const [cx, cy] = hexCenter(tile % this.map.width, Math.floor(tile / this.map.width), this.map.hexKm);
    let best: string | null = null;
    let bestD = this.map.hexKm * 3.2;
    for (const [name, lon, lat] of GAZETTEER) {
      if (used.has(name)) continue;
      const [x, y] = lonLatToKm(lon, lat);
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestD) {
        bestD = d;
        best = name;
      }
    }
    if (best) return best;
    const nation = MAJOR_NATIONS.find((n) => n.id === this.player(owner).nation);
    for (const n of nation?.cityNames ?? []) if (!used.has(n)) return n;
    let k = 1;
    while (used.has(`${this.player(owner).adjective} Outpost ${k}`)) k++;
    return `${this.player(owner).adjective} Outpost ${k}`;
  }

  claimTiles(city: City) {
    for (const t of tilesInRadius(this.map, city.tile, city.borderRadius)) {
      const tile = this.map.tiles[t];
      if (tile.owner === -1) {
        tile.owner = city.owner;
        tile.city = city.id;
      }
    }
  }

  captureCity(city: City, newOwner: number) {
    const old = city.owner;
    const wasCapital = city.isCapital;
    city.owner = newOwner;
    city.isCapital = false;
    city.pop = Math.max(1, city.pop - 1);
    city.prod = 0;
    city.food = 0;
    city.build = null;
    // a city of another faith resists its new masters for longer
    city.unrest = 3 + (city.religion && this.player(newOwner).religion && city.religion !== this.player(newOwner).religion ? DISSENT_UNREST : 0);
    city.buildings = city.buildings.filter((b) => BUILDINGS[b].wonder || this.rng.chance(0.6));
    for (const tile of this.map.tiles) if (tile.city === city.id) tile.owner = newOwner;
    // displaced civilians are lost
    for (const u of [...this.unitsAt(city.tile)]) if (u.owner === old) this.removeUnit(u);
    this.player(newOwner).stats.citiesCaptured++;
    this.log('city', `${this.player(newOwner).name} captures ${city.name} from ${this.player(old).name}!`, [newOwner, old], city.tile);
    // a liberated original capital becomes the capital again
    if (this.player(newOwner).originalCapital === city.id) {
      for (const c of this.citiesOf(newOwner)) c.isCapital = false;
      city.isCapital = true;
    }
    if (wasCapital) {
      this.reassignCapital(old);
      onCapitalLost(this, old);
    }
    if (!this.capitalOf(newOwner)) this.reassignCapital(newOwner);
    syncStateReligion(this, old);
    syncStateReligion(this, newOwner);
    if (this.citiesOf(old).length === 0) this.eliminate(old, newOwner);
  }

  private reassignCapital(pid: number) {
    const cities = this.citiesOf(pid);
    if (!cities.length || cities.some((c) => c.isCapital)) return;
    cities.sort((a, b) => b.pop - a.pop);
    cities[0].isCapital = true;
  }

  private eliminate(pid: number, by: number) {
    const p = this.player(pid);
    if (!p.alive) return;
    p.alive = false;
    for (const u of this.unitsOf(pid)) this.removeUnit(u);
    for (const other of this.s.players) if (other.id !== pid) this.relation(pid, other.id).war = false;
    this.s.proposals = this.s.proposals.filter((x) => x.from !== pid && x.to !== pid);
    this.log('war', `${p.name} has been destroyed by ${this.player(by).name}.`, [pid, by]);
  }

  setFocus(city: City, focus: CityFocus) {
    city.focus = focus === 'balanced' ? undefined : focus;
  }

  setBuild(city: City, item: BuildItem | null) {
    if (item && !canBuild(this, city, item)) return false;
    // switching between categories loses half the stored production
    const prev = city.build;
    if (prev && item && prev.kind !== item.kind && city.prod > 0) city.prod = Math.floor(city.prod / 2);
    city.build = item;
    return true;
  }

  buy(city: City): boolean {
    const cost = buyCost(this, city);
    const p = this.player(city.owner);
    if (cost === null || p.gold < cost || !city.build) return false;
    p.gold -= cost;
    city.prod = buildCost(city.build);
    return true;
  }

  // -------------------------------------------------------------- research

  availableTechs(pid: number): string[] {
    const p = this.player(pid);
    return TECH_LIST.filter((t) => !p.techs.includes(t.id) && t.prereqs.every((r) => p.techs.includes(r))).map((t) => t.id);
  }

  /** Research cost grows 4% per city beyond the fourth, so sprawling empires pay for it. */
  techCost(pid: number, tech: string): number {
    const cities = this.citiesOf(pid).length;
    return Math.round(TECHS[tech].cost * (1 + 0.04 * Math.max(0, cities - 4)));
  }

  setResearch(pid: number, tech: string) {
    if (!this.availableTechs(pid).includes(tech)) return false;
    this.player(pid).research = tech;
    return true;
  }

  /** Techs still to learn on the way to `goal` (ending with it), prerequisites first. */
  techPath(pid: number, goal: string): string[] {
    const known = this.player(pid).techs;
    const out: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id) || known.includes(id)) return;
      seen.add(id);
      for (const r of TECHS[id].prereqs) visit(r);
      out.push(id);
    };
    visit(goal);
    return out;
  }

  /**
   * Work toward a distant tech: research switches to a step on its path
   * (unless it is already on one) and moves on by itself as each step is learned.
   */
  setResearchGoal(pid: number, goal: string | null) {
    const p = this.player(pid);
    if (!goal || p.techs.includes(goal)) {
      p.researchGoal = null;
      return;
    }
    p.researchGoal = goal;
    const path = this.techPath(pid, goal);
    if (!p.research || !path.includes(p.research)) p.research = this.nextOnPath(pid);
  }

  /** The cheapest tech on the way to the research goal that can be studied now. */
  private nextOnPath(pid: number): string | null {
    const goal = this.player(pid).researchGoal;
    if (!goal) return null;
    const avail = new Set(this.availableTechs(pid));
    const steps = this.techPath(pid, goal).filter((t) => avail.has(t));
    steps.sort((a, b) => TECHS[a].cost - TECHS[b].cost);
    return steps[0] ?? null;
  }

  grantTech(pid: number, tech: string) {
    const p = this.player(pid);
    if (p.techs.includes(tech)) return;
    p.techs.push(tech);
    if (p.research === tech) p.research = null;
    if (p.researchGoal && p.techs.includes(p.researchGoal)) p.researchGoal = null;
    if (!p.research && p.researchGoal) p.research = this.nextOnPath(pid);
    if (!p.isMinor) this.log('tech', `${p.name} discovers ${TECHS[tech].name}.`, [pid]);
    onTechDiscovered(this, pid, tech);
    if (tech === 'satellites' && p.explored) p.explored.fill(1);
    if (p.isHuman) this.refreshVisibility();
  }

  // ------------------------------------------------------------ turn cycle

  /** Ends the human turn: AIs move, then every player's economy ticks. */
  endTurn() {
    if (this.s.winner) return;
    for (const p of this.s.players) {
      if (!p.alive || p.isHuman) continue;
      this.ai?.(this, p.id);
      if (this.s.winner) break;
    }
    for (const p of this.s.players) if (p.alive) this.processPlayer(p.id);
    spreadReligion(this);
    this.s.turn++;
    this.checkVictory();
    // human units continue multi-turn moves
    const h = this.humanId;
    if (h >= 0) {
      for (const u of this.unitsOf(h)) {
        if (u.goto !== null && this.unit(u.id)) {
          const target = u.goto;
          const r = this.moveUnit(u, target);
          if (!r.moved && u.tile !== target) u.goto = null;
        }
      }
    }
    this.refreshVisibility();
    this.s.rng = this.rng.state;
  }

  processPlayer(pid: number) {
    const p = this.player(pid);
    let goldDelta = 0;
    let sci = 0;
    for (const city of this.citiesOf(pid)) {
      const y = computeCityYields(this, city);
      sci += y.sci;
      goldDelta += y.gold - buildingUpkeep(city);
      if (city.unrest > 0) city.unrest--;
      // growth
      city.food += y.surplus;
      const need = growthThreshold(city.pop);
      if (city.food >= need) {
        city.pop++;
        city.food = city.buildings.includes('granary') ? Math.floor(need * 0.25) : 0;
        if (p.isHuman) this.log('city', `${city.name} grows to size ${city.pop}.`, [pid], city.tile);
      } else if (city.food < 0) {
        if (city.pop > 1) {
          city.pop--;
          this.log('city', `${city.name} is starving and shrinks to size ${city.pop}.`, [pid], city.tile);
        }
        city.food = 0;
      }
      // borders
      city.culture += y.culture;
      if (city.borderRadius < MAX_BORDER_RADIUS && city.culture >= borderThreshold(city.borderRadius)) {
        city.borderRadius++;
        this.claimTiles(city);
      }
      // production
      this.advanceProduction(city, y.prod);
    }
    // unit upkeep: a few units per city are free
    const units = this.unitsOf(pid);
    const free = 3 + this.citiesOf(pid).length;
    goldDelta -= Math.max(0, units.length - free);
    p.gold += goldDelta;
    if (p.gold < 0) {
      const victim = units.filter((u) => isMilitary(UNITS[u.type])).sort((a, b) => UNITS[a.type].cost - UNITS[b.type].cost)[0];
      if (victim) {
        this.removeUnit(victim);
        this.log('info', `${p.name} cannot pay its troops: a ${UNITS[victim.type].name} deserts.`, [pid], victim.tile);
      }
      p.gold = 0;
    }
    // research
    p.researchProgress += sci;
    if (p.research) {
      const cost = this.techCost(pid, p.research);
      if (p.researchProgress >= cost) {
        p.researchProgress -= cost;
        this.grantTech(pid, p.research);
      }
    }
    // units heal and refresh
    for (const u of units) {
      if (!u.acted && u.hp < 100) {
        const tile = this.map.tiles[u.tile];
        const city = this.cityAt(u.tile);
        let heal = city && city.owner === pid ? 20 : tile.owner === pid ? 15 : this.atWar(pid, tile.owner) ? 5 : 10;
        if (u.fortified && !city) heal += 5;
        // besieged units recover slowly
        if (neighbors(this.map, u.tile).some((n) => this.unitsAt(n).some((o) => this.atWar(pid, o.owner) && isMilitary(UNITS[o.type])))) heal = Math.ceil(heal / 2);
        u.hp = Math.min(100, u.hp + heal);
      }
      u.moves = UNITS[u.type].moves;
      u.acted = false;
    }
  }

  private advanceProduction(city: City, prod: number) {
    const item = city.build;
    const p = this.player(city.owner);
    if (!item || item.kind === 'wealth') {
      p.gold += Math.floor(prod / 2);
      return;
    }
    if (!canBuild(this, city, item)) {
      // e.g. a wonder completed elsewhere: keep the production for the next item
      if (p.isHuman && item.kind === 'building' && (BUILDINGS[item.id].wonder || BUILDINGS[item.id].project)) {
        this.log('wonder', `${city.name} can no longer build ${BUILDINGS[item.id].name}.`, [city.owner], city.tile);
      }
      city.build = null;
      return;
    }
    city.prod += effectiveProd(this, city, item, prod);
    const cost = buildCost(item);
    if (city.prod < cost) return;
    if (item.kind === 'unit' && item.id === 'settler' && city.pop < 2) return; // wait to grow
    city.prod -= cost;
    if (item.kind === 'unit') {
      const u = this.createUnit(item.id, city.owner, city.tile);
      if (cityEffects(city).veteran && isMilitary(UNITS[u.type])) u.veteran = true;
      if (u.type === 'missionary') u.religion = city.religion;
      if (item.id === 'settler') city.pop--;
      if (p.isHuman) this.log('city', `${city.name} trains a new ${UNITS[item.id].name}.`, [city.owner], city.tile);
      city.build = null;
    } else if (BUILDINGS[item.id].project) {
      completeProject(this, city, item.id);
      city.build = null;
    } else {
      city.buildings.push(item.id);
      const b = BUILDINGS[item.id];
      if (b.wonder) {
        this.s.wonders[b.id] = city.id;
        this.log('wonder', `${p.name} completes the ${b.name} in ${city.name}!`, [city.owner], city.tile);
      } else if (p.isHuman) this.log('city', `${city.name} completes the ${b.name}.`, [city.owner], city.tile);
      city.build = null;
    }
    // a little overflow carries over; late-game cities keep up to a turn's worth
    city.prod = Math.min(city.prod, Math.max(30, prod));
  }

  // --------------------------------------------------------------- victory

  score(pid: number): number {
    const p = this.player(pid);
    const cities = this.citiesOf(pid);
    const pop = cities.reduce((s, c) => s + c.pop, 0);
    const wonders = cities.reduce((s, c) => s + c.buildings.filter((b) => BUILDINGS[b].wonder).length, 0);
    let land = 0;
    for (const t of this.map.tiles) if (t.owner === pid) land++;
    return cities.length * 8 + pop * 3 + p.techs.length * 5 + wonders * 20 + Math.floor(land / 4);
  }

  majors(): Player[] {
    return this.s.players.filter((p) => !p.isMinor);
  }

  checkVictory() {
    if (this.s.winner) return;
    const majors = this.majors();
    const alive = majors.filter((p) => p.alive);
    const h = this.humanId;
    if (h >= 0 && !this.player(h).alive) {
      const best = alive.sort((a, b) => this.score(b.id) - this.score(a.id))[0];
      this.s.winner = { player: best ? best.id : -1, kind: 'conquest' };
      return;
    }
    if (alive.length === 1) {
      this.s.winner = { player: alive[0].id, kind: 'conquest' };
      return;
    }
    const capitals = majors.map((p) => this.city(p.originalCapital)).filter((c): c is City => !!c);
    if (capitals.length > 1) {
      const owner = capitals[0].owner;
      if (!this.player(owner).isMinor && capitals.every((c) => c.owner === owner)) {
        this.s.winner = { player: owner, kind: 'domination' };
        return;
      }
    }
    const arrived = spaceArrival(this);
    if (arrived !== null) {
      this.s.winner = { player: arrived, kind: 'space' };
      return;
    }
    if (this.s.turn > this.s.maxTurns) {
      const best = alive.sort((a, b) => this.score(b.id) - this.score(a.id))[0];
      this.s.winner = { player: best.id, kind: 'score' };
    }
  }

  // ------------------------------------------------------------ visibility

  refreshVisibility() {
    const h = this.humanId;
    this.visible.fill(0);
    if (h < 0) return;
    const p = this.player(h);
    const mark = (center: number, r: number) => {
      for (const t of tilesInRadius(this.map, center, r)) this.visible[t] = 1;
    };
    for (const u of this.s.units) {
      if (u.owner !== h) continue;
      const terrain = this.map.tiles[u.tile].t;
      mark(u.tile, UNITS[u.type].sight + (terrain === 'hills' || terrain === 'mountains' ? 1 : 0));
    }
    for (const c of this.s.cities) if (c.owner === h) mark(c.tile, Math.max(2, c.borderRadius + 1));
    this.map.tiles.forEach((t, i) => {
      if (t.owner === h) this.visible[i] = 1;
    });
    if (p.explored) for (let i = 0; i < this.visible.length; i++) if (this.visible[i]) p.explored[i] = 1;
  }

  isExplored(tile: number): boolean {
    const h = this.humanId;
    if (h < 0) return true;
    const e = this.player(h).explored;
    return !e || e[tile] === 1;
  }

  // ------------------------------------------------------------------- log

  onLog(fn: (e: LogEntry) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  log(kind: LogKind, text: string, players: number[], tile?: number) {
    const e: LogEntry = { turn: this.s.turn, kind, text, players, tile };
    this.s.log.push(e);
    if (this.s.log.length > LOG_LIMIT) this.s.log.splice(0, this.s.log.length - LOG_LIMIT);
    for (const fn of this.listeners) fn(e);
  }

  // --------------------------------------------------------------- persist

  serialize(): string {
    this.s.rng = this.rng.state;
    return JSON.stringify(this.s);
  }

  static deserialize(json: string): Game {
    const s = JSON.parse(json) as GameState;
    if (s.version !== 1) throw new Error('Unsupported save version');
    return new Game(s);
  }
}

export { buildName, terrainAllowed };
