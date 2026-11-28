// The game guide page: fills the reference tables from the game's data,
// draws unit thumbnails with the game's own 3D models, makes the big
// tables sortable, and highlights the current section in the contents.

import './guide.css';
import { faithIcon } from '../ui/render/faith';
import { leaderPortrait } from '../ui/render/portraits';
import type { ReligionId } from '../core/data/religions';
import {
  buildingsTable,
  CONSTANTS,
  faithsTable,
  growthTable,
  minorsList,
  projectsTable,
  realmsTable,
  renderTable,
  resourcesTable,
  TableSpec,
  techTree,
  terrainTable,
  unitsTable,
  wondersTable,
} from './tables';

const TABLES: Record<string, () => TableSpec> = {
  realms: () => realmsTable((n) => leaderPortrait(n, 52)),
  terrain: terrainTable,
  resources: resourcesTable,
  growth: growthTable,
  units: unitsTable,
  buildings: buildingsTable,
  wonders: wondersTable,
  projects: projectsTable,
  faiths: () => faithsTable((r) => faithIcon(r as ReligionId, 22)),
};

for (const el of document.querySelectorAll<HTMLElement>('[data-table]')) {
  const make = TABLES[el.dataset.table!];
  if (make) el.innerHTML = renderTable(make());
}
for (const el of document.querySelectorAll<HTMLElement>('[data-const]')) {
  const v = CONSTANTS[el.dataset.const!];
  if (v !== undefined) el.textContent = String(v);
}
document.getElementById('tech-tree')!.innerHTML = techTree();
document.getElementById('minors')!.innerHTML = minorsList();
for (const el of document.querySelectorAll<HTMLElement>('[data-faith]')) el.innerHTML = faithIcon(el.dataset.faith as ReligionId, 16);

// ------------------------------------------------------------- sorting

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const status = document.getElementById('sort-status')!;

function sortBy(button: HTMLButtonElement) {
  const th = button.closest('th')!;
  const table = th.closest('table')!;
  const tbody = table.tBodies[0];
  const direction = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
  for (const h of table.tHead!.rows[0].cells) h.removeAttribute('aria-sort');
  th.setAttribute('aria-sort', direction);
  const index = th.cellIndex;
  const factor = direction === 'ascending' ? 1 : -1;
  const key = (row: HTMLTableRowElement) => {
    const cell = row.cells[index];
    return cell.dataset.value ?? cell.textContent!.trim();
  };
  const rows = [...tbody.rows].map((row) => ({ row, k: key(row) }));
  rows.sort((a, b) => factor * (th.dataset.type === 'number' ? Number(a.k) - Number(b.k) : collator.compare(a.k, b.k)));
  for (const { row } of rows) {
    // move the existing rows; moveBefore keeps their state where supported
    const body = tbody as HTMLTableSectionElement & { moveBefore?: (n: Node, ref: Node | null) => void };
    if (body.moveBefore) body.moveBefore(row, null);
    else tbody.append(row);
  }
  status.textContent = `${table.caption?.textContent?.split('.')[0] ?? 'Table'} sorted by ${button.textContent!.trim()}, ${direction}`;
}

for (const table of document.querySelectorAll<HTMLTableElement>('table[data-sortable]')) {
  table.addEventListener('command', (e) => {
    const ev = e as Event & { command?: string; source?: HTMLButtonElement };
    if (ev.command === '--sort' && ev.source) sortBy(ev.source);
  });
}
// Without invoker commands, a click does it (with them, a click also fires `command`)
if (!('commandForElement' in HTMLButtonElement.prototype)) {
  for (const b of document.querySelectorAll<HTMLButtonElement>('button[command="--sort"]')) b.addEventListener('click', () => sortBy(b));
}

// ---------------------------------------------------------- scrollspy

const toc = document.querySelector<HTMLElement>('#toc')!;
const links = [...toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
const setCurrent = (current: Element | null) => {
  for (const a of links) {
    if (a === current) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
};

if (CSS.supports('scroll-target-group: auto')) {
  // the browser tracks the current section; mirror it for assistive tech
  const sync = () => setCurrent(toc.querySelector('a:target-current'));
  sync();
  document.addEventListener('scrollend', sync);
} else {
  const sections = links.map((a) => document.querySelector(a.hash)).filter((s): s is HTMLElement => !!s);
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const link = links.find((a) => a.hash === `#${e.target.id}`) ?? null;
        for (const a of links) a.classList.toggle('target-current', a === link);
        setCurrent(link);
      }
    },
    { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
  );
  for (const s of sections) observer.observe(s);
}

// --------------------------------------------------------- unit models

/** Bake each unit's 3D model into its table cell, a few at a time, once the tables are near. */
async function drawUnits() {
  const spots = [...document.querySelectorAll<HTMLElement>('.unit-pic[data-unit]')];
  let models: typeof import('../ui/render/three/models');
  try {
    models = await import('../ui/render/three/models');
  } catch {
    return;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const spot of spots) {
    try {
      const { sprite } = models.unitSprite(spot.dataset.unit!, '#2f62c8', false, 2 * dpr, true);
      if (!sprite) continue;
      const c = document.createElement('canvas');
      c.width = sprite.canvas.width;
      c.height = sprite.canvas.height;
      c.getContext('2d')!.drawImage(sprite.canvas, 0, 0);
      spot.append(c);
    } catch {
      return; // no WebGL: the table reads fine without pictures
    }
    await new Promise((r) => setTimeout(r, 0));
  }
}

const unitsSection = document.getElementById('units');
if (unitsSection) {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void drawUnits();
      }
    },
    { rootMargin: '800px 0px' },
  );
  io.observe(unitsSection);
}
