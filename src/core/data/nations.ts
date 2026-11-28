import type { ReligionId } from './religions';

export interface NationTraits {
  prodPct?: number;
  goldPct?: number;
  sciPct?: number;
  culturePct?: number;
  foodPct?: number;
  combatPct?: number;
}

export interface NationDef {
  id: string;
  name: string;
  adjective: string;
  ruler: string;
  color: string;
  capital: { name: string; lon: number; lat: number };
  startTechs: string[];
  traits: NationTraits;
  traitText: string;
  /** AI temperament 0..1 */
  aggression: number;
  /** fallback city names if no gazetteer town is nearby */
  cityNames: string[];
}

export const MAJOR_NATIONS: NationDef[] = [
  {
    id: 'england', name: 'Kingdom of England', adjective: 'English', ruler: 'Henry IV', color: '#c62828',
    capital: { name: 'London', lon: -0.13, lat: 51.5 }, startTechs: ['sailing'], traits: { goldPct: 0.15 },
    traitText: 'Island trade: +15% gold, starts with Sailing.', aggression: 0.55,
    cityNames: ['Winchester', 'Salisbury', 'Bath', 'Hereford', 'Ipswich', 'Kendal'],
  },
  {
    id: 'france', name: 'Kingdom of France', adjective: 'French', ruler: 'Charles VI', color: '#2456c9',
    capital: { name: 'Paris', lon: 2.35, lat: 48.86 }, startTechs: ['masonry'], traits: { prodPct: 0.1, culturePct: 0.25 },
    traitText: 'Grandeur: +10% production, +25% culture, starts with Masonry.', aggression: 0.6,
    cityNames: ['Beauvais', 'Laon', 'Soissons', 'Blois', 'Vézelay', 'Arras'],
  },
  {
    id: 'castile', name: 'Crown of Castile', adjective: 'Castilian', ruler: 'Henry III', color: '#e9be00',
    capital: { name: 'Toledo', lon: -4.02, lat: 39.86 }, startTechs: ['horsebackRiding'], traits: { combatPct: 0.1 },
    traitText: 'Reconquista: +10% combat strength, starts with Horseback Riding.', aggression: 0.7,
    cityNames: ['Ávila', 'Plasencia', 'Medina', 'Trujillo', 'Talavera', 'Úbeda'],
  },
  {
    id: 'portugal', name: 'Kingdom of Portugal', adjective: 'Portuguese', ruler: 'John I', color: '#2e8b3e',
    capital: { name: 'Lisbon', lon: -9.14, lat: 38.72 }, startTechs: ['sailing'], traits: { goldPct: 0.2, sciPct: 0.1 },
    traitText: 'Age of Discovery: +20% gold, +10% science, starts with Sailing.', aggression: 0.35,
    cityNames: ['Tomar', 'Lagos', 'Setúbal', 'Silves', 'Elvas', 'Aveiro'],
  },
  {
    id: 'hre', name: 'Holy Roman Empire', adjective: 'Imperial', ruler: 'Wenceslaus', color: '#e07a10',
    capital: { name: 'Prague', lon: 14.42, lat: 50.08 }, startTechs: ['bronzeWorking'], traits: { prodPct: 0.15 },
    traitText: 'Imperial estates: +15% production, starts with Bronze Working.', aggression: 0.55,
    cityNames: ['Eger', 'Tábor', 'Znaim', 'Iglau', 'Kolin', 'Leitmeritz'],
  },
  {
    id: 'burgundy', name: 'Duchy of Burgundy', adjective: 'Burgundian', ruler: 'Philip the Bold', color: '#7b1fa2',
    capital: { name: 'Dijon', lon: 5.04, lat: 47.32 }, startTechs: ['pottery'], traits: { goldPct: 0.1, culturePct: 0.25 },
    traitText: 'Court splendour: +10% gold, +25% culture, starts with Pottery.', aggression: 0.5,
    cityNames: ['Beaune', 'Autun', 'Mâcon', 'Chalon', 'Dole', 'Semur'],
  },
  {
    id: 'venice', name: 'Republic of Venice', adjective: 'Venetian', ruler: 'Doge Michele Steno', color: '#00a3a3',
    capital: { name: 'Venice', lon: 12.33, lat: 45.44 }, startTechs: ['sailing'], traits: { goldPct: 0.25 },
    traitText: 'Serenissima: +25% gold, starts with Sailing.', aggression: 0.4,
    cityNames: ['Chioggia', 'Treviso', 'Vicenza', 'Rovigo', 'Belluno', 'Feltre'],
  },
  {
    id: 'denmark', name: 'Kalmar Union', adjective: 'Danish', ruler: 'Margaret I', color: '#e05a8a',
    capital: { name: 'Copenhagen', lon: 12.57, lat: 55.68 }, startTechs: ['sailing'], traits: { combatPct: 0.1, foodPct: 0.1 },
    traitText: 'Northern union: +10% combat, +10% food, starts with Sailing.', aggression: 0.6,
    cityNames: ['Helsingør', 'Køge', 'Nyborg', 'Randers', 'Horsens', 'Svendborg'],
  },
];

export interface MinorDef {
  id: string;
  name: string;
  color: string;
  city: { name: string; lon: number; lat: number };
  size: number;
  walls?: boolean;
  /** faith at the start (default Catholic) */
  religion?: ReligionId;
}

export const MINOR_NATIONS: MinorDef[] = [
  { id: 'scotland', name: 'Kingdom of Scotland', color: '#5a7fa8', city: { name: 'Edinburgh', lon: -3.19, lat: 55.95 }, size: 3, walls: true },
  { id: 'ireland', name: 'Lordship of Ireland', color: '#4f9a6b', city: { name: 'Dublin', lon: -6.26, lat: 53.35 }, size: 2 },
  { id: 'brittany', name: 'Duchy of Brittany', color: '#8a8a6a', city: { name: 'Nantes', lon: -1.55, lat: 47.22 }, size: 2 },
  { id: 'aragon', name: 'Crown of Aragon', color: '#b8860b', city: { name: 'Barcelona', lon: 2.17, lat: 41.39 }, size: 3, walls: true },
  { id: 'granada', name: 'Emirate of Granada', color: '#6f8f3f', city: { name: 'Granada', lon: -3.6, lat: 37.18 }, size: 3, walls: true, religion: 'islam' },
  { id: 'navarre', name: 'Kingdom of Navarre', color: '#9c6b6b', city: { name: 'Pamplona', lon: -1.64, lat: 42.81 }, size: 2 },
  { id: 'milan', name: 'Duchy of Milan', color: '#6a8fb0', city: { name: 'Milan', lon: 9.19, lat: 45.46 }, size: 3, walls: true },
  { id: 'florence', name: 'Republic of Florence', color: '#b05a5a', city: { name: 'Florence', lon: 11.25, lat: 43.77 }, size: 3 },
  { id: 'papal', name: 'Papal States', color: '#d8c890', city: { name: 'Rome', lon: 12.5, lat: 41.9 }, size: 3, walls: true },
  { id: 'naples', name: 'Kingdom of Naples', color: '#7a6aa8', city: { name: 'Naples', lon: 14.27, lat: 40.85 }, size: 3 },
  { id: 'sicily', name: 'Kingdom of Sicily', color: '#a8865a', city: { name: 'Palermo', lon: 13.36, lat: 38.12 }, size: 2 },
  { id: 'genoa', name: 'Republic of Genoa', color: '#a84a6a', city: { name: 'Genoa', lon: 8.93, lat: 44.41 }, size: 2 },
  { id: 'hafsid', name: 'Hafsid Sultanate', color: '#5a9a8a', city: { name: 'Tunis', lon: 10.18, lat: 36.8 }, size: 3, walls: true, religion: 'islam' },
  { id: 'zayyanid', name: 'Zayyanid Sultanate', color: '#8aa05a', city: { name: 'Algiers', lon: 3.06, lat: 36.75 }, size: 2, religion: 'islam' },
  { id: 'marinid', name: 'Marinid Sultanate', color: '#a0785a', city: { name: 'Tangier', lon: -5.8, lat: 35.77 }, size: 2, religion: 'islam' },
  { id: 'swiss', name: 'Swiss Confederacy', color: '#c05050', city: { name: 'Bern', lon: 7.45, lat: 46.95 }, size: 2, walls: true },
  { id: 'austria', name: 'Duchy of Austria', color: '#c0a0a0', city: { name: 'Vienna', lon: 16.37, lat: 48.21 }, size: 3, walls: true },
  { id: 'bavaria', name: 'Duchy of Bavaria', color: '#6a9ad0', city: { name: 'Munich', lon: 11.58, lat: 48.14 }, size: 2 },
  { id: 'hansa', name: 'Hanseatic League', color: '#a05050', city: { name: 'Lübeck', lon: 10.69, lat: 53.87 }, size: 3 },
  { id: 'holland', name: 'County of Holland', color: '#d08a4a', city: { name: 'Amsterdam', lon: 4.9, lat: 52.37 }, size: 2 },
  { id: 'flanders', name: 'County of Flanders', color: '#9a9a50', city: { name: 'Bruges', lon: 3.22, lat: 51.21 }, size: 2 },
  { id: 'brandenburg', name: 'Margraviate of Brandenburg', color: '#7a7a9a', city: { name: 'Berlin', lon: 13.4, lat: 52.52 }, size: 2 },
  { id: 'teutonic', name: 'Teutonic Order', color: '#9aa0a8', city: { name: 'Marienburg', lon: 19.03, lat: 54.04 }, size: 3, walls: true },
  { id: 'poland', name: 'Kingdom of Poland', color: '#c06a7a', city: { name: 'Kraków', lon: 19.94, lat: 50.06 }, size: 3 },
  { id: 'hungary', name: 'Kingdom of Hungary', color: '#6a8a5a', city: { name: 'Buda', lon: 19.04, lat: 47.5 }, size: 3, walls: true },
  { id: 'ragusa', name: 'Republic of Ragusa', color: '#5a8ab0', city: { name: 'Ragusa', lon: 18.09, lat: 42.65 }, size: 2 },
  { id: 'bosnia', name: 'Kingdom of Bosnia', color: '#8a6a4a', city: { name: 'Jajce', lon: 17.27, lat: 44.34 }, size: 2 },
  { id: 'sweden', name: 'Swedish Riksråd', color: '#4a7ac0', city: { name: 'Stockholm', lon: 18.07, lat: 59.33 }, size: 2 },
  { id: 'norway', name: 'Norwegian Realm', color: '#7a9ab0', city: { name: 'Oslo', lon: 10.75, lat: 59.91 }, size: 2 },
];

/** Faith a nation follows at the start of the game. */
export function homeReligion(nation: string): ReligionId {
  return MINOR_NATIONS.find((m) => m.id === nation)?.religion ?? 'catholic';
}
