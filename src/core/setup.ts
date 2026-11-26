// Creates a new game on the Western Europe map.

import { MAJOR_NATIONS, MINOR_NATIONS } from './data/nations';
import { distance, neighbors } from './hex';
import { Game } from './game';
import { generateMap, nearestLandTile } from './map/mapgen';
import { TERRAIN } from './data/terrain';
import type { Difficulty, GameState, Player } from './types';

export interface NewGameOptions {
  seed?: number;
  /** nation id the human plays, or null for an all-AI game */
  humanNation: string | null;
  difficulty?: Difficulty;
  maxTurns?: number;
  /** include independent minor states */
  minors?: boolean;
  /** start with the geography of Europe already charted (default true) */
  revealMap?: boolean;
}

function newPlayer(id: number, fields: Partial<Player> & Pick<Player, 'nation' | 'name' | 'color'>): Player {
  return {
    id,
    adjective: fields.name,
    ruler: '',
    isHuman: false,
    isMinor: false,
    alive: true,
    gold: 30,
    research: null,
    researchProgress: 0,
    techs: [],
    originalCapital: -1,
    explored: null,
    aggression: 0.5,
    stats: { citiesFounded: 0, citiesCaptured: 0, unitsKilled: 0, unitsLost: 0 },
    ...fields,
  };
}

export function createGame(opts: NewGameOptions): Game {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const map = generateMap({ seed });
  const players: Player[] = [];
  for (const n of MAJOR_NATIONS) {
    const human = n.id === opts.humanNation;
    players.push(
      newPlayer(players.length, {
        nation: n.id,
        name: n.name,
        adjective: n.adjective,
        ruler: n.ruler,
        color: n.color,
        isHuman: human,
        techs: [...n.startTechs],
        explored: human ? new Array(map.tiles.length).fill(opts.revealMap === false ? 0 : 1) : null,
        aggression: n.aggression,
      }),
    );
  }
  if (opts.minors !== false) {
    for (const m of MINOR_NATIONS) {
      players.push(
        newPlayer(players.length, {
          nation: m.id,
          name: m.name,
          adjective: m.name.replace(/^(Kingdom|Duchy|Republic|County|Crown|Emirate|Lordship|Margraviate) of /, ''),
          color: m.color,
          isMinor: true,
          techs: ['masonry', 'bronzeWorking'],
          aggression: 0,
        }),
      );
    }
  }

  const state: GameState = {
    version: 1,
    seed,
    rng: seed ^ 0x9e3779b9,
    turn: 1,
    maxTurns: opts.maxTurns ?? 200,
    startYear: 1400,
    difficulty: opts.difficulty ?? 'normal',
    map,
    players,
    units: [],
    cities: [],
    nextId: 1,
    relations: {},
    wonders: {},
    log: [],
    proposals: [],
    winner: null,
  };
  const g = new Game(state);

  const freeLand = (center: number): number => {
    for (const n of [center, ...neighbors(map, center)]) {
      if (!TERRAIN[map.tiles[n].t].water && map.tiles[n].t !== 'mountains') return n;
    }
    return center;
  };

  // Majors first so their capitals take precedence.
  MAJOR_NATIONS.forEach((n, i) => {
    const p = players[i];
    const tile = nearestLandTile(map, n.capital.lon, n.capital.lat);
    if (map.tiles[tile].t === 'marsh' || map.tiles[tile].t === 'desert') map.tiles[tile].t = 'plains';
    const city = g.createCity(p.id, tile, 2, n.capital.name);
    city.borderRadius = 2;
    g.claimTiles(city);
    p.originalCapital = city.id;
    const hard = !p.isHuman && state.difficulty === 'hard';
    const start = ['levy', 'levy', 'scout', 'settler', ...(hard ? ['levy', 'settler'] : [])];
    for (const type of start) g.createUnit(type, p.id, type === 'scout' ? freeLand(neighbors(map, tile)[0]) : tile);
  });

  MINOR_NATIONS.forEach((m, k) => {
    const p = players[MAJOR_NATIONS.length + k];
    if (!p) return;
    const tile = nearestLandTile(map, m.city.lon, m.city.lat);
    if (tile < 0 || g.s.cities.some((c) => distance(map, c.tile, tile) < 3)) {
      p.alive = false;
      return;
    }
    const city = g.createCity(p.id, tile, m.size, m.city.name);
    city.borderRadius = m.size >= 3 ? 2 : 1;
    g.claimTiles(city);
    if (m.walls) city.buildings.push('walls');
    p.originalCapital = city.id;
    const defenders = m.size >= 3 ? 3 : 2;
    for (let d = 0; d < defenders; d++) {
      const u = g.createUnit(d === 0 ? 'spearman' : 'levy', p.id, tile);
      u.fortified = true;
    }
  });

  g.refreshVisibility();
  g.log('info', `The year is ${state.startYear}. Europe awaits its masters.`, []);
  return g;
}
