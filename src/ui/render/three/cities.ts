// 3D models for cities: a keep flying the owner's banner, houses that
// multiply as the city grows, and landmarks for some of its buildings.

import * as THREE from 'three';
import type { Frame } from './baker';
import { ball, box, C, cone, cyl, group, mat, pennant, slab, tone } from './parts';

export const CITY_FRAME: Frame = { r: 30, up: 40, down: 20 };

export interface CitySpec {
  team: string;
  pop: number;
  capital: boolean;
  walls: boolean;
  castle: boolean;
  temple: boolean;
  market: boolean;
  granary: boolean;
  /** any world wonder: a cathedral or a gilded dome */
  cathedral: boolean;
  wonder: boolean;
  /** layout seed */
  seed: number;
}

/** Everything that changes how the model looks, as a cache key. */
export function citySignature(c: CitySpec): string {
  const flags = [c.capital, c.walls, c.castle, c.temple, c.market, c.granary, c.cathedral, c.wonder].map((f) => (f ? 1 : 0)).join('');
  return `${c.team}:${houseCount(c.pop)}:${flags}:${c.seed}`;
}

export function cityRadius(pop: number): number {
  return 12 + Math.min(9, pop * 0.8);
}

function houseCount(pop: number): number {
  return Math.max(4, Math.min(16, 3 + Math.round(pop * 1.1)));
}

function rand(seed: number, k: number): number {
  const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

const STONE = '#cfc6b2';
const STONE_DARK = '#a39a86';
const WALLS = ['#efe6d0', '#e4d6b4', '#d8c8a8', '#f2ece0', '#c9b796'];

/** A gabled house about 5 wide; `roof` is the roof colour. */
function house(w: number, d: number, h: number, wall: string, roof: string, timber: boolean): THREE.Group {
  const parts: THREE.Object3D[] = [box(w, h, d, mat(wall), [0, h / 2, 0])];
  const rise = w * 0.55;
  parts.push(slab(`gable${w},${rise}`, [[-w / 2 - 0.4, 0], [w / 2 + 0.4, 0], [0, rise]], d + 0.8, mat(roof), [0, h, 0]));
  if (timber) {
    const beam = mat(C.woodDark);
    parts.push(box(w + 0.05, 0.3, d + 0.05, beam, [0, h * 0.55, 0]), box(0.3, h, d + 0.05, beam, [-w / 2 + 0.15, h / 2, 0]), box(0.3, h, d + 0.05, beam, [w / 2 - 0.15, h / 2, 0]));
  }
  parts.push(box(1.1, 1.8, 0.2, mat(C.woodDark), [0, 0.9, d / 2 + 0.05]));
  return group(parts);
}

function crenellations(w: number, d: number, y: number, material: THREE.Material): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const n = Math.max(2, Math.round(w / 1.6));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    if (i % 2 === 0) {
      out.push(box(w / n, 1.0, 0.6, material, [x, y + 0.5, d / 2 - 0.3]));
      out.push(box(w / n, 1.0, 0.6, material, [x, y + 0.5, -d / 2 + 0.3]));
    }
  }
  const m = Math.max(2, Math.round(d / 1.6));
  for (let i = 0; i < m; i++) {
    const z = -d / 2 + (i + 0.5) * (d / m);
    if (i % 2 === 0) {
      out.push(box(0.6, 1.0, d / m, material, [w / 2 - 0.3, y + 0.5, z]));
      out.push(box(0.6, 1.0, d / m, material, [-w / 2 + 0.3, y + 0.5, z]));
    }
  }
  return out;
}

function tower(r: number, h: number, roof: string | null, at: [number, number, number]): THREE.Group {
  const parts: THREE.Object3D[] = [cyl(r, r * 1.08, h, mat(STONE), [0, 0, 0], undefined, 10)];
  if (roof) parts.push(cone(r * 1.25, r * 2.2, mat(roof), [0, h, 0], undefined, 10));
  else {
    parts.push(cyl(r * 1.15, r * 1.15, 0.8, mat(STONE_DARK), [0, h, 0], undefined, 10));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      parts.push(box(0.9, 1.0, 0.9, mat(STONE_DARK), [Math.cos(a) * r, h + 1.2, Math.sin(a) * r]));
    }
  }
  return group(parts, at);
}

function keep(c: CitySpec): THREE.Group {
  const stone = mat(STONE);
  const big = c.capital || c.castle;
  const w = big ? 7.4 : 6;
  const h = big ? 15 : 11.5;
  const parts: THREE.Object3D[] = [box(w, h, w, stone, [0, h / 2, 0]), box(w + 0.6, 0.8, w + 0.6, mat(STONE_DARK), [0, h, 0]), ...crenellations(w + 0.6, w + 0.6, h + 0.4, stone)];
  // door and arrow slits
  parts.push(box(1.6, 2.6, 0.2, mat('#3a2c1c'), [0, 1.3, w / 2 + 0.05]));
  for (const y of [h * 0.5, h * 0.75]) parts.push(box(0.4, 1.3, 0.2, mat(C.dark), [-w * 0.22, y, w / 2 + 0.05]), box(0.4, 1.3, 0.2, mat(C.dark), [w * 0.22, y, w / 2 + 0.05]));
  parts.push(pennant(c.team, 8, [0, h + 0.4, 0], 5.2));
  if (c.castle) {
    const s = w / 2 + 1.2;
    for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]] as [number, number][]) parts.push(tower(1.7, h * 0.78, c.team, [x, 0, z]));
    parts.push(box(w + 2.4, h * 0.5, w + 2.4, mat(STONE_DARK), [0, h * 0.25, 0]));
  }
  return group(parts);
}

function church(team: string, big: boolean): THREE.Group {
  const stone = mat('#e2dccb');
  const len = big ? 12 : 8;
  const parts: THREE.Object3D[] = [
    box(4.6, 5.4, len, stone, [0, 2.7, 0]),
    slab(`nave${len}`, [[-2.8, 0], [2.8, 0], [0, 3.2]], len + 0.4, mat('#6a6e78'), [0, 5.4, 0]),
  ];
  const tw = big ? 3.4 : 2.8;
  const th = big ? 11 : 9;
  const front = len / 2 + tw / 2 - 0.4;
  const towers = big ? [-1.9, 1.9] : [0];
  for (const x of towers) {
    parts.push(box(tw, th, tw, stone, [x, th / 2, front]));
    parts.push(cone(tw * 0.75, big ? 3 : 6.4, mat('#5a5e68'), [x, th, front], undefined, 4).rotateY(Math.PI / 4));
  }
  parts.push(ball(1.0, mat('#4a6aa8', 0.6), [0, 4.2, front + tw / 2 + 0.1], [1, 1, 0.2], 1));
  if (big) parts.push(pennant(team, 4, [0, 8.6, -len / 2 + 1], 2.6));
  else parts.push(box(0.3, 1.8, 0.3, mat(C.gold, 0.7), [0, th + 6.6, front]), box(1.2, 0.3, 0.3, mat(C.gold, 0.7), [0, th + 7.0, front]));
  const g = group(parts);
  // face the viewer with the west front
  g.rotation.y = 0.35;
  return g;
}

function dome(): THREE.Group {
  return group([
    box(6, 4.4, 6, mat('#efe6d0'), [0, 2.2, 0]),
    cyl(2.8, 2.8, 1.6, mat('#e2d6b8'), [0, 4.4, 0], undefined, 12),
    ball(2.8, mat(C.gold, 0.9), [0, 6.0, 0], [1, 0.9, 1], 2),
    cone(0.4, 1.6, mat(C.gold, 0.9), [0, 8.4, 0], undefined, 6),
  ]);
}

function marketStall(team: string, rot: number): THREE.Group {
  const g = group([
    box(3.4, 1.2, 2.2, mat(C.wood), [0, 0.6, 0]),
    box(0.25, 2.8, 0.25, mat(C.woodDark), [-1.5, 1.4, -0.9]),
    box(0.25, 2.8, 0.25, mat(C.woodDark), [1.5, 1.4, -0.9]),
    slab('awning', [[-1.9, 0], [1.9, 0], [1.9, 0.4], [-1.9, 1.4]], 2.8, mat(team), [0, 2.6, 0], [0, 0, 0]),
    ball(0.5, mat('#d8a040'), [-0.8, 1.4, 0.4], [1, 1, 1], 0),
    ball(0.5, mat('#8aa040'), [0.6, 1.4, 0.3], [1, 1, 1], 0),
  ]);
  g.rotation.y = rot;
  return g;
}

function granary(): THREE.Group {
  return group([cyl(2.2, 2.4, 3.6, mat('#d8c8a0'), [0, 0, 0], undefined, 10), cone(3.0, 2.8, mat('#c8a050'), [0, 3.6, 0], undefined, 10)]);
}

/** A ring wall with round towers and a gatehouse facing the viewer. */
function walls(R: number, castle: boolean): THREE.Group {
  const parts: THREE.Object3D[] = [];
  const n = castle ? 10 : 8;
  const h = castle ? 4.6 : 3.6;
  const thick = castle ? 1.6 : 1.2;
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.PI / n;
    pts.push([Math.cos(a) * R, Math.sin(a) * R * 0.92]);
  }
  for (let k = 0; k < n; k++) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[(k + 1) % n];
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bz - az, bx - ax);
    // a gate in the wall nearest the viewer
    const gate = mz > R * 0.6 && Math.abs(mx) < R * 0.4;
    const seg = box(len, h, thick, mat(STONE), [mx, h / 2, mz], [0, -ang, 0]);
    parts.push(seg);
    const merlons = Math.floor(len / 1.5);
    for (let i = 0; i < merlons; i += 2) {
      const t = (i + 0.5) / merlons - 0.5;
      parts.push(box(0.8, 0.9, thick, mat(STONE_DARK), [mx + Math.cos(ang) * t * len, h + 0.45, mz + Math.sin(ang) * t * len], [0, -ang, 0]));
    }
    if (gate) {
      parts.push(box(2.4, h * 0.75, thick + 0.1, mat('#3a2c1c'), [mx, h * 0.375, mz], [0, -ang, 0]));
      parts.push(tower(1.4, h + 2.4, null, [mx - Math.cos(ang) * 2.2, 0, mz - Math.sin(ang) * 2.2]));
      parts.push(tower(1.4, h + 2.4, null, [mx + Math.cos(ang) * 2.2, 0, mz + Math.sin(ang) * 2.2]));
    }
  }
  for (const [x, z] of pts) parts.push(tower(castle ? 1.8 : 1.5, h + 1.8, castle ? null : '#6a6e78', [x, 0, z]));
  return group(parts);
}

export function cityModel(c: CitySpec): THREE.Object3D {
  const R = cityRadius(c.pop);
  const parts: THREE.Object3D[] = [];
  // packed earth and cobbles
  parts.push(cyl(R + 1.5, R + 2, 0.4, mat('#9a8a6a'), [0, 0, 0], undefined, 18));
  parts.push(cyl(R * 0.4, R * 0.4, 0.5, mat('#b4a888'), [0, 0, 0], undefined, 12));

  parts.push(keep(c));

  // landmarks on fixed spots around the keep
  const slots: [number, number][] = [
    [-R * 0.55, -R * 0.35],
    [R * 0.55, -R * 0.3],
    [R * 0.5, R * 0.45],
    [-R * 0.5, R * 0.5],
  ];
  const taken = new Set<number>();
  const put = (obj: THREE.Object3D, slot: number) => {
    const [x, z] = slots[slot];
    obj.position.x += x;
    obj.position.z += z;
    taken.add(slot);
    parts.push(obj);
  };
  if (c.cathedral) put(church(c.team, true), 0);
  else if (c.temple) put(church(c.team, false), 0);
  if (c.wonder && !c.cathedral) put(dome(), 1);
  if (c.market) {
    const m = group([marketStall(c.team, 0.3), marketStall(tone(c.team, 1.4), -0.4)]);
    m.children[1].position.set(3.6, 0, 1.2);
    put(m, 2);
  }
  if (c.granary) put(granary(), c.wonder && !c.cathedral ? 3 : 1);

  // houses on a sunflower spiral, avoiding the keep and the landmarks
  const count = houseCount(c.pop);
  const spin = rand(c.seed, 1) * Math.PI * 2;
  let placed = 0;
  for (let i = 0; placed < count && i < count * 3; i++) {
    const a = i * 2.39996 + spin;
    const rr = R * 0.38 + R * 0.55 * Math.sqrt((i + 0.5) / (count * 1.4));
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr * 0.92;
    if (Math.abs(x) < 5.4 && Math.abs(z) < 5.4) continue;
    let blocked = false;
    for (const s of taken) if (Math.hypot(x - slots[s][0], z - slots[s][1]) < 5.2) blocked = true;
    if (blocked) continue;
    const r = rand(c.seed, 10 + i);
    const w = 3.6 + r * 1.6;
    const d = 3.2 + rand(c.seed, 40 + i) * 1.4;
    const h = 2.8 + rand(c.seed, 70 + i) * 2.0 + (rr < R * 0.6 ? 1 : 0);
    const roof = r < 0.55 ? tone(c.team, 0.7 + rand(c.seed, 90 + i) * 0.45) : r < 0.8 ? '#a8553a' : '#6a6e78';
    const hs = house(w, d, h, WALLS[i % WALLS.length], roof, rand(c.seed, 110 + i) < 0.4);
    hs.position.set(x, 0.3, z);
    hs.rotation.y = -a + Math.PI / 2;
    parts.push(hs);
    placed++;
  }

  if (c.walls || c.castle) parts.push(walls(R + 1.2, c.castle));
  return group(parts);
}
