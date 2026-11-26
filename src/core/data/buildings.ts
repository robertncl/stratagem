export interface BuildingEffects {
  food?: number;
  prod?: number;
  gold?: number;
  sci?: number;
  culture?: number;
  prodPct?: number;
  goldPct?: number;
  sciPct?: number;
  /** city defence bonus as a fraction */
  defense?: number;
  /** extra food from worked water tiles */
  waterFood?: number;
  /** new units start as veterans */
  veteran?: boolean;
  /** extra production when building military units */
  militaryPct?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  cost: number;
  upkeep: number;
  tech?: string;
  requires?: string;
  coastal?: boolean;
  wonder?: boolean;
  effects: BuildingEffects;
  description: string;
}

const list: BuildingDef[] = [
  { id: 'granary', name: 'Granary', cost: 40, upkeep: 1, tech: 'pottery', effects: { food: 2 }, description: '+2 food' },
  { id: 'walls', name: 'Walls', cost: 45, upkeep: 1, tech: 'masonry', effects: { defense: 0.75 }, description: '+75% defence for units in the city' },
  { id: 'barracks', name: 'Barracks', cost: 40, upkeep: 1, tech: 'bronzeWorking', effects: { veteran: true }, description: 'New units start as veterans (+25% strength)' },
  { id: 'harbor', name: 'Harbor', cost: 55, upkeep: 1, tech: 'sailing', coastal: true, effects: { waterFood: 1, gold: 1 }, description: '+1 food on worked water tiles, +1 gold' },
  { id: 'library', name: 'Library', cost: 60, upkeep: 1, tech: 'writing', effects: { sci: 2, sciPct: 0.5 }, description: '+2 science, +50% science' },
  { id: 'market', name: 'Market', cost: 60, upkeep: 0, tech: 'currency', effects: { gold: 1, goldPct: 0.5 }, description: '+1 gold, +50% gold' },
  { id: 'aqueduct', name: 'Aqueduct', cost: 70, upkeep: 1, tech: 'mathematics', effects: { food: 2 }, description: '+2 food' },
  { id: 'temple', name: 'Temple', cost: 50, upkeep: 1, tech: 'theology', effects: { culture: 3 }, description: '+3 culture (borders grow faster)' },
  { id: 'workshop', name: 'Workshop', cost: 80, upkeep: 1, tech: 'machinery', effects: { prod: 2, prodPct: 0.25 }, description: '+2 production, +25% production' },
  { id: 'castle', name: 'Castle', cost: 90, upkeep: 2, tech: 'engineering', requires: 'walls', effects: { defense: 0.75, culture: 1 }, description: 'Another +75% defence' },
  { id: 'university', name: 'University', cost: 120, upkeep: 2, tech: 'education', requires: 'library', effects: { sci: 3, sciPct: 0.5 }, description: '+3 science, +50% science' },
  { id: 'bank', name: 'Bank', cost: 110, upkeep: 0, tech: 'banking', requires: 'market', effects: { gold: 2, goldPct: 0.5 }, description: '+2 gold, +50% gold' },
  { id: 'printingHouse', name: 'Printing House', cost: 100, upkeep: 1, tech: 'printingPress', effects: { sci: 3, culture: 2 }, description: '+3 science, +2 culture' },
  { id: 'observatory', name: 'Observatory', cost: 140, upkeep: 2, tech: 'astronomy', effects: { sciPct: 0.5 }, description: '+50% science' },
  { id: 'arsenal', name: 'Arsenal', cost: 120, upkeep: 2, tech: 'gunpowder', effects: { militaryPct: 0.5 }, description: '+50% production toward military units' },
  // Wonders: one per world.
  { id: 'cluny', name: 'Cluny Abbey', cost: 160, upkeep: 0, tech: 'writing', wonder: true, effects: { sci: 4, culture: 4 }, description: '+4 science, +4 culture' },
  { id: 'alhambra', name: 'Alhambra', cost: 200, upkeep: 0, tech: 'feudalism', wonder: true, effects: { culture: 5, defense: 1 }, description: '+5 culture, +100% city defence' },
  { id: 'notreDame', name: 'Notre-Dame', cost: 260, upkeep: 0, tech: 'theology', wonder: true, effects: { culture: 8, food: 2 }, description: '+8 culture, +2 food' },
  { id: 'veniceArsenal', name: 'Arsenale di Venezia', cost: 320, upkeep: 0, tech: 'engineering', wonder: true, effects: { prod: 4, militaryPct: 0.5 }, description: '+4 production, +50% toward military units' },
  { id: 'bologna', name: 'University of Bologna', cost: 380, upkeep: 0, tech: 'education', wonder: true, effects: { sci: 8, sciPct: 0.5 }, description: '+8 science, +50% science' },
  { id: 'medici', name: 'Medici Bank', cost: 380, upkeep: 0, tech: 'banking', wonder: true, effects: { gold: 10, goldPct: 0.5 }, description: '+10 gold, +50% gold' },
  { id: 'uraniborg', name: 'Uraniborg', cost: 480, upkeep: 0, tech: 'astronomy', wonder: true, effects: { sci: 10, sciPct: 0.5 }, description: '+10 science, +50% science' },
  { id: 'escorial', name: 'El Escorial', cost: 560, upkeep: 0, tech: 'economics', wonder: true, effects: { culture: 10, gold: 6, prodPct: 0.25 }, description: '+10 culture, +6 gold, +25% production' },
];

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(list.map((b) => [b.id, b]));
export const BUILDING_LIST = list;
