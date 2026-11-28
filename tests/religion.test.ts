import { describe, expect, it } from 'vitest';
import { createGame } from '../src/core/setup';
import { Game } from '../src/core/game';
import { computeCityYields, canBuild } from '../src/core/rules/cities';
import { cannotPreach, holyCityOf, preachTargets, spreadReligion } from '../src/core/rules/religion';
import { distance, neighbors, tilesInRadius } from '../src/core/hex';
import { TERRAIN } from '../src/core/data/terrain';
import type { City } from '../src/core/types';

const newGame = () => createGame({ seed: 7, humanNation: 'france' });
const pid = (g: Game, nation: string) => g.s.players.find((p) => p.nation === nation)!.id;
const landNextTo = (g: Game, c: City) => neighbors(g.map, c.tile).find((n) => !TERRAIN[g.map.tiles[n].t].water && !g.unitsAt(n).length && !g.cityAt(n))!;

describe('religion', () => {
  it('starts Catholic in Europe and Muslim in Granada and the Maghreb, with Rome and Tunis holy', () => {
    const g = newGame();
    for (const p of g.majors()) expect(p.religion).toBe('catholic');
    expect(g.capitalOf(pid(g, 'granada'))!.religion).toBe('islam');
    expect(g.capitalOf(pid(g, 'hafsid'))!.religion).toBe('islam');
    expect(g.capitalOf(g.humanId)!.religion).toBe('catholic');
    expect(holyCityOf(g, 'catholic')!.name).toBe('Rome');
    expect(holyCityOf(g, 'islam')!.name).toBe('Tunis');
    expect(g.s.religions!.protestant).toBeUndefined();
  });

  it('new cities follow the founder’s state religion', () => {
    const g = newGame();
    const settler = g.unitsOf(g.humanId).find((u) => u.type === 'settler')!;
    const cap = g.capitalOf(g.humanId)!;
    let site = -1;
    for (const t of g.map.tiles.keys()) {
      settler.tile = t;
      if (!g.canFoundCity(settler) && Math.abs((t % g.map.width) - (cap.tile % g.map.width)) < 8) {
        site = t;
        break;
      }
    }
    expect(site).toBeGreaterThanOrEqual(0);
    g.rebuildCaches();
    const city = g.foundCity(settler)!;
    expect(city.religion).toBe('catholic');
  });

  it('gives the faith bonus, and costs production in a city of another faith', () => {
    const g = newGame();
    const paris = g.capitalOf(g.humanId)!;
    const base = computeCityYields(g, paris);
    expect(base.dissent).toBe(false);
    paris.religion = 'islam';
    const muslim = computeCityYields(g, paris);
    expect(muslim.dissent).toBe(true);
    expect(muslim.prod).toBeLessThan(base.prod);
    expect(muslim.sci).toBeGreaterThan(base.sci);
    expect(muslim.culture).toBeLessThan(base.culture);
  });

  it('missionaries need Theology and a faith, and convert a city next to them', () => {
    const g = newGame();
    const me = g.humanId;
    const paris = g.capitalOf(me)!;
    expect(canBuild(g, paris, { kind: 'unit', id: 'missionary' })).toBe(false);
    g.grantTech(me, 'theology');
    expect(canBuild(g, paris, { kind: 'unit', id: 'missionary' })).toBe(true);

    const granada = g.capitalOf(pid(g, 'granada'))!;
    const m = g.createUnit('missionary', me, landNextTo(g, granada));
    m.religion = 'catholic';
    expect(preachTargets(g, m).map((c) => c.id)).toEqual([granada.id]);
    expect(g.preach(m, granada)).toBe(true);
    expect(granada.religion).toBe('catholic');
    expect(g.unit(m.id)).toBeUndefined();
    // Granada was its realm's capital, so the emirate's state religion follows
    expect(g.player(granada.owner).religion).toBe('catholic');
  });

  it('holy cities and enemy cities cannot be converted', () => {
    const g = newGame();
    const me = g.humanId;
    const tunis = g.capitalOf(pid(g, 'hafsid'))!;
    const m = g.createUnit('missionary', me, landNextTo(g, tunis));
    m.religion = 'catholic';
    expect(cannotPreach(g, m, tunis)).toMatch(/holy city/);
    const algiers = g.capitalOf(pid(g, 'zayyanid'))!;
    const m2 = g.createUnit('missionary', me, landNextTo(g, algiers));
    m2.religion = 'catholic';
    expect(cannotPreach(g, m2, algiers)).toBeNull();
    g.declareWar(me, algiers.owner);
    expect(cannotPreach(g, m2, algiers)).toMatch(/enemy/);
  });

  it('pressure from neighbouring cities slowly wins over a lone city', () => {
    const g = newGame();
    const granada = g.capitalOf(pid(g, 'granada'))!;
    const castile = pid(g, 'castile');
    // two big Castilian towns with temples three tiles from Granada
    const sites = tilesInRadius(g.map, granada.tile, 3).filter((t) => distance(g.map, t, granada.tile) === 3 && !TERRAIN[g.map.tiles[t].t].water);
    const a = g.createCity(castile, sites[0], 12);
    const b = g.createCity(castile, sites.find((t) => distance(g.map, t, sites[0]) >= 3)!, 12);
    for (const c of [a, b]) c.buildings.push('temple');
    let turns = 0;
    while (granada.religion === 'islam' && turns < 100) {
      spreadReligion(g);
      turns++;
    }
    expect(granada.religion).toBe('catholic');
    expect(turns).toBeGreaterThan(3);
    expect(g.s.log.some((e) => e.kind === 'religion' && e.text.includes('Granada'))).toBe(true);
  });

  it('the first great power to learn Printing Press founds Protestantism in its capital', () => {
    const g = newGame();
    const en = pid(g, 'england');
    g.grantTech(en, 'printingPress');
    const london = g.capitalOf(en)!;
    expect(g.s.religions!.protestant!.holyCity).toBe(london.id);
    expect(london.religion).toBe('protestant');
    expect(g.player(en).religion).toBe('protestant');
    g.grantTech(g.humanId, 'printingPress');
    expect(g.capitalOf(g.humanId)!.religion).toBe('catholic');
  });

  it('capturing a city of another faith adds unrest', () => {
    const g = newGame();
    const me = g.humanId;
    const granada = g.capitalOf(pid(g, 'granada'))!;
    g.declareWar(me, granada.owner);
    for (const u of g.unitsAt(granada.tile)) g.removeUnit(u);
    g.captureCity(granada, me);
    expect(granada.unrest).toBe(5);
    expect(computeCityYields(g, granada).dissent).toBe(true);
  });

  it('gives old saves their faiths', () => {
    const g = newGame();
    const raw = JSON.parse(g.serialize());
    delete raw.religions;
    for (const p of raw.players) delete p.religion;
    for (const c of raw.cities) {
      delete c.religion;
      delete c.faith;
    }
    const loaded = Game.deserialize(JSON.stringify(raw));
    expect(loaded.capitalOf(loaded.humanId)!.religion).toBe('catholic');
    expect(loaded.capitalOf(pid(loaded, 'marinid'))!.religion).toBe('islam');
    expect(holyCityOf(loaded, 'catholic')!.name).toBe('Rome');
  });
});
