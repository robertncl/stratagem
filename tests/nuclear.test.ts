import { describe, expect, it } from 'vitest';
import { createGame } from '../src/core/setup';
import { Game } from '../src/core/game';
import { canBuild } from '../src/core/rules/cities';
import { tileYield } from '../src/core/rules/cities';
import { cannotStrike, FALLOUT_TURNS, strikePreview } from '../src/core/rules/nuclear';
import { distance, tilesInRadius } from '../src/core/hex';
import { TERRAIN } from '../src/core/data/terrain';

const pid = (g: Game, nation: string) => g.s.players.find((p) => p.nation === nation)!.id;
const learn = (g: Game, p: number, goal: string) => {
  for (const t of g.techPath(p, goal)) g.grantTech(p, t);
};

/** Castile with the bomb, an Atomic Bomb and a Nuclear Missile in Toledo. */
function armed() {
  const g = createGame({ seed: 7, humanNation: 'castile' });
  const me = g.humanId;
  learn(g, me, 'rocketry');
  learn(g, me, 'nuclearFission');
  g.player(me).projects = ['manhattanProject'];
  const toledo = g.capitalOf(me)!;
  const bomb = g.createUnit('atomicBomb', me, toledo.tile);
  const missile = g.createUnit('nuclearMissile', me, toledo.tile);
  const lisbon = g.capitalOf(pid(g, 'portugal'))!;
  return { g, me, toledo, bomb, missile, lisbon, pt: lisbon.owner };
}

describe('super weapons', () => {
  it('need the Manhattan Project, and Rocketry for missiles', () => {
    const g = createGame({ seed: 7, humanNation: 'castile' });
    const me = g.humanId;
    const toledo = g.capitalOf(me)!;
    learn(g, me, 'nuclearFission');
    expect(canBuild(g, toledo, { kind: 'unit', id: 'atomicBomb' })).toBe(false);
    expect(canBuild(g, toledo, { kind: 'building', id: 'manhattanProject' })).toBe(true);
    g.player(me).projects = ['manhattanProject'];
    expect(canBuild(g, toledo, { kind: 'unit', id: 'atomicBomb' })).toBe(true);
    expect(canBuild(g, toledo, { kind: 'unit', id: 'nuclearMissile' })).toBe(false);
    learn(g, me, 'rocketry');
    expect(canBuild(g, toledo, { kind: 'unit', id: 'nuclearMissile' })).toBe(true);
  });

  it('are limited by range and by peace treaties', () => {
    const { g, me, bomb, missile, lisbon, pt } = armed();
    const d = distance(g.map, bomb.tile, lisbon.tile);
    expect(d).toBeGreaterThan(0);
    const far = g.capitalOf(pid(g, 'denmark'))!.tile;
    expect(cannotStrike(g, bomb, far)).toMatch(/Out of range/);
    expect(cannotStrike(g, missile, lisbon.tile)).toBeNull();
    g.declareWar(me, pt);
    g.makePeace(me, pt);
    expect(cannotStrike(g, missile, lisbon.tile)).toMatch(/peace treaty/);
  });

  it('destroy every unit in the blast, devastate cities, leave fallout and start a war', () => {
    const { g, me, missile, lisbon, pt } = armed();
    lisbon.pop = 10;
    const before = lisbon.buildings.length;
    const area = tilesInRadius(g.map, lisbon.tile, 2);
    expect(area.some((t) => g.unitsAt(t).length)).toBe(true);
    expect(g.atWar(me, pt)).toBe(false);
    const blast = g.launch(missile, lisbon.tile)!;
    expect(blast.intercepted).toBe(false);
    expect(g.unit(missile.id)).toBeUndefined();
    expect(g.atWar(me, pt)).toBe(true);
    for (const t of area) expect(g.unitsAt(t)).toHaveLength(0);
    expect(lisbon.pop).toBe(4);
    expect(lisbon.buildings.length).toBeLessThanOrEqual(before);
    const land = area.filter((t) => !TERRAIN[g.map.tiles[t].t].water);
    for (const t of land) {
      expect(g.map.tiles[t].fallout).toBe(FALLOUT_TURNS);
      expect(tileYield(g, t)).toEqual({ food: 0, prod: 0, gold: 0 });
    }
    expect(g.player(me).stats.nukesLaunched).toBe(1);
    expect(g.blasts).toHaveLength(1);
    for (let k = 0; k < FALLOUT_TURNS; k++) g.endTurn();
    for (const t of land) expect(g.map.tiles[t].fallout).toBeUndefined();
  });

  it('can be shot down by a Missile Shield', () => {
    const { g, missile, lisbon } = armed();
    lisbon.buildings.push('missileShield');
    lisbon.pop = 10;
    expect(strikePreview(g, missile, lisbon.tile).shielded).toBe(true);
    g.rng.chance = () => true;
    const blast = g.launch(missile, lisbon.tile)!;
    expect(blast.intercepted).toBe(true);
    expect(lisbon.pop).toBe(10);
    expect(g.map.tiles[lisbon.tile].fallout).toBeUndefined();
    expect(g.unit(missile.id)).toBeUndefined();
  });

  it('never defend a city', () => {
    const { g, me, toledo, pt } = armed();
    for (const u of [...g.unitsAt(toledo.tile)]) if (u.type !== 'atomicBomb' && u.type !== 'nuclearMissile') g.removeUnit(u);
    g.declareWar(pt, me);
    const attacker = g.createUnit('knight', pt, tilesInRadius(g.map, toledo.tile, 1).find((t) => t !== toledo.tile && !TERRAIN[g.map.tiles[t].t].water && !g.unitsAt(t).length)!);
    g.moveUnit(attacker, toledo.tile);
    expect(toledo.owner).toBe(pt);
    expect(g.unitsOf(me).filter((u) => u.type === 'atomicBomb' || u.type === 'nuclearMissile')).toHaveLength(0);
  });
});
