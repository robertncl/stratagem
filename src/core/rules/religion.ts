// Faith: every city follows one religion. Each turn every city sends
// religious pressure to the cities around it (and twice as much to
// itself); pressure builds up as faith, and a city converts once another
// religion's faith clearly outweighs its own. Missionaries convert a city
// at once. A realm's state religion is the faith of its capital.

import { BUILDINGS } from '../data/buildings';
import { homeReligion } from '../data/nations';
import { DISSENT_PROD_PCT, HOLY_CITY, RELIGIONS, RELIGION_LIST, ReligionId } from '../data/religions';
import { distance } from '../hex';
import type { Game } from '../game';
import type { City, Unit } from '../types';

/** Cities this far away still feel a city's pressure (half strength beyond NEAR). */
export const PRESSURE_RANGE = 6;
const NEAR = 3;
/** Share of last turn's faith a city keeps. Steady-state faith is pressure × 10. */
const KEEP = 0.9;
/** A rival faith must exceed the current one by this factor, plus CONVERT_MARGIN, to win a city over. */
const CONVERT_FACTOR = 1.2;
const CONVERT_MARGIN = 4;
/** Faith a new or newly set-up city starts with. */
const START_FAITH = 30;

export function holyCityOf(g: Game, rel: ReligionId): City | undefined {
  const id = g.s.religions?.[rel]?.holyCity;
  return id !== undefined && id >= 0 ? g.city(id) : undefined;
}

/** The religion whose holy city this is, if any. */
export function holyReligion(g: Game, city: City): ReligionId | null {
  for (const r of RELIGION_LIST) if (g.s.religions?.[r.id]?.holyCity === city.id) return r.id;
  return null;
}

/** Pressure a city sends out each turn: bigger cities, temples and holy cities preach harder. */
export function pressureOf(g: Game, city: City): number {
  if (!city.religion) return 0;
  let p = 1 + Math.floor(city.pop / 4);
  for (const b of city.buildings) p += BUILDINGS[b].effects.faith ?? 0;
  if (holyReligion(g, city) === city.religion) p += HOLY_CITY.pressure;
  return p;
}

/** Does this city follow a faith other than its owner's state religion? */
export function inDissent(g: Game, city: City): boolean {
  const state = g.player(city.owner).religion;
  return !!city.religion && !!state && city.religion !== state;
}

export interface FaithYields {
  culture: number;
  sci: number;
  gold: number;
  /** production modifier, as a fraction */
  prodPct: number;
}

/** What a city gets from the faith it follows, its holy city status and any dissent. */
export function faithYields(g: Game, city: City): FaithYields {
  const out: FaithYields = { culture: 0, sci: 0, gold: 0, prodPct: 0 };
  if (!city.religion) return out;
  const fx = RELIGIONS[city.religion].effects;
  out.culture += fx.culture ?? 0;
  out.sci += fx.sci ?? 0;
  out.gold += fx.gold ?? 0;
  if (holyReligion(g, city) === city.religion) {
    out.gold += HOLY_CITY.gold;
    out.culture += HOLY_CITY.culture;
  }
  if (inDissent(g, city)) out.prodPct -= DISSENT_PROD_PCT;
  return out;
}

/** Faith shares (0..1) of a city, largest first. */
export function faithShares(city: City): { religion: ReligionId; share: number }[] {
  const entries = Object.entries(city.faith ?? {}) as [ReligionId, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return city.religion ? [{ religion: city.religion, share: 1 }] : [];
  return entries.map(([religion, v]) => ({ religion, share: v / total })).sort((a, b) => b.share - a.share);
}

/** A new city follows the state religion of the realm that founds it. */
export function seedCityFaith(g: Game, city: City) {
  const rel = g.player(city.owner).religion;
  if (!rel) return;
  city.religion = rel;
  city.faith = { [rel]: START_FAITH };
}

/** Holy cities of the faiths that exist in 1400: the capitals of the Papal States and the Hafsids. */
export function foundStartingReligions(g: Game) {
  const religions = (g.s.religions ??= {});
  for (const r of RELIGION_LIST) {
    if (r.foundedBy || religions[r.id]) continue;
    const holder = g.s.players.find((p) => p.nation === r.holyCityOf);
    const city = holder ? g.city(holder.originalCapital) : undefined;
    religions[r.id] = { holyCity: city ? city.id : -1, founded: 1 };
  }
}

/** Give a save from before religion existed its faiths: every city follows the faith of its founder. */
export function migrateReligion(g: Game) {
  for (const p of g.s.players) p.religion ??= homeReligion(p.nation);
  for (const c of g.s.cities) {
    if (c.religion) continue;
    c.religion = g.player(c.founder).religion;
    c.faith = c.religion ? { [c.religion]: START_FAITH } : {};
  }
  foundStartingReligions(g);
}

/** Switch a city to `rel`. A capital takes its realm's state religion with it. */
export function convertCity(g: Game, city: City, rel: ReligionId, how: 'pressure' | 'preaching' | 'founding') {
  if (city.religion === rel) return;
  city.religion = rel;
  const owner = g.player(city.owner);
  if (how === 'pressure') g.log('religion', `${city.name} turns to ${RELIGIONS[rel].name}.`, [city.owner], city.tile);
  if (city.isCapital && owner.religion !== rel) {
    owner.religion = rel;
    if (how !== 'founding' && !owner.isMinor) g.log('religion', `${owner.name} adopts ${RELIGIONS[rel].name} as its state religion.`, [owner.id], city.tile);
  }
}

/** A conquered or relocated capital brings the realm's state religion in line with it. */
export function syncStateReligion(g: Game, pid: number) {
  const cap = g.capitalOf(pid);
  const p = g.player(pid);
  if (cap?.religion && p.religion !== cap.religion) {
    p.religion = cap.religion;
    if (!p.isMinor) g.log('religion', `${p.name} adopts ${RELIGIONS[cap.religion].name} as its state religion.`, [pid], cap.tile);
  }
}

/** The first great power to discover a founding tech starts that faith in its capital. */
export function onTechDiscovered(g: Game, pid: number, tech: string) {
  const p = g.player(pid);
  if (p.isMinor) return;
  for (const r of RELIGION_LIST) {
    if (r.foundedBy !== tech) continue;
    const religions = (g.s.religions ??= {});
    if (religions[r.id]) continue;
    const cap = g.capitalOf(pid);
    if (!cap) continue;
    religions[r.id] = { holyCity: cap.id, founded: g.s.turn };
    const faith = (cap.faith ??= {});
    faith[r.id] = Math.max(faith[r.id] ?? 0, ...Object.values(faith).map((v) => (v ?? 0) * 2), START_FAITH * 2);
    g.log('religion', `The Reformation begins in ${cap.name}: ${p.name} breaks with Rome and founds ${r.name}.`, [], cap.tile);
    convertCity(g, cap, r.id, 'founding');
  }
}

/** One turn of religious pressure across the map. */
export function spreadReligion(g: Game) {
  const sources = g.s.cities.filter((c) => c.religion).map((c) => ({ c, p: pressureOf(g, c) }));
  for (const city of g.s.cities) {
    const incoming: Partial<Record<ReligionId, number>> = {};
    for (const { c, p } of sources) {
      const d = c === city ? 0 : distance(g.map, c.tile, city.tile);
      if (d > PRESSURE_RANGE) continue;
      const w = d === 0 ? 2 : d <= NEAR ? 1 : 0.5;
      incoming[c.religion!] = (incoming[c.religion!] ?? 0) + p * w;
    }
    const faith = (city.faith ??= {});
    for (const r of RELIGION_LIST) {
      const v = (faith[r.id] ?? 0) * KEEP + (incoming[r.id] ?? 0);
      if (v < 0.5) delete faith[r.id];
      else faith[r.id] = Math.round(v * 10) / 10;
    }
    maybeConvert(g, city);
  }
}

function maybeConvert(g: Game, city: City) {
  const holy = holyReligion(g, city);
  if (holy && city.religion === holy) return;
  const faith = city.faith ?? {};
  let best: ReligionId | null = null;
  for (const r of RELIGION_LIST) if ((faith[r.id] ?? 0) > (best ? (faith[best] ?? 0) : 0)) best = r.id;
  if (!best || best === city.religion) return;
  const cur = city.religion ? (faith[city.religion] ?? 0) : 0;
  if ((faith[best] ?? 0) > cur * CONVERT_FACTOR + CONVERT_MARGIN) convertCity(g, city, best, 'pressure');
}

// --------------------------------------------------------------- missionaries

/** Why this missionary can't preach in `city`, or null if it can. */
export function cannotPreach(g: Game, u: Unit, city: City): string | null {
  if (u.type !== 'missionary' || !u.religion) return 'Only missionaries can preach.';
  if (u.moves <= 0) return 'The missionary has no moves left this turn.';
  if (distance(g.map, u.tile, city.tile) > 1) return 'Move next to the city first.';
  if (city.religion === u.religion) return `${city.name} is already ${RELIGIONS[u.religion].adjective}.`;
  const holy = holyReligion(g, city);
  if (holy && holy === city.religion) return `${city.name} is the holy city of ${RELIGIONS[holy].name} and will not be swayed.`;
  if (g.atWar(u.owner, city.owner)) return 'You cannot preach in an enemy city.';
  return null;
}

/** Cities in or next to the missionary's tile it could preach in. */
export function preachTargets(g: Game, u: Unit): City[] {
  if (u.type !== 'missionary') return [];
  return g.s.cities.filter((c) => distance(g.map, u.tile, c.tile) <= 1 && !cannotPreach(g, u, c));
}

/** The missionary wins the city over to its faith and is used up. */
export function preach(g: Game, u: Unit, city: City): boolean {
  if (cannotPreach(g, u, city)) return false;
  const rel = u.religion!;
  const faith = (city.faith ??= {});
  const strongest = Math.max(0, ...Object.values(faith).map((v) => v ?? 0));
  faith[rel] = Math.round(Math.max(faith[rel] ?? 0, strongest * 1.5 + 20) * 10) / 10;
  const by = g.player(u.owner);
  g.log('religion', `${by.adjective} missionaries convert ${city.name} to ${RELIGIONS[rel].name}.`, [u.owner, city.owner], city.tile);
  convertCity(g, city, rel, 'preaching');
  g.removeUnit(u);
  return true;
}
