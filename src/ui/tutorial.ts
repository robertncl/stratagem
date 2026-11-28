// Guided first game: a coach card walks a new player through research,
// production, exploring, founding a city, faith, diplomacy and victory.
// Each task step watches the game and moves on by itself once done.

import { RELIGIONS } from '../core/data/religions';
import { TERRAIN } from '../core/data/terrain';
import { UNITS } from '../core/data/units';
import type { Game } from '../core/game';
import { distance, tilesInRadius } from '../core/hex';
import { isCoastal, tileYield } from '../core/rules/cities';
import { findPath } from '../core/rules/movement';
import type { City } from '../core/types';
import { $, esc } from './dialogs';
import { faithIcon } from './render/faith';

/** The tutorial always plays the same map: France, easy, known world. */
export const TUTORIAL = { nation: 'france', seed: 7, difficulty: 'easy' as const };

export interface TutorialHost {
  readonly game: Game;
  /** id of the city whose panel is open, if any */
  openCity(): number | null;
  centerOn(tile: number): void;
  refresh(): void;
  toast(text: string, ms?: number): void;
}

interface Step {
  title: string;
  body(t: Tutorial): string;
  /** the task is complete; steps without one are read and then Next */
  done?(t: Tutorial): boolean;
  /** element to make glow while the step is shown */
  glow?: string;
  /** tile to point at on the map */
  marker?(t: Tutorial): number;
  /** runs when the step is shown */
  enter?(t: Tutorial): void;
}

const kbd = (k: string) => `<kbd>${k}</kbd>`;

const STEPS: Step[] = [
  {
    title: 'Welcome, Your Majesty',
    body: (t) =>
      `<p>It is 1400, and you rule the <b>${esc(t.me.name)}</b> from Paris. This tutorial walks you through your first turns.</p>
       <p>Drag the map to pan, and use the mouse wheel (or ${kbd('+')} / ${kbd('−')}) to zoom. Press <b>Next</b> when you're ready.</p>`,
    marker: (t) => t.capital()?.tile ?? -1,
    enter: (t) => {
      const cap = t.capital();
      if (cap) t.host.centerOn(cap.tile);
    },
  },
  {
    title: 'Choose your research',
    body: () =>
      `<p>Your scholars need a subject. Click the research button in the top bar (or press ${kbd('T')}) and pick a technology.</p>
       <p>Each one unlocks units, buildings or wonders. <b>Pottery</b> (Granary) and <b>Bronze Working</b> (Spearman) are good first picks.</p>`,
    glow: 'tb-research',
    done: (t) => !!t.me.research || t.me.techs.length > 2,
  },
  {
    title: 'Set production in Paris',
    body: () =>
      `<p>Cities build one thing at a time. Click <b>Paris</b> twice to open it, then pick something from the list. A <b>Settler</b> grows your realm, and a <b>Scout</b> or <b>Levy</b> is quick to train.</p>
       <p>The panel also shows food, production, gold, science and culture, and how long the city takes to grow.</p>`,
    marker: (t) => t.capital()?.tile ?? -1,
    done: (t) => !!t.capital()?.build,
  },
  {
    title: 'Explore with the Scout',
    body: () =>
      `<p>Press ${kbd('Space')} until your <b>Scout</b> is selected, or click it next to Paris. Then <b>right-click</b> a far-off tile to send it there.</p>
       <p>Hover a tile first to preview the path. The numbers mark where each turn ends. Scouts pay just 1 movement for any land.</p>`,
    marker: (t) => t.scout()?.tile ?? -1,
    enter: (t) => {
      const s = t.scout();
      t.scoutStart = s ? s.tile : -1;
    },
    done: (t) => {
      const s = t.scout();
      return !s || s.tile !== t.scoutStart || s.goto !== null || s.moves < UNITS.scout.moves;
    },
  },
  {
    title: 'Guard the capital',
    body: () =>
      `<p>Two <b>Levies</b> stand in Paris. Select one (click Paris once, or press ${kbd('Space')}) and press ${kbd('F')} to <b>fortify</b>. It digs in for +25% defence and stops asking for orders.</p>
       <p>Units in a city already get the fortification bonus, and walls add more.</p>`,
    marker: (t) => t.capital()?.tile ?? -1,
    done: (t) => t.game.unitsOf(t.me.id).some((u) => u.type === 'levy' && (u.fortified || u.sleeping)),
  },
  {
    title: 'End the turn',
    body: () =>
      `<p>The button in the bottom-right corner always names the next thing that needs you: research, production, or a unit waiting for orders.</p>
       <p>When it says <b>End Turn</b>, click it or press ${kbd('Enter')}. Rival realms move, and your cities grow and build.</p>`,
    glow: 'btn-endturn',
    enter: (t) => (t.turnStart = t.game.s.turn),
    done: (t) => t.game.s.turn > t.turnStart,
  },
  {
    title: 'Found a second city',
    body: (t) =>
      `<p>Your <b>Settler</b> founds new cities. The marked tile is a good site: fertile land${t.siteNote()}, three tiles from Paris (cities must be at least three tiles apart).</p>
       <p>Select the Settler, right-click the marked tile, and press ${kbd('B')} (<b>Found city</b>) once it arrives. It may take a turn or two, so end the turn while it travels.</p>`,
    marker: (t) => t.site(),
    enter: (t) => {
      const s = t.site();
      if (s >= 0) t.host.centerOn(s);
    },
    done: (t) => t.game.citiesOf(t.me.id).length >= 2,
  },
  {
    title: 'Run your new city',
    body: (t) =>
      `<p>${esc(t.newCity()?.name ?? 'Your new city')} is yours. Open it (click it twice) and choose what it builds.</p>
       <p>Citizens work tiles within two hexes of the city. Its <b>focus</b> buttons (balanced, food, production, gold) decide which tiles they pick, and worked tiles are outlined on the map while the panel is open. Culture pushes the borders out.</p>`,
    marker: (t) => t.newCity()?.tile ?? -1,
    enter: (t) => {
      const c = t.newCity();
      if (c) t.host.centerOn(c.tile);
    },
    done: (t) => !!t.newCity()?.build,
  },
  {
    title: 'Faith',
    body: (t) => {
      const rel = t.me.religion ?? 'catholic';
      return `<p>The badge on each city's name shows its faith. ${esc(t.me.adjective)} cities follow ${faithIcon(rel, 13)} <b>${RELIGIONS[rel].name}</b>: ${RELIGIONS[rel].effectText} each. Cities of another faith are in <b>dissent</b> and lose 20% production.</p>
       <p>Cities press their faith on their neighbours, and Temples make them press harder. After <b>Theology</b>, train <b>Missionaries</b> and press ${kbd('P')} next to a city to convert it. Rome and Tunis are holy cities, and the Reformation comes with <b>Printing Press</b>.</p>`;
    },
    marker: (t) => t.capital()?.tile ?? -1,
  },
  {
    title: 'War and diplomacy',
    body: () =>
      `<p>The <b>Diplomacy</b> screen (${kbd('D')}) shows every realm's faith, army and score, and lets you declare war or sue for peace. Peace treaties last at least 10 turns.</p>
       <p>Hover an enemy with a unit selected to see the odds before you attack. Archers and siege engines strike from two tiles away. To take a city, kill every defender, then march a melee or mounted unit in.</p>`,
    glow: 'btn-diplomacy',
  },
  {
    title: 'Paths to victory',
    body: () =>
      `<p>Win by <b>Conquest</b> (outlast every great power), <b>Domination</b> (hold every original capital), <b>Enlightenment</b> (research it first) or <b>Score</b> (lead when turn 200 ends, in 1800 AD).</p>
       <p>Press ${kbd('H')} for help at any time, and ${kbd('Esc')} for the menu. The realm is yours. Good luck!</p>`,
    glow: 'btn-help',
  },
];

export class Tutorial {
  index = -1;
  scoutStart = -1;
  turnStart = 0;
  private siteTile = -1;
  private secondCity = -1;
  private completed = false;
  private advanceTimer = 0;
  private glowing: HTMLElement | null = null;
  private el = $('coach');

  constructor(readonly host: TutorialHost) {
    this.el.onclick = (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-tut]')?.dataset.tut;
      if (act === 'next') this.next();
      else if (act === 'back') this.go(this.index - 1);
      else if (act === 'end') this.close(false);
    };
    this.go(0);
  }

  get game(): Game {
    return this.host.game;
  }

  get me() {
    return this.game.player(this.game.humanId);
  }

  capital(): City | undefined {
    return this.game.capitalOf(this.me.id);
  }

  scout() {
    return this.game.unitsOf(this.me.id).find((u) => u.type === 'scout');
  }

  newCity(): City | undefined {
    const c = this.game.city(this.secondCity);
    if (c && c.owner === this.me.id) return c;
    const mine = this.game.citiesOf(this.me.id).filter((x) => !x.isCapital);
    const found = mine.sort((a, b) => b.founded - a.founded || b.id - a.id)[0];
    this.secondCity = found ? found.id : -1;
    return found;
  }

  /** A good city site for the settler, kept while it stays valid. */
  site(): number {
    const g = this.game;
    const settler = g.unitsOf(this.me.id).find((u) => u.type === 'settler');
    if (!settler) return -1;
    if (this.siteTile >= 0 && this.validSite(this.siteTile)) return this.siteTile;
    let best = -1;
    let bestScore = -Infinity;
    for (const t of tilesInRadius(g.map, settler.tile, 5)) {
      if (!this.validSite(t)) continue;
      let s = 0;
      for (const n of tilesInRadius(g.map, t, 2)) {
        const tile = g.map.tiles[n];
        if (tile.owner !== -1 && tile.owner !== this.me.id) continue;
        if (tile.city !== -1 && n !== t) continue;
        const y = tileYield(g, n);
        s += y.food * 1.4 + y.prod + y.gold * 0.6;
      }
      if (g.map.tiles[t].river) s += 3;
      if (isCoastal(g, t)) s += 2;
      s -= distance(g.map, settler.tile, t) * 2;
      if (s > bestScore && findPath(g, settler, t, { maxNodes: 3000 })) {
        bestScore = s;
        best = t;
      }
    }
    this.siteTile = best;
    return best;
  }

  siteNote(): string {
    const t = this.site();
    if (t < 0) return '';
    const notes = [this.game.map.tiles[t].river ? 'a river for gold and quick travel' : '', isCoastal(this.game, t) ? 'the sea for a harbour' : ''].filter(Boolean);
    return notes.length ? `, ${notes.join(' and ')}` : '';
  }

  private validSite(t: number): boolean {
    const g = this.game;
    const tile = g.map.tiles[t];
    if (TERRAIN[tile.t].water || tile.t === 'mountains') return false;
    if (tile.owner !== -1 && tile.owner !== this.me.id) return false;
    if (g.unitsAt(t).some((u) => u.owner !== this.me.id)) return false;
    return g.s.cities.every((c) => distance(g.map, c.tile, t) >= 3);
  }

  /** The tile the current step points at, for the map overlay. */
  get marker(): number {
    const step = STEPS[this.index];
    return step?.marker ? step.marker(this) : -1;
  }

  private go(i: number) {
    if (i < 0 || i >= STEPS.length) return;
    window.clearTimeout(this.advanceTimer);
    this.index = i;
    this.completed = false;
    STEPS[i].enter?.(this);
    this.render();
    this.host.refresh();
  }

  private next() {
    if (this.index >= STEPS.length - 1) return this.close(true);
    this.go(this.index + 1);
  }

  /** Called after every UI refresh: checks whether the task is done. */
  update() {
    const step = STEPS[this.index];
    if (!step || this.completed || !step.done?.(this)) return;
    this.completed = true;
    this.render();
    const at = this.index;
    this.advanceTimer = window.setTimeout(() => {
      if (this.index === at) this.next();
    }, 1100);
  }

  private render() {
    const step = STEPS[this.index];
    this.glowing?.classList.remove('tut-glow');
    this.glowing = step.glow && !this.completed ? document.getElementById(step.glow) : null;
    this.glowing?.classList.add('tut-glow');
    const last = this.index === STEPS.length - 1;
    const task = !!step.done;
    const status = task ? (this.completed ? '<div class="tut-status done">✓ Done</div>' : '<div class="tut-status">Your move</div>') : '';
    this.el.innerHTML = `
      <div class="tut-head"><span class="tut-count">Tutorial · ${this.index + 1} of ${STEPS.length}</span>
        <button class="close" data-tut="end" aria-label="End tutorial" title="End tutorial">✕</button></div>
      <h2>${step.title}</h2>
      <div class="tut-body">${step.body(this)}</div>
      ${status}
      <div class="tut-dots" aria-hidden="true">${STEPS.map((_, k) => `<i class="${k < this.index ? 'past' : k === this.index ? 'now' : ''}"></i>`).join('')}</div>
      <div class="row-end">
        ${this.index > 0 ? '<button data-tut="back">Back</button>' : ''}
        <button data-tut="next" class="${!task || this.completed ? 'primary' : ''}">${last ? 'Finish' : task && !this.completed ? 'Skip step' : 'Next'}</button>
      </div>`;
    this.el.hidden = false;
  }

  /** Hide the coach; `finished` when the player reached the end. */
  close(finished: boolean) {
    window.clearTimeout(this.advanceTimer);
    this.glowing?.classList.remove('tut-glow');
    this.el.hidden = true;
    this.el.innerHTML = '';
    this.el.onclick = null;
    this.index = -1;
    if (finished) this.host.toast('Tutorial complete. The realm is yours!', 4000);
    this.onClose?.();
    this.host.refresh();
  }

  onClose?: () => void;
}
