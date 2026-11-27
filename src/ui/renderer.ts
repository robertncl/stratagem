// Canvas 2D renderer for the hex map.
//
// The map is drawn in two cached layers plus a live layer:
//   terrain  – textures, terrain blending, coastlines, relief, forests, rivers
//              and resources. Depends only on the map, so it is rendered once
//              per zoom level.
//   politics – territory tint, borders, fog of war and unexplored land.
//              Re-rendered whenever the game state changes (invalidate()).
//   live     – selection, paths, cities, units and labels, drawn every frame.
//
// Both cached layers are split into square chunks of tiles, rendered lazily
// for the visible part of the map at the current zoom bucket and blitted each
// frame. Chunks that are out of date are redrawn under a per-frame time budget
// so panning and zooming stay smooth.

import { TERRAIN, TerrainId } from '../core/data/terrain';
import { UNITS } from '../core/data/units';
import type { Game } from '../core/game';
import { hexCenter, neighbor, pixelToTile, SQRT3 } from '../core/hex';
import { fbm, hash2 } from '../core/rng';
import type { PathStep } from '../core/rules/movement';
import type { City, Unit } from '../core/types';
import { drawResourceBadge, drawUnitEmblem, shieldPath } from './render/icons';
import { terrainPatterns } from './render/textures';

export const HEX = 30;
const W = SQRT3 * HEX;
const ROW = 1.5 * HEX;

export interface CityTileInfo {
  tile: number;
  worked: boolean;
  food: number;
  prod: number;
  gold: number;
}

export interface Overlay {
  selectedUnit: Unit | null;
  selectedTile: number;
  hoverTile: number;
  reachable: Map<number, number> | null;
  attackable: Set<number>;
  path: PathStep[] | null;
  /** tiles of the open city, with what each yields and whether it is worked */
  cityTiles: CityTileInfo[] | null;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function mix(a: string, b: string, k: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
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

/** Which land terrain bleeds into which: higher ranks soften into lower. */
const BLEND_RANK: Partial<Record<TerrainId, number>> = {
  desert: 1,
  plains: 2,
  grassland: 3,
  marsh: 4,
  hills: 5,
  forest: 6,
  mountains: 7,
};

const STRIPS: [depth: number, alpha: number][] = [
  [0.46, 0.14],
  [0.3, 0.26],
  [0.15, 0.45],
];

/** Pixel budget for all cached chunks (both layers). */
const CHUNK_PIXEL_BUDGET = 40e6;
/** Time per frame that may be spent redrawing out-of-date chunks. */
const FRAME_BUDGET_MS = 10;

interface Chunk {
  key: string;
  level: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  scale: number;
  version: number;
  canvas: HTMLCanvasElement;
  usedFrame: number;
}

type LayerKind = 'terrain' | 'politics';

export class Renderer {
  camera = { x: 0, y: 0, zoom: 0.8 };
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private centers: [number, number][] = [];
  private isWater: Uint8Array = new Uint8Array(0);
  private chunks: Record<LayerKind, Map<string, Chunk>> = { terrain: new Map(), politics: new Map() };
  private chunkPixels = 0;
  private politicsVersion = 0;
  private frameNo = 0;
  private vignette: { w: number; h: number; g: CanvasGradient } | null = null;
  private minimapColors = new Map<string, string>();
  /** called when part of the map still needs redrawing in a later frame */
  onNeedsRedraw: (() => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.setGame(game);
  }

  /** Game state changed: borders, fog and exploration must be redrawn. */
  invalidate() {
    this.politicsVersion++;
  }

  setGame(game: Game) {
    this.game = game;
    const map = game.map;
    this.centers = map.tiles.map((_, i) => hexCenter(i % map.width, Math.floor(i / map.width), HEX));
    this.isWater = Uint8Array.from(map.tiles, (t) => (TERRAIN[t.t].water ? 1 : 0));
    for (const kind of ['terrain', 'politics'] as LayerKind[]) this.chunks[kind].clear();
    this.chunkPixels = 0;
    this.politicsVersion++;
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

  /** Tiles whose centres lie in a world rectangle. */
  private tilesInRect(x0: number, y0: number, x1: number, y1: number): number[] {
    const map = this.game.map;
    const r0 = Math.max(0, Math.ceil((y0 - HEX) / ROW));
    const r1 = Math.min(map.height - 1, Math.floor((y1 - HEX) / ROW));
    const c0 = Math.max(0, Math.floor(x0 / W) - 1);
    const c1 = Math.min(map.width - 1, Math.ceil(x1 / W) + 1);
    const out: number[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = r * map.width + c;
        const x = this.centers[t][0];
        if (x >= x0 && x <= x1) out.push(t);
      }
    }
    return out;
  }

  /** Visible tile indices with a margin of one hex. */
  private visibleTiles(): number[] {
    const [x0, y0] = this.screenToWorld(0, 0);
    const [x1, y1] = this.screenToWorld(this.width, this.height);
    return this.tilesInRect(x0 - HEX * 1.5, y0 - HEX * 1.5, x1 + HEX * 1.5, y1 + HEX * 1.5);
  }

  // ================================================================ frame

  draw(ov: Overlay) {
    const ctx = this.ctx;
    const g = this.game;
    const z = this.camera.zoom;
    this.frameNo++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // cached layers, at a zoom bucket a little sharper than the screen needs
    const scale = 2 ** (Math.ceil(Math.log2(z * this.dpr) * 3 - 1e-6) / 3);
    const level = scale >= 1.5 ? 4 : scale >= 0.6 ? 8 : 16;
    const deadline = performance.now() + FRAME_BUDGET_MS;
    let pending = this.drawLayer('terrain', level, scale, deadline);
    pending = this.drawLayer('politics', level, scale, deadline) || pending;
    this.evictChunks();
    this.drawVignette();

    const tiles = this.visibleTiles();
    const human = g.humanId;
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, -this.camera.x * this.dpr * z, -this.camera.y * this.dpr * z);

    if (ov.cityTiles) this.drawCityTiles(ov.cityTiles, false);

    // movement overlays
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

    // path preview
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

    // cities, back to front
    const cities = tiles.map((t) => g.cityAt(t)).filter((c): c is City => !!c && g.isExplored(c.tile));
    for (const city of cities) this.drawCity(city);

    // units (visible tiles only)
    for (const t of tiles) {
      if (human >= 0 && !g.visible[t]) continue;
      const units = g.unitsAt(t);
      if (units.length) this.drawUnits(t, units, ov.selectedUnit);
    }

    if (ov.cityTiles) this.drawCityTiles(ov.cityTiles, true);

    // screen-space city labels
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const city of cities) {
      const [x, y] = this.tileScreenPos(city.tile);
      this.drawCityLabel(city.name, city.pop, g.player(city.owner).color, x, y + HEX * 0.66 * z + 4, city.isCapital, city.owner === human);
    }

    if (pending) this.onNeedsRedraw?.();
  }

  // ======================================================== chunk caching

  /** Blit one cached layer, rendering missing or stale chunks. Returns true if work remains. */
  private drawLayer(kind: LayerKind, level: number, scale: number, deadline: number): boolean {
    const cache = this.chunks[kind];
    const version = kind === 'politics' ? this.politicsVersion : 0;
    const cw = level * W;
    const ch = level * ROW;
    const [vx0, vy0] = this.screenToWorld(0, 0);
    const [vx1, vy1] = this.screenToWorld(this.width, this.height);
    const cx0 = Math.max(0, Math.floor(vx0 / cw));
    const cy0 = Math.max(0, Math.floor(vy0 / ch));
    const cx1 = Math.min(Math.ceil(this.worldWidth / cw) - 1, Math.floor(vx1 / cw));
    const cy1 = Math.min(Math.ceil(this.worldHeight / ch) - 1, Math.floor(vy1 / ch));

    const ready: Chunk[] = [];
    const todo: { cx: number; cy: number; key: string; old?: Chunk }[] = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = `${level}:${cx}:${cy}`;
        const c = cache.get(key);
        if (c && c.scale === scale && c.version === version) ready.push(c);
        else todo.push({ cx, cy, key, old: c });
      }
    }
    // nearest the centre of the screen first
    const mx = (vx0 + vx1) / 2;
    const my = (vy0 + vy1) / 2;
    todo.sort((a, b) => Math.hypot((a.cx + 0.5) * cw - mx, (a.cy + 0.5) * ch - my) - Math.hypot((b.cx + 0.5) * cw - mx, (b.cy + 0.5) * ch - my));

    // chunks from another zoom level can stand in for ones not rendered yet
    // (one level only, the one shown most recently, as levels overlap each other)
    let backdrop = [...cache.values()].filter((c) => c.level !== level && c.x1 > vx0 && c.x0 < vx1 && c.y1 > vy0 && c.y0 < vy1);
    if (backdrop.length) {
      const recent = backdrop.reduce((a, b) => (b.usedFrame > a.usedFrame ? b : a)).level;
      backdrop = backdrop.filter((c) => c.level === recent);
    }
    let pending = false;
    const missing: { cx: number; cy: number }[] = [];
    for (const t of todo) {
      const mustRender = !t.old && backdrop.length === 0;
      if (mustRender || performance.now() < deadline) {
        ready.push(this.renderChunk(kind, t.key, level, t.cx, t.cy, scale, version, t.old));
      } else {
        pending = true;
        if (t.old) ready.push(t.old);
        else missing.push(t);
      }
    }
    if (missing.length && backdrop.length) {
      // Only where nothing at this level is drawn yet: the politics layer is
      // translucent, so a backdrop under a finished chunk would tint twice.
      const k = this.camera.zoom * this.dpr;
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      for (const { cx, cy } of missing) {
        const x0 = Math.round((cx * cw - this.camera.x) * k);
        const y0 = Math.round((cy * ch - this.camera.y) * k);
        ctx.rect(x0, y0, Math.round(((cx + 1) * cw - this.camera.x) * k) - x0, Math.round(((cy + 1) * ch - this.camera.y) * k) - y0);
      }
      ctx.clip();
      for (const c of backdrop) this.blitChunk(c);
      ctx.restore();
    }
    for (const c of ready) {
      this.blitChunk(c);
      cache.delete(c.key);
      cache.set(c.key, c);
    }
    // with time to spare, prepare the ring just outside the view so panning
    // doesn't have to render chunks on the spot
    const maxX = Math.ceil(this.worldWidth / cw) - 1;
    const maxY = Math.ceil(this.worldHeight / ch) - 1;
    for (let cy = cy0 - 1; cy <= cy1 + 1 && !pending; cy++) {
      for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
        if (cx < 0 || cy < 0 || cx > maxX || cy > maxY) continue;
        if (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) continue;
        const key = `${level}:${cx}:${cy}`;
        const c = cache.get(key);
        if (c && c.scale === scale && c.version === version) {
          c.usedFrame = this.frameNo;
          continue;
        }
        if (performance.now() >= deadline) {
          pending = true;
          break;
        }
        this.renderChunk(kind, key, level, cx, cy, scale, version, c);
      }
    }
    return pending;
  }

  private blitChunk(c: Chunk) {
    const k = this.camera.zoom * this.dpr;
    const dx0 = Math.round((c.x0 - this.camera.x) * k);
    const dy0 = Math.round((c.y0 - this.camera.y) * k);
    const dx1 = Math.round((c.x1 - this.camera.x) * k);
    const dy1 = Math.round((c.y1 - this.camera.y) * k);
    const sw = (c.x1 - c.x0) * c.scale;
    const sh = (c.y1 - c.y0) * c.scale;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(c.canvas, 0, 0, sw, sh, dx0, dy0, dx1 - dx0, dy1 - dy0);
    c.usedFrame = this.frameNo;
  }

  private renderChunk(kind: LayerKind, key: string, level: number, cx: number, cy: number, scale: number, version: number, old?: Chunk): Chunk {
    const x0 = cx * level * W;
    const y0 = cy * level * ROW;
    const x1 = x0 + level * W;
    const y1 = y0 + level * ROW;
    const pw = Math.ceil((x1 - x0) * scale);
    const ph = Math.ceil((y1 - y0) * scale);
    let canvas = old?.canvas;
    if (old) this.chunkPixels -= old.canvas.width * old.canvas.height;
    if (!canvas) canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    this.chunkPixels += pw * ph;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
    const zoomEq = scale / this.dpr;
    if (kind === 'terrain') {
      const m = HEX * 1.5;
      this.drawTerrain(ctx, this.tilesInRect(x0 - m, y0 - m, x1 + m, y1 + m), zoomEq);
    } else {
      const m = HEX * 1.2;
      this.drawPolitics(ctx, this.tilesInRect(x0 - m, y0 - m, x1 + m, y1 + m), zoomEq);
    }
    const c: Chunk = { key, level, x0, y0, x1, y1, scale, version, canvas, usedFrame: this.frameNo };
    this.chunks[kind].set(key, c);
    return c;
  }

  private evictChunks() {
    for (const kind of ['politics', 'terrain'] as LayerKind[]) {
      const cache = this.chunks[kind];
      for (const [key, c] of cache) {
        if (this.chunkPixels <= CHUNK_PIXEL_BUDGET) return;
        if (c.usedFrame === this.frameNo) continue;
        this.chunkPixels -= c.canvas.width * c.canvas.height;
        c.canvas.width = c.canvas.height = 0;
        cache.delete(key);
      }
    }
  }

  private drawVignette() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!this.vignette || this.vignette.w !== w || this.vignette.h !== h) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.hypot(w, h) * 0.56);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.32)');
      this.vignette = { w, h, g };
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.vignette.g;
    ctx.fillRect(0, 0, w, h);
  }

  // ======================================================== terrain layer

  private corner(t: number, k: number, r = HEX + 0.6): [number, number] {
    const [x, y] = this.centers[t];
    const c = CORNERS[k % 6];
    return [x + c[0] * r, y + c[1] * r];
  }

  /** Coastline edge from corner d to d+1 of land tile t, as a wobbly curve. */
  private coastEdge(ctx: CanvasRenderingContext2D, t: number, d: number, move: boolean) {
    const [ax, ay] = this.corner(t, d);
    const [bx, by] = this.corner(t, d + 1);
    const [cx, cy] = this.centers[t];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const nl = Math.hypot(mx - cx, my - cy);
    const nx = (mx - cx) / nl;
    const ny = (my - cy) / nl;
    const seed = this.game.s.seed;
    const o1 = (hash2(t * 6 + d, 1, seed) - 0.5) * HEX * 0.62;
    const o2 = (hash2(t * 6 + d, 2, seed) - 0.5) * HEX * 0.62;
    if (move) ctx.moveTo(ax, ay);
    ctx.bezierCurveTo(ax + (bx - ax) / 3 + nx * o1, ay + (by - ay) / 3 + ny * o1, ax + ((bx - ax) * 2) / 3 + nx * o2, ay + ((by - ay) * 2) / 3 + ny * o2, bx, by);
  }

  /** Hex outline of a land tile, with coastline edges replaced by curves. */
  private landPath(ctx: CanvasRenderingContext2D, t: number) {
    const map = this.game.map;
    const [x0, y0] = this.corner(t, 0);
    ctx.moveTo(x0, y0);
    for (let d = 0; d < 6; d++) {
      const n = neighbor(map, t, d);
      if (n >= 0 && this.isWater[n]) this.coastEdge(ctx, t, d, false);
      else {
        const [x, y] = this.corner(t, d + 1);
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }

  /** A strip inside tile t along edge d, `depth` of the way to the centre, with a wavy inner edge. */
  private stripPath(ctx: CanvasRenderingContext2D, t: number, d: number, depth: number, level: number) {
    const [cx, cy] = this.centers[t];
    const [ax, ay] = this.corner(t, d);
    const [bx, by] = this.corner(t, d + 1);
    const ix = (x: number) => x + (cx - x) * depth;
    const iy = (y: number) => y + (cy - y) * depth;
    const jit = (hash2(t * 6 + d, 10 + level, this.game.s.seed) - 0.5) * 0.5 * depth;
    const qx = (ix(ax) + ix(bx)) / 2 + (cx - (ax + bx) / 2) * jit;
    const qy = (iy(ay) + iy(by)) / 2 + (cy - (ay + by) / 2) * jit;
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(ix(bx), iy(by));
    ctx.quadraticCurveTo(qx, qy, ix(ax), iy(ay));
    ctx.closePath();
  }

  private drawTerrain(ctx: CanvasRenderingContext2D, tiles: number[], zoomEq: number) {
    const map = this.game.map;
    const pat = terrainPatterns(ctx);
    const water = tiles.filter((t) => this.isWater[t]);
    const land = tiles.filter((t) => !this.isWater[t]);

    // 1. water, plus water under coastal land so coastline dents show the sea
    const waterGroups = new Map<TerrainId, number[]>();
    const push = (id: TerrainId, t: number) => {
      let a = waterGroups.get(id);
      if (!a) waterGroups.set(id, (a = []));
      a.push(t);
    };
    for (const t of water) push(map.tiles[t].t, t);
    for (const t of land) {
      for (let d = 0; d < 6; d++) {
        const n = neighbor(map, t, d);
        if (n >= 0 && this.isWater[n]) {
          push(map.tiles[n].t, t);
          break;
        }
      }
    }
    for (const [id, list] of waterGroups) {
      ctx.beginPath();
      for (const t of list) this.hexPath(ctx, this.centers[t][0], this.centers[t][1]);
      ctx.fillStyle = pat[id];
      ctx.fill();
    }
    this.drawMacroShade(ctx, water, false, 0.07);
    // shallow coastal water bleeds softly into the deep ocean
    this.drawBlendStrips(ctx, water, pat, (a, b) => a === 'ocean' && (b === 'coast' || b === 'lake'));

    // 2. surf along the shore (the land drawn next covers the inland half)
    const coastEdges: [number, number][] = [];
    for (const t of land) {
      for (let d = 0; d < 6; d++) {
        const n = neighbor(map, t, d);
        if (n >= 0 && this.isWater[n]) coastEdges.push([t, d]);
      }
    }
    const strokeCoast = (filter?: (t: number) => boolean) => {
      ctx.beginPath();
      for (const [t, d] of coastEdges) if (!filter || filter(t)) this.coastEdge(ctx, t, d, true);
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokeCoast();
    ctx.strokeStyle = 'rgba(190,225,240,0.13)';
    ctx.lineWidth = 11;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(225,242,250,0.32)';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    // 3. land
    const landGroups = new Map<TerrainId, number[]>();
    for (const t of land) {
      const id = map.tiles[t].t;
      let a = landGroups.get(id);
      if (!a) landGroups.set(id, (a = []));
      a.push(t);
    }
    for (const [id, list] of landGroups) {
      ctx.beginPath();
      for (const t of list) this.landPath(ctx, t);
      ctx.fillStyle = pat[id];
      ctx.fill();
    }
    this.drawMacroShade(ctx, land, true, 0.1);
    this.drawBlendStrips(ctx, land, pat, (a, b) => (BLEND_RANK[b] ?? 0) > (BLEND_RANK[a] ?? 0));

    // 4. beaches and rocky shores, kept on the land side of the coastline
    if (coastEdges.length) {
      ctx.save();
      ctx.beginPath();
      for (const t of land) this.landPath(ctx, t);
      ctx.clip();
      const rocky = (t: number) => map.tiles[t].t === 'hills' || map.tiles[t].t === 'mountains';
      strokeCoast((t) => !rocky(t) && map.tiles[t].t !== 'marsh');
      ctx.strokeStyle = 'rgba(226,208,150,0.9)';
      ctx.lineWidth = 6;
      ctx.stroke();
      strokeCoast(rocky);
      ctx.strokeStyle = 'rgba(92,84,72,0.9)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();
      strokeCoast();
      ctx.strokeStyle = 'rgba(28,34,30,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 5. a faint hex grid so the board stays readable
    if (zoomEq >= 0.7) {
      ctx.beginPath();
      for (const t of tiles) {
        for (let d = 0; d < 3; d++) {
          const n = neighbor(map, t, d);
          if (n < 0 || this.isWater[n] !== this.isWater[t]) continue;
          const [ax, ay] = this.corner(t, d, HEX);
          const [bx, by] = this.corner(t, d + 1, HEX);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.09)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // 6. relief, vegetation and other details
    if (zoomEq > 0.42) this.drawDecorations(ctx, tiles, zoomEq);

    // 7. rivers
    this.drawRivers(ctx, new Set(tiles));

    // 8. resources
    if (zoomEq > 0.55) {
      for (const t of tiles) {
        const res = map.tiles[t].res;
        if (!res) continue;
        const [x, y] = this.centers[t];
        drawResourceBadge(ctx, res, x + HEX * 0.4, y + HEX * 0.38);
      }
    }
  }

  /** Low-frequency light and shadow so large areas don't look uniform. */
  private drawMacroShade(ctx: CanvasRenderingContext2D, tiles: number[], land: boolean, strength: number) {
    const seed = this.game.s.seed;
    const dark: number[] = [];
    const light: number[] = [];
    for (const t of tiles) {
      const [x, y] = this.centers[t];
      const n = fbm(x / (W * 3.2), y / (W * 3.2), seed + 5) - 0.5;
      if (n < -0.06) dark.push(t);
      else if (n > 0.06) light.push(t);
    }
    for (const [list, color] of [
      [dark, `rgba(0,0,0,${strength})`],
      [light, `rgba(255,250,225,${strength * 0.6})`],
    ] as [number[], string][]) {
      if (!list.length) continue;
      ctx.beginPath();
      for (const t of list) {
        if (land) this.landPath(ctx, t);
        else this.hexPath(ctx, this.centers[t][0], this.centers[t][1]);
      }
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  /** Feathered strips of a neighbour's texture along edges where `bleeds(mine, theirs)`. */
  private drawBlendStrips(
    ctx: CanvasRenderingContext2D,
    tiles: number[],
    pat: Record<TerrainId, CanvasPattern>,
    bleeds: (mine: TerrainId, theirs: TerrainId) => boolean,
  ) {
    const map = this.game.map;
    const edges = new Map<TerrainId, [number, number][]>();
    for (const t of tiles) {
      const mine = map.tiles[t].t;
      for (let d = 0; d < 6; d++) {
        const n = neighbor(map, t, d);
        if (n < 0 || this.isWater[n] !== this.isWater[t]) continue;
        const theirs = map.tiles[n].t;
        if (theirs === mine || !bleeds(mine, theirs)) continue;
        let a = edges.get(theirs);
        if (!a) edges.set(theirs, (a = []));
        a.push([t, d]);
      }
    }
    for (const [id, list] of edges) {
      ctx.fillStyle = pat[id];
      STRIPS.forEach(([depth, alpha], level) => {
        ctx.beginPath();
        for (const [t, d] of list) this.stripPath(ctx, t, d, depth, level);
        ctx.globalAlpha = alpha;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
  }

  private drawRivers(ctx: CanvasRenderingContext2D, inChunk: Set<number>) {
    const map = this.game.map;
    const seed = this.game.s.seed;
    for (const r of map.rivers) {
      if (!r.path.some((t) => inChunk.has(t))) continue;
      const pts: [number, number][] = r.path.map((t) => [...this.centers[t]] as [number, number]);
      // run the mouth on into the sea
      const last = r.path[r.path.length - 1];
      const prev = r.path[r.path.length - 2];
      let best = -1;
      let bestDot = -Infinity;
      for (let d = 0; d < 6; d++) {
        const n = neighbor(map, last, d);
        if (n < 0 || !this.isWater[n]) continue;
        const dot = (this.centers[n][0] - this.centers[last][0]) * (this.centers[last][0] - this.centers[prev][0]) + (this.centers[n][1] - this.centers[last][1]) * (this.centers[last][1] - this.centers[prev][1]);
        if (dot > bestDot) {
          bestDot = dot;
          best = n;
        }
      }
      if (best >= 0) pts.push([(this.centers[last][0] + this.centers[best][0]) / 2, (this.centers[last][1] + this.centers[best][1]) / 2]);
      // meandering midpoints
      const mids: [number, number][] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const j = (hash2(r.path[Math.min(i, r.path.length - 1)], 40 + i, seed) - 0.5) * HEX * 0.5;
        mids.push([(ax + bx) / 2 + (-(by - ay) / len) * j, (ay + by) / 2 + ((bx - ax) / len) * j]);
      }
      const n = mids.length;
      const width = (i: number) => (1.2 + 3.4 * (i / Math.max(1, n - 1))) * Math.min(1, 0.55 + n / 20);
      const segment = (i: number) => {
        ctx.beginPath();
        if (i === 0) {
          ctx.moveTo(pts[0][0], pts[0][1]);
          ctx.lineTo(mids[0][0], mids[0][1]);
        } else {
          ctx.moveTo(mids[i - 1][0], mids[i - 1][1]);
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], mids[i][0], mids[i][1]);
        }
        if (i === n - 1) ctx.lineTo(pts[n][0], pts[n][1]);
      };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [color, extra, mul] of [
        ['rgba(34,62,70,0.75)', 2.4, 1],
        ['#4d8fc4', 0, 1],
        ['rgba(160,205,240,0.55)', 0, 0.35],
      ] as [string, number, number][]) {
        ctx.strokeStyle = color;
        for (let i = 0; i < n; i++) {
          segment(i);
          ctx.lineWidth = width(i) * mul + extra;
          ctx.stroke();
        }
      }
    }
  }

  private drawDecorations(ctx: CanvasRenderingContext2D, tiles: number[], zoomEq: number) {
    const map = this.game.map;
    const seed = this.game.s.seed;
    const by: Partial<Record<TerrainId, number[]>> = {};
    for (const t of tiles) (by[map.tiles[t].t] ??= []).push(t);
    const rnd = (t: number, k: number) => hash2(t, k, seed);

    // water: wavelets
    const water = [...(by.ocean ?? []), ...(by.coast ?? [])];
    if (water.length && zoomEq > 0.65) {
      ctx.beginPath();
      for (const t of water) {
        const [x, y] = this.centers[t];
        for (let k = 0; k < 2; k++) {
          if (rnd(t, 77 + k) > 0.55) continue;
          const ox = (rnd(t, 78 + k) - 0.5) * 30;
          const oy = (rnd(t, 80 + k) - 0.5) * 26;
          ctx.moveTo(x + ox - 6, y + oy);
          ctx.quadraticCurveTo(x + ox - 3, y + oy - 3, x + ox, y + oy);
          ctx.quadraticCurveTo(x + ox + 3, y + oy + 3, x + ox + 6, y + oy);
        }
      }
      ctx.strokeStyle = 'rgba(220,238,255,0.14)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    // grassland: tufts and the odd wildflower
    if (by.grassland && zoomEq > 0.6) {
      ctx.beginPath();
      const flowers: [number, number][] = [];
      for (const t of by.grassland) {
        const [x, y] = this.centers[t];
        for (let k = 0; k < 6; k++) {
          const ox = (rnd(t, 100 + k) - 0.5) * 40;
          const oy = (rnd(t, 110 + k) - 0.5) * 36;
          ctx.moveTo(x + ox - 2.2, y + oy - 3);
          ctx.lineTo(x + ox, y + oy);
          ctx.lineTo(x + ox + 0.4, y + oy - 4);
          ctx.moveTo(x + ox, y + oy);
          ctx.lineTo(x + ox + 2.4, y + oy - 2.8);
          if (rnd(t, 120 + k) < 0.12) flowers.push([x + ox + 3, y + oy - 4]);
        }
      }
      ctx.strokeStyle = 'rgba(52,88,34,0.6)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.beginPath();
      for (const [fx, fy] of flowers) {
        ctx.moveTo(fx + 1, fy);
        ctx.arc(fx, fy, 1, 0, Math.PI * 2);
      }
      ctx.fillStyle = 'rgba(250,240,190,0.85)';
      ctx.fill();
    }

    // plains: strip fields with furrows
    if (by.plains) {
      const fills: Path2D = new Path2D();
      const furrows = new Path2D();
      for (const t of by.plains) {
        const [x, y] = this.centers[t];
        const patches = 1 + (rnd(t, 130) < 0.55 ? 1 : 0);
        for (let p = 0; p < patches; p++) {
          const px = x + (rnd(t, 131 + p) - 0.5) * 22;
          const py = y + (rnd(t, 133 + p) - 0.5) * 20;
          const a = rnd(t, 135 + p) * Math.PI;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const hw = 8 + rnd(t, 137 + p) * 4;
          const hh = 5 + rnd(t, 139 + p) * 2;
          const pt = (u: number, v: number): [number, number] => [px + u * ca - v * sa, py + u * sa + v * ca];
          const c = [pt(-hw, -hh), pt(hw, -hh), pt(hw, hh), pt(-hw, hh)];
          fills.moveTo(...c[0]);
          for (let i = 1; i < 4; i++) fills.lineTo(...c[i]);
          fills.closePath();
          for (let i = -2; i <= 2; i++) {
            const v = (i * hh) / 2.5;
            furrows.moveTo(...pt(-hw + 1, v));
            furrows.lineTo(...pt(hw - 1, v));
          }
        }
      }
      ctx.fillStyle = 'rgba(214,196,120,0.35)';
      ctx.fill(fills);
      ctx.strokeStyle = 'rgba(125,108,52,0.5)';
      ctx.lineWidth = 0.9;
      ctx.stroke(furrows);
    }

    // desert: shaded dunes
    if (by.desert) {
      const lit = new Path2D();
      const dark = new Path2D();
      for (const t of by.desert) {
        const [x, y] = this.centers[t];
        for (let k = 0; k < 2; k++) {
          const dx = x + (k ? 7 : -8) + (rnd(t, 150 + k) - 0.5) * 6;
          const dy = y + (k ? 7 : -3) + (rnd(t, 152 + k) - 0.5) * 6;
          const w = 9 + rnd(t, 154 + k) * 4;
          lit.moveTo(dx - w, dy + 3);
          lit.quadraticCurveTo(dx - w * 0.3, dy - 6, dx + w * 0.15, dy - 3);
          lit.quadraticCurveTo(dx - w * 0.2, dy + 1, dx - w, dy + 3);
          dark.moveTo(dx + w * 0.15, dy - 3);
          dark.quadraticCurveTo(dx + w * 0.6, dy - 2, dx + w, dy + 3);
          dark.quadraticCurveTo(dx + w * 0.1, dy + 2, dx + w * 0.15, dy - 3);
        }
      }
      ctx.fillStyle = 'rgba(246,230,186,0.75)';
      ctx.fill(lit);
      ctx.fillStyle = 'rgba(160,124,70,0.55)';
      ctx.fill(dark);
    }

    // marsh: pools and reeds
    if (by.marsh) {
      const pools = new Path2D();
      const reeds = new Path2D();
      const heads = new Path2D();
      for (const t of by.marsh) {
        const [x, y] = this.centers[t];
        for (let k = 0; k < 3; k++) {
          const px = x + (rnd(t, 160 + k) - 0.5) * 28;
          const py = y + (rnd(t, 163 + k) - 0.5) * 22;
          pools.moveTo(px + 5, py);
          pools.ellipse(px, py, 5 + rnd(t, 166 + k) * 3, 2.2, 0, 0, Math.PI * 2);
        }
        for (let k = 0; k < 4; k++) {
          const rx = x + (rnd(t, 170 + k) - 0.5) * 34;
          const ry = y + (rnd(t, 174 + k) - 0.5) * 28;
          for (let s = -1; s <= 1; s++) {
            reeds.moveTo(rx + s * 1.6, ry);
            reeds.lineTo(rx + s * 2.4, ry - 6 + Math.abs(s));
            heads.moveTo(rx + s * 2.4 + 0.8, ry - 6 + Math.abs(s));
            heads.ellipse(rx + s * 2.4, ry - 6 + Math.abs(s), 0.8, 1.6, 0, 0, Math.PI * 2);
          }
        }
      }
      ctx.fillStyle = 'rgba(52,96,112,0.75)';
      ctx.fill(pools);
      ctx.strokeStyle = 'rgba(170,210,220,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke(pools);
      ctx.strokeStyle = 'rgba(38,62,36,0.85)';
      ctx.lineWidth = 0.9;
      ctx.stroke(reeds);
      ctx.fillStyle = 'rgba(96,70,40,0.9)';
      ctx.fill(heads);
    }

    // hills: lit and shaded mounds
    if (by.hills) {
      const lit = new Path2D();
      const dark = new Path2D();
      const rim = new Path2D();
      for (const t of by.hills) {
        const [x, y] = this.centers[t];
        const mounds: [number, number, number, number][] = [
          [x - 8 + (rnd(t, 180) - 0.5) * 4, y + 2 + (rnd(t, 181) - 0.5) * 4, 11, 9],
          [x + 8 + (rnd(t, 182) - 0.5) * 4, y + 9 + (rnd(t, 183) - 0.5) * 3, 10, 7],
        ];
        if (rnd(t, 184) < 0.5) mounds.unshift([x + 4, y - 9, 8, 6]);
        for (const [mx, my, w, h] of mounds) {
          lit.moveTo(mx - w, my);
          lit.quadraticCurveTo(mx, my - 2 * h, mx + w, my);
          lit.closePath();
          dark.moveTo(mx, my - h);
          dark.quadraticCurveTo(mx + w / 2, my - h, mx + w, my);
          dark.lineTo(mx + w * 0.1, my);
          dark.closePath();
          rim.moveTo(mx - w, my);
          rim.quadraticCurveTo(mx - w / 2, my - h, mx, my - h);
        }
      }
      ctx.fillStyle = 'rgba(176,166,110,0.9)';
      ctx.fill(lit);
      ctx.fillStyle = 'rgba(98,90,54,0.75)';
      ctx.fill(dark);
      ctx.strokeStyle = 'rgba(255,248,210,0.4)';
      ctx.lineWidth = 1.1;
      ctx.stroke(rim);
    }

    // forests: mixed woods, conifers in the north
    if (by.forest) this.drawForests(ctx, by.forest);

    // mountains: shaded peaks with snow
    if (by.mountains) for (const t of by.mountains) this.drawMountain(ctx, t);
  }

  private drawForests(ctx: CanvasRenderingContext2D, tiles: number[]) {
    const map = this.game.map;
    const seed = this.game.s.seed;
    const slots: [number, number][] = [
      [-9, -9],
      [3, -12],
      [12, -4],
      [-13, 2],
      [-1, -1],
      [10, 7],
      [-6, 10],
      [4, 13],
    ];
    const shadows = new Path2D();
    const trunks = new Path2D();
    const pineDark = new Path2D();
    const pineLit = new Path2D();
    const leafDark = new Path2D();
    const leafLit = new Path2D();
    for (const t of tiles) {
      const [x, y] = this.centers[t];
      const north = Math.floor(t / map.width) / map.height;
      const pineChance = north < 0.35 ? 0.85 : north < 0.5 ? 0.5 : 0.2;
      const trees: [number, number, number, boolean][] = [];
      slots.forEach(([sx, sy], k) => {
        if (hash2(t, 200 + k, seed) < 0.18) return;
        const tx = x + sx + (hash2(t, 210 + k, seed) - 0.5) * 5;
        const ty = y + sy + 4 + (hash2(t, 220 + k, seed) - 0.5) * 4;
        trees.push([tx, ty, 0.85 + hash2(t, 230 + k, seed) * 0.35, hash2(t, 240 + k, seed) < pineChance]);
      });
      trees.sort((a, b) => a[1] - b[1]);
      for (const [tx, ty, k, pine] of trees) {
        shadows.moveTo(tx + 8 * k, ty + 1);
        shadows.ellipse(tx + 3 * k, ty + 1, 5 * k, 1.8 * k, 0, 0, Math.PI * 2);
        trunks.rect(tx - 0.7, ty - 2.5 * k, 1.4, 2.5 * k);
        if (pine) {
          for (const [top, base, hw] of [
            [13, 6, 4.2],
            [9, 1.8, 5.8],
          ]) {
            pineDark.moveTo(tx, ty - top * k);
            pineDark.lineTo(tx + hw * k, ty - base * k);
            pineDark.lineTo(tx - hw * k, ty - base * k);
            pineDark.closePath();
            pineLit.moveTo(tx, ty - top * k);
            pineLit.lineTo(tx - hw * k, ty - base * k);
            pineLit.lineTo(tx - hw * 0.15 * k, ty - base * k);
            pineLit.closePath();
          }
        } else {
          leafDark.moveTo(tx + 5.2 * k, ty - 6.5 * k);
          leafDark.arc(tx, ty - 6.5 * k, 5.2 * k, 0, Math.PI * 2);
          leafLit.moveTo(tx - 1.4 * k + 3 * k, ty - 8 * k);
          leafLit.arc(tx - 1.4 * k, ty - 8 * k, 3 * k, 0, Math.PI * 2);
        }
      }
    }
    ctx.fillStyle = 'rgba(10,24,10,0.32)';
    ctx.fill(shadows);
    ctx.fillStyle = '#4a3420';
    ctx.fill(trunks);
    ctx.fillStyle = '#1b3b20';
    ctx.fill(pineDark);
    ctx.fillStyle = '#2e5a2f';
    ctx.fill(pineLit);
    ctx.fillStyle = '#2d5626';
    ctx.fill(leafDark);
    ctx.fillStyle = 'rgba(92,140,62,0.85)';
    ctx.fill(leafLit);
  }

  private drawMountain(ctx: CanvasRenderingContext2D, t: number) {
    const seed = this.game.s.seed;
    const [x, y] = this.centers[t];
    const r = (k: number) => hash2(t, 300 + k, seed);
    const peaks: [number, number, number, number][] = [
      [x - 8 + (r(0) - 0.5) * 4, y + 6, 11, 17 + r(1) * 6],
      [x + 9 + (r(2) - 0.5) * 4, y + 4, 10, 14 + r(3) * 5],
    ];
    if (r(4) < 0.6) peaks.push([x + 1 + (r(5) - 0.5) * 6, y + 13, 9, 11 + r(6) * 4]);
    else peaks[0][3] += 3;

    ctx.beginPath();
    ctx.ellipse(x + 2, y + 13, 19, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,16,12,0.22)';
    ctx.fill();
    for (const [px, base, hw, h] of peaks) {
      const skew = (hash2(t, Math.round(px), seed) - 0.5) * 4;
      const ax = px + skew;
      const ay = base - h;
      const ridgeX = px + skew * 0.3 + hw * 0.12;
      // lit face
      ctx.beginPath();
      ctx.moveTo(px - hw, base);
      ctx.lineTo(px - hw * 0.45, base - h * 0.55);
      ctx.lineTo(ax, ay);
      ctx.lineTo(ridgeX, base);
      ctx.closePath();
      ctx.fillStyle = '#a49c90';
      ctx.fill();
      // shaded face
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(px + hw * 0.5, base - h * 0.45);
      ctx.lineTo(px + hw, base);
      ctx.lineTo(ridgeX, base);
      ctx.closePath();
      ctx.fillStyle = '#5e574f';
      ctx.fill();
      // snow on the taller peaks
      if (h > 15) {
        const s = 0.32;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + (px - hw * 0.45 - ax) * s * 1.1, ay + (base - h * 0.55 - ay) * s * 1.1);
        ctx.lineTo(ax - 1.2, ay + h * s * 0.7);
        ctx.lineTo(ax + (ridgeX - ax) * s * 0.8, ay + (base - ay) * s * 0.8);
        ctx.closePath();
        ctx.fillStyle = '#f3f1ec';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + (ridgeX - ax) * s * 0.8, ay + (base - ay) * s * 0.8);
        ctx.lineTo(ax + (px + hw * 0.5 - ax) * s, ay + (base - h * 0.45 - ay) * s);
        ctx.closePath();
        ctx.fillStyle = '#b9c0cc';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(px - hw, base);
      ctx.lineTo(px - hw * 0.45, base - h * 0.55);
      ctx.lineTo(ax, ay);
      ctx.lineTo(px + hw * 0.5, base - h * 0.45);
      ctx.lineTo(px + hw, base);
      ctx.strokeStyle = 'rgba(40,34,28,0.7)';
      ctx.lineWidth = 0.9;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  // ======================================================= politics layer

  private drawPolitics(ctx: CanvasRenderingContext2D, tiles: number[], zoomEq: number) {
    const g = this.game;
    const map = g.map;
    const human = g.humanId;

    // territory tint and borders
    const byOwner = new Map<number, number[]>();
    for (const t of tiles) {
      const o = map.tiles[t].owner;
      if (o < 0) continue;
      let a = byOwner.get(o);
      if (!a) byOwner.set(o, (a = []));
      a.push(t);
    }
    ctx.lineCap = 'round';
    for (const [owner, list] of byOwner) {
      const color = g.player(owner).color;
      ctx.beginPath();
      for (const t of list) this.hexPath(ctx, this.centers[t][0], this.centers[t][1]);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      const edges = new Path2D();
      for (const t of list) {
        for (let d = 0; d < 6; d++) {
          const n = neighbor(map, t, d);
          if (n >= 0 && map.tiles[n].owner === owner) continue;
          const [ax, ay] = this.corner(t, d, HEX - 2.4);
          const [bx, by] = this.corner(t, d + 1, HEX - 2.4);
          edges.moveTo(ax, ay);
          edges.lineTo(bx, by);
        }
      }
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 6.5;
      ctx.stroke(edges);
      ctx.globalAlpha = 1;
      ctx.lineWidth = owner === human ? 3 : 2.2;
      ctx.stroke(edges);
      if (zoomEq > 0.7) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 0.7;
        ctx.stroke(edges);
      }
    }

    if (human < 0) return;
    // fog over explored-but-unseen land
    ctx.beginPath();
    for (const t of tiles) if (g.isExplored(t) && !g.visible[t]) this.hexPath(ctx, this.centers[t][0], this.centers[t][1]);
    ctx.fillStyle = 'rgba(8,10,18,0.45)';
    ctx.fill();

    // unexplored land: opaque, with a soft edge into the known world
    const hidden = tiles.filter((t) => !g.isExplored(t));
    if (!hidden.length) return;
    ctx.beginPath();
    for (const t of hidden) this.hexPath(ctx, this.centers[t][0], this.centers[t][1], HEX + 1.2);
    ctx.fillStyle = '#0c0f15';
    ctx.fill();
    const edge: [number, number][] = [];
    for (const t of tiles) {
      if (!g.isExplored(t)) continue;
      for (let d = 0; d < 6; d++) {
        const n = neighbor(map, t, d);
        if (n >= 0 && !g.isExplored(n)) edge.push([t, d]);
      }
    }
    ctx.fillStyle = '#0c0f15';
    STRIPS.forEach(([depth, alpha], level) => {
      ctx.beginPath();
      for (const [t, d] of edge) this.stripPath(ctx, t, d, depth * 0.8, level);
      ctx.globalAlpha = alpha * 1.4;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // =========================================================== live layer

  /** Worked-tile highlights (under units) or yield pips (over units) for the open city. */
  private drawCityTiles(tiles: CityTileInfo[], pips: boolean) {
    const ctx = this.ctx;
    if (!pips) {
      ctx.beginPath();
      for (const t of tiles) if (!t.worked) this.hexPath(ctx, this.centers[t.tile][0], this.centers[t.tile][1], HEX - 1);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fill();
      ctx.beginPath();
      for (const t of tiles) if (t.worked) this.hexPath(ctx, this.centers[t.tile][0], this.centers[t.tile][1], HEX - 4);
      ctx.strokeStyle = 'rgba(255,226,140,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }
    const kinds: [keyof CityTileInfo, string, string][] = [
      ['food', '#5fae4a', '#0e2a08'],
      ['prod', '#d0874a', '#2e1606'],
      ['gold', '#e8c650', '#3a2a04'],
    ];
    ctx.font = '700 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of tiles) {
      const [x, y] = this.centers[t.tile];
      const items = kinds.filter(([k]) => (t[k] as number) > 0);
      const w = 10.5;
      let px = x - ((items.length - 1) * w) / 2;
      const py = y - HEX * 0.55;
      ctx.globalAlpha = t.worked ? 1 : 0.6;
      for (const [k, bg, fg] of items) {
        ctx.beginPath();
        ctx.arc(px, py, 4.8, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.fillStyle = fg;
        ctx.fillText(String(t[k]), px, py + 0.4);
        px += w;
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawCity(city: City) {
    const ctx = this.ctx;
    const g = this.game;
    const [x, y] = this.centers[city.tile];
    const color = g.player(city.owner).color;
    const z = this.camera.zoom;
    const walls = city.buildings.includes('walls');
    const castle = city.buildings.includes('castle');

    if (z < 0.55) {
      // far away: a simple banner disc reads better than a tiny town
      const r = 12 + Math.min(6, city.pop * 0.6);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = walls ? 4 : 2.5;
      ctx.strokeStyle = walls ? '#cfc6b2' : 'rgba(15,12,8,0.95)';
      ctx.stroke();
      if (city.isCapital) this.drawStar(x, y, 7);
      return;
    }

    const R = 11 + Math.min(9, city.pop * 0.75);
    const seed = city.id * 977 + g.s.seed;
    // ground
    ctx.beginPath();
    ctx.ellipse(x, y + 3, R + 4, (R + 4) * 0.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(82,66,44,0.7)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // town walls
    if (walls) {
      const n = 9;
      const ring: [number, number][] = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + 0.3;
        ring.push([x + Math.cos(a) * (R + 2), y + 3 + Math.sin(a) * (R + 2) * 0.8]);
      }
      ctx.beginPath();
      ring.forEach(([wx, wy], k) => (k ? ctx.lineTo(wx, wy) : ctx.moveTo(wx, wy)));
      ctx.closePath();
      ctx.strokeStyle = '#6f675a';
      ctx.lineWidth = castle ? 5 : 3.6;
      ctx.stroke();
      ctx.strokeStyle = '#c4bba6';
      ctx.lineWidth = castle ? 2.2 : 1.5;
      ctx.stroke();
      ctx.beginPath();
      for (const [wx, wy] of ring) {
        const tr = castle ? 3.3 : 2.4;
        ctx.moveTo(wx + tr, wy);
        ctx.arc(wx, wy, tr, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#b3aa95';
      ctx.fill();
      ctx.strokeStyle = '#4b453b';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }

    // houses on a sunflower spiral, back to front
    const count = Math.max(3, Math.min(12, 2 + Math.round(city.pop * 0.9)));
    const houses: [number, number, number][] = [];
    const spin = hash2(city.id, 1, seed) * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996 + spin;
      const rr = R * 0.42 + R * 0.5 * Math.sqrt((i + 0.5) / count);
      houses.push([x + Math.cos(a) * rr, y + 4 + Math.sin(a) * rr * 0.72, hash2(city.id, 10 + i, seed)]);
    }
    houses.sort((a, b) => a[1] - b[1]);
    const keepY = y + 2;
    const drawHouse = ([hx, hy, h]: [number, number, number]) => {
      const w = 5.6 + h * 2;
      const ht = 3.6 + h * 1.4;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(hx - w / 2 + 1.2, hy - 0.6, w, 1.6);
      ctx.fillStyle = '#e6dcc2';
      ctx.fillRect(hx - w / 2, hy - ht, w, ht);
      ctx.fillStyle = '#bfb193';
      ctx.fillRect(hx + w * 0.15, hy - ht, w * 0.35, ht);
      ctx.beginPath();
      ctx.moveTo(hx - w / 2 - 1, hy - ht);
      ctx.lineTo(hx + w / 2 + 1, hy - ht);
      ctx.lineTo(hx + w / 2 - 1.2, hy - ht - 3.6);
      ctx.lineTo(hx - w / 2 + 1.2, hy - ht - 3.6);
      ctx.closePath();
      ctx.fillStyle = shade(color, 0.72 + h * 0.3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,14,8,0.65)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    };
    for (const hs of houses) if (hs[1] <= keepY) drawHouse(hs);

    // keep with the owner's banner
    const kw = city.isCapital ? 11 : 8.5;
    const kh = city.isCapital ? 17 : 13;
    const kx = x - kw / 2;
    const ky = keepY - kh;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(kx + 2, keepY - 1, kw, 2.4);
    ctx.fillStyle = '#d2cab6';
    ctx.fillRect(kx, ky, kw, kh);
    ctx.fillStyle = '#a0977f';
    ctx.fillRect(kx + kw * 0.55, ky, kw * 0.45, kh);
    ctx.beginPath();
    const merlons = city.isCapital ? 4 : 3;
    for (let k = 0; k < merlons; k++) ctx.rect(kx + (k * kw) / (merlons - 0.5), ky - 2.4, kw / (merlons * 2 - 1), 2.4);
    ctx.fillStyle = '#c3baa4';
    ctx.fill();
    ctx.fillStyle = '#3a2c1c';
    ctx.beginPath();
    ctx.moveTo(x - 1.6, keepY);
    ctx.lineTo(x - 1.6, keepY - 3.4);
    ctx.arc(x, keepY - 3.4, 1.6, Math.PI, 0);
    ctx.lineTo(x + 1.6, keepY);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,24,16,0.8)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(kx, ky, kw, kh);
    // banner
    const poleTop = ky - 12;
    ctx.beginPath();
    ctx.moveTo(x, ky - 2.4);
    ctx.lineTo(x, poleTop);
    ctx.strokeStyle = '#2a2218';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, poleTop);
    ctx.quadraticCurveTo(x + 4, poleTop - 1.4, x + 8.5, poleTop + 0.6);
    ctx.lineTo(x + 7.4, poleTop + 3);
    ctx.lineTo(x + 8.5, poleTop + 5.2);
    ctx.quadraticCurveTo(x + 4, poleTop + 3.4, x, poleTop + 5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    if (city.isCapital) this.drawStar(x, poleTop - 5, 4.5);

    for (const hs of houses) if (hs[1] > keepY) drawHouse(hs);
  }

  private drawStar(x: number, y: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd86b';
    ctx.fill();
    ctx.strokeStyle = '#3a2a08';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  private drawCityLabel(name: string, pop: number, color: string, x: number, y: number, capital: boolean, mine: boolean) {
    const ctx = this.ctx;
    const z = this.camera.zoom;
    const size = Math.round(Math.max(10, Math.min(14, 11 * Math.sqrt(z))));
    ctx.font = `${mine ? 600 : 500} ${size}px 'Palatino Linotype', Palatino, Georgia, serif`;
    const tw = ctx.measureText(name).width;
    const badge = size + 4;
    const w = tw + badge + 12;
    const h = size + 7;
    const lx = x - w / 2;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = 'rgba(14,13,16,0.86)';
    ctx.beginPath();
    ctx.roundRect(lx, y, w, h, 4);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = color;
    ctx.lineWidth = capital ? 2 : 1.2;
    ctx.stroke();
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
    ctx.fillText(name, lx + badge + 7, y + h / 2 + 0.5);
  }

  private drawUnits(tile: number, units: Unit[], selected: Unit | null) {
    const ctx = this.ctx;
    const g = this.game;
    const z = this.camera.zoom;
    const hasCity = !!g.cityAt(tile);
    const [cx, cy] = this.centers[tile];
    const sel = selected && selected.tile === tile ? selected : null;
    const top =
      sel ??
      [...units].sort((a, b) => UNITS[b.type].defense + UNITS[b.type].attack - (UNITS[a.type].defense + UNITS[a.type].attack))[0];
    const x = hasCity ? cx - 15 : cx;
    const y = hasCity ? cy - 11 : cy - 2;
    const color = g.player(top.owner).color;
    const ink = textColorFor(color) === '#ffffff' ? '#fbf6ea' : '#1a140c';
    const embarked = TERRAIN[g.map.tiles[tile].t].water;

    if (embarked) {
      ctx.beginPath();
      ctx.moveTo(x - 16, y + 7);
      ctx.lineTo(x + 16, y + 7);
      ctx.quadraticCurveTo(x + 13, y + 15, x + 8, y + 15);
      ctx.lineTo(x - 8, y + 15);
      ctx.quadraticCurveTo(x - 13, y + 15, x - 16, y + 7);
      ctx.fillStyle = '#6b4826';
      ctx.fill();
      ctx.strokeStyle = '#2c1d0e';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 12, y + 10);
      ctx.lineTo(x + 12, y + 10);
      ctx.strokeStyle = 'rgba(255,230,190,0.35)';
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(x + 1.5, y + 14, 10, 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    shieldPath(ctx);
    ctx.fillStyle = color;
    ctx.fill();
    const sheen = ctx.createLinearGradient(0, -11, 0, 14);
    sheen.addColorStop(0, 'rgba(255,255,255,0.32)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = sheen;
    ctx.fill();
    ctx.lineWidth = sel ? 3 : 1.6;
    ctx.strokeStyle = sel ? '#ffd86b' : top.fortified ? '#9fd59a' : 'rgba(18,14,10,0.95)';
    ctx.stroke();
    ctx.beginPath();
    shieldPath(ctx, 8.8, -8.8, 11);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.translate(0, 0.5);
    drawUnitEmblem(ctx, top.type, ink);
    ctx.restore();

    if (top.fortified) {
      ctx.beginPath();
      ctx.arc(x, y + 1, 17, Math.PI * 0.2, Math.PI * 0.8);
      ctx.strokeStyle = '#9fd59a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (top.sleeping) {
      ctx.fillStyle = '#d6e4ff';
      ctx.font = 'italic 700 9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('z', x + 12, y - 12);
    }
    // hp bar
    if (top.hp < 100) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(x - 12, y + 16, 24, 4);
      ctx.fillStyle = top.hp > 60 ? '#7fbf6a' : top.hp > 30 ? '#e0b84a' : '#e0675a';
      ctx.fillRect(x - 12, y + 16, (24 * top.hp) / 100, 4);
    }
    // type label when zoomed in
    if (z >= 1.3) {
      ctx.font = '700 7.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const ly = y + (top.hp < 100 ? 25 : 20);
      ctx.strokeText(UNITS[top.type].abbr, x, ly);
      ctx.fillStyle = '#f4ecd8';
      ctx.fillText(UNITS[top.type].abbr, x, ly);
    }
    // stack count
    if (units.length > 1) {
      ctx.beginPath();
      ctx.arc(x + 11, y - 10, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '700 8.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(units.length), x + 11, y - 9.5);
    }
    // moves left (human's units)
    if (top.owner === g.humanId && top.moves > 0 && !top.fortified && !top.sleeping) {
      ctx.beginPath();
      ctx.arc(x - 11, y - 10, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = '#7fe07a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  // ============================================================== minimap

  /** Minimap: terrain tinted by owner, cities, and the viewport rectangle. */
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
      const owned = t.owner >= 0 && !this.isWater[i];
      const key = owned ? `${t.t}|${t.owner}` : t.t;
      let c = this.minimapColors.get(key);
      if (!c) {
        c = owned ? mix(TERRAIN[t.t].color, g.player(t.owner).color, 0.6) : TERRAIN[t.t].color;
        this.minimapColors.set(key, c);
      }
      ctx.fillStyle = c;
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
