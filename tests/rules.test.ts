import { describe, expect, it } from 'vitest';
import { createGame } from '../src/core/setup';
import { Game } from '../src/core/game';
import { findPath } from '../src/core/rules/movement';
import { computeCityYields, availableBuilds, chooseWorkedTiles, focusWeights, SPECIALIST_YIELD, tileYield } from '../src/core/rules/cities';
import { neighbors, distance } from '../src/core/hex';
import { lonLatToTile, nearestLandTile } from '../src/core/map/mapgen';
import { TERRAIN } from '../src/core/data/terrain';

const newGame = () => createGame({ seed: 7, humanNation: 'france' });
const pid = (g: Game, nation: string) => g.s.players.find((p) => p.nation === nation)!.id;

describe('setup', () => {
  it('creates majors with capitals at their historical seats, plus minors', () => {
    const g = newGame();
    const majors = g.s.players.filter((p) => !p.isMinor);
    expect(majors).toHaveLength(8);
    for (const p of majors) {
      const cap = g.capitalOf(p.id)!;
      expect(cap).toBeTruthy();
      expect(g.unitsOf(p.id).length).toBeGreaterThanOrEqual(4);
    }
    expect(g.capitalOf(pid(g, 'france'))!.name).toBe('Paris');
    expect(g.capitalOf(pid(g, 'england'))!.name).toBe('London');
    expect(g.s.players.filter((p) => p.isMinor && p.alive).length).toBeGreaterThan(20);
    expect(g.humanId).toBe(pid(g, 'france'));
    expect(g.player(g.humanId).explored!.some((x) => x === 1)).toBe(true);
  });
});

describe('movement', () => {
  it('paths over land, and over sea only with Sailing', () => {
    const g = newGame();
    const fr = pid(g, 'france');
    const en = pid(g, 'england');
    const levy = g.unitsOf(fr).find((u) => u.type === 'levy')!;
    const lyon = nearestLandTile(g.map, 4.84, 45.76);
    expect(findPath(g, levy, lyon)).not.toBeNull();
    const london = g.capitalOf(en)!.tile;
    const nearLondon = neighbors(g.map, london).find((t) => !TERRAIN[g.map.tiles[t].t].water && g.unitsAt(t).length === 0)!;
    expect(findPath(g, levy, nearLondon)).toBeNull();
    g.player(fr).techs.push('sailing');
    expect(findPath(g, levy, nearLondon)).not.toBeNull();
  });

  it('moves units and spends movement', () => {
    const g = newGame();
    const fr = pid(g, 'france');
    const scout = g.unitsOf(fr).find((u) => u.type === 'scout')!;
    const target = nearestLandTile(g.map, 1.91, 47.9); // Orléans
    g.moveUnit(scout, target);
    expect(scout.moves).toBe(0);
    expect(distance(g.map, scout.tile, g.capitalOf(fr)!.tile)).toBeGreaterThan(0);
  });
});

describe('cities', () => {
  it('founds a city named after a nearby real town', () => {
    const g = newGame();
    const fr = pid(g, 'france');
    const settler = g.unitsOf(fr).find((u) => u.type === 'settler')!;
    const site = nearestLandTile(g.map, 1.1, 49.44); // Rouen
    g.s.units.find((u) => u.id === settler.id)!.tile; // keep reference
    // teleport for the test
    g.removeUnit(settler);
    const s2 = g.createUnit('settler', fr, site);
    expect(g.canFoundCity(s2)).toBeNull();
    const city = g.foundCity(s2)!;
    expect(city.name).toBe('Rouen');
    expect(g.map.tiles[city.tile].owner).toBe(fr);
    const y = computeCityYields(g, city);
    expect(y.food).toBeGreaterThan(0);
    expect(availableBuilds(g, city).some((b) => b.kind === 'unit' && b.id === 'settler')).toBe(true);
  });

  it('grows, produces and researches over turns', () => {
    const g = newGame();
    const fr = pid(g, 'france');
    const paris = g.capitalOf(fr)!;
    g.setBuild(paris, { kind: 'building', id: 'walls' });
    g.setResearch(fr, 'pottery');
    for (let t = 0; t < 25; t++) g.endTurn();
    expect(paris.pop).toBeGreaterThan(2);
    expect(paris.buildings).toContain('walls');
    expect(g.hasTech(fr, 'pottery')).toBe(true);
    expect(g.s.turn).toBe(26);
  });

  it('refuses settling next to another city or in foreign land', () => {
    const g = newGame();
    const fr = pid(g, 'france');
    const s = g.unitsOf(fr).find((u) => u.type === 'settler')!;
    expect(g.canFoundCity(s)).toMatch(/Too close/);
  });
});

describe('tile working', () => {
  it('a city focus shifts what the city produces', () => {
    const g = newGame();
    const paris = g.capitalOf(pid(g, 'france'))!;
    paris.pop = 5;
    paris.borderRadius = 2;
    g.claimTiles(paris);
    const by = (f: 'balanced' | 'food' | 'production' | 'gold') => {
      g.setFocus(paris, f);
      return computeCityYields(g, paris);
    };
    const balanced = by('balanced');
    expect(paris.focus).toBeUndefined();
    expect(by('food').food).toBeGreaterThanOrEqual(balanced.food);
    expect(by('production').prod).toBeGreaterThanOrEqual(balanced.prod);
    expect(by('gold').gold).toBeGreaterThanOrEqual(balanced.gold);
    const f = by('food');
    const p = by('production');
    expect(f.food).toBeGreaterThan(p.food);
    expect(p.prod).toBeGreaterThan(f.prod);
    expect(balanced.tiles.length).toBeGreaterThanOrEqual(balanced.worked.length);
  });

  it('trades tiles for food instead of starving when it can', () => {
    const y = (food: number, prod: number, gold: number) => ({ food, prod, gold });
    const candidates = [
      { t: 1, y: y(0, 1, 4) }, // silver mountain
      { t: 2, y: y(0, 3, 0) }, // iron mountain
      { t: 3, y: y(1, 2, 0) },
      { t: 4, y: y(2, 0, 1) },
      { t: 5, y: y(3, 0, 0) },
    ];
    const weights = focusWeights('production', 3);
    // unconstrained: the three most productive tiles, with 1 food between them
    const greedy = chooseWorkedTiles(candidates, 3, weights, 0, -Infinity);
    expect(greedy.map((c) => c.t).sort()).toEqual([1, 2, 3]);
    // needing 4 food from tiles: give up the weakest producers for food
    const fed = chooseWorkedTiles(candidates, 3, weights, 0, 4);
    expect(fed.reduce((s, c) => s + c.y.food, 0)).toBeGreaterThanOrEqual(4);
    expect(fed.map((c) => c.t)).toContain(2);
    // impossible to feed: keep the best it can do rather than loop
    const starving = chooseWorkedTiles(candidates, 3, weights, 0, 99);
    expect(starving.reduce((s, c) => s + c.y.food, 0)).toBe(6);
  });

  it('citizens without a good tile become specialists', () => {
    const g = newGame();
    const paris = g.capitalOf(pid(g, 'france'))!;
    const tiles = computeCityYields(g, paris).tiles.length;
    paris.pop = tiles + 2;
    const y = computeCityYields(g, paris);
    expect(y.specialists).toBeGreaterThanOrEqual(2);
    expect(y.worked.length + y.specialists).toBe(paris.pop);
    // specialists add output on top of every worked tile
    paris.pop = tiles;
    const full = computeCityYields(g, paris);
    expect(y.prod).toBeGreaterThan(full.prod);
    expect(y.sci).toBeGreaterThan(full.sci);
  });

  it('prefers a specialist to a tile that yields almost nothing', () => {
    const y = (food: number, prod: number, gold: number) => ({ food, prod, gold });
    const specialist = { t: -1, y: SPECIALIST_YIELD };
    const candidates = [{ t: 1, y: y(2, 1, 0) }, { t: 2, y: y(0, 1, 0) }, specialist, specialist];
    const worked = chooseWorkedTiles(candidates, 2, focusWeights('balanced', 2), 0, -Infinity);
    expect(worked.map((c) => c.t).sort()).toEqual([-1, 1]);
    // but works the poor tile over a specialist when food is short and it helps
    const hungry = [{ t: 1, y: y(2, 1, 0) }, { t: 3, y: y(1, 0, 0) }, specialist, specialist];
    expect(chooseWorkedTiles(hungry, 2, focusWeights('balanced', 2), 0, 3).map((c) => c.t).sort()).toEqual([1, 3]);
  });

  it('harbors add food to worked water tiles', () => {
    const g = newGame();
    const city = g.s.cities.find((c) => neighbors(g.map, c.tile).some((n) => g.map.tiles[n].t === 'coast'))!;
    const sea = neighbors(g.map, city.tile).find((n) => g.map.tiles[n].t === 'coast')!;
    const before = tileYield(g, sea, city).food;
    city.buildings.push('harbor');
    expect(tileYield(g, sea, city).food).toBe(before + 1);
  });
});

describe('war', () => {
  function frontline() {
    const g = newGame();
    const fr = pid(g, 'france');
    const bu = pid(g, 'burgundy');
    const dijon = g.capitalOf(bu)!;
    const adj = neighbors(g.map, dijon.tile).find((t) => !TERRAIN[g.map.tiles[t].t].water && g.unitsAt(t).length === 0)!;
    return { g, fr, bu, dijon, adj };
  }

  it('requires war to attack, and enforces peace treaties', () => {
    const { g, fr, bu, dijon, adj } = frontline();
    const knight = g.createUnit('knight', fr, adj);
    expect(g.canAttack(knight, dijon.tile)).toBe(false);
    expect(g.declareWar(fr, bu)).toBe(true);
    expect(g.canAttack(knight, dijon.tile)).toBe(true);
    g.makePeace(fr, bu);
    expect(g.canDeclareWar(fr, bu)).toBe(false);
    g.s.turn += 10;
    expect(g.canDeclareWar(fr, bu)).toBe(true);
  });

  it('resolves combat and captures an emptied city', () => {
    const { g, fr, bu, dijon, adj } = frontline();
    g.declareWar(fr, bu);
    for (const u of [...g.unitsAt(dijon.tile)]) g.removeUnit(u);
    const def = g.createUnit('levy', bu, dijon.tile);
    def.hp = 10;
    const att = g.createUnit('cuirassier', fr, adj);
    const res = g.attack(att, dijon.tile)!;
    expect(res.defenderDied).toBe(true);
    expect(dijon.owner).toBe(fr);
    expect(att.tile).toBe(dijon.tile);
    expect(g.player(bu).alive).toBe(false); // Burgundy only had one city
  });

  it('ranged units hit without retaliation', () => {
    const { g, fr, bu, dijon, adj } = frontline();
    g.declareWar(fr, bu);
    const archer = g.createUnit('archer', fr, adj);
    const before = g.unitsAt(dijon.tile).map((u) => u.hp).reduce((a, b) => a + b, 0);
    const res = g.attack(archer, dijon.tile)!;
    expect(res.ranged).toBe(true);
    expect(archer.hp).toBe(100);
    const after = g.unitsAt(dijon.tile).map((u) => u.hp).reduce((a, b) => a + b, 0);
    expect(after).toBeLessThan(before);
  });
});

describe('persistence', () => {
  it('round-trips through JSON', () => {
    const g = newGame();
    for (let t = 0; t < 3; t++) g.endTurn();
    const json = g.serialize();
    const g2 = Game.deserialize(json);
    expect(g2.serialize()).toBe(json);
    expect(g2.capitalOf(pid(g2, 'france'))!.name).toBe('Paris');
    expect(g2.unitsAt(g2.capitalOf(pid(g2, 'france'))!.tile).length).toBeGreaterThan(0);
  });

  it('maps Paris to the right tile', () => {
    const g = newGame();
    expect(distance(g.map, g.capitalOf(pid(g, 'france'))!.tile, lonLatToTile(g.map, 2.35, 48.86))).toBeLessThanOrEqual(1);
  });
});
