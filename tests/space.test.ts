import { describe, expect, it } from 'vitest';
import { createGame, MAX_TURNS } from '../src/core/setup';
import { Game } from '../src/core/game';
import { BUILDINGS } from '../src/core/data/buildings';
import { canBuild, availableBuilds } from '../src/core/rules/cities';
import { FLIGHT_TURNS, SHIP_PARTS } from '../src/core/rules/space';
import type { City } from '../src/core/types';

const newGame = () => createGame({ seed: 7, humanNation: 'france' });
const learn = (g: Game, pid: number, goal: string) => {
  for (const t of g.techPath(pid, goal)) g.grantTech(pid, t);
};
/** Finish `id` in `city` at the end of this turn. */
const finish = (g: Game, city: City, id: string) => {
  expect(g.setBuild(city, { kind: 'building', id }), `can build ${id}`).toBe(true);
  city.prod = BUILDINGS[id].cost;
  g.endTurn();
};

describe('the modern eras', () => {
  it('runs to 2050 and no longer ends at the Enlightenment', () => {
    const g = newGame();
    expect(g.s.maxTurns).toBe(MAX_TURNS);
    expect(g.year(MAX_TURNS) + 2).toBe(2050);
    g.grantTech(g.humanId, 'enlightenment');
    g.checkVictory();
    expect(g.s.winner).toBeNull();
  });

  it('modern units replace their forebears in the build list', () => {
    const g = newGame();
    const me = g.humanId;
    const paris = g.capitalOf(me)!;
    learn(g, me, 'composites');
    learn(g, me, 'mobileTactics');
    const units = availableBuilds(g, paris).filter((b) => b.kind === 'unit').map((b) => (b as { id: string }).id);
    expect(units).toContain('modernArmor');
    expect(units).toContain('mechInfantry');
    for (const old of ['levy', 'musketeer', 'rifleman', 'infantry', 'knight', 'cuirassier', 'cavalry', 'tank', 'cannon']) expect(units).not.toContain(old);
  });

  it('Satellites chart the whole map', () => {
    const g = createGame({ seed: 7, humanNation: 'france', revealMap: false });
    const me = g.humanId;
    learn(g, me, 'satellites');
    expect(g.player(me).explored!.every((x) => x === 1)).toBe(true);
  });

  it('old saves run on to 2050', () => {
    const g = newGame();
    const raw = JSON.parse(g.serialize());
    raw.maxTurns = 200;
    expect(Game.deserialize(JSON.stringify(raw)).s.maxTurns).toBe(MAX_TURNS);
  });
});

describe('the space race', () => {
  it('needs the Apollo Program, then a Spaceport, before the ship', () => {
    const g = newGame();
    const me = g.humanId;
    const paris = g.capitalOf(me)!;
    learn(g, me, 'fusion');
    paris.buildings.push('workshop', 'factory');
    expect(canBuild(g, paris, { kind: 'building', id: 'launchBooster' })).toBe(false);
    finish(g, paris, 'apolloProgram');
    expect(g.player(me).projects).toContain('apolloProgram');
    expect(paris.buildings).not.toContain('apolloProgram');
    expect(canBuild(g, paris, { kind: 'building', id: 'apolloProgram' })).toBe(false);
    expect(canBuild(g, paris, { kind: 'building', id: 'launchBooster' })).toBe(false); // no Spaceport yet
    paris.buildings.push('spaceport');
    expect(canBuild(g, paris, { kind: 'building', id: 'launchBooster' })).toBe(true);
  });

  it('launches when the last part is done and wins when the ship arrives', () => {
    const g = newGame();
    const me = g.humanId;
    const paris = g.capitalOf(me)!;
    learn(g, me, 'fusion');
    learn(g, me, 'robotics');
    paris.buildings.push('workshop', 'factory', 'spaceport');
    finish(g, paris, 'apolloProgram');
    for (const part of SHIP_PARTS) finish(g, paris, part);
    const ship = g.player(me).spaceship!;
    expect(ship).toBeTruthy();
    expect(ship.arrives - ship.launched).toBe(FLIGHT_TURNS);
    while (!g.s.winner && g.s.turn < ship.arrives + 1) g.endTurn();
    expect(g.s.winner).toEqual({ player: me, kind: 'space' });
  });

  it('loses the ship if the capital falls during the flight', () => {
    const g = newGame();
    const me = g.humanId;
    const paris = g.capitalOf(me)!;
    learn(g, me, 'fusion');
    learn(g, me, 'robotics');
    paris.buildings.push('workshop', 'factory', 'spaceport');
    finish(g, paris, 'apolloProgram');
    for (const part of SHIP_PARTS) finish(g, paris, part);
    expect(g.player(me).spaceship).toBeTruthy();
    // a second French city keeps France alive
    const second = g.createCity(me, g.capitalOf(g.s.players.find((p) => p.nation === 'brittany')!.id)!.tile + 6, 1);
    expect(second).toBeTruthy();
    const en = g.s.players.find((p) => p.nation === 'england')!.id;
    g.declareWar(me, en);
    for (const u of g.unitsAt(paris.tile)) g.removeUnit(u);
    g.captureCity(paris, en);
    expect(g.player(me).spaceship).toBeNull();
    expect(g.player(me).projects).toContain('apolloProgram');
    for (const part of SHIP_PARTS) expect(g.player(me).projects).not.toContain(part);
  });
});
