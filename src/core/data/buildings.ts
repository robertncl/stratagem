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
  /** extra religious pressure the city sends out (see rules/religion.ts) */
  faith?: number;
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
  /**
   * A national project: built once per realm, and kept by the realm, not
   * the city (losing the city does not lose it).
   */
  project?: boolean;
  /** national project the realm must have finished first */
  needsProject?: string;
  /** a part of the colony ship (see rules/space.ts) */
  spaceship?: boolean;
  effects: BuildingEffects;
  description: string;
}

const list: BuildingDef[] = [
  { id: 'granary', name: 'Granary', cost: 40, upkeep: 1, tech: 'pottery', effects: { food: 2 }, description: '+2 food' },
  { id: 'walls', name: 'Walls', cost: 45, upkeep: 1, tech: 'masonry', effects: { defense: 0.6 }, description: '+60% defence for units in the city' },
  { id: 'barracks', name: 'Barracks', cost: 40, upkeep: 1, tech: 'bronzeWorking', effects: { veteran: true }, description: 'New units start as veterans (+25% strength)' },
  { id: 'harbor', name: 'Harbor', cost: 55, upkeep: 1, tech: 'sailing', coastal: true, effects: { waterFood: 1, gold: 1 }, description: '+1 food on worked water tiles, +1 gold' },
  { id: 'library', name: 'Library', cost: 60, upkeep: 1, tech: 'writing', effects: { sci: 2, sciPct: 0.3 }, description: '+2 science, +30% science' },
  { id: 'market', name: 'Market', cost: 60, upkeep: 0, tech: 'currency', effects: { gold: 1, goldPct: 0.5 }, description: '+1 gold, +50% gold' },
  { id: 'aqueduct', name: 'Aqueduct', cost: 70, upkeep: 1, tech: 'mathematics', effects: { food: 2 }, description: '+2 food' },
  { id: 'temple', name: 'Temple', cost: 50, upkeep: 1, tech: 'theology', effects: { culture: 3, faith: 2 }, description: '+3 culture (borders grow faster), +2 faith pressure' },
  { id: 'workshop', name: 'Workshop', cost: 80, upkeep: 1, tech: 'machinery', effects: { prod: 2, prodPct: 0.25 }, description: '+2 production, +25% production' },
  { id: 'castle', name: 'Castle', cost: 90, upkeep: 2, tech: 'engineering', requires: 'walls', effects: { defense: 0.6, culture: 1 }, description: 'Another +60% defence' },
  { id: 'university', name: 'University', cost: 120, upkeep: 2, tech: 'education', requires: 'library', effects: { sci: 3, sciPct: 0.4 }, description: '+3 science, +40% science' },
  { id: 'bank', name: 'Bank', cost: 110, upkeep: 0, tech: 'banking', requires: 'market', effects: { gold: 2, goldPct: 0.5 }, description: '+2 gold, +50% gold' },
  { id: 'printingHouse', name: 'Printing House', cost: 100, upkeep: 1, tech: 'printingPress', effects: { sci: 3, culture: 2 }, description: '+3 science, +2 culture' },
  { id: 'observatory', name: 'Observatory', cost: 140, upkeep: 2, tech: 'astronomy', effects: { sciPct: 0.4 }, description: '+40% science' },
  { id: 'arsenal', name: 'Arsenal', cost: 120, upkeep: 2, tech: 'gunpowder', effects: { militaryPct: 0.5 }, description: '+50% production toward military units' },
  // Industrial and modern
  { id: 'publicSchool', name: 'Public School', cost: 160, upkeep: 2, tech: 'scientificMethod', requires: 'library', effects: { sci: 3, sciPct: 0.25 }, description: '+3 science, +25% science' },
  { id: 'factory', name: 'Factory', cost: 200, upkeep: 3, tech: 'steamPower', requires: 'workshop', effects: { prod: 3, prodPct: 0.25 }, description: '+3 production, +25% production' },
  { id: 'railwayStation', name: 'Railway Station', cost: 180, upkeep: 2, tech: 'railroad', effects: { prod: 2, gold: 2 }, description: '+2 production, +2 gold' },
  { id: 'hospital', name: 'Hospital', cost: 200, upkeep: 2, tech: 'medicine', effects: { food: 3 }, description: '+3 food' },
  { id: 'powerPlant', name: 'Power Plant', cost: 240, upkeep: 3, tech: 'electricity', requires: 'factory', effects: { prod: 3, prodPct: 0.25 }, description: '+3 production, +25% production' },
  { id: 'stockExchange', name: 'Stock Exchange', cost: 220, upkeep: 2, tech: 'theCorporation', requires: 'bank', effects: { gold: 3, goldPct: 0.4 }, description: '+3 gold, +40% gold' },
  { id: 'broadcastTower', name: 'Broadcast Tower', cost: 220, upkeep: 2, tech: 'radio', effects: { culture: 6, gold: 2 }, description: '+6 culture, +2 gold' },
  { id: 'supermarket', name: 'Supermarket', cost: 240, upkeep: 2, tech: 'refrigeration', effects: { food: 3 }, description: '+3 food' },
  { id: 'researchLab', name: 'Research Lab', cost: 300, upkeep: 3, tech: 'computers', requires: 'university', effects: { sci: 5, sciPct: 0.5 }, description: '+5 science, +50% science' },
  { id: 'nuclearPlant', name: 'Nuclear Plant', cost: 340, upkeep: 3, tech: 'nuclearFission', requires: 'factory', effects: { prod: 5, prodPct: 0.25 }, description: '+5 production, +25% production' },
  { id: 'spaceport', name: 'Spaceport', cost: 300, upkeep: 4, tech: 'spaceFlight', requires: 'factory', effects: { prod: 2 }, description: 'Builds the parts of the colony ship. +2 production' },
  // Wonders: one per world.
  { id: 'cluny', name: 'Cluny Abbey', cost: 160, upkeep: 0, tech: 'writing', wonder: true, effects: { sci: 4, culture: 4, faith: 2 }, description: '+4 science, +4 culture, +2 faith pressure' },
  { id: 'alhambra', name: 'Alhambra', cost: 200, upkeep: 0, tech: 'feudalism', wonder: true, effects: { culture: 5, defense: 1 }, description: '+5 culture, +100% city defence' },
  { id: 'notreDame', name: 'Notre-Dame', cost: 260, upkeep: 0, tech: 'theology', wonder: true, effects: { culture: 8, food: 2, faith: 3 }, description: '+8 culture, +2 food, +3 faith pressure' },
  { id: 'veniceArsenal', name: 'Arsenale di Venezia', cost: 320, upkeep: 0, tech: 'engineering', wonder: true, effects: { prod: 4, militaryPct: 0.5 }, description: '+4 production, +50% toward military units' },
  { id: 'bologna', name: 'University of Bologna', cost: 380, upkeep: 0, tech: 'education', wonder: true, effects: { sci: 8, sciPct: 0.5 }, description: '+8 science, +50% science' },
  { id: 'medici', name: 'Medici Bank', cost: 380, upkeep: 0, tech: 'banking', wonder: true, effects: { gold: 10, goldPct: 0.5 }, description: '+10 gold, +50% gold' },
  { id: 'uraniborg', name: 'Uraniborg', cost: 480, upkeep: 0, tech: 'astronomy', wonder: true, effects: { sci: 10, sciPct: 0.5 }, description: '+10 science, +50% science' },
  { id: 'escorial', name: 'El Escorial', cost: 560, upkeep: 0, tech: 'economics', wonder: true, effects: { culture: 10, gold: 6, prodPct: 0.25, faith: 2 }, description: '+10 culture, +6 gold, +25% production, +2 faith pressure' },
  { id: 'royalSociety', name: 'Royal Society', cost: 700, upkeep: 0, tech: 'enlightenment', wonder: true, effects: { sci: 6, sciPct: 0.25 }, description: '+6 science, +25% science' },
  { id: 'crystalPalace', name: 'Crystal Palace', cost: 900, upkeep: 0, tech: 'industrialization', wonder: true, effects: { prod: 6, prodPct: 0.25 }, description: '+6 production, +25% production' },
  { id: 'eiffelTower', name: 'Eiffel Tower', cost: 1100, upkeep: 0, tech: 'electricity', wonder: true, effects: { culture: 12, gold: 5 }, description: '+12 culture, +5 gold' },
  { id: 'curieInstitute', name: 'Curie Institute', cost: 1300, upkeep: 0, tech: 'atomicTheory', wonder: true, effects: { sci: 10, sciPct: 0.25 }, description: '+10 science, +25% science' },
  { id: 'cern', name: 'CERN', cost: 1600, upkeep: 0, tech: 'computers', wonder: true, effects: { sci: 15, sciPct: 0.5 }, description: '+15 science, +50% science' },
  { id: 'spaceStation', name: 'International Space Station', cost: 2000, upkeep: 0, tech: 'satellites', wonder: true, effects: { sci: 20, culture: 10 }, description: '+20 science, +10 culture' },
  // National projects: the space race
  { id: 'apolloProgram', name: 'Apollo Program', cost: 800, upkeep: 0, tech: 'spaceFlight', project: true, effects: {}, description: 'Opens the space race: your Spaceports can build the colony ship' },
  { id: 'launchBooster', name: 'Launch Booster', cost: 600, upkeep: 0, tech: 'spaceFlight', project: true, spaceship: true, requires: 'spaceport', needsProject: 'apolloProgram', effects: {}, description: 'Colony ship part 1 of 3: lifts the ship to orbit' },
  { id: 'orbitalHabitat', name: 'Orbital Habitat', cost: 700, upkeep: 0, tech: 'robotics', project: true, spaceship: true, requires: 'spaceport', needsProject: 'apolloProgram', effects: {}, description: 'Colony ship part 2 of 3: keeps the colonists alive' },
  { id: 'fusionDrive', name: 'Fusion Drive', cost: 800, upkeep: 0, tech: 'fusion', project: true, spaceship: true, requires: 'spaceport', needsProject: 'apolloProgram', effects: {}, description: 'Colony ship part 3 of 3: carries it to the stars' },
];

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(list.map((b) => [b.id, b]));
export const BUILDING_LIST = list;
