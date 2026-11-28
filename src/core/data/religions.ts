// The faiths of the map. Every city follows one; the faith it follows adds
// a yield bonus, and a city whose faith differs from its owner's state
// religion is restless (see rules/religion.ts).

export type ReligionId = 'catholic' | 'islam' | 'protestant';

export interface ReligionEffects {
  culture?: number;
  sci?: number;
  gold?: number;
}

export interface ReligionDef {
  id: ReligionId;
  name: string;
  adjective: string;
  /** banner colour on the map and in panels */
  color: string;
  /** independent state whose capital is the holy city at the start, if any */
  holyCityOf?: string;
  /** tech whose first discoverer founds this faith in their capital */
  foundedBy?: string;
  effects: ReligionEffects;
  effectText: string;
}

const list: ReligionDef[] = [
  {
    id: 'catholic', name: 'Catholicism', adjective: 'Catholic', color: '#e3c25a', holyCityOf: 'papal',
    effects: { culture: 2 }, effectText: '+2 culture',
  },
  {
    id: 'islam', name: 'Islam', adjective: 'Muslim', color: '#3f9f6a', holyCityOf: 'hafsid',
    effects: { sci: 2 }, effectText: '+2 science',
  },
  {
    id: 'protestant', name: 'Protestantism', adjective: 'Protestant', color: '#7f9fe0', foundedBy: 'printingPress',
    effects: { gold: 2 }, effectText: '+2 gold',
  },
];

export const RELIGIONS: Record<ReligionId, ReligionDef> = Object.fromEntries(list.map((r) => [r.id, r])) as Record<ReligionId, ReligionDef>;
export const RELIGION_LIST = list;

/** Holy cities: extra yields and extra pressure; they never convert. */
export const HOLY_CITY = { gold: 3, culture: 2, pressure: 3 };
/** Production lost in a city that does not share its owner's state religion. */
export const DISSENT_PROD_PCT = 0.2;
/** Extra turns of unrest when a city is captured by a realm of another faith. */
export const DISSENT_UNREST = 2;
