export type UnitClass = 'civilian' | 'recon' | 'melee' | 'ranged' | 'mounted' | 'siege';

export interface UnitDef {
  id: string;
  name: string;
  /** short label drawn on the map token */
  abbr: string;
  cls: UnitClass;
  cost: number;
  attack: number;
  defense: number;
  /** ranged strength (ranged & siege units attack with this without retaliation) */
  ranged?: number;
  range?: number;
  moves: number;
  sight: number;
  tech?: string;
  /** extra multiplier vs mounted units (1 = +100%) */
  vsMounted?: number;
  /** extra multiplier vs units defending a city */
  vsCity?: number;
  /** unit ids this one replaces in build lists */
  replaces?: string[];
  description: string;
}

const list: UnitDef[] = [
  { id: 'settler', name: 'Settler', abbr: 'Se', cls: 'civilian', cost: 45, attack: 0, defense: 0, moves: 2, sight: 2, description: 'Founds a new city. Costs 1 population.' },
  { id: 'missionary', name: 'Missionary', abbr: 'Mi', cls: 'civilian', cost: 40, attack: 0, defense: 0, moves: 3, sight: 2, tech: 'theology', description: 'Carries the faith of the city that trained it. Preach next to or inside a city of another faith to convert it; the missionary is used up.' },
  { id: 'scout', name: 'Scout', abbr: 'Sc', cls: 'recon', cost: 14, attack: 2, defense: 2, moves: 3, sight: 3, description: 'Fast explorer that pays only 1 movement for any land.' },
  { id: 'levy', name: 'Levy', abbr: 'Lv', cls: 'melee', cost: 18, attack: 5, defense: 6, moves: 2, sight: 2, description: 'Peasant militia. Cheap, weak.' },
  { id: 'spearman', name: 'Spearman', abbr: 'Sp', cls: 'melee', cost: 26, attack: 6, defense: 9, moves: 2, sight: 2, tech: 'bronzeWorking', vsMounted: 1, replaces: ['levy'], description: 'Solid defender, +100% vs mounted.' },
  { id: 'archer', name: 'Archer', abbr: 'Ar', cls: 'ranged', cost: 28, attack: 3, defense: 5, ranged: 7, range: 2, moves: 2, sight: 2, tech: 'archery', description: 'Shoots 2 tiles without retaliation.' },
  { id: 'horseman', name: 'Horseman', abbr: 'Ho', cls: 'mounted', cost: 32, attack: 9, defense: 5, moves: 3, sight: 2, tech: 'horsebackRiding', description: 'Fast raider.' },
  { id: 'swordsman', name: 'Swordsman', abbr: 'Sw', cls: 'melee', cost: 36, attack: 11, defense: 8, moves: 2, sight: 2, tech: 'ironWorking', description: 'Strong attacking infantry.' },
  { id: 'catapult', name: 'Catapult', abbr: 'Ca', cls: 'siege', cost: 45, attack: 3, defense: 3, ranged: 10, range: 2, moves: 2, sight: 2, tech: 'mathematics', vsCity: 1, description: 'Siege engine, +100% vs cities.' },
  { id: 'pikeman', name: 'Pikeman', abbr: 'Pk', cls: 'melee', cost: 42, attack: 9, defense: 14, moves: 2, sight: 2, tech: 'feudalism', vsMounted: 1, replaces: ['levy', 'spearman'], description: 'Excellent defender, +100% vs mounted.' },
  { id: 'knight', name: 'Knight', abbr: 'Kn', cls: 'mounted', cost: 60, attack: 16, defense: 10, moves: 3, sight: 2, tech: 'chivalry', replaces: ['horseman'], description: 'Heavy cavalry, the hammer of the age.' },
  { id: 'crossbowman', name: 'Crossbowman', abbr: 'Cb', cls: 'ranged', cost: 48, attack: 5, defense: 8, ranged: 13, range: 2, moves: 2, sight: 2, tech: 'machinery', replaces: ['archer'], description: 'Powerful ranged infantry.' },
  { id: 'trebuchet', name: 'Trebuchet', abbr: 'Tb', cls: 'siege', cost: 65, attack: 4, defense: 4, ranged: 17, range: 2, moves: 2, sight: 2, tech: 'engineering', vsCity: 1, replaces: ['catapult'], description: 'Heavy siege engine, +100% vs cities.' },
  { id: 'manAtArms', name: 'Man-at-Arms', abbr: 'MA', cls: 'melee', cost: 60, attack: 17, defense: 13, moves: 2, sight: 2, tech: 'steel', replaces: ['swordsman'], description: 'Armoured infantry.' },
  { id: 'musketeer', name: 'Musketeer', abbr: 'Mu', cls: 'melee', cost: 80, attack: 21, defense: 22, moves: 2, sight: 2, tech: 'gunpowder', replaces: ['levy', 'spearman', 'pikeman', 'swordsman', 'manAtArms'], description: 'Gunpowder infantry.' },
  { id: 'cannon', name: 'Cannon', abbr: 'Cn', cls: 'siege', cost: 95, attack: 6, defense: 7, ranged: 26, range: 2, moves: 2, sight: 2, tech: 'metallurgy', vsCity: 1, replaces: ['catapult', 'trebuchet'], description: 'Breaks any wall.' },
  { id: 'cuirassier', name: 'Cuirassier', abbr: 'Cu', cls: 'mounted', cost: 100, attack: 27, defense: 16, moves: 3, sight: 2, tech: 'militaryScience', replaces: ['horseman', 'knight'], description: 'Armoured pistol cavalry.' },
];

export const UNITS: Record<string, UnitDef> = Object.fromEntries(list.map((u) => [u.id, u]));
export const UNIT_LIST = list;

export function isMilitary(def: UnitDef): boolean {
  return def.cls !== 'civilian';
}

export function isRanged(def: UnitDef): boolean {
  return def.ranged !== undefined && def.range !== undefined;
}
