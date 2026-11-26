import { describe, expect, it } from 'vitest';
import { createGame } from '../src/core/setup';
import { Game } from '../src/core/game';
import { findPath } from '../src/core/rules/movement';
import { computeCityYields, availableBuilds } from '../src/core/rules/cities';
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
