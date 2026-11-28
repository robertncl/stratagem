import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import { BUILDING_LIST } from '../src/core/data/buildings';
import { MAJOR_NATIONS, MINOR_NATIONS } from '../src/core/data/nations';
import { TECH_LIST } from '../src/core/data/techs';
import { UNIT_LIST } from '../src/core/data/units';
import { buildingsTable, CONSTANTS, minorsList, projectsTable, realmsTable, renderTable, techTree, unitsTable, wondersTable } from '../src/guide/tables';

const html = fs.readFileSync(new URL('../guide.html', import.meta.url), 'utf8');

describe('game guide', () => {
  it('lists every unit, building, wonder, project, tech and realm', () => {
    const units = renderTable(unitsTable());
    for (const u of UNIT_LIST) expect(units, u.id).toContain(`data-unit="${u.id}"`);
    const built = renderTable(buildingsTable()) + renderTable(wondersTable()) + renderTable(projectsTable());
    for (const b of BUILDING_LIST) expect(built, b.id).toContain(b.name.replace(/'/g, '&#39;'));
    const tree = techTree();
    for (const t of TECH_LIST) expect(tree, t.id).toContain(`id="tech-${t.id}"`);
    const realms = renderTable(realmsTable(() => ''));
    for (const n of MAJOR_NATIONS) expect(realms).toContain(n.leader.name);
    expect(minorsList().match(/<li>/g)).toHaveLength(MINOR_NATIONS.length);
  });

  it('every placeholder in the page has data, and every contents link a section', () => {
    for (const [, name] of html.matchAll(/data-const="(\w+)"/g)) expect(CONSTANTS[name], name).toBeDefined();
    const tables = ['realms', 'terrain', 'resources', 'growth', 'units', 'buildings', 'wonders', 'projects', 'faiths'];
    for (const [, name] of html.matchAll(/data-table="(\w+)"/g)) expect(tables, name).toContain(name);
    for (const [, id] of html.matchAll(/<li><a href="#(\w+)">/g)) expect(html, id).toContain(`<section id="${id}"`);
  });

  it('quotes the current rules', () => {
    expect(CONSTANTS.END_YEAR).toBe(2050);
    expect(CONSTANTS.TECH_COUNT).toBe(TECH_LIST.length);
    expect(CONSTANTS.UNIT_COUNT).toBe(UNIT_LIST.length);
  });
});
