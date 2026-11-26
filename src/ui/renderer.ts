// Canvas 2D renderer for the hex map: terrain, rivers, borders, fog, cities,
// units and order overlays. Drawn on demand, culled to the viewport.

import { TERRAIN, RESOURCES, TerrainId } from '../core/data/terrain';
import { UNITS } from '../core/data/units';
import type { Game } from '../core/game';
import { hexCenter, neighbor, pixelToTile, SQRT3 } from '../core/hex';
import { hash2 } from '../core/rng';
import type { PathStep } from '../core/rules/movement';
import type { Unit } from '../core/types';

export const HEX = 30;
const W = SQRT3 * HEX;
const ROW = 1.5 * HEX;

export interface Overlay {
  selectedUnit: Unit | null;
  selectedTile: number;
  hoverTile: number;
  reachable: Map<number, number> | null;
  attackable: Set<number>;
  path: PathStep[] | null;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}

export function textColorFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? '#141414' : '#ffffff';
}

const CORNERS: [number, number][] = Array.from({ length: 6 }, (_, k) => {
  const a = (Math.PI / 180) * (60 * k - 30);
  return [Math.cos(a), Math.sin(a)];
});

export class Renderer {
  camera = { x: 0, y: 0, zoom: 0.8 };
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private tileColor: string[] = [];
  private centers: [number, number][] = [];
  private cache: HTMLCanvasElement | null = null;
  private cacheScale = 0;
  private cacheDirty = true;
  private lastRebuild = 0;
  private rebuildTimer = 0;
  /** called when a deferred cache rebuild needs a new frame */
  onNeedsRedraw: (() => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.setGame(game);
  }

  /** Game state changed: terrain/border/fog layers must be redrawn. */
  invalidate() {
    this.cacheDirty = true;
  }

  setGame(game: Game) {
    this.game = game;
    this.cacheDirty = true;
    const map = game.map;
    this.centers = map.tiles.map((_, i) => hexCenter(i % map.width, Math.floor(i / map.width), HEX));
    this.tileColor = map.tiles.map((t, i) => {
      const h = hash2(i, 11, game.s.seed);
      const f = 0.9 + Math.floor(h * 3) * 0.06;
      return shade(TERRAIN[t.t].color, f);
    });
  }

  get worldWidth() {
    return W * (this.game.map.width + 0.5);
  }

  get worldHeight() {
    return ROW * (this.game.map.height - 1) + 2 * HEX;
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.clampCamera();
  }

  get viewSize() {
    return { w: this.width, h: this.height };
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.camera.x + sx / this.camera.zoom, this.camera.y + sy / this.camera.zoom];
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.camera.x) * this.camera.zoom, (wy - this.camera.y) * this.camera.zoom];
  }

  tileAtScreen(sx: number, sy: number): number {
    const [wx, wy] = this.screenToWorld(sx, sy);
    return pixelToTile(this.game.map, wx, wy, HEX);
  }

  tileScreenPos(tile: number): [number, number] {
    const [x, y] = this.centers[tile];
    return this.worldToScreen(x, y);
  }

  centerOn(tile: number) {
    const [x, y] = this.centers[tile];
    this.camera.x = x - this.width / 2 / this.camera.zoom;
    this.camera.y = y - this.height / 2 / this.camera.zoom;
    this.clampCamera();
  }

  isOnScreen(tile: number, margin = 60): boolean {
    const [sx, sy] = this.tileScreenPos(tile);
    return sx > margin && sy > margin && sx < this.width - margin && sy < this.height - margin;
  }

  pan(dx: number, dy: number) {
    this.camera.x -= dx / this.camera.zoom;
    this.camera.y -= dy / this.camera.zoom;
    this.clampCamera();
  }

  zoomAt(factor: number, sx: number, sy: number) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    const minZoom = Math.max(0.25, Math.min(this.width / this.worldWidth, this.height / this.worldHeight) * 0.9);
    this.camera.zoom = Math.max(minZoom, Math.min(2.4, this.camera.zoom * factor));
    this.camera.x = wx - sx / this.camera.zoom;
    this.camera.y = wy - sy / this.camera.zoom;
    this.clampCamera();
  }

  private clampCamera() {
    const vw = this.width / this.camera.zoom;
    const vh = this.height / this.camera.zoom;
    const margin = 160 / this.camera.zoom;
    const clampAxis = (pos: number, view: number, world: number) =>
      view >= world ? (world - view) / 2 : Math.min(Math.max(pos, -margin), world - view + margin);
    this.camera.x = clampAxis(this.camera.x, vw, this.worldWidth);
    this.camera.y = clampAxis(this.camera.y, vh, this.worldHeight);
  }

  private hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r = HEX + 0.6) {
    ctx.moveTo(cx + CORNERS[0][0] * r, cy + CORNERS[0][1] * r);
    for (let k = 1; k < 6; k++) ctx.lineTo(cx + CORNERS[k][0] * r, cy + CORNERS[k][1] * r);
    ctx.closePath();
  }

  /** Visible tile indices (culling by row/col range). */
  private visibleTiles(): number[] {
    const map = this.game.map;
    const [x0, y0] = this.screenToWorld(0, 0);
    const [x1, y1] = this.screenToWorld(this.width, this.height);
    const r0 = Math.max(0, Math.floor((y0 - 2 * HEX) / ROW));
    const r1 = Math.min(map.height - 1, Math.ceil((y1 + HEX) / ROW));
    const c0 = Math.max(0, Math.floor(x0 / W) - 1);
    const c1 = Math.min(map.width - 1, Math.ceil(x1 / W) + 1);
    const out: number[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * map.width + c);
    return out;
  }

  draw(ov: Overlay) {
    const ctx = this.ctx;
    const g = this.game;
    const z = this.camera.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const tiles = this.visibleTiles();
    const explored = tiles.filter((t) => g.isExplored(t));
    const human = g.humanId;

    if (z < 1) this.drawStaticCached();
    else {
      ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, -this.camera.x * this.dpr * z, -this.camera.y * this.dpr * z);
      this.drawStatic(ctx, explored, z);
    }
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, -this.camera.x * this.dpr * z, -this.camera.y * this.dpr * z);

    // 7. overlays: reachable, attackable, hover, selection
    if (ov.reachable) {
      ctx.beginPath();
      for (const [t, left] of ov.reachable) if (left >= 0) this.hexPath(ctx, this.centers[t][0], this.centers[t][1], HEX - 3);
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fill();
    }
    if (ov.attackable.size) {
      ctx.beginPath();
      for (const t of ov.attackable) this.hexPath(ctx, this.centers[t][0], this.centers[t][1], HEX - 3);
      ctx.strokeStyle = '#ff5a4a';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (ov.hoverTile >= 0) {
      ctx.beginPath();
      this.hexPath(ctx, this.centers[ov.hoverTile][0], this.centers[ov.hoverTile][1], HEX - 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (ov.selectedTile >= 0) {
      ctx.beginPath();
      this.hexPath(ctx, this.centers[ov.selectedTile][0], this.centers[ov.selectedTile][1], HEX - 2);
      ctx.strokeStyle = '#ffd86b';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // 8. path preview
    if (ov.path && ov.path.length && ov.selectedUnit) {
      ctx.beginPath();
      const [sx, sy] = this.centers[ov.selectedUnit.tile];
      ctx.moveTo(sx, sy);
      for (const step of ov.path) ctx.lineTo(this.centers[step.tile][0], this.centers[step.tile][1]);
      ctx.setLineDash([7, 6]);
      ctx.strokeStyle = 'rgba(255,230,150,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
      // turn markers where a turn ends
      for (let k = 0; k < ov.path.length; k++) {
        const s = ov.path[k];
        const next = ov.path[k + 1];
        if (next && next.turn === s.turn) continue;
        const [x, y] = this.centers[s.tile];
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(20,20,20,0.85)';
        ctx.fill();
        ctx.strokeStyle = '#ffe696';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#ffe696';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(s.turn + 1), x, y + 0.5);
      }
    }

    // 9. cities
    for (const t of explored) {
      const city = g.cityAt(t);
      if (city) this.drawCity(city.owner, city.pop, city.isCapital, t);
    }

    // 10. units (visible tiles only)
    for (const t of tiles) {
      if (human >= 0 && !g.visible[t]) continue;
      const units = g.unitsAt(t);
      if (units.length) this.drawUnits(t, units, ov.selectedUnit);
    }

    // 11. screen-space labels for cities
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const t of explored) {
      const city = g.cityAt(t);
      if (!city) continue;
      const [x, y] = this.tileScreenPos(t);
      this.drawCityLabel(city.name, city.pop, g.player(city.owner).color, x, y + HEX * 0.62 * z + 4, city.isCapital, city.owner === human);
    }
  }

  /** Terrain, rivers, resources, borders and fog for the given tiles. */
  private drawStatic(ctx: CanvasRenderingContext2D, explored: number[], z: number) {
    const g = this.game;
    const map = g.map;
    const human = g.humanId;
    // 1. terrain, batched by colour
    const groups = new Map<string, number[]>();
    for (const t of explored) {
      const c = this.tileColor[t];
      let arr = groups.get(c);
      if (!arr) groups.set(c, (arr = []));
      arr.push(t);
    }
    for (const [color, list] of groups) {
      ctx.beginPath();
      for (const t of list) this.hexPath(ctx, this.centers[t][0], this.centers[t][1]);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // 2. terrain decoration
    if (z > 0.45) this.drawDecorations(ctx, explored);

    // 3. rivers
    ctx.strokeStyle = '#4b8fcf';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.2;
    for (const r of map.rivers) {
      ctx.beginPath();
      let drawing = false;
      for (const t of r.path) {
        if (!g.isExplored(t)) {
          drawing = false;
          continue;
        }
        const [x, y] = this.centers[t];
        if (drawing) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        drawing = true;
      }
      ctx.stroke();
    }

    // 4. resources
    if (z > 0.6) {
      for (const t of explored) {
        const res = map.tiles[t].res;
        if (!res) continue;
        const [x, y] = this.centers[t];
        ctx.beginPath();
        ctx.arc(x + HEX * 0.45, y + HEX * 0.38, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = RESOURCES[res].color;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.stroke();
      }
    }

    // 5. territory tint & borders
    const tint = new Map<number, number[]>();
    for (const t of explored) {
      const o = map.tiles[t].owner;
      if (o < 0) continue;
      let arr = tint.get(o);
      if (!arr) tint.set(o, (arr = []));
      arr.push(t);
    }
    for (const [owner, list] of tint) {
      const color = g.player(owner).color;
      ctx.beginPath();
      for (const t of list) this.hexPath(ctx, this.centers[t][0], this.centers[t][1]);
      ctx.globalAlpha = 0.17;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (const t of list) {
        const [cx, cy] = this.centers[t];
        for (let d = 0; d < 6; d++) {
          const n = neighbor(map, t, d);
          if (n >= 0 && map.tiles[n].owner === owner) continue;
          // edge d lies between corners d and d+1
          const r = HEX - 2;
          ctx.moveTo(cx + CORNERS[d][0] * r, cy + CORNERS[d][1] * r);
          ctx.lineTo(cx + CORNERS[(d + 1) % 6][0] * r, cy + CORNERS[(d + 1) % 6][1] * r);
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = owner === human ? 3.4 : 2.6;
      ctx.stroke();
    }

    // 6. fog over explored-but-not-visible tiles
    if (human >= 0) {
      ctx.beginPath();
      for (const t of explored) if (!g.visible[t]) this.hexPath(ctx, this.centers[t][0], this.centers[t][1]);
      ctx.fillStyle = 'rgba(8,10,16,0.42)';
      ctx.fill();
    }

  }

  /** Blit the static layers from an offscreen canvas of the whole map. */
  private drawStaticCached() {
    const z = this.camera.zoom;
    const scale = z * this.dpr;
    const now = performance.now();
    const zoomChanged = this.cacheScale !== scale;
    const canRebuildNow = this.cacheDirty || !this.cache || now - this.lastRebuild > 140;
    if ((this.cacheDirty || zoomChanged) && canRebuildNow) {
      const w = Math.ceil(this.worldWidth * scale);
      const h = Math.ceil(this.worldHeight * scale);
      const c = this.cache ?? document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cctx = c.getContext('2d')!;
      cctx.setTransform(scale, 0, 0, scale, 0, 0);
      const all: number[] = [];
      for (let i = 0; i < this.game.map.tiles.length; i++) if (this.game.isExplored(i)) all.push(i);
      this.drawStatic(cctx, all, z);
      this.cache = c;
      this.cacheScale = scale;
      this.cacheDirty = false;
      this.lastRebuild = now;
    } else if (zoomChanged) {
      // mid-zoom: stretch the stale cache now, rebuild crisply shortly
      window.clearTimeout(this.rebuildTimer);
      this.rebuildTimer = window.setTimeout(() => this.onNeedsRedraw?.(), 150);
    }
    if (!this.cache) return;
    const k = scale / this.cacheScale;
    this.ctx.setTransform(k, 0, 0, k, -this.camera.x * scale, -this.camera.y * scale);
    this.ctx.drawImage(this.cache, 0, 0);
  }

  private drawDecorations(ctx: CanvasRenderingContext2D, tiles: number[]) {
    const map = this.game.map;
    const by: Partial<Record<TerrainId, number[]>> = {};
    for (const t of tiles) (by[map.tiles[t].t] ??= []).push(t);
    const seed = this.game.s.seed;

    // mountains: two peaks with snow caps
    if (by.mountains) {
      ctx.beginPath();
      for (const t of by.mountains) {
        const [x, y] = this.centers[t];
        ctx.moveTo(x - 17, y + 10);
        ctx.lineTo(x - 5, y - 12);
        ctx.lineTo(x + 5, y + 10);
        ctx.moveTo(x - 3, y + 10);
        ctx.lineTo(x + 8, y - 6);
        ctx.lineTo(x + 18, y + 10);
      }
      ctx.fillStyle = '#6c665f';
      ctx.fill();
      ctx.strokeStyle = '#4d4842';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      for (const t of by.mountains) {
        const [x, y] = this.centers[t];
        ctx.moveTo(x - 5, y - 12);
        ctx.lineTo(x - 9.4, y - 4);
        ctx.lineTo(x - 0.6, y - 4);
        ctx.closePath();
      }
      ctx.fillStyle = '#ece8e0';
      ctx.fill();
    }
    // hills: soft humps
    if (by.hills) {
      ctx.beginPath();
      for (const t of by.hills) {
        const [x, y] = this.centers[t];
        ctx.moveTo(x - 16, y + 6);
        ctx.quadraticCurveTo(x - 8, y - 8, x, y + 6);
        ctx.moveTo(x - 2, y + 9);
        ctx.quadraticCurveTo(x + 7, y - 4, x + 16, y + 9);
      }
      ctx.strokeStyle = 'rgba(60,52,30,0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // forest: little conifers
    if (by.forest) {
      ctx.beginPath();
      for (const t of by.forest) {
        const [x, y] = this.centers[t];
        for (let k = 0; k < 3; k++) {
          const ox = (k - 1) * 10 + (hash2(t, k, seed) - 0.5) * 4;
          const oy = (k === 1 ? -5 : 3) + (hash2(t, k + 9, seed) - 0.5) * 4;
          ctx.moveTo(x + ox, y + oy - 9);
          ctx.lineTo(x + ox - 6, y + oy + 5);
          ctx.lineTo(x + ox + 6, y + oy + 5);
          ctx.closePath();
        }
      }
      ctx.fillStyle = '#244a22';
      ctx.fill();
    }
    // marsh: reeds
    if (by.marsh) {
      ctx.beginPath();
      for (const t of by.marsh) {
        const [x, y] = this.centers[t];
        for (let k = -1; k <= 1; k++) {
          ctx.moveTo(x + k * 9 - 5, y + 4 + k * 2);
          ctx.lineTo(x + k * 9 + 5, y + 4 + k * 2);
        }
      }
      ctx.strokeStyle = 'rgba(40,70,70,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // desert: dunes
    if (by.desert) {
      ctx.beginPath();
      for (const t of by.desert) {
        const [x, y] = this.centers[t];
        ctx.moveTo(x - 14, y + 2);
        ctx.quadraticCurveTo(x - 7, y - 5, x, y + 2);
        ctx.moveTo(x + 2, y + 9);
        ctx.quadraticCurveTo(x + 9, y + 2, x + 15, y + 9);
      }
      ctx.strokeStyle = 'rgba(150,120,60,0.8)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    // ocean: faint waves
    const water = [...(by.ocean ?? []), ...(by.coast ?? [])];
    if (water.length && this.camera.zoom > 0.7) {
      ctx.beginPath();
      for (const t of water) {
        if (hash2(t, 77, seed) > 0.35) continue;
        const [x, y] = this.centers[t];
        const ox = (hash2(t, 78, seed) - 0.5) * 16;
        const oy = (hash2(t, 79, seed) - 0.5) * 16;
        ctx.moveTo(x + ox - 7, y + oy);
        ctx.quadraticCurveTo(x + ox - 3.5, y + oy - 4, x + ox, y + oy);
        ctx.quadraticCurveTo(x + ox + 3.5, y + oy + 4, x + ox + 7, y + oy);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
  }

  private drawCity(owner: number, pop: number, capital: boolean, tile: number) {
    const ctx = this.ctx;
    const [x, y] = this.centers[tile];
    const color = this.game.player(owner).color;
    const r = 13 + Math.min(6, pop * 0.6);
    // walls ring
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(15,12,8,0.95)';
    ctx.stroke();
    // keep with crenellations
    const s = r * 0.62;
    ctx.beginPath();
    ctx.moveTo(x - s, y + s * 0.8);
    ctx.lineTo(x - s, y - s * 0.4);
    for (let k = 0; k < 3; k++) {
      const bx = x - s + (k * 2 * s) / 2.5;
      ctx.lineTo(bx, y - s * 0.75);
      ctx.lineTo(bx + s * 0.4, y - s * 0.75);
      ctx.lineTo(bx + s * 0.4, y - s * 0.4);
      ctx.lineTo(bx + s * 0.8, y - s * 0.4);
    }
    ctx.lineTo(x + s, y - s * 0.75);
    ctx.lineTo(x + s, y + s * 0.8);
    ctx.closePath();
    ctx.fillStyle = textColorFor(color) === '#ffffff' ? 'rgba(255,255,255,0.92)' : 'rgba(20,16,10,0.85)';
    ctx.fill();
    if (capital) {
      ctx.beginPath();
      const sx = x;
      const sy = y - r - 3;
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? 3 : 7;
        ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = '#ffd86b';
      ctx.fill();
      ctx.strokeStyle = '#3a2a08';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawCityLabel(name: string, pop: number, color: string, x: number, y: number, capital: boolean, mine: boolean) {
    const ctx = this.ctx;
    const z = this.camera.zoom;
    const size = Math.round(Math.max(10, Math.min(14, 11 * Math.sqrt(z))));
    ctx.font = `${mine ? 600 : 500} ${size}px 'Palatino Linotype', Palatino, Georgia, serif`;
    const text = name;
    const tw = ctx.measureText(text).width;
    const badge = size + 4;
    const w = tw + badge + 12;
    const h = size + 7;
    const lx = x - w / 2;
    ctx.fillStyle = 'rgba(12,12,14,0.82)';
    ctx.beginPath();
    ctx.roundRect(lx, y, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = capital ? 2 : 1.2;
    ctx.stroke();
    // population badge
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(lx + 2, y + 2, badge, h - 4, 3);
    ctx.fill();
    ctx.fillStyle = textColorFor(color);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${size - 1}px system-ui, sans-serif`;
    ctx.fillText(String(pop), lx + 2 + badge / 2, y + h / 2 + 0.5);
    ctx.fillStyle = '#f1ead6';
    ctx.font = `${mine ? 600 : 500} ${size}px 'Palatino Linotype', Palatino, Georgia, serif`;
    ctx.textAlign = 'left';
    ctx.fillText(text, lx + badge + 7, y + h / 2 + 0.5);
  }

  private drawUnits(tile: number, units: Unit[], selected: Unit | null) {
    const ctx = this.ctx;
    const g = this.game;
    const hasCity = !!g.cityAt(tile);
    const [cx, cy] = this.centers[tile];
    const sel = selected && selected.tile === tile ? selected : null;
    // show the selected unit, otherwise the strongest military unit
    const top =
      sel ??
      [...units].sort((a, b) => UNITS[b.type].defense + UNITS[b.type].attack - (UNITS[a.type].defense + UNITS[a.type].attack))[0];
    const x = hasCity ? cx - 15 : cx;
    const y = hasCity ? cy - 15 : cy;
    const color = g.player(top.owner).color;
    const r = 12;
    const embarked = TERRAIN[g.map.tiles[tile].t].water;
    ctx.beginPath();
    if (embarked) {
      // little boat hull
      ctx.moveTo(x - 15, y + 4);
      ctx.lineTo(x + 15, y + 4);
      ctx.lineTo(x + 9, y + 12);
      ctx.lineTo(x - 9, y + 12);
      ctx.closePath();
      ctx.fillStyle = '#5a3d22';
      ctx.fill();
      ctx.beginPath();
    }
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = sel ? 3 : 2;
    ctx.strokeStyle = sel ? '#ffd86b' : top.fortified ? '#9fd59a' : 'rgba(255,255,255,0.9)';
    ctx.stroke();
    if (top.fortified) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3, Math.PI * 0.15, Math.PI * 0.85);
      ctx.strokeStyle = '#9fd59a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = textColorFor(color);
    ctx.font = '700 10.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(UNITS[top.type].abbr, x, y + 0.5);
    // hp bar
    if (top.hp < 100) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(x - 12, y + r + 2, 24, 4);
      ctx.fillStyle = top.hp > 60 ? '#7fbf6a' : top.hp > 30 ? '#e0b84a' : '#e0675a';
      ctx.fillRect(x - 12, y + r + 2, (24 * top.hp) / 100, 4);
    }
    // stack count
    if (units.length > 1) {
      ctx.beginPath();
      ctx.arc(x + r - 1, y - r + 1, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.fillText(String(units.length), x + r - 1, y - r + 1.5);
    }
    // moves-left pip for the human's units
    if (top.owner === g.humanId && top.moves > 0 && !top.fortified && !top.sleeping) {
      ctx.beginPath();
      ctx.arc(x - r + 1, y - r + 1, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#7fe07a';
      ctx.fill();
    }
  }

  /** Minimap: one pixel-ish per tile, plus the viewport rectangle. */
  drawMinimap(canvas: HTMLCanvasElement) {
    const g = this.game;
    const map = g.map;
    const cssW = canvas.clientWidth || 210;
    const scale = cssW / this.worldWidth;
    const cssH = Math.round(this.worldHeight * scale);
    const dpr = this.dpr;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.height = `${cssH}px`;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
    for (let i = 0; i < map.tiles.length; i++) {
      if (!g.isExplored(i)) continue;
      const t = map.tiles[i];
      const [x, y] = this.centers[i];
      ctx.fillStyle = t.owner >= 0 && !TERRAIN[t.t].water ? g.player(t.owner).color : TERRAIN[t.t].color;
      ctx.fillRect(x - W / 2, y - ROW / 2 - 4, W + 1, ROW + 8);
    }
    for (const c of g.s.cities) {
      if (!g.isExplored(c.tile)) continue;
      const [x, y] = this.centers[c.tile];
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 25, y - 25, 50, 50);
    }
    const vw = this.width / this.camera.zoom;
    const vh = this.height / this.camera.zoom;
    ctx.strokeStyle = '#ffd86b';
    ctx.lineWidth = 2 / scale;
    ctx.strokeRect(this.camera.x, this.camera.y, vw, vh);
    return scale;
  }
}


