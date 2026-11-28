// UI controller: input, selection, HUD panels and the turn flow.

import { runAI } from '../core/ai/ai';
import { BUILDINGS } from '../core/data/buildings';
import { TECHS } from '../core/data/techs';
import { RESOURCES, TERRAIN } from '../core/data/terrain';
import { UNITS, isMilitary, isRanged } from '../core/data/units';
import type { Game } from '../core/game';
import { distance } from '../core/hex';
import {
  availableBuilds,
  buildCost,
  buildName,
  buyCost,
  CITY_FOCUSES,
  computeCityYields,
  effectiveProd,
  growthThreshold,
  tileYield,
} from '../core/rules/cities';
import { bestDefender, previewCombat } from '../core/rules/combat';
import { findPath, reachableThisTurn, PathStep } from '../core/rules/movement';
import { DISSENT_PROD_PCT, RELIGIONS } from '../core/data/religions';
import { faithShares, faithYields, holyReligion, preachTargets } from '../core/rules/religion';
import { faithIcon } from './render/faith';
import type { BuildItem, City, CityFocus, LogEntry, Unit } from '../core/types';
import {
  $,
  closeDialog,
  confirmDialog,
  esc,
  peaceWouldBeAccepted,
  showDiplomacy,
  showEmpire,
  showGameOver,
  showHelp,
  showMainMenu,
  showTech,
} from './dialogs';
import { CityTileInfo, Renderer, START_ZOOM, textColorFor } from './renderer';
import * as storage from './storage';
import { Tutorial } from './tutorial';

const FOCUS_LABEL: Record<CityFocus, string> = { balanced: 'Balanced', food: 'Food', production: 'Production', gold: 'Gold' };

export class App {
  game!: Game;
  renderer!: Renderer;
  private canvas = $('map') as HTMLCanvasElement;
  private minimap = $('minimap') as HTMLCanvasElement;
  private selUnit: number | null = null;
  private selTile = -1;
  private cityPanel: number | null = null;
  private hover = -1;
  private hoverPath: PathStep[] | null = null;
  private reach: Map<number, number> | null = null;
  private attackable = new Set<number>();
  private frame = 0;
  private busy = false;
  private unsubscribe: (() => void) | null = null;
  private toastTimer = 0;
  private researchPrompted = -1;
  private bound = false;
  private tutorial: Tutorial | null = null;

  // ------------------------------------------------------------ lifecycle

  start(game: Game, opts: { tutorial?: boolean } = {}) {
    this.tutorial?.close(false);
    this.unsubscribe?.();
    this.game = game;
    game.ai = runAI;
    if (!this.renderer) {
      this.renderer = new Renderer(this.canvas, game);
      this.renderer.onNeedsRedraw = () => this.requestRender();
    } else this.renderer.setGame(game);
    for (const id of ['topbar', 'log', 'corner']) $(id).hidden = false;
    this.renderer.resize();
    this.unsubscribe = game.onLog((e) => this.onLogEntry(e));
    if (!this.bound) this.bindInput();
    this.bound = true;
    this.selUnit = null;
    this.selTile = -1;
    this.closeCityPanel();
    const cap = game.capitalOf(game.humanId);
    this.renderer.camera.zoom = START_ZOOM;
    if (cap) this.renderer.centerOn(cap.tile);
    this.renderLog();
    this.nextUnit(false);
    this.refresh();
    if (opts.tutorial) this.startTutorial();
    else if (game.s.turn === 1) {
      this.toast(`${game.player(game.humanId).ruler} rules ${game.player(game.humanId).name}. Choose a research path and expand your realm.`, 6000);
    }
    if (game.s.winner) this.gameOver();
  }

  private startTutorial() {
    const t = new Tutorial({
      game: this.game,
      openCity: () => this.cityPanel,
      centerOn: (tile) => this.renderer.centerOn(tile),
      refresh: () => this.refresh(),
      toast: (text, ms) => this.toast(text, ms),
    });
    t.onClose = () => {
      if (this.tutorial === t) this.tutorial = null;
    };
    this.tutorial = t;
    this.refresh();
  }

  private get me() {
    return this.game.humanId;
  }

  menu() {
    showMainMenu(
      {
        newGame: (nation, difficulty, seed, reveal) => this.onNewGame?.(nation, difficulty, seed, reveal),
        tutorial: () => this.onTutorial?.(),
        load: (key) => {
          const g = storage.load(key);
          if (!g) return this.toast('That save could not be loaded.');
          closeDialog('dlg-menu');
          this.start(g);
        },
        save: (key) => {
          if (this.game && storage.save(this.game, key)) this.toast('Game saved.');
        },
        resume: () => this.refresh(),
      },
      !!this.game && !this.game.s.winner,
    );
  }

  onNewGame?: (nation: string, difficulty: 'easy' | 'normal' | 'hard', seed: number | undefined, reveal: boolean) => void;
  onTutorial?: () => void;

  // ---------------------------------------------------------------- input

  private bindInput() {
    const c = this.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let down: { x: number; y: number; button: number; moved: boolean } | null = null;
    let pinch = 0;

    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        down = null;
        return;
      }
      down = { x: e.offsetX, y: e.offsetY, button: e.button, moved: false };
    });
    c.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (prev) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pointers.size === 2 && prev) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.renderer.zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = d;
        this.requestRender();
        return;
      }
      if (down && prev) {
        if (!down.moved && Math.hypot(e.offsetX - down.x, e.offsetY - down.y) > 5) {
          down.moved = true;
          c.classList.add('dragging');
        }
        if (down.moved) {
          this.renderer.pan(e.offsetX - prev.x, e.offsetY - prev.y);
          this.hideTooltip();
          this.requestRender();
          return;
        }
      }
      this.setHover(this.renderer.tileAtScreen(e.offsetX, e.offsetY), e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      c.classList.remove('dragging');
      if (pointers.size < 2) pinch = 0;
      if (!down || down.moved || this.busy) {
        down = null;
        return;
      }
      const tile = this.renderer.tileAtScreen(e.offsetX, e.offsetY);
      const button = down.button;
      down = null;
      if (tile < 0) return;
      if (button === 2) this.order(tile);
      else if (button === 0) this.leftClick(tile, e.detail >= 2);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', (e) => {
      pointers.delete(e.pointerId);
      down = null;
      c.classList.remove('dragging');
    });
    c.addEventListener('pointerleave', () => {
      this.hover = -1;
      this.hoverPath = null;
      this.hideTooltip();
      this.requestRender();
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.renderer.zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY);
        this.hideTooltip();
        this.requestRender();
      },
      { passive: false },
    );

    // minimap navigation
    let miniDown = false;
    const miniJump = (e: PointerEvent) => {
      const scale = this.minimap.clientWidth / this.renderer.worldWidth;
      const wx = e.offsetX / scale;
      const wy = e.offsetY / scale;
      const { w, h } = this.renderer.viewSize;
      this.renderer.camera.x = wx - w / 2 / this.renderer.camera.zoom;
      this.renderer.camera.y = wy - h / 2 / this.renderer.camera.zoom;
      this.renderer.pan(0, 0);
      this.requestRender();
    };
    this.minimap.addEventListener('pointerdown', (e) => {
      miniDown = true;
      this.minimap.setPointerCapture(e.pointerId);
      miniJump(e);
    });
    this.minimap.addEventListener('pointermove', (e) => miniDown && miniJump(e));
    this.minimap.addEventListener('pointerup', () => (miniDown = false));

    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.requestRender();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));

    $('btn-endturn').addEventListener('click', () => this.endTurnButton());
    $('tb-research').addEventListener('click', () => this.openTech());
    $('btn-diplomacy').addEventListener('click', () => this.openDiplomacy());
    $('btn-empire').addEventListener('click', () => this.openEmpire());
    $('btn-help').addEventListener('click', () => showHelp());
    $('btn-menu').addEventListener('click', () => this.menu());
    $('log-list').addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tile]')?.dataset.tile;
      if (t !== undefined) {
        this.renderer.centerOn(Number(t));
        this.requestRender();
      }
    });
    $('selection').addEventListener('click', (e) => this.onSelectionClick(e));
    $('city-panel').addEventListener('click', (e) => this.onCityClick(e));
  }

  private onKey(e: KeyboardEvent) {
    if (!this.game || this.busy) return;
    if (document.querySelector('dialog[open]')) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const u = this.selectedUnit();
    const k = e.key;
    const pan = 80;
    switch (k) {
      case 'ArrowLeft':
      case 'a':
        this.renderer.pan(pan, 0);
        break;
      case 'ArrowRight':
        this.renderer.pan(-pan, 0);
        break;
      case 'ArrowUp':
      case 'w':
        this.renderer.pan(0, pan);
        break;
      case 'ArrowDown':
        this.renderer.pan(0, -pan);
        break;
      case 'd':
        if (e.ctrlKey || e.metaKey) return;
        this.openDiplomacy();
        break;
      case '+':
      case '=':
        this.renderer.zoomAt(1.2, this.renderer.viewSize.w / 2, this.renderer.viewSize.h / 2);
        break;
      case '-':
      case '_':
        this.renderer.zoomAt(1 / 1.2, this.renderer.viewSize.w / 2, this.renderer.viewSize.h / 2);
        break;
      case 'Enter':
        this.endTurn();
        break;
      case ' ':
      case 'n':
        if (u) u.goto = null;
        this.nextUnit(true, true);
        break;
      case 'f':
        if (u) this.unitAction('fortify');
        break;
      case 's':
        if (e.ctrlKey || e.metaKey) return;
        if (u) this.unitAction('sleep');
        else this.renderer.pan(0, -pan);
        break;
      case 'b':
        if (u) this.unitAction('found');
        break;
      case 'p':
        if (u) this.unitAction('preach');
        break;
      case 'c':
        if (u) this.renderer.centerOn(u.tile);
        break;
      case 'Delete':
      case 'Backspace':
        if (u) this.unitAction('disband');
        break;
      case 't':
        this.openTech();
        break;
      case 'e':
        this.openEmpire();
        break;
      case 'h':
      case '?':
        showHelp();
        break;
      case 'Escape':
        if (this.cityPanel !== null) this.closeCityPanel();
        else if (this.selUnit !== null || this.selTile >= 0) this.deselect();
        else this.menu();
        break;
      default:
        return;
    }
    e.preventDefault();
    this.refresh();
  }

  // ------------------------------------------------------------ selection

  selectedUnit(): Unit | null {
    if (this.selUnit === null) return null;
    const u = this.game.unit(this.selUnit);
    if (!u || u.owner !== this.me) {
      this.selUnit = null;
      return null;
    }
    return u;
  }

  private deselect() {
    this.selUnit = null;
    this.selTile = -1;
    this.reach = null;
    this.attackable.clear();
    this.hoverPath = null;
  }

  private selectUnit(u: Unit, center = false) {
    this.selUnit = u.id;
    this.selTile = u.tile;
    this.hoverPath = null;
    this.computeReach();
    if (center && !this.renderer.isOnScreen(u.tile, 120)) this.renderer.centerOn(u.tile);
  }

  private computeReach() {
    const u = this.selectedUnit();
    this.attackable.clear();
    if (!u) {
      this.reach = null;
      return;
    }
    this.reach = reachableThisTurn(this.game, u);
    for (const [t, left] of this.reach) if (left < 0 && this.game.canAttack(u, t)) this.attackable.add(t);
    if (isRanged(UNITS[u.type]) && u.moves > 0) {
      for (const other of this.game.s.units) {
        if (other.owner === this.me || !this.game.visible[other.tile]) continue;
        if (this.game.canAttack(u, other.tile)) this.attackable.add(other.tile);
      }
    }
  }

  private leftClick(tile: number, double: boolean) {
    const g = this.game;
    const u = this.selectedUnit();
    const own = g.unitsAt(tile).filter((x) => x.owner === this.me);
    const city = g.cityAt(tile);
    const ownCity = city && city.owner === this.me ? city : undefined;
    // click on empty/enemy ground with a unit selected → move there
    if (u && tile !== u.tile && own.length === 0 && !ownCity) {
      this.order(tile);
      return;
    }
    if (ownCity && (double || (u && u.tile === tile) || own.every((x) => x.moves <= 0 || x.fortified || x.sleeping))) {
      this.deselect();
      this.selTile = tile;
      this.openCityPanel(ownCity.id);
      this.refresh();
      return;
    }
    if (own.length) {
      // cycle through the stack
      const idx = u ? own.findIndex((x) => x.id === u.id) : -1;
      const ready = own.filter((x) => x.moves > 0);
      const next = idx >= 0 ? own[(idx + 1) % own.length] : (ready[0] ?? own[0]);
      this.selectUnit(next);
      this.closeCityPanel();
      this.refresh();
      return;
    }
    this.deselect();
    this.selTile = g.isExplored(tile) ? tile : -1;
    if (city && g.isExplored(tile)) this.openCityPanel(city.id);
    else this.closeCityPanel();
    this.refresh();
  }

  /** Move / attack order toward a tile. */
  private async order(tile: number) {
    const g = this.game;
    const u = this.selectedUnit();
    if (!u || tile === u.tile) return;
    if (u.moves <= 0) {
      u.goto = tile;
      this.toast('No moves left this turn — the order will continue next turn.');
      this.refresh();
      return;
    }
    // Who is there?
    const foreignUnits = g.unitsAt(tile).filter((x) => x.owner !== this.me);
    const city = g.cityAt(tile);
    const occupant = foreignUnits[0]?.owner ?? (city && city.owner !== this.me ? city.owner : -1);
    if (occupant >= 0 && !g.atWar(this.me, occupant) && distance(g.map, u.tile, tile) <= Math.max(1, UNITS[u.type].range ?? 1)) {
      if (!isMilitary(UNITS[u.type])) return this.toast('Civilians cannot attack.');
      if (!g.canDeclareWar(this.me, occupant)) return this.toast(`A peace treaty with ${g.player(occupant).name} is still in force.`);
      const ok = await confirmDialog(`Declare war on ${g.player(occupant).name}?`, 'Attacking breaks the peace. Every one of their units and cities becomes hostile.', 'Declare war');
      if (!ok) return;
      g.declareWar(this.me, occupant);
    }
    if (isRanged(UNITS[u.type]) && g.canAttack(u, tile)) {
      g.attack(u, tile);
    } else if (distance(g.map, u.tile, tile) === 1 && g.canAttack(u, tile)) {
      g.attack(u, tile);
    } else {
      const res = g.moveUnit(u, tile);
      if (!res.moved && !res.combat && u.tile !== tile && u.goto === null) this.toast('That tile cannot be reached.');
    }
    this.afterAction();
  }

  private afterAction() {
    const u = this.selectedUnit();
    if (u) {
      this.selTile = u.tile;
      this.computeReach();
      if (u.moves <= 0 || u.goto !== null) {
        window.setTimeout(() => {
          if (this.selUnit === u.id) this.nextUnit(true);
          this.refresh();
        }, 250);
      }
    } else this.nextUnit(true);
    this.hoverPath = null;
    this.checkWinner();
    this.refresh();
  }

  private idleUnits(): Unit[] {
    return this.game.unitsOf(this.me).filter((u) => u.moves > 0 && !u.fortified && !u.sleeping && u.goto === null);
  }

  private nextUnit(center: boolean, skipCurrent = false) {
    const idle = this.idleUnits();
    if (!idle.length) {
      this.deselect();
      return;
    }
    const cur = this.selUnit;
    let next = idle[0];
    if (cur !== null) {
      const sorted = idle.sort((a, b) => a.id - b.id);
      next = sorted.find((x) => x.id > cur) ?? sorted[0];
      if (!skipCurrent && sorted.some((x) => x.id === cur)) next = sorted.find((x) => x.id === cur)!;
    }
    this.selectUnit(next, center);
    this.closeCityPanel();
  }

  private unitAction(act: string, cityId?: number) {
    const g = this.game;
    const u = this.selectedUnit();
    if (!u) return;
    switch (act) {
      case 'preach': {
        if (u.type !== 'missionary') return;
        const targets = preachTargets(g, u);
        const city = targets.find((c) => c.id === cityId) ?? targets[0];
        if (!city) return this.toast('Move next to a city of another faith to preach there.');
        g.preach(u, city);
        this.renderLog();
        this.nextUnit(true);
        this.refresh();
        return;
      }
      case 'fortify':
        g.fortify(u);
        break;
      case 'sleep':
        g.sleep(u);
        break;
      case 'wake':
        g.wake(u);
        break;
      case 'skip':
        this.nextUnit(true, true);
        return;
      case 'cancel':
        u.goto = null;
        break;
      case 'found': {
        const why = g.canFoundCity(u);
        if (why) return this.toast(why);
        const city = g.foundCity(u);
        if (city) {
          this.selUnit = null;
          this.selTile = city.tile;
          this.openCityPanel(city.id);
          this.refresh();
          return;
        }
        break;
      }
      case 'disband':
        void confirmDialog(`Disband this ${UNITS[u.type].name}?`, 'The unit will be removed permanently.', 'Disband').then((ok) => {
          if (ok) {
            g.disband(u);
            this.nextUnit(true);
            this.refresh();
          }
        });
        return;
    }
    if (act !== 'wake') this.nextUnit(true, true);
    this.refresh();
  }

  private setHover(tile: number, cx: number, cy: number) {
    if (tile !== this.hover) {
      this.hover = tile;
      const u = this.selectedUnit();
      this.hoverPath = u && tile >= 0 && tile !== u.tile && this.game.isExplored(tile) ? findPath(this.game, u, tile, { maxNodes: 6000 }) : null;
      this.requestRender();
    }
    this.showTooltip(tile, cx, cy);
  }

  // ------------------------------------------------------------- tooltip

  private showTooltip(tile: number, cx: number, cy: number) {
    const g = this.game;
    const tip = $('tooltip');
    if (tile < 0 || !g.isExplored(tile)) return this.hideTooltip();
    const t = g.map.tiles[tile];
    const y = tileYield(g, tile);
    const parts: string[] = [];
    parts.push(`<h4>${TERRAIN[t.t].name}${t.river ? ' · River' : ''}${t.res ? ` · ${RESOURCES[t.res].name}` : ''}</h4>`);
    parts.push(`<div><span class="ico food"></span> ${y.food} &nbsp;<span class="ico prod"></span> ${y.prod} &nbsp;<span class="ico gold"></span> ${y.gold}${TERRAIN[t.t].defense ? ` &nbsp;· defence ${TERRAIN[t.t].defense > 0 ? '+' : ''}${Math.round(TERRAIN[t.t].defense * 100)}%` : ''}</div>`);
    if (t.owner >= 0) parts.push(`<div class="muted">${esc(g.player(t.owner).name)}</div>`);
    const city = g.cityAt(tile);
    if (city) parts.push(`<div><b>${esc(city.name)}</b> (size ${city.pop})${city.religion ? ` · ${faithIcon(city.religion, 12)} ${RELIGIONS[city.religion].adjective}` : ''}</div>`);
    if (g.visible[tile] || g.humanId < 0) {
      const units = g.unitsAt(tile);
      if (units.length) {
        parts.push(
          `<div>${units
            .slice(0, 6)
            .map((u) => `${esc(g.player(u.owner).adjective)} ${UNITS[u.type].name} <span class="muted">${u.hp}hp</span>`)
            .join('<br>')}${units.length > 6 ? `<br>+${units.length - 6} more` : ''}</div>`,
        );
      }
    }
    const sel = this.selectedUnit();
    if (sel && this.attackable.has(tile)) {
      const def = bestDefender(g, tile, sel);
      if (def) {
        const ranged = isRanged(UNITS[sel.type]);
        const p = previewCombat(g, sel, def, ranged);
        const kill = p.toDefender >= def.hp;
        const die = p.toAttacker >= sel.hp;
        parts.push(
          `<div class="odds"><b>Attack</b> ${p.attack.toFixed(1)} vs ${p.defense.toFixed(1)}<br>` +
            `Enemy loses ~${Math.round(Math.min(def.hp, p.toDefender))} HP${kill ? ' <span class="pos">(likely destroyed)</span>' : ''}<br>` +
            (ranged ? 'No retaliation' : `You lose ~${Math.round(Math.min(sel.hp, p.toAttacker))} HP${die ? ' <span class="neg">(likely destroyed)</span>' : ''}`) +
            `</div>`,
        );
      }
    } else if (sel && this.hoverPath && this.hoverPath.length) {
      const turns = this.hoverPath[this.hoverPath.length - 1].turn + 1;
      parts.push(`<div class="odds">${turns === 1 ? 'Reachable this turn' : `${turns} turns away`}</div>`);
    }
    tip.innerHTML = parts.join('');
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(cx + 16, window.innerWidth - r.width - 8)}px`;
    tip.style.top = `${Math.min(cy + 16, window.innerHeight - r.height - 8)}px`;
  }

  private hideTooltip() {
    $('tooltip').hidden = true;
  }

  // ----------------------------------------------------------------- HUD

  refresh() {
    if (!this.game) return;
    this.renderer.invalidate();
    this.renderTopbar();
    this.renderSelection();
    this.renderCityPanel();
    this.renderEndTurn();
    this.requestRender();
    this.tutorial?.update();
  }

  /** Tiles of the open city (if it is ours), for the worked-tile overlay. */
  private openCityTiles(): CityTileInfo[] | null {
    if (this.cityPanel === null) return null;
    const city = this.game.city(this.cityPanel);
    if (!city || city.owner !== this.me) return null;
    const y = computeCityYields(this.game, city);
    const worked = new Set(y.worked);
    return y.tiles.map(({ t, y: ty }) => ({ tile: t, worked: worked.has(t), ...ty }));
  }

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.draw({
        selectedUnit: this.selectedUnit(),
        selectedTile: this.selTile,
        hoverTile: this.hover,
        reachable: this.reach,
        attackable: this.attackable,
        path: this.hoverPath,
        cityTiles: this.openCityTiles(),
        marker: this.tutorial?.marker,
      });
      this.renderer.drawMinimap(this.minimap);
    });
  }

  private empireTotals() {
    const g = this.game;
    let gold = 0;
    let sci = 0;
    let upkeep = 0;
    for (const c of g.citiesOf(this.me)) {
      const y = computeCityYields(g, c);
      gold += y.gold;
      sci += y.sci;
      upkeep += c.buildings.reduce((s, b) => s + BUILDINGS[b].upkeep, 0);
    }
    const units = g.unitsOf(this.me).length;
    const unitUpkeep = Math.max(0, units - (3 + g.citiesOf(this.me).length));
    return { gold, sci, upkeep: upkeep + unitUpkeep, net: gold - upkeep - unitUpkeep };
  }

  private renderTopbar() {
    const g = this.game;
    const p = g.player(this.me);
    ($('tb-swatch') as HTMLElement).style.background = p.color;
    $('tb-nation').textContent = p.name;
    $('tb-faith').innerHTML = p.religion ? `${faithIcon(p.religion, 16)}` : '';
    $('tb-faith').title = p.religion ? `State religion: ${RELIGIONS[p.religion].name}` : '';
    const t = this.empireTotals();
    $('tb-gold').innerHTML = `${p.gold} <span class="${t.net >= 0 ? 'pos' : 'neg'}">(${t.net >= 0 ? '+' : ''}${t.net})</span>`;
    const r = p.research ? TECHS[p.research] : null;
    const rc = r ? g.techCost(this.me, r.id) : 0;
    const goal = p.researchGoal && p.researchGoal !== p.research ? ` <span class="muted">→ ${esc(TECHS[p.researchGoal].name)}</span>` : '';
    $('tb-sci').innerHTML = r
      ? `${esc(r.name)} ${Math.min(p.researchProgress, rc)}/${rc} <span class="muted">(+${t.sci}, ${t.sci > 0 ? Math.max(1, Math.ceil((rc - p.researchProgress) / t.sci)) : '∞'}t)</span>${goal}`
      : g.availableTechs(this.me).length
        ? `<span class="neg">Choose research</span> <span class="muted">(+${t.sci})</span>`
        : 'All knowledge attained';
    $('tb-research').classList.toggle('needed', !p.research && g.availableTechs(this.me).length > 0);
    $('tb-turn').innerHTML = `Turn ${g.s.turn}/${g.s.maxTurns} · <b>${g.year()} AD</b>`;
  }

  private renderSelection() {
    const g = this.game;
    const el = $('selection');
    const u = this.selectedUnit();
    if (!u) {
      if (this.selTile >= 0 && this.cityPanel === null && g.isExplored(this.selTile)) {
        const t = g.map.tiles[this.selTile];
        const y = tileYield(g, this.selTile);
        el.innerHTML = `<div class="sel-head"><h2>${TERRAIN[t.t].name}</h2></div>
          <div class="stats"><span>Food <b>${y.food}</b></span><span>Prod <b>${y.prod}</b></span><span>Gold <b>${y.gold}</b></span>
          ${t.res ? `<span>${RESOURCES[t.res].name}</span>` : ''}${t.river ? '<span>River</span>' : ''}
          ${t.owner >= 0 ? `<span>${esc(g.player(t.owner).name)}</span>` : '<span>Unclaimed</span>'}</div>`;
        el.hidden = false;
      } else el.hidden = true;
      return;
    }
    const def = UNITS[u.type];
    const p = g.player(u.owner);
    const status = u.goto !== null ? 'Marching' : u.fortified ? 'Fortified' : u.sleeping ? 'Sleeping' : TERRAIN[g.map.tiles[u.tile].t].water ? 'Embarked' : '';
    const stack = g.unitsAt(u.tile).filter((x) => x.owner === this.me);
    const city = g.cityAt(u.tile);
    const actions: string[] = [];
    if (u.type === 'settler') actions.push(`<button class="primary" data-act="found" ${g.canFoundCity(u) ? `title="${esc(g.canFoundCity(u)!)}"` : ''}>Found city <kbd>B</kbd></button>`);
    if (u.type === 'missionary') {
      for (const c of preachTargets(g, u)) actions.push(`<button class="primary" data-act="preach" data-city="${c.id}">Preach in ${esc(c.name)} <kbd>P</kbd></button>`);
    }
    if (isMilitary(def)) actions.push(`<button data-act="fortify">Fortify <kbd>F</kbd></button>`);
    actions.push(`<button data-act="sleep">Sleep <kbd>S</kbd></button>`);
    if (u.fortified || u.sleeping) actions.push(`<button data-act="wake">Wake</button>`);
    if (u.goto !== null) actions.push(`<button data-act="cancel">Cancel march</button>`);
    actions.push(`<button data-act="skip">Skip <kbd>Space</kbd></button>`);
    actions.push(`<button data-act="disband">Disband</button>`);
    if (city && city.owner === this.me) actions.push(`<button data-act="city">${esc(city.name)} →</button>`);
    el.innerHTML = `
      <div class="sel-head">
        <div class="token" style="background:${p.color};color:${textColorFor(p.color)}">${def.abbr}</div>
        <div><h2>${def.name}${u.veteran ? ' ★' : ''}${u.religion ? ` ${faithIcon(u.religion, 16)}` : ''}</h2><div class="muted" style="font-size:12px">${u.religion ? `Preaches ${RELIGIONS[u.religion].name}. ` : ''}${esc(def.description)}</div></div>
      </div>
      <div class="stats">
        ${def.cls !== 'civilian' ? `<span>Attack <b>${def.attack}</b></span><span>Defence <b>${def.defense}</b></span>` : ''}
        ${def.ranged ? `<span>Ranged <b>${def.ranged}</b> (range ${def.range})</span>` : ''}
        <span>Moves <b>${u.moves}/${def.moves}</b></span>
        <span>HP <span class="hpbar"><i style="width:${u.hp}%;background:${u.hp > 60 ? 'var(--good)' : u.hp > 30 ? '#e0b84a' : 'var(--bad)'}"></i></span> <b>${u.hp}</b></span>
        ${status ? `<span><b>${status}</b></span>` : ''}
      </div>
      <div class="actions">${actions.join('')}</div>
      ${stack.length > 1 ? `<div class="stack">${stack.map((x) => `<button data-unit="${x.id}" class="${x.id === u.id ? 'on' : ''}">${UNITS[x.type].abbr} ${x.hp < 100 ? x.hp : ''}${x.moves > 0 ? '' : ' ·'}</button>`).join('')}</div>` : ''}
      <div class="hint">${u.type === 'missionary' ? 'Right-click to move. Stand next to or inside a city of another faith, then preach.' : `Right-click to move or attack. ${isRanged(def) ? 'Ranged units strike from two tiles away.' : ''}`}</div>`;
    el.hidden = false;
  }

  private onSelectionClick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    const act = el.closest<HTMLElement>('[data-act]')?.dataset.act;
    const unit = el.closest<HTMLElement>('[data-unit]')?.dataset.unit;
    if (unit) {
      const u = this.game.unit(Number(unit));
      if (u) this.selectUnit(u);
      this.refresh();
      return;
    }
    if (act === 'city') {
      const u = this.selectedUnit();
      const c = u && this.game.cityAt(u.tile);
      if (c) {
        this.deselect();
        this.selTile = c.tile;
        this.openCityPanel(c.id);
        this.refresh();
      }
      return;
    }
    const city = el.closest<HTMLElement>('[data-city]')?.dataset.city;
    if (act) this.unitAction(act, city !== undefined ? Number(city) : undefined);
  }

  // ---------------------------------------------------------- city panel

  private openCityPanel(id: number) {
    this.cityPanel = id;
    document.body.classList.add('city-open');
    this.renderCityPanel();
  }

  private closeCityPanel() {
    this.cityPanel = null;
    $('city-panel').hidden = true;
    document.body.classList.remove('city-open');
  }

  private renderCityPanel() {
    const el = $('city-panel');
    if (this.cityPanel === null) return void (el.hidden = true);
    const g = this.game;
    const city = g.city(this.cityPanel);
    if (!city) return this.closeCityPanel();
    const owner = g.player(city.owner);
    if (city.owner !== this.me) {
      const defenders = g.visible[city.tile] ? g.unitsAt(city.tile).length : '?';
      el.innerHTML = `
        <div class="cp-head"><h2>${esc(city.name)}<div class="sub"><span class="swatch" style="background:${owner.color}"></span> ${esc(owner.name)}</div></h2>
        <button class="close" data-act="close" aria-label="Close">✕</button></div>
        <div class="cp-body">
          <p>Size <b>${city.pop}</b>${city.isCapital ? ' · Capital' : ''} · defenders: <b>${defenders}</b></p>
          <p>Relation: ${g.atWar(this.me, city.owner) ? '<span class="status-war">At war</span>' : '<span class="status-peace">Peace</span>'}</p>
          ${this.faithBlock(city)}
          ${city.buildings.length ? `<h3>Known buildings</h3><div class="chips">${city.buildings.map((b) => `<span class="chip ${BUILDINGS[b].wonder ? 'wonder' : ''}">${BUILDINGS[b].name}</span>`).join('')}</div>` : ''}
        </div>`;
      el.hidden = false;
      return;
    }
    const y = computeCityYields(g, city);
    const need = growthThreshold(city.pop);
    const growTurns = y.surplus > 0 ? Math.ceil((need - city.food) / y.surplus) : null;
    const cost = city.build ? buildCost(city.build) : 0;
    const prod = effectiveProd(g, city, city.build, y.prod);
    const turns = city.build && city.build.kind !== 'wealth' && prod > 0 ? Math.max(1, Math.ceil((cost - city.prod) / prod)) : null;
    const buy = buyCost(g, city);
    const items = availableBuilds(g, city);
    const itemRow = (b: BuildItem) => {
      const c = buildCost(b);
      const pr = effectiveProd(g, city, b, y.prod);
      const t = b.kind === 'wealth' ? '' : pr > 0 ? `${Math.max(1, Math.ceil(Math.max(0, c - (city.build && sameItem(city.build, b) ? city.prod : 0)) / pr))} turns` : '—';
      const desc = b.kind === 'unit' ? UNITS[b.id].description : b.kind === 'building' ? BUILDINGS[b.id].description : 'Convert production into gold.';
      const stats = b.kind === 'unit' && UNITS[b.id].cls !== 'civilian' ? ` · ${UNITS[b.id].attack}/${UNITS[b.id].defense}${UNITS[b.id].ranged ? ` R${UNITS[b.id].ranged}` : ''}` : '';
      const on = city.build && sameItem(city.build, b);
      const key = b.kind === 'wealth' ? 'wealth:' : `${b.kind}:${b.id}`;
      return `<button data-build="${key}" class="${on ? 'on' : ''}"><span class="bname">${buildName(b)}${b.kind === 'building' && BUILDINGS[b.id].wonder ? ' ★' : ''}</span><span class="bturns">${b.kind === 'wealth' ? '' : `${c} · ${t}`}</span><span class="bdesc">${esc(desc)}${stats}</span></button>`;
    };
    const units = items.filter((b) => b.kind === 'unit');
    const buildings = items.filter((b) => b.kind === 'building' && !BUILDINGS[b.id].wonder);
    const wonders = items.filter((b) => b.kind === 'building' && BUILDINGS[b.id].wonder);
    const wealth = items.filter((b) => b.kind === 'wealth');
    el.innerHTML = `
      <div class="cp-head"><h2>${city.isCapital ? '★ ' : ''}${esc(city.name)}<div class="sub">Size ${city.pop} · founded ${g.year(city.founded)} AD${city.unrest ? ` · <span class="neg">unrest ${city.unrest} turns</span>` : ''}</div></h2>
      <button class="close" data-act="close" aria-label="Close">✕</button></div>
      <div class="cp-body">
        <div class="yields">
          <div><span class="ico food"></span><b class="${y.surplus >= 0 ? 'pos' : 'neg'}">${y.surplus >= 0 ? '+' : ''}${y.surplus}</b>food</div>
          <div><span class="ico prod"></span><b>${y.prod}</b>prod</div>
          <div><span class="ico gold"></span><b>${y.gold}</b>gold</div>
          <div><span class="ico sci"></span><b>${y.sci}</b>sci</div>
          <div><span class="ico cult"></span><b>${y.culture}</b>culture</div>
        </div>
        <div style="margin-top:8px;font-size:12px">Growth ${city.food}/${need} ${growTurns ? `· ${growTurns} turns` : y.surplus < 0 ? '· <span class="neg">starving</span>' : '· stagnant'}</div>
        <div class="bar food"><i style="width:${Math.min(100, (city.food / need) * 100)}%"></i></div>
        <h3>Citizens</h3>
        <div class="focus" role="group" aria-label="City focus">${CITY_FOCUSES.map((f) => `<button data-focus="${f}" class="${(city.focus ?? 'balanced') === f ? 'on' : ''}" aria-pressed="${(city.focus ?? 'balanced') === f}">${FOCUS_LABEL[f]}</button>`).join('')}</div>
        <div class="hint">Working ${y.worked.length} of ${y.tiles.length} tiles${y.idle ? ` · <span class="neg">${y.idle} idle: the city has outgrown its land</span>` : ''}. Worked tiles are outlined on the map.</div>
        <h3>Faith</h3>
        ${this.faithBlock(city)}
        <h3>Production</h3>
        <div class="build-current">
          ${city.build ? `<b>${buildName(city.build)}</b> <span class="muted">${city.build.kind === 'wealth' ? `+${Math.floor(y.prod / 2)} gold/turn` : `${Math.min(city.prod, cost)}/${cost} · ${turns ?? '∞'} turns`}</span>` : '<span class="neg">Nothing — choose below</span>'}
          ${city.build && city.build.kind !== 'wealth' ? `<div class="bar prod"><i style="width:${Math.min(100, (city.prod / Math.max(1, cost)) * 100)}%"></i></div>` : ''}
          ${buy !== null ? `<button data-act="buy" ${g.player(this.me).gold < buy ? 'disabled' : ''} style="margin-top:6px">Buy for ${buy} gold</button>` : ''}
          ${city.build?.kind === 'unit' && city.build.id === 'settler' && city.pop < 2 ? '<div class="hint">Settlers need the city to reach size 2.</div>' : ''}
        </div>
        <h3>Units</h3><div class="build-list">${units.map(itemRow).join('')}</div>
        ${buildings.length ? `<h3>Buildings</h3><div class="build-list">${buildings.map(itemRow).join('')}</div>` : ''}
        ${wonders.length ? `<h3>World wonders</h3><div class="build-list">${wonders.map(itemRow).join('')}</div>` : ''}
        <h3>Other</h3><div class="build-list">${wealth.map(itemRow).join('')}</div>
        ${city.buildings.length ? `<h3>Built</h3><div class="chips">${city.buildings.map((b) => `<span class="chip ${BUILDINGS[b].wonder ? 'wonder' : ''}" title="${esc(BUILDINGS[b].description)}">${BUILDINGS[b].name}</span>`).join('')}</div>` : ''}
      </div>`;
    el.hidden = false;
  }

  /** Faith of a city: what it follows, what that gives, and how its people are split. */
  private faithBlock(city: City): string {
    const g = this.game;
    if (!city.religion) return '';
    const rel = RELIGIONS[city.religion];
    const holy = holyReligion(g, city);
    const mine = city.owner === this.me;
    const fy = faithYields(g, city);
    const gains = [fy.culture && `+${fy.culture} culture`, fy.sci && `+${fy.sci} science`, fy.gold && `+${fy.gold} gold`].filter(Boolean).join(', ');
    const shares = faithShares(city).filter((x) => x.share >= 0.02);
    const state = g.player(city.owner).religion;
    const dissent = state && state !== city.religion;
    return `<div class="faith">
        <div>${faithIcon(city.religion, 16)} <b>${rel.name}</b>${holy ? ` · <span class="holy">holy city of ${RELIGIONS[holy].name}</span>` : ''}${mine && gains ? ` <span class="muted">· ${gains}</span>` : ''}</div>
        ${shares.length > 1 ? `<div class="faith-bar" aria-label="Followers">${shares.map((x) => `<i style="width:${(x.share * 100).toFixed(1)}%;background:${RELIGIONS[x.religion].color}" title="${RELIGIONS[x.religion].name} ${Math.round(x.share * 100)}%"></i>`).join('')}</div>
        <div class="faith-legend">${shares.map((x) => `<span>${faithIcon(x.religion, 11)} ${RELIGIONS[x.religion].adjective} ${Math.round(x.share * 100)}%</span>`).join('')}</div>` : ''}
        ${dissent && mine ? `<div class="neg" style="font-size:12px">Dissent: your state religion is ${RELIGIONS[state].name}. −${Math.round(DISSENT_PROD_PCT * 100)}% production until a Missionary converts the city.</div>` : ''}
      </div>`;
  }

  private onCityClick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    const act = el.closest<HTMLElement>('[data-act]')?.dataset.act;
    const build = el.closest<HTMLElement>('[data-build]')?.dataset.build;
    const city = this.cityPanel !== null ? this.game.city(this.cityPanel) : undefined;
    if (act === 'close') {
      this.closeCityPanel();
      this.selTile = -1;
      this.refresh();
      return;
    }
    if (!city || city.owner !== this.me) return;
    const focus = el.closest<HTMLElement>('[data-focus]')?.dataset.focus as CityFocus | undefined;
    if (focus) this.game.setFocus(city, focus);
    if (act === 'buy') {
      if (this.game.buy(city)) this.toast(`Purchased — ${buildName(city.build)} will be ready next turn.`);
    }
    if (build) {
      const [kind, id] = build.split(':');
      const item: BuildItem = kind === 'wealth' ? { kind: 'wealth' } : ({ kind, id } as BuildItem);
      this.game.setBuild(city, item);
    }
    this.refresh();
  }

  // ----------------------------------------------------------- end turn

  private pendingStep(): { label: string; run: () => void } | null {
    const g = this.game;
    const p = g.player(this.me);
    if (!p.research && g.availableTechs(this.me).length) return { label: 'Choose Research', run: () => this.openTech() };
    const idleCity = g.citiesOf(this.me).find((c) => !c.build);
    if (idleCity)
      return {
        label: 'Choose Production',
        run: () => {
          this.deselect();
          this.selTile = idleCity.tile;
          this.renderer.centerOn(idleCity.tile);
          this.openCityPanel(idleCity.id);
          this.refresh();
        },
      };
    const idle = this.idleUnits();
    if (idle.length)
      return {
        label: `Next Unit (${idle.length})`,
        run: () => {
          this.nextUnit(true, true);
          this.refresh();
        },
      };
    return null;
  }

  private renderEndTurn() {
    const btn = $('btn-endturn') as HTMLButtonElement;
    const step = this.pendingStep();
    btn.textContent = step ? step.label : 'End Turn';
    btn.title = step ? 'Press Enter to end the turn anyway' : 'End turn (Enter)';
    btn.classList.toggle('primary', !step);
    btn.disabled = this.busy || !!this.game.s.winner;
  }

  private endTurnButton() {
    const step = this.pendingStep();
    if (step) step.run();
    else this.endTurn();
  }

  endTurn() {
    if (this.busy || this.game.s.winner) return;
    this.busy = true;
    $('busy').hidden = false;
    this.renderEndTurn();
    window.setTimeout(() => {
      try {
        this.game.endTurn();
      } finally {
        this.busy = false;
        $('busy').hidden = true;
      }
      storage.save(this.game, storage.AUTOSAVE);
      this.afterTurn();
    }, 30);
  }

  private async afterTurn() {
    const g = this.game;
    this.renderLog();
    if (this.checkWinner()) return;
    // peace offers from AIs
    for (const prop of [...g.s.proposals]) {
      if (prop.to !== this.me) continue;
      g.s.proposals = g.s.proposals.filter((x) => x !== prop);
      if (!g.atWar(prop.from, this.me)) continue;
      const ok = await confirmDialog(`${g.player(prop.from).name} sues for peace`, `${g.player(prop.from).ruler || 'Their envoys'} offer${g.player(prop.from).ruler ? 's' : ''} to end the war. A treaty will last at least 10 turns.`, 'Accept peace', false);
      if (ok) g.makePeace(prop.from, this.me);
    }
    this.selUnit = null;
    this.nextUnit(true);
    this.computeReach();
    this.refresh();
    const p = g.player(this.me);
    if (!p.research && g.availableTechs(this.me).length && this.researchPrompted !== g.s.turn) {
      this.researchPrompted = g.s.turn;
      this.openTech();
    }
  }

  private checkWinner(): boolean {
    if (!this.game.s.winner) return false;
    this.gameOver();
    return true;
  }

  private gameOver() {
    showGameOver(
      this.game,
      () => this.menu(),
      () => this.refresh(),
    );
  }

  // ------------------------------------------------------------- dialogs

  private openTech() {
    showTech(this.game, {
      research: (tech) => {
        this.game.setResearchGoal(this.me, null);
        this.game.setResearch(this.me, tech);
        this.refresh();
      },
      goal: (tech) => {
        this.game.setResearchGoal(this.me, tech);
        if (tech) this.toast(`Research goal: ${TECHS[tech].name}. Each step will be chosen for you.`);
        this.refresh();
      },
    });
  }

  private openDiplomacy() {
    const g = this.game;
    showDiplomacy(g, {
      declareWar: async (pid) => {
        closeDialog('dlg-diplo');
        const ok = await confirmDialog(`Declare war on ${g.player(pid).name}?`, 'Their armies and cities become hostile at once.', 'Declare war');
        if (ok) g.declareWar(this.me, pid);
        this.refresh();
        this.renderLog();
      },
      proposePeace: (pid) => {
        if (peaceWouldBeAccepted(g, pid)) {
          g.makePeace(this.me, pid);
          this.toast(`${g.player(pid).name} accepts peace.`);
        } else this.toast(`${g.player(pid).name} refuses — they believe the war still favours them.`);
        closeDialog('dlg-diplo');
        this.refresh();
        this.renderLog();
      },
    });
  }

  private openEmpire() {
    showEmpire(this.game, (id) => {
      const c = this.game.city(id);
      if (!c) return;
      this.deselect();
      this.selTile = c.tile;
      this.renderer.centerOn(c.tile);
      this.openCityPanel(id);
      this.refresh();
    });
  }

  // ----------------------------------------------------------------- log

  private relevant(e: LogEntry): boolean {
    const me = this.me;
    if (e.players.includes(me)) return true;
    if (e.players.length === 0) return true;
    if (e.kind === 'wonder' || e.kind === 'war' || e.kind === 'peace') return !e.players.every((p) => this.game.player(p).isMinor);
    if (e.kind === 'tech') return false;
    return e.tile !== undefined && !!this.game.visible[e.tile];
  }

  private onLogEntry(e: LogEntry) {
    if (!this.busy && this.relevant(e)) this.renderLog();
  }

  private renderLog() {
    const entries = this.game.s.log.filter((e) => this.relevant(e)).slice(-60);
    $('log-list').innerHTML = entries
      .map((e) => `<li class="${e.kind}" ${e.tile !== undefined ? `data-tile="${e.tile}"` : ''}><span class="t">${this.game.year(e.turn)}</span>${esc(e.text)}</li>`)
      .join('');
    const log = $('log');
    log.scrollTop = log.scrollHeight;
  }

  toast(text: string, ms = 3200) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (t.hidden = true), ms);
  }
}

function sameItem(a: BuildItem, b: BuildItem): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'wealth') return true;
  return (a as { id: string }).id === (b as { id: string }).id;
}
