export type TerrainId =
  | 'ocean'
  | 'coast'
  | 'lake'
  | 'grassland'
  | 'plains'
  | 'forest'
  | 'hills'
  | 'mountains'
  | 'marsh'
  | 'desert';

export interface TerrainDef {
  id: TerrainId;
  name: string;
  food: number;
  prod: number;
  gold: number;
  /** movement points to enter */
  moveCost: number;
  /** defensive bonus as a fraction (0.5 = +50%) */
  defense: number;
  water: boolean;
  color: string;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  ocean: { id: 'ocean', name: 'Ocean', food: 1, prod: 0, gold: 1, moveCost: 1, defense: 0, water: true, color: '#1d3b5e' },
  coast: { id: 'coast', name: 'Coastal Waters', food: 2, prod: 0, gold: 1, moveCost: 1, defense: 0, water: true, color: '#2e6690' },
  lake: { id: 'lake', name: 'Lake', food: 2, prod: 0, gold: 1, moveCost: 1, defense: 0, water: true, color: '#3a78a3' },
  grassland: { id: 'grassland', name: 'Grassland', food: 2, prod: 1, gold: 0, moveCost: 1, defense: 0, water: false, color: '#6f9846' },
  plains: { id: 'plains', name: 'Plains', food: 1, prod: 2, gold: 0, moveCost: 1, defense: 0, water: false, color: '#b2a55e' },
  forest: { id: 'forest', name: 'Forest', food: 1, prod: 2, gold: 0, moveCost: 2, defense: 0.25, water: false, color: '#3e6a36' },
  hills: { id: 'hills', name: 'Hills', food: 1, prod: 2, gold: 0, moveCost: 2, defense: 0.5, water: false, color: '#8e8a58' },
  mountains: { id: 'mountains', name: 'Mountains', food: 0, prod: 1, gold: 0, moveCost: 3, defense: 0.75, water: false, color: '#857f78' },
  marsh: { id: 'marsh', name: 'Marsh', food: 1, prod: 0, gold: 0, moveCost: 2, defense: -0.1, water: false, color: '#5c7a5c' },
  desert: { id: 'desert', name: 'Desert', food: 0, prod: 1, gold: 0, moveCost: 1, defense: 0, water: false, color: '#d4bf86' },
};

export type ResourceId = 'wheat' | 'cattle' | 'fish' | 'wine' | 'iron' | 'horses' | 'furs' | 'silver' | 'salt' | 'olives';

export interface ResourceDef {
  id: ResourceId;
  name: string;
  terrains: TerrainId[];
  food: number;
  prod: number;
  gold: number;
  color: string;
}

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  wheat: { id: 'wheat', name: 'Wheat', terrains: ['plains', 'grassland'], food: 2, prod: 0, gold: 0, color: '#f3d35b' },
  cattle: { id: 'cattle', name: 'Cattle', terrains: ['grassland'], food: 1, prod: 1, gold: 0, color: '#c58a5a' },
  fish: { id: 'fish', name: 'Fish', terrains: ['coast', 'lake'], food: 2, prod: 0, gold: 0, color: '#9fd8ff' },
  wine: { id: 'wine', name: 'Wine', terrains: ['plains', 'hills'], food: 0, prod: 0, gold: 3, color: '#8e2c5c' },
  iron: { id: 'iron', name: 'Iron', terrains: ['hills', 'mountains'], food: 0, prod: 2, gold: 0, color: '#5f6a74' },
  horses: { id: 'horses', name: 'Horses', terrains: ['plains', 'grassland'], food: 0, prod: 2, gold: 0, color: '#a0703c' },
  furs: { id: 'furs', name: 'Furs', terrains: ['forest'], food: 0, prod: 0, gold: 2, color: '#7a5634' },
  silver: { id: 'silver', name: 'Silver', terrains: ['hills', 'mountains'], food: 0, prod: 0, gold: 4, color: '#d9dde2' },
  salt: { id: 'salt', name: 'Salt', terrains: ['desert', 'marsh', 'plains'], food: 1, prod: 0, gold: 2, color: '#f2f2f2' },
  olives: { id: 'olives', name: 'Olives', terrains: ['plains', 'hills'], food: 1, prod: 0, gold: 2, color: '#7d8c3a' },
};

export function isWater(t: TerrainId): boolean {
  return TERRAIN[t].water;
}
