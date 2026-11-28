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
  // Industrial and modern
  { id: 'rifleman', name: 'Rifleman', abbr: 'Ri', cls: 'melee', cost: 110, attack: 30, defense: 32, moves: 2, sight: 2, tech: 'rifling', replaces: ['musketeer'], description: 'Line infantry with rifled muskets.' },
  { id: 'artillery', name: 'Artillery', abbr: 'At', cls: 'siege', cost: 130, attack: 8, defense: 10, ranged: 40, range: 2, moves: 2, sight: 2, tech: 'chemistry', vsCity: 1, replaces: ['cannon'], description: 'Field guns firing explosive shells, +100% vs cities.' },
  { id: 'cavalry', name: 'Cavalry', abbr: 'Cv', cls: 'mounted', cost: 140, attack: 40, defense: 24, moves: 3, sight: 2, tech: 'conscription', replaces: ['cuirassier'], description: 'Sabre-armed horsemen.' },
  { id: 'infantry', name: 'Infantry', abbr: 'In', cls: 'melee', cost: 160, attack: 45, defense: 48, moves: 2, sight: 2, tech: 'conscription', replaces: ['rifleman'], description: 'Conscript riflemen in steel helmets.' },
  { id: 'gatlingGun', name: 'Gatling Gun', abbr: 'Ga', cls: 'ranged', cost: 150, attack: 14, defense: 30, ranged: 34, range: 2, moves: 2, sight: 2, tech: 'machineTools', replaces: ['crossbowman'], description: 'Hand-cranked rapid fire. A stout defender.' },
  { id: 'tank', name: 'Tank', abbr: 'Tk', cls: 'mounted', cost: 240, attack: 70, defense: 50, moves: 3, sight: 2, tech: 'combustion', replaces: ['cavalry'], description: 'Armoured breakthrough vehicle.' },
  { id: 'machineGun', name: 'Machine Gun', abbr: 'MG', cls: 'ranged', cost: 220, attack: 20, defense: 48, ranged: 55, range: 2, moves: 2, sight: 2, tech: 'automaticWeapons', replaces: ['gatlingGun'], description: 'Belt-fed fire that holds any line.' },
  { id: 'rocketArtillery', name: 'Rocket Artillery', abbr: 'RA', cls: 'siege', cost: 320, attack: 15, defense: 20, ranged: 85, range: 3, moves: 2, sight: 2, tech: 'rocketry', vsCity: 1, replaces: ['artillery'], description: 'Truck-mounted rockets that strike 3 tiles away, +100% vs cities.' },
  { id: 'mechInfantry', name: 'Mechanized Infantry', abbr: 'MI', cls: 'melee', cost: 320, attack: 72, defense: 80, moves: 3, sight: 2, tech: 'mobileTactics', replaces: ['infantry'], description: 'Infantry in armoured carriers.' },
  { id: 'modernArmor', name: 'Modern Armor', abbr: 'MB', cls: 'mounted', cost: 400, attack: 110, defense: 80, moves: 4, sight: 2, tech: 'composites', replaces: ['tank'], description: 'Main battle tank with composite armour.' },
];

export const UNITS: Record<string, UnitDef> = Object.fromEntries(list.map((u) => [u.id, u]));
export const UNIT_LIST = list;

export function isMilitary(def: UnitDef): boolean {
  return def.cls !== 'civilian';
}

export function isRanged(def: UnitDef): boolean {
  return def.ranged !== undefined && def.range !== undefined;
}
