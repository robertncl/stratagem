// Modal screens: main menu, research, diplomacy, empire, help, game over.

import { acceptsPeace } from '../core/ai/ai';
import { BUILDING_LIST } from '../core/data/buildings';
import { MAJOR_NATIONS } from '../core/data/nations';
import { ERA_NAMES, TECH_LIST } from '../core/data/techs';
import { UNIT_LIST } from '../core/data/units';
import type { Game } from '../core/game';
import { buildCost, buildName, computeCityYields, effectiveProd } from '../core/rules/cities';
import type { Difficulty } from '../core/types';
import { AUTOSAVE, info, SLOTS } from './storage';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

export function dialog(id: string): HTMLDialogElement {
  return document.getElementById(id) as HTMLDialogElement;
}

export function openDialog(id: string) {
  const d = dialog(id);
  if (!d.open) d.showModal();
}

export function closeDialog(id: string) {
  const d = dialog(id);
  if (d.open) d.close();
}

// Light-dismiss fallback where <dialog closedby> is unsupported (Safari).
export function installDialogFallbacks() {
  for (const d of document.querySelectorAll<HTMLDialogElement>('dialog')) {
    d.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-close]');
      if (btn) d.close();
    });
  }
  if ('closedBy' in HTMLDialogElement.prototype) return;
  const outside = (e: PointerEvent, d: HTMLDialogElement) => {
    const r = d.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  for (const d of document.querySelectorAll<HTMLDialogElement>('dialog[closedby="any"]')) {
    let pressedOutside = false;
    d.addEventListener('pointerdown', (e) => (pressedOutside = outside(e, d)));
    d.addEventListener('pointerup', (e) => {
      if (pressedOutside && outside(e, d)) d.close();
    });
  }
}

/** Promise-based confirmation using the shared confirm dialog. */
export function confirmDialog(title: string, text: string, yes = 'Confirm', danger = true): Promise<boolean> {
  const d = dialog('dlg-confirm');
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  const y = $('confirm-yes');
  y.textContent = yes;
  y.className = danger ? 'danger' : 'primary';
  d.returnValue = '';
  d.showModal();
  return new Promise((resolve) => {
    d.addEventListener(
      'close',
      () => {
        const v = d.returnValue === 'yes';
        d.returnValue = '';
        resolve(v);
      },
      { once: true },
    );
  });
}

// ----------------------------------------------------------------- menu

export interface MenuHandlers {
  newGame(nation: string, difficulty: Difficulty, seed: number | undefined, reveal: boolean): void;
  load(key: string): void;
  save(key: string): void;
  resume(): void;
}

export function showMainMenu(h: MenuHandlers, inGame: boolean) {
  const body = $('menu-body');
  const auto = info(AUTOSAVE);
  body.innerHTML = `
    <div class="menu-actions">
      ${inGame ? `<button class="primary" data-act="resume">Resume</button>` : ''}
      ${!inGame && auto ? `<button class="primary" data-act="continue">Continue — ${esc(auto.nation)}, ${auto.year} AD</button>` : ''}
      <button data-act="new" ${!inGame && !auto ? 'class="primary"' : ''}>New Game</button>
      <button data-act="loadmenu">Load Game</button>
      ${inGame ? `<button data-act="savemenu">Save Game</button>` : ''}
    </div>`;
  body.onclick = (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'resume') {
      closeDialog('dlg-menu');
      h.resume();
    } else if (act === 'continue') h.load(AUTOSAVE);
    else if (act === 'new') showNewGame(h, inGame);
    else if (act === 'loadmenu') showSlots(h, 'load', inGame);
    else if (act === 'savemenu') showSlots(h, 'save', inGame);
  };
  openDialog('dlg-menu');
}

function showSlots(h: MenuHandlers, mode: 'load' | 'save', inGame: boolean) {
  const body = $('menu-body');
  const keys = mode === 'load' ? [AUTOSAVE, ...SLOTS] : SLOTS;
  body.innerHTML = `
    <h2 style="text-align:center;font:600 18px var(--serif)">${mode === 'load' ? 'Load Game' : 'Save Game'}</h2>
    <div class="slots">
      ${keys
        .map((k, i) => {
          const s = info(k);
          const label = k === AUTOSAVE ? 'Autosave' : `Slot ${i + (mode === 'load' ? 0 : 1)}`;
          const desc = s ? `${esc(s.nation)} — turn ${s.turn}, ${s.year} AD · ${new Date(s.savedAt).toLocaleString()}` : 'Empty';
          const disabled = mode === 'load' && !s ? 'disabled' : '';
          return `<div class="slot"><button data-slot="${k}" ${disabled}>${mode === 'load' ? 'Load' : 'Save'} ${label}</button><span>${desc}</span></div>`;
        })
        .join('')}
    </div>
    <div class="row-end"><button data-act="back">Back</button></div>`;
  body.onclick = (e) => {
    const el = e.target as HTMLElement;
    const slot = el.closest<HTMLElement>('[data-slot]')?.dataset.slot;
    if (slot) {
      if (mode === 'load') h.load(slot);
      else {
        h.save(slot);
        showSlots(h, mode, inGame);
      }
      return;
    }
    if (el.closest('[data-act="back"]')) showMainMenu(h, inGame);
  };
}

function showNewGame(h: MenuHandlers, inGame: boolean) {
  const body = $('menu-body');
  let chosen = 'france';
  body.innerHTML = `
    <p class="muted" style="text-align:center;margin:0">Choose a realm. The rest of Europe will be led by the computer.</p>
    <div class="nations">
      ${MAJOR_NATIONS.map(
        (n) => `<button class="nation ${n.id === chosen ? 'on' : ''}" data-nation="${n.id}" style="border-left-color:${n.color}">
          <b>${esc(n.name)}</b><small>${esc(n.ruler)} · ${esc(n.capital.name)}</small><small>${esc(n.traitText)}</small></button>`,
      ).join('')}
    </div>
    <div class="opts">
      <label>Difficulty <select id="ng-diff"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option></select></label>
      <label>Map <select id="ng-reveal"><option value="1" selected>Known world</option><option value="0">Unexplored</option></select></label>
      <label>Seed <input id="ng-seed" type="number" placeholder="random" style="width:110px"></label>
    </div>
    <div class="row-end"><button data-act="back">Back</button><button class="primary" data-act="start">Begin the reign</button></div>`;
  body.onclick = (e) => {
    const el = e.target as HTMLElement;
    const n = el.closest<HTMLElement>('[data-nation]');
    if (n) {
      chosen = n.dataset.nation!;
      body.querySelectorAll('.nation').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.nation === chosen));
      return;
    }
    if (el.closest('[data-act="back"]')) showMainMenu(h, inGame);
    if (el.closest('[data-act="start"]')) {
      const diff = (document.getElementById('ng-diff') as HTMLSelectElement).value as Difficulty;
      const seedRaw = (document.getElementById('ng-seed') as HTMLInputElement).value;
      const reveal = (document.getElementById('ng-reveal') as HTMLSelectElement).value === '1';
      closeDialog('dlg-menu');
      h.newGame(chosen, diff, seedRaw ? Number(seedRaw) : undefined, reveal);
    }
  };
}

// -------------------------------------------------------------- research

export function unlocksOf(tech: string): string[] {
  const out: string[] = [];
  for (const u of UNIT_LIST) if (u.tech === tech) out.push(u.name);
  for (const b of BUILDING_LIST) if (b.tech === tech) out.push(b.wonder ? `★ ${b.name}` : b.name);
  return out;
}

export function showTech(g: Game, onPick: (tech: string) => void) {
  const pid = g.humanId;
  const p = g.player(pid);
  const avail = new Set(g.availableTechs(pid));
  const eras = [1, 2, 3, 4, 5, 6];
  const sci = g.citiesOf(pid).reduce((s, c) => s + computeCityYields(g, c).sci, 0);
  $('tech-body').innerHTML = eras
    .map(
      (era) => `<section class="era"><h2>${ERA_NAMES[era]}</h2>
      ${TECH_LIST.filter((t) => t.era === era)
        .map((t) => {
          const known = p.techs.includes(t.id);
          const current = p.research === t.id;
          const cls = known ? 'known' : current ? 'current' : avail.has(t.id) ? 'avail' : 'locked';
          const cost = g.techCost(pid, t.id);
          const turns = sci > 0 ? Math.max(1, Math.ceil((cost - (current ? p.researchProgress : 0)) / sci)) : '∞';
          const unl = [...unlocksOf(t.id), ...(t.note ? [t.note] : [])].join(', ');
          const prog = current ? `<div class="pbar"><i style="width:${Math.min(100, (p.researchProgress / cost) * 100)}%"></i></div>` : '';
          return `<button class="tech ${cls}" data-tech="${t.id}" ${known || cls === 'locked' ? 'disabled' : ''}>
            <b>${esc(t.name)}</b>
            <span class="muted">${known ? 'Known' : `${cost} science · ${turns} turns`}</span>
            ${unl ? `<span class="unl">${esc(unl)}</span>` : ''}
            ${t.prereqs.length && !known ? `<span class="muted">Needs: ${t.prereqs.map((r) => TECH_LIST.find((x) => x.id === r)!.name).join(', ')}</span>` : ''}
            ${prog}
          </button>`;
        })
        .join('')}</section>`,
    )
    .join('');
  $('tech-body').onclick = (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tech]')?.dataset.tech;
    if (t) {
      onPick(t);
      closeDialog('dlg-tech');
    }
  };
  openDialog('dlg-tech');
}

// ------------------------------------------------------------- diplomacy

export interface DiploHandlers {
  declareWar(pid: number): void;
  proposePeace(pid: number): void;
}

export function showDiplomacy(g: Game, h: DiploHandlers) {
  const me = g.humanId;
  const row = (pid: number) => {
    const p = g.player(pid);
    const r = g.relation(me, pid);
    const isMe = pid === me;
    const status = isMe ? '—' : r.war ? '<span class="status-war">At war</span>' : '<span class="status-peace">Peace</span>';
    const treaty = !isMe && !r.war && !g.canDeclareWar(me, pid) ? `<span class="muted">treaty ${g.s.turn - r.since}/10</span>` : '';
    const action = isMe
      ? ''
      : r.war
        ? `<button data-peace="${pid}">Propose peace</button>`
        : `<button class="danger" data-war="${pid}" ${g.canDeclareWar(me, pid) ? '' : 'disabled'}>Declare war</button>`;
    return `<tr class="${isMe ? 'me' : ''}">
      <td><span class="swatch" style="background:${p.color}"></span> ${esc(p.name)}${p.ruler ? ` <span class="muted">· ${esc(p.ruler)}</span>` : ''}</td>
      <td>${status} ${treaty}</td>
      <td class="num">${g.citiesOf(pid).length}</td>
      <td class="num">${g.militaryStrength(pid)}</td>
      <td class="num">${g.score(pid)}</td>
      <td>${action}</td></tr>`;
  };
  const majors = g.majors().filter((p) => p.alive).map((p) => p.id);
  const minors = g.s.players.filter((p) => p.isMinor && p.alive).map((p) => p.id);
  const head = '<tr><th>Realm</th><th>Relation</th><th class="num">Cities</th><th class="num">Army</th><th class="num">Score</th><th></th></tr>';
  $('diplo-body').innerHTML = `
    <div class="scroll">
      <table class="grid">${head}${majors.map(row).join('')}</table>
      <div class="diplo-section"><h2 style="font:600 15px var(--serif);color:var(--gold)">Independent states</h2>
      <table class="grid">${head}${minors.map(row).join('')}</table></div>
    </div>`;
  $('diplo-body').onclick = (e) => {
    const el = e.target as HTMLElement;
    const war = el.closest<HTMLElement>('[data-war]')?.dataset.war;
    const peace = el.closest<HTMLElement>('[data-peace]')?.dataset.peace;
    if (war !== undefined) h.declareWar(Number(war));
    if (peace !== undefined) h.proposePeace(Number(peace));
  };
  openDialog('dlg-diplo');
}

export function peaceWouldBeAccepted(g: Game, ai: number): boolean {
  return acceptsPeace(g, ai, g.humanId);
}

// ---------------------------------------------------------------- empire

export function showEmpire(g: Game, onCity: (id: number) => void) {
  const me = g.humanId;
  const cities = g.citiesOf(me).sort((a, b) => b.pop - a.pop);
  const rows = cities
    .map((c) => {
      const y = computeCityYields(g, c);
      const cost = c.build ? buildCost(c.build) : 0;
      const prod = effectiveProd(g, c, c.build, y.prod);
      const turns = c.build && c.build.kind !== 'wealth' && prod > 0 ? Math.max(1, Math.ceil((cost - c.prod) / prod)) : '';
      return `<tr data-city="${c.id}" style="cursor:pointer">
        <td>${c.isCapital ? '★ ' : ''}${esc(c.name)}</td><td class="num">${c.pop}</td>
        <td class="num ${y.surplus >= 0 ? 'pos' : 'neg'}">${y.surplus >= 0 ? '+' : ''}${y.surplus}</td>
        <td class="num">${y.prod}</td><td class="num">${y.gold}</td><td class="num">${y.sci}</td>
        <td>${c.build ? esc(buildName(c.build)) : '<span class="neg">— choose —</span>'} <span class="muted">${turns ? `${turns}t` : ''}</span></td>
        <td class="num">${c.unrest > 0 ? `<span class="neg">unrest ${c.unrest}</span>` : ''}</td></tr>`;
    })
    .join('');
  const p = g.player(me);
  $('empire-body').innerHTML = `
    <p class="muted">${cities.length} cities · ${g.unitsOf(me).length} units · ${p.techs.length} techs · score ${g.score(me)}</p>
    <div class="scroll"><table class="grid">
      <tr><th>City</th><th class="num">Pop</th><th class="num">Food</th><th class="num">Prod</th><th class="num">Gold</th><th class="num">Sci</th><th>Building</th><th></th></tr>
      ${rows}
    </table></div>`;
  $('empire-body').onclick = (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-city]')?.dataset.city;
    if (id) {
      closeDialog('dlg-empire');
      onCity(Number(id));
    }
  };
  openDialog('dlg-empire');
}

// ------------------------------------------------------------------ help

export function showHelp() {
  $('help-body').innerHTML = `
  <div class="help-cols">
    <div><h2>Controls</h2><ul>
      <li><b>Left-click</b> a unit or city to select it.</li>
      <li><b>Right-click</b> (or left-click empty ground while a unit is selected) to move or attack. Hover to preview the path; numbers mark where each turn ends.</li>
      <li><b>Drag</b> to pan, <b>wheel</b> or <kbd>+</kbd>/<kbd>−</kbd> to zoom, arrow keys to scroll.</li>
      <li><kbd>Space</kbd>/<kbd>N</kbd> next unit · <kbd>F</kbd> fortify · <kbd>S</kbd> sleep · <kbd>B</kbd> found city · <kbd>C</kbd> centre · <kbd>Del</kbd> disband</li>
      <li>Click the minimap or a log entry to jump there.</li>
      <li><kbd>Enter</kbd> end turn · <kbd>T</kbd> research · <kbd>D</kbd> diplomacy · <kbd>E</kbd> empire · <kbd>Esc</kbd> deselect / menu</li>
    </ul></div>
    <div><h2>Expand &amp; exploit</h2><ul>
      <li>Settlers found cities (3+ tiles apart, not in foreign land). New cities take the name of the nearest real town.</li>
      <li>Cities work their best tiles; set a city's focus in its panel. Citizens with no good tile become specialists (+1 production, gold and science, no food). Food grows population; production builds units, buildings and wonders; gold pays upkeep and can rush-buy.</li>
      <li>Culture pushes borders out to 2 and then 3 tiles. Rivers add gold and act as roads.</li>
      <li>Learn <b>Sailing</b> to embark onto coastal waters (a whole turn to embark/land), <b>Navigation</b> for the open sea.</li>
    </ul></div>
    <div><h2>Exterminate</h2><ul>
      <li>Attack odds depend on strength ratio, terrain, fortification, walls and veterancy — hover an enemy to see the forecast.</li>
      <li>Archers and siege engines shoot two tiles without retaliation; siege is doubly effective against cities.</li>
      <li>Kill every defender, then march a melee or mounted unit in to capture a city.</li>
      <li>Peace treaties last at least 10 turns.</li>
    </ul></div>
    <div><h2>Victory</h2><ul>
      <li><b>Conquest</b>: be the last great power standing.</li>
      <li><b>Domination</b>: hold every great power's original capital.</li>
      <li><b>Enlightenment</b>: be first to research it.</li>
      <li><b>Score</b>: highest score when turn 200 ends (1800 AD).</li>
      <li>You are out of the game when your last city falls.</li>
    </ul></div>
  </div>`;
  openDialog('dlg-help');
}

// ------------------------------------------------------------- game over

export function showGameOver(g: Game, onNew: () => void, onContinue: () => void) {
  const w = g.s.winner!;
  const me = g.humanId;
  const won = w.player === me;
  const kinds = { conquest: 'Conquest', domination: 'Domination', enlightenment: 'Enlightenment', score: 'Score' };
  $('over-title').textContent = won ? 'Victory' : 'Defeat';
  const winner = w.player >= 0 ? g.player(w.player) : null;
  const ranking = g
    .majors()
    .map((p) => ({ p, s: g.score(p.id) }))
    .sort((a, b) => b.s - a.s);
  $('over-body').innerHTML = `
    <p class="subtitle">${winner ? `${esc(winner.name)} — ${kinds[w.kind]} victory in ${g.year()} AD` : 'Your realm has fallen.'}</p>
    <table class="grid">
      <tr><th>Realm</th><th class="num">Cities</th><th class="num">Techs</th><th class="num">Score</th></tr>
      ${ranking.map(({ p, s }) => `<tr class="${p.id === me ? 'me' : ''}"><td><span class="swatch" style="background:${p.color}"></span> ${esc(p.name)}${p.alive ? '' : ' <span class="muted">(destroyed)</span>'}</td><td class="num">${g.citiesOf(p.id).length}</td><td class="num">${p.techs.length}</td><td class="num">${s}</td></tr>`).join('')}
    </table>
    <div class="row-end"><button data-act="look">Look at the map</button><button class="primary" data-act="new">New game</button></div>`;
  $('over-body').onclick = (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'new') {
      closeDialog('dlg-over');
      onNew();
    } else if (act === 'look') {
      closeDialog('dlg-over');
      onContinue();
    }
  };
  openDialog('dlg-over');
}
