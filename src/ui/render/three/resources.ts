// 3D models for map resources: small dioramas that sit in a corner of the hex.

import * as THREE from 'three';
import type { ResourceId } from '../../../core/data/terrain';
import type { Frame } from './baker';
import { ball, beast, box, C, cone, cyl, group, mat, rod, tone } from './parts';

export const RESOURCE_FRAME: Frame = { r: 17, up: 20, down: 11 };

type V3 = [number, number, number];

/** Deterministic jitter so repeated props don't look stamped. */
function jit(i: number, k: number): number {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return v - Math.floor(v) - 0.5;
}

function rock(r: number, color: string, at: V3, squash = 0.7, shine = 0): THREE.Object3D {
  const m = ball(r, mat(color, shine), at, [1, squash, 1], 0);
  m.rotation.set(at[0] * 0.7, at[2] * 1.3, 0);
  return m;
}

function sheaf(at: V3): THREE.Object3D {
  const gold = mat('#d8aa3a');
  return group(
    [
      cyl(0.9, 1.4, 3.2, mat('#c49530'), [0, 0, 0], undefined, 7),
      cone(1.5, 2.2, gold, [0, 3.0, 0], undefined, 7),
      cyl(1.0, 1.0, 0.5, mat(C.rope), [0, 1.6, 0], undefined, 7),
    ],
    at,
  );
}

function wheat(): THREE.Object3D {
  const parts: THREE.Object3D[] = [];
  // a ripe field: rows of standing ears on tilled earth
  parts.push(box(16, 0.4, 11, mat('#8a6a3a'), [0, 0.2, 0]));
  const ears = [mat('#f2d264'), mat('#e8c252'), mat('#dcb244')];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 7; c++) {
      const x = -6.6 + c * 2.2 + jit(r, c) * 0.6;
      const z = -4.4 + r * 2.2 + jit(c, r) * 0.5;
      parts.push(cone(0.95, 2.6 + jit(r * 7 + c, 3) * 0.8, ears[(r + c) % 3], [x, 0.4, z], [jit(r, c + 9) * 0.3, 0, jit(c, r + 9) * 0.3], 5));
    }
  }
  parts.push(sheaf([-4.4, 0, 6.6]), sheaf([-1.2, 0, 7.2]), sheaf([2.2, 0, 6.4]));
  return group(parts, undefined, [0, 0.25, 0]);
}

function cattle(): THREE.Object3D {
  const cows: THREE.Object3D[] = [];
  const coats = ['#f2eee6', '#7a4a2c', '#2e2a28'];
  [
    [-4.2, -2.2, 1.9],
    [4.6, 2.6, -0.4],
    [-1.4, 5.0, 0.7],
  ].forEach(([x, z, rot], i) => {
    const cow = beast({ coat: coats[i], ox: true });
    cow.scale.setScalar(i === 2 ? 0.42 : 0.52);
    cow.position.set(x, 0, z);
    cow.rotation.y = rot;
    // patches on the pale cow
    if (i === 0) cow.add(ball(1, mat('#2e2a28'), [1.4, 9.4, -1.6], [1.6, 1.4, 2.4], 0));
    cows.push(cow);
  });
  // a fence corner
  const wood = mat(C.wood);
  for (let k = 0; k < 4; k++) cows.push(cyl(0.35, 0.35, 3.8, wood, [-9 + k * 4.2, 0, -7], undefined, 5));
  cows.push(box(13, 0.4, 0.4, wood, [-2.7, 3.0, -7]), box(13, 0.4, 0.4, wood, [-2.7, 1.8, -7]));
  return group(cows);
}

function fish(): THREE.Object3D {
  const body = mat('#7aa8c8', 0.8);
  const belly = mat('#dfeaf0', 0.6);
  const parts: THREE.Object3D[] = [];
  // two fish leaping out of rings of spray
  const jump = (at: V3, rot: number, s: number) => {
    const f = group(
      [
        ball(1, body, [0, 0, 0], [1.3, 1.5, 4.0], 1),
        ball(1, belly, [0, -0.6, 0.4], [1.0, 0.9, 3.0], 1),
        cone(1.8, 2.6, body, [0, 0, -3.8], [-Math.PI / 2, 0, 0], 4),
        ball(0.35, mat(C.dark), [0.9, 0.5, 3.0], [1, 1, 1], 0),
        cone(0.6, 1.6, body, [0, 1.2, 0.4], undefined, 3),
      ],
      at,
      [-0.7, rot, 0],
      s,
    );
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2 * s, 0.35 * s, 3, 16), mat('#e8f4fa', 0.5));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at[0], 0.2, at[2] - 2.6 * s);
    parts.push(f, ring);
  };
  jump([-3.4, 4.6, 0], 1.2, 1);
  jump([4.6, 2.8, 4], 2.3, 0.75);
  // a moored float
  parts.push(cyl(0.9, 0.9, 1.2, mat('#c0392b'), [5.4, 0, -4.6], undefined, 8), cyl(0.92, 0.92, 0.5, mat(C.linen), [5.4, 1.2, -4.6], undefined, 8));
  return group(parts);
}

function wine(): THREE.Object3D {
  const parts: THREE.Object3D[] = [];
  const leaf = mat('#5d8a34');
  const leafDark = mat('#46702a');
  const grape = mat('#5a1a48', 0.5);
  const post = mat(C.woodDark);
  for (let r = 0; r < 3; r++) {
    const z = -5 + r * 4.6;
    parts.push(cyl(0.3, 0.3, 4.6, post, [-7, 0, z], undefined, 4), cyl(0.3, 0.3, 4.6, post, [6, 0, z], undefined, 4));
    parts.push(rod(0.12, 13, mat(C.rope), [-0.5, 4.2, z], [0, 0, Math.PI / 2], 3));
    for (let k = 0; k < 4; k++) {
      const x = -5 + k * 3.4 + jit(r, k) * 0.8;
      parts.push(ball(1.6, k % 2 ? leaf : leafDark, [x, 3.2, z], [1.2, 0.9, 0.8], 0));
      if ((k + r) % 2 === 0) parts.push(ball(0.8, grape, [x + 0.6, 2.0, z + 0.8], [0.9, 1.4, 0.9], 0));
    }
  }
  // a barrel
  parts.push(cyl(1.8, 1.6, 4.0, mat('#8a5a30'), [8.4, 0, 6.2], [Math.PI / 2, 0, 0.4], 10));
  parts.push(cyl(1.85, 1.85, 0.4, mat(C.iron), [8.4, 1.8, 5.0], [Math.PI / 2, 0, 0.4], 10));
  return group(parts);
}

function iron(): THREE.Object3D {
  const parts: THREE.Object3D[] = [];
  const ore = ['#7a4f3a', '#6c625c', '#8a5a40', '#5a524e'];
  [
    [-4.4, 0.6, 2.4, 3.2],
    [-0.6, 0.4, 4.6, 2.6],
    [3.2, 0.5, 3.0, 2.2],
    [-2.4, 2.4, 2.8, 1.8],
  ].forEach(([x, y, z, r], i) => parts.push(rock(r, ore[i], [x, y, z], 0.75)));
  // timbered mine adit
  const wood = mat(C.wood);
  parts.push(rock(5.8, '#6a645c', [1.4, 2.2, -4.0], 0.8));
  parts.push(box(4.4, 4.6, 1.0, mat('#1a1614'), [1.0, 2.3, -0.6]));
  parts.push(box(0.9, 5.6, 0.9, wood, [-1.6, 2.8, 0.2]), box(0.9, 5.6, 0.9, wood, [3.6, 2.8, 0.2]), box(6.6, 1.0, 1.2, wood, [1.0, 5.6, 0.2]));
  // a cart of ore on its rails
  parts.push(box(1, 0.3, 9, mat(C.iron), [6.2, 0.2, 3.6]), box(1, 0.3, 9, mat(C.iron), [8.4, 0.2, 3.6]));
  parts.push(box(3.6, 2.2, 3.6, mat(C.woodDark), [7.3, 1.6, 5.0]));
  parts.push(rock(1.4, ore[0], [7.0, 3.0, 5.0], 0.6), rock(1.2, ore[2], [7.8, 3.1, 4.6], 0.6));
  return group(parts);
}

function horses(): THREE.Object3D {
  const parts: THREE.Object3D[] = [];
  [
    ['#7a4e2c', -3.4, -1.4, 1.5, 0.5],
    ['#e8e2d8', 4.2, 2.8, -0.6, 0.46],
    ['#3e2a1a', -0.6, 5.6, 2.6, 0.4],
  ].forEach(([coat, x, z, rot, s]) => {
    const h = beast({ coat: coat as string });
    h.scale.setScalar(s as number);
    h.position.set(x as number, 0, z as number);
    h.rotation.y = rot as number;
    parts.push(h);
  });
  const wood = mat('#a8845a');
  for (let k = 0; k < 4; k++) parts.push(cyl(0.35, 0.35, 4, wood, [-9 + k * 4.4, 0, -6.4], undefined, 5));
  parts.push(box(13.6, 0.45, 0.45, wood, [-2.4, 3.2, -6.4]), box(13.6, 0.45, 0.45, wood, [-2.4, 1.8, -6.4]));
  return group(parts);
}

function furs(): THREE.Object3D {
  const parts: THREE.Object3D[] = [];
  const wood = mat(C.woodDark);
  // a drying rack hung with pelts
  parts.push(rod(0.35, 8, wood, [-5.4, 3.6, 0], [0, 0, 0.18]), rod(0.35, 8, wood, [5.4, 3.6, 0], [0, 0, -0.18]));
  parts.push(rod(0.3, 12.6, wood, [0, 7.2, 0], [0, 0, Math.PI / 2]));
  const pelts = ['#8a5a33', '#6e4426', '#a8784a'];
  for (let k = 0; k < 3; k++) {
    const x = -3.6 + k * 3.6;
    parts.push(box(2.8, 4.6, 0.3, mat(pelts[k]), [x, 4.6, 0.2], [0, 0, jit(k, 1) * 0.2]));
    parts.push(cone(0.5, 1.6, mat(tone(pelts[k], 0.7)), [x, 1.2, 0.2], [Math.PI, 0, 0], 4));
  }
  // a stack of folded skins and a hunter's lean-to
  parts.push(box(4.4, 0.8, 3.0, mat('#7a4a28'), [5.4, 0.4, 5.6]), box(4.0, 0.8, 2.8, mat('#9a6a3c'), [5.2, 1.2, 5.4], [0, 0.3, 0]));
  parts.push(cone(3.4, 5.4, mat('#6a5a40'), [-5.6, 0, 5.4], undefined, 5));
  return group(parts);
}

function silver(): THREE.Object3D {
  const parts: THREE.Object3D[] = [];
  parts.push(rock(5.2, '#6a6e74', [-1.4, 1.8, -2.4], 0.75), rock(3.4, '#7c8088', [3.6, 1.2, -0.6], 0.7));
  // bright crystals of ore poking out
  const bright = mat('#e6ecf2', 1);
  [
    [-3.4, 3.6, 0.6, 0.3],
    [-0.4, 4.4, 0.4, -0.3],
    [1.6, 3.0, 1.6, 0.5],
    [4.4, 2.6, 1.4, -0.2],
  ].forEach(([x, y, z, tilt]) => parts.push(cone(0.9, 3.2, bright, [x, y - 1.2, z], [0.3, 0, tilt], 5)));
  // ingots on a crate
  parts.push(box(5.2, 2.0, 3.6, mat(C.wood), [-3.6, 1.0, 6.0]));
  for (const [x, z] of [[-4.8, 5.4], [-2.6, 5.4], [-3.7, 6.6]]) parts.push(box(1.8, 0.8, 1.0, bright, [x, 2.4, z]));
  return group(parts);
}

function salt(): THREE.Object3D {
  const parts: THREE.Object3D[] = [];
  // evaporation pans
  parts.push(box(15, 0.4, 7, mat('#8aa4b0', 0.6), [0, 0.2, -3.6]), box(15.4, 0.8, 0.5, mat('#a89878'), [0, 0.4, -0.1]), box(0.5, 0.8, 7, mat('#a89878'), [0, 0.4, -3.6]));
  // heaps of salt
  const white = mat('#f4f2ec', 0.3);
  parts.push(cone(3.4, 4.4, white, [-4.2, 0, 4.4], undefined, 9), cone(2.6, 3.4, white, [0.6, 0, 5.4], undefined, 9), cone(2.0, 2.6, white, [4.4, 0, 4.0], undefined, 9));
  parts.push(rod(0.2, 7, mat(C.wood), [6.2, 2.6, 6.0], [0.9, 0, 0.3], 4));
  return group(parts);
}

function olives(): THREE.Object3D {
  const parts: THREE.Object3D[] = [];
  const bark = mat('#6b5a44');
  const leaves = mat('#8a9a62');
  const leavesDark = mat('#6e7e4a');
  const tree = (x: number, z: number, s: number) =>
    group(
      [
        cyl(0.7, 1.2, 4.4, bark, [0, 0, 0], [0, 0, 0.25], 6),
        rod(0.5, 3.6, bark, [1.4, 4.6, 0], [0, 0, -0.7], 5),
        ball(3.2, leavesDark, [-0.6, 6.2, 0], [1.2, 0.7, 1.1], 1),
        ball(2.6, leaves, [2.2, 6.8, 0.6], [1.1, 0.7, 1.1], 1),
        ball(2.2, leaves, [-1.8, 7.4, -0.8], [1, 0.7, 1], 1),
        ...[0, 1, 2, 3].map((k) => ball(0.35, mat('#2e3418'), [-2 + k * 1.4, 5.0, 2.6 - (k % 2)], [1, 1.3, 1], 0)),
      ],
      [x, 0, z],
      [0, x * 0.4, 0],
      s,
    );
  parts.push(tree(-4.4, -1.6, 1), tree(4.6, 1.8, 0.85));
  // a basket of the crop
  parts.push(cyl(1.8, 1.4, 1.8, mat('#b08a54'), [-0.4, 0, 6.0], undefined, 9));
  parts.push(ball(1.5, mat('#3a4220'), [-0.4, 1.7, 6.0], [1, 0.4, 1], 0));
  return group(parts);
}

const BUILDERS: Record<ResourceId, () => THREE.Object3D> = { wheat, cattle, fish, wine, iron, horses, furs, silver, salt, olives };

export function resourceModel(res: ResourceId): THREE.Object3D {
  return BUILDERS[res]();
}

/** Resources on water cast no ground shadow. */
export function resourceOnWater(res: ResourceId): boolean {
  return res === 'fish';
}
