// The game guide's reference tables, built from the game's own data so
// they always match the rules. Pure string builders, with no DOM, so they
// can be tested headless.

import { BUILDING_LIST, BuildingDef } from '../core/data/buildings';
import { MAJOR_NATIONS, MINOR_NATIONS } from '../core/data/nations';
import { DISSENT_PROD_PCT, DISSENT_UNREST, HOLY_CITY, RELIGION_LIST } from '../core/data/religions';
import { ERA_NAMES, TECHS, TECH_LIST } from '../core/data/techs';
import { RESOURCES, TERRAIN } from '../core/data/terrain';
import { UNIT_LIST, UNITS, UnitDef } from '../core/data/units';
import { PEACE_TREATY_TURNS, YEARS_PER_TURN } from '../core/game';
import { PRESSURE_RANGE } from '../core/rules/religion';
import { AI_LAUNCH_COOLDOWN, FALLOUT_TURNS, SHIELD_CHANCE, SHIELD_RANGE } from '../core/rules/nuclear';
import { FLIGHT_TURNS } from '../core/rules/space';
import { MAX_BORDER_RADIUS, WORK_RADIUS, growthThreshold } from '../core/rules/cities';
import { MAX_TURNS } from '../core/setup';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Numbers the prose quotes, by name, so the text follows the rules when they are retuned. */
export const CONSTANTS: Record<string, string | number> = {
  MAX_TURNS,
  END_YEAR: 1400 + MAX_TURNS * YEARS_PER_TURN,
  YEARS_PER_TURN,
  PEACE_TREATY_TURNS,
  WORK_RADIUS,
  MAX_BORDER_RADIUS,
  PRESSURE_RANGE,
  DISSENT_PCT: Math.round(DISSENT_PROD_PCT * 100),
  DISSENT_UNREST,
  HOLY_GOLD: HOLY_CITY.gold,
  HOLY_CULTURE: HOLY_CITY.culture,
  HOLY_PRESSURE: HOLY_CITY.pressure,
  FLIGHT_TURNS,
  FALLOUT_TURNS,
  SHIELD_RANGE,
  SHIELD_PCT: Math.round(SHIELD_CHANCE * 100),
  AI_LAUNCH_COOLDOWN,
  TECH_COUNT: TECH_LIST.length,
  ERA_COUNT: ERA_NAMES.length - 1,
  UNIT_COUNT: UNIT_LIST.length,
  BUILDING_COUNT: BUILDING_LIST.filter((b) => !b.wonder && !b.project).length,
  WONDER_COUNT: BUILDING_LIST.filter((b) => b.wonder).length,
  MINOR_COUNT: MINOR_NATIONS.length,
};

/** Rows of a table: each cell is [html, sort value?]. */
type Cell = string | [html: string, value: string | number];

export interface TableSpec {
  id: string;
  caption: string;
  head: { label: string; type?: 'number' | 'text'; sortable?: boolean; num?: boolean }[];
  rows: Cell[][];
  /** cell to render as the row header (default 0) */
  rowHeader?: number;
}

export function renderTable(t: TableSpec): string {
  const sortable = t.head.some((h) => h.sortable);
  const head = t.head
    .map((h) =>
      h.sortable
        ? `<th scope="col" data-type="${h.type ?? 'text'}"${h.num ? ' class="num"' : ''}><button type="button" commandfor="${t.id}" command="--sort">${esc(h.label)}<svg class="sort-ico" viewBox="0 0 10 12" aria-hidden="true"><path d="M5 1 9 5H1zM5 11 1 7h8z" fill="currentColor"/></svg></button></th>`
        : `<th scope="col"${h.num ? ' class="num"' : ''}>${esc(h.label)}</th>`,
    )
    .join('');
  const rh = t.rowHeader ?? 0;
  const body = t.rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => {
            const [html, value] = Array.isArray(c) ? c : [c, undefined];
            const tag = i === rh ? 'th scope="row"' : 'td';
            const cls = t.head[i]?.num ? ' class="num"' : '';
            const v = value !== undefined ? ` data-value="${esc(String(value))}"` : '';
            return `<${tag}${cls}${v}>${html}</${tag.split(' ')[0]}>`;
          })
          .join('')}</tr>`,
    )
    .join('');
  return `<div class="table-wrap" role="region" aria-labelledby="${t.id}-cap" tabindex="0">
    <table id="${t.id}"${sortable ? ' data-sortable' : ''}><caption id="${t.id}-cap">${esc(t.caption)}</caption>
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const pct = (f: number) => `${f > 0 ? '+' : ''}${Math.round(f * 100)}%`;
const techName = (id?: string) => (id ? esc(TECHS[id].name) : '—');
const eraOf = (id?: string) => (id ? TECHS[id].era : 0);

// --------------------------------------------------------------- realms

export function realmsTable(portrait: (nation: string) => string): TableSpec {
  return {
    id: 't-realms',
    caption: 'The eight great powers',
    rowHeader: 1,
    head: [{ label: '' }, { label: 'Realm' }, { label: 'Leader' }, { label: 'Capital' }, { label: 'Trait' }, { label: 'Starts with' }],
    rows: MAJOR_NATIONS.map((n) => [
      portrait(n.id),
      `<span class="swatch" style="background:${n.color}"></span> ${esc(n.name)}`,
      `<b>${esc(n.leader.name)}</b><br><small>${esc(n.leader.title)}, ${esc(n.leader.years)}</small>`,
      esc(n.capital.name),
      esc(n.traitText.replace(/, starts with .*$/, '.')),
      n.startTechs.map(techName).join(', '),
    ]),
  };
}

export function minorsList(): string {
  return MINOR_NATIONS.map(
    (m) => `<li><span class="swatch" style="background:${m.color}"></span> <b>${esc(m.name)}</b> <span class="muted">· ${esc(m.city.name)}, size ${m.size}${m.walls ? ', walled' : ''}${m.religion === 'islam' ? ', Muslim' : ''}</span></li>`,
  ).join('');
}

// ------------------------------------------------------------- the land

export function terrainTable(): TableSpec {
  return {
    id: 't-terrain',
    caption: 'Terrain: what a worked tile yields, what it costs to enter, and its defence bonus',
    head: [{ label: 'Terrain' }, { label: 'Food', num: true }, { label: 'Production', num: true }, { label: 'Gold', num: true }, { label: 'Move cost', num: true }, { label: 'Defence', num: true }, { label: 'Notes' }],
    rows: Object.values(TERRAIN).map((t) => [
      `<span class="swatch" style="background:${t.color}"></span> ${esc(t.name)}`,
      String(t.food),
      String(t.prod),
      String(t.gold),
      t.water ? '1 at sea' : String(t.moveCost),
      t.defense ? pct(t.defense) : '—',
      t.id === 'ocean' ? 'Needs Navigation to enter' : t.water ? 'Needs Sailing to enter' : t.id === 'mountains' ? 'No cities' : t.id === 'marsh' ? 'Defenders are weaker' : '',
    ]),
  };
}

export function resourcesTable(): TableSpec {
  return {
    id: 't-resources',
    caption: 'Resources add to the yield of the tile they sit on',
    head: [{ label: 'Resource' }, { label: 'Found on' }, { label: 'Food', num: true }, { label: 'Production', num: true }, { label: 'Gold', num: true }],
    rows: Object.values(RESOURCES).map((r) => [
      `<span class="swatch" style="background:${r.color}"></span> ${esc(r.name)}`,
      r.terrains.map((t) => TERRAIN[t].name).join(', '),
      r.food ? signed(r.food) : '—',
      r.prod ? signed(r.prod) : '—',
      r.gold ? signed(r.gold) : '—',
    ]),
  };
}

export function growthTable(): TableSpec {
  const sizes = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
  return {
    id: 't-growth',
    caption: 'Food a city must store to grow from each size',
    head: [{ label: 'Size' }, ...sizes.map((s) => ({ label: String(s), num: true }))],
    rows: [['Food to grow', ...sizes.map((s) => String(growthThreshold(s)))]],
  };
}

// ------------------------------------------------------------ research

export function techTree(): string {
  const eras = [...new Set(TECH_LIST.map((t) => t.era))].sort((a, b) => a - b);
  return eras
    .map((era) => {
      const techs = TECH_LIST.filter((t) => t.era === era);
      const cost = techs[0].cost;
      return `<section class="era-block" aria-labelledby="era-${era}"><h4 id="era-${era}">${esc(ERA_NAMES[era])} <small class="muted">· ${cost.toLocaleString('en')} science each</small></h4>
        <ul class="techs">${techs
          .map((t) => {
            const unl = [
              ...UNIT_LIST.filter((u) => u.tech === t.id).map((u) => esc(u.name)),
              ...BUILDING_LIST.filter((b) => b.tech === t.id).map((b) => (b.wonder ? `★ ${esc(b.name)}` : b.project ? `◆ ${esc(b.name)}` : esc(b.name))),
              ...(t.note ? [esc(t.note)] : []),
            ];
            return `<li id="tech-${t.id}"><b>${esc(t.name)}</b>${t.prereqs.length ? `<span class="needs">needs ${t.prereqs.map((p) => `<a href="#tech-${p}">${esc(TECHS[p].name)}</a>`).join(', ')}</span>` : ''}<span class="unl">${unl.join(' · ')}</span></li>`;
          })
          .join('')}</ul></section>`;
    })
    .join('');
}

// --------------------------------------------------------------- units

const CLASS_NAME: Record<UnitDef['cls'], string> = {
  civilian: 'Civilian',
  recon: 'Recon',
  melee: 'Infantry',
  ranged: 'Ranged',
  mounted: 'Mounted',
  siege: 'Siege',
  missile: 'Super weapon',
};

function special(u: UnitDef): string {
  const out: string[] = [];
  if (u.ranged) out.push(`Ranged ${u.ranged}, range ${u.range}`);
  if (u.vsMounted) out.push(`${pct(u.vsMounted)} vs mounted`);
  if (u.vsCity) out.push(`${pct(u.vsCity)} vs cities`);
  if (u.strike) out.push(`Range ${u.strike.range}, blast ${u.strike.blast}`);
  if (u.needsProject) out.push(`Needs the ${esc(BUILDING_LIST.find((b) => b.id === u.needsProject)!.name)}`);
  if (u.replaces?.length) out.push(`Replaces ${u.replaces.map((r) => esc(UNITS[r].name)).join(', ')}`);
  return out.join('<br>');
}

export function unitsTable(): TableSpec {
  return {
    id: 't-units',
    caption: 'Every unit, in the order techs unlock them. Click a column to sort.',
    rowHeader: 1,
    head: [
      { label: '' },
      { label: 'Unit', sortable: true },
      { label: 'Class', sortable: true },
      { label: 'Tech', sortable: true, type: 'number' },
      { label: 'Cost', sortable: true, type: 'number', num: true },
      { label: 'Attack', sortable: true, type: 'number', num: true },
      { label: 'Defence', sortable: true, type: 'number', num: true },
      { label: 'Moves', sortable: true, type: 'number', num: true },
      { label: 'Special' },
    ],
    rows: [...UNIT_LIST]
      .sort((a, b) => eraOf(a.tech) - eraOf(b.tech))
      .map((u) => [
        `<span class="unit-pic" data-unit="${u.id}" aria-hidden="true"></span>`,
        `<b>${esc(u.name)}</b><br><small class="muted">${esc(u.description)}</small>`,
        CLASS_NAME[u.cls],
        [u.tech ? `${techName(u.tech)}<br><small class="muted">${esc(ERA_NAMES[eraOf(u.tech)])}</small>` : 'Start', eraOf(u.tech) * 100 + (u.tech ? TECH_LIST.findIndex((t) => t.id === u.tech) : 0)],
        String(u.cost),
        u.cls === 'civilian' || u.cls === 'missile' ? ['—', 0] : String(u.attack),
        u.cls === 'civilian' || u.cls === 'missile' ? ['—', 0] : String(u.defense),
        String(u.moves),
        special(u),
      ]),
  };
}

// ----------------------------------------------------------- buildings

function effects(b: BuildingDef): string {
  return esc(b.description);
}

export function buildingsTable(): TableSpec {
  return {
    id: 't-buildings',
    caption: 'City buildings. Each city builds its own. Click a column to sort.',
    head: [
      { label: 'Building', sortable: true },
      { label: 'Tech', sortable: true, type: 'number' },
      { label: 'Cost', sortable: true, type: 'number', num: true },
      { label: 'Upkeep', sortable: true, type: 'number', num: true },
      { label: 'Needs' },
      { label: 'Effect' },
    ],
    rows: BUILDING_LIST.filter((b) => !b.wonder && !b.project)
      .sort((a, b) => eraOf(a.tech) - eraOf(b.tech))
      .map((b) => [
        `<b>${esc(b.name)}</b>`,
        [techName(b.tech), eraOf(b.tech) * 100 + TECH_LIST.findIndex((t) => t.id === b.tech)],
        String(b.cost),
        String(b.upkeep),
        [b.requires ? esc(BUILDING_LIST.find((x) => x.id === b.requires)!.name) : '', b.coastal ? 'Coastal city' : ''].filter(Boolean).join(', ') || '—',
        effects(b),
      ]),
  };
}

export function wondersTable(): TableSpec {
  return {
    id: 't-wonders',
    caption: 'World wonders: one in the whole world, built by whoever finishes first',
    head: [{ label: 'Wonder' }, { label: 'Tech' }, { label: 'Cost', num: true }, { label: 'Effect' }],
    rows: BUILDING_LIST.filter((b) => b.wonder)
      .sort((a, b) => eraOf(a.tech) - eraOf(b.tech))
      .map((b) => [`★ <b>${esc(b.name)}</b>`, `${techName(b.tech)} <small class="muted">· ${esc(ERA_NAMES[eraOf(b.tech)])}</small>`, String(b.cost), effects(b)]),
  };
}

export function projectsTable(): TableSpec {
  return {
    id: 't-projects',
    caption: 'National projects: once per realm, kept by the realm even if the city that built it falls',
    head: [{ label: 'Project' }, { label: 'Tech' }, { label: 'Cost', num: true }, { label: 'Needs' }, { label: 'Effect' }],
    rows: BUILDING_LIST.filter((b) => b.project).map((b) => [
      `◆ <b>${esc(b.name)}</b>`,
      techName(b.tech),
      String(b.cost),
      [b.needsProject ? esc(BUILDING_LIST.find((x) => x.id === b.needsProject)!.name) : '', b.requires ? `a ${esc(BUILDING_LIST.find((x) => x.id === b.requires)!.name)} in the city` : ''].filter(Boolean).join(', ') || '—',
      effects(b),
    ]),
  };
}

// --------------------------------------------------------------- faith

export function faithsTable(icon: (rel: string) => string): TableSpec {
  return {
    id: 't-faiths',
    caption: 'The faiths, and what each gives a city that follows it',
    rowHeader: 1,
    head: [{ label: '' }, { label: 'Faith' }, { label: 'City bonus' }, { label: 'Holy city' }, { label: 'How it starts' }],
    rows: RELIGION_LIST.map((r) => {
      const holder = MINOR_NATIONS.find((m) => m.id === r.holyCityOf);
      return [
        icon(r.id),
        `<b>${esc(r.name)}</b>`,
        esc(r.effectText),
        holder ? `${esc(holder.city.name)} <small class="muted">(${esc(holder.name)})</small>` : 'The capital of its founder',
        r.foundedBy ? `Founded by the first great power to learn ${techName(r.foundedBy)}` : r.id === 'islam' ? 'Granada and the Maghreb' : 'The great powers and most independent states',
      ];
    }),
  };
}
