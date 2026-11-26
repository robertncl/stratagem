import type { GameMap } from './map/mapgen';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Unit {
  id: number;
  type: string;
  owner: number;
  tile: number;
  hp: number;
  /** movement points left this turn */
  moves: number;
  xp: number;
  veteran: boolean;
  fortified: boolean;
  /** skip this unit when cycling (sleep / sentry) */
  sleeping: boolean;
  /** multi-turn move target */
  goto: number | null;
  /** has moved or fought this turn (no healing) */
  acted: boolean;
  /** free-form AI bookkeeping (target tile, role…) */
  ai?: { target?: number; role?: string };
}

export type BuildItem = { kind: 'unit'; id: string } | { kind: 'building'; id: string } | { kind: 'wealth' };

export interface City {
  id: number;
  name: string;
  owner: number;
  /** player who founded it — used for capital/domination bookkeeping */
  founder: number;
  tile: number;
  pop: number;
  food: number;
  prod: number;
  culture: number;
  borderRadius: number;
  buildings: string[];
  build: BuildItem | null;
  isCapital: boolean;
  founded: number;
  /** turns of resistance after conquest (no production) */
  unrest: number;
  /** what the city favours when choosing tiles to work (absent in old saves: balanced) */
  focus?: CityFocus;
}

export type CityFocus = 'balanced' | 'food' | 'production' | 'gold';

export interface Player {
  id: number;
  nation: string;
  name: string;
  adjective: string;
  ruler: string;
  color: string;
  isHuman: boolean;
  isMinor: boolean;
  alive: boolean;
  gold: number;
  research: string | null;
  researchProgress: number;
  techs: string[];
  /** original capital city id (domination victory) */
  originalCapital: number;
  /** explored tiles (1/0), only tracked for human players */
  explored: number[] | null;
  aggression: number;
  /** AI memory: city id it is currently trying to conquer */
  aiTarget?: number;
  /** cumulative stats for the score screen */
  stats: { citiesFounded: number; citiesCaptured: number; unitsKilled: number; unitsLost: number };
}

export interface Relation {
  war: boolean;
  /** turn of the last change */
  since: number;
}

export type LogKind = 'info' | 'combat' | 'war' | 'peace' | 'city' | 'tech' | 'wonder' | 'victory';

export interface LogEntry {
  turn: number;
  kind: LogKind;
  text: string;
  tile?: number;
  /** players directly involved */
  players: number[];
}

export interface Proposal {
  from: number;
  to: number;
  kind: 'peace';
}

export interface GameState {
  version: 1;
  seed: number;
  rng: number;
  turn: number;
  maxTurns: number;
  startYear: number;
  difficulty: Difficulty;
  map: GameMap;
  players: Player[];
  units: Unit[];
  cities: City[];
  nextId: number;
  relations: Record<string, Relation>;
  wonders: Record<string, number>;
  log: LogEntry[];
  proposals: Proposal[];
  winner: { player: number; kind: 'conquest' | 'domination' | 'score' | 'enlightenment' } | null;
}
