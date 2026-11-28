// Low-poly building blocks for the map's 3D models: shared materials and
// geometries, and builders for people, horses, wheels and flags.
//
// Units: one model unit is one art unit of the map (a hex has radius 30).
// +y is up, and a model's front faces +z unless it is turned.

import * as THREE from 'three';

// ------------------------------------------------------------ materials

const materials = new Map<string, THREE.Material>();

/** A flat-shaded material, shared between models. `shine` 0..1 adds a specular highlight. */
export function mat(color: string | number, shine = 0): THREE.Material {
  const key = `${color}|${shine}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshPhongMaterial({
      color,
      flatShading: true,
      shininess: 6 + shine * 90,
      specular: new THREE.Color(0xffffff).multiplyScalar(0.04 + shine * 0.5),
    });
    materials.set(key, m);
  }
  return m;
}

export const C = {
  skin: '#e2b08c',
  skinDark: '#b98a64',
  hair: '#4a3020',
  cloth: '#8c7a5a',
  linen: '#e8dfc8',
  trousers: '#4b4436',
  boots: '#3a2818',
  leather: '#6e4a2a',
  wood: '#8a5f36',
  woodDark: '#5c3e22',
  steel: '#b8c0c8',
  iron: '#6c7178',
  dark: '#2c2a2a',
  bronze: '#b08a3c',
  gold: '#e0b440',
  rope: '#c8b07a',
  horse: '#7a4e2c',
  horseDark: '#3e2a1a',
  horseGrey: '#c8c2b8',
  ox: '#8c6a48',
  canvas: '#e6dcc0',
  habit: '#5a4330',
  olive: '#5a6142',
  sand: '#8c876a',
  gunmetal: '#3b3e42',
  tyre: '#242322',
} as const;

/** Darker or lighter version of a #rrggbb colour. */
export function tone(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  if (f < 1) c.multiplyScalar(f);
  else c.lerp(new THREE.Color(0xffffff), f - 1);
  return `#${c.getHexString()}`;
}

// ----------------------------------------------------------- geometries

const geometries = new Map<string, THREE.BufferGeometry>();

function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g;
}

type V3 = [number, number, number];

function place(m: THREE.Object3D, at: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): THREE.Object3D {
  m.position.set(...at);
  m.rotation.set(...rot);
  return m;
}

export function box(w: number, h: number, d: number, material: THREE.Material, at?: V3, rot?: V3): THREE.Object3D {
  const g = geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  return place(new THREE.Mesh(g, material), at, rot);
}

/** Cylinder standing on its base at `at` (unless rotated). */
export function cyl(rTop: number, rBottom: number, h: number, material: THREE.Material, at: V3 = [0, 0, 0], rot?: V3, seg = 8): THREE.Object3D {
  const g = geo(`cyl${rTop},${rBottom},${h},${seg}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, seg).translate(0, h / 2, 0));
  return place(new THREE.Mesh(g, material), at, rot);
}

/** Cylinder centred on `at`, along its local y axis. */
export function rod(r: number, len: number, material: THREE.Material, at: V3, rot: V3 = [0, 0, 0], seg = 6): THREE.Object3D {
  const g = geo(`rod${r},${len},${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg));
  return place(new THREE.Mesh(g, material), at, rot);
}

export function cone(r: number, h: number, material: THREE.Material, at: V3 = [0, 0, 0], rot?: V3, seg = 8): THREE.Object3D {
  const g = geo(`cone${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0));
  return place(new THREE.Mesh(g, material), at, rot);
}

export function ball(r: number, material: THREE.Material, at: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], detail = 1): THREE.Object3D {
  const g = geo(`ball${r},${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
  const m = place(new THREE.Mesh(g, material), at);
  m.scale.set(...scale);
  return m;
}

/** A flat shape (in the xy plane) extruded `depth` along z, centred on z = 0. */
export function slab(key: string, outline: [number, number][], depth: number, material: THREE.Material, at?: V3, rot?: V3): THREE.Object3D {
  const g = geo(`slab${key},${depth}`, () => {
    const s = new THREE.Shape();
    outline.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -depth / 2);
  });
  return place(new THREE.Mesh(g, material), at, rot);
}

export function group(children: THREE.Object3D[], at?: V3, rot?: V3, scale = 1): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  place(g, at, rot);
  g.scale.setScalar(scale);
  return g;
}

// ---------------------------------------------------------------- props

/** A spoked cart wheel facing ±x, centred on `at`. */
export function wheel(r: number, at: V3, material = mat(C.woodDark)): THREE.Object3D {
  const g = geo(`wheel${r}`, () => new THREE.TorusGeometry(r, r * 0.16, 4, 12));
  const rim = new THREE.Mesh(g, material);
  const parts: THREE.Object3D[] = [rim, rod(r * 0.22, r * 0.5, material, [0, 0, 0], [0, 0, Math.PI / 2])];
  for (let k = 0; k < 3; k++) parts.push(rod(r * 0.07, r * 2, material, [0, 0, 0], [0, 0, 0], 4).rotateZ((k * Math.PI) / 3));
  const w = group(parts, at);
  w.rotation.y = Math.PI / 2;
  return w;
}

/** A swallow-tailed pennant on a pole; the pole's foot is at `at`. */
export function pennant(team: string, height: number, at: V3 = [0, 0, 0], flag = 4): THREE.Group {
  const len = flag;
  const outline: [number, number][] = [
    [0, 0],
    [len, -0.3],
    [len * 0.72, -len * 0.3],
    [len, -len * 0.58],
    [0, -len * 0.62],
  ];
  return group(
    [
      rod(0.22, height, mat(C.woodDark), [0, height / 2, 0]),
      ball(0.4, mat(C.gold, 0.6), [0, height + 0.2, 0], [1, 1, 1], 0),
      slab(`pennant${len}`, outline, 0.25, mat(team), [0.2, height - 0.2, 0], [0, -0.35, 0]),
    ],
    at,
  );
}

// -------------------------------------------------------------- people

export type Head = 'bare' | 'hood' | 'cap' | 'kettle' | 'helm' | 'greathelm' | 'morion' | 'hat' | 'cowl' | 'shako' | 'steelhelmet';
export type RightHand = 'none' | 'spear' | 'pike' | 'sword' | 'pitchfork' | 'musket' | 'staff' | 'lance' | 'torch' | 'cross' | 'rifle' | 'sabre';
export type LeftHand = 'none' | 'round' | 'heater' | 'pavise' | 'bow' | 'crossbow' | 'bundle' | 'book';

export interface FigureOpts {
  team: string;
  /** tunic: team-coloured cloth; armour: steel with a team surcoat; coat: long team coat; robe: a friar's habit with a team stole */
  body?: 'tunic' | 'armour' | 'coat' | 'peasant' | 'cloak' | 'robe';
  head?: Head;
  right?: RightHand;
  left?: LeftHand;
  /** sitting astride a horse: legs splayed forward, no feet on the ground */
  mounted?: boolean;
  /** darker armour (cuirassiers) */
  blackened?: boolean;
}

/** A person about 16 units tall, standing on the origin, facing +z. */
export function figure(o: FigureOpts): THREE.Group {
  const team = mat(o.team);
  const teamDark = mat(tone(o.team, 0.7));
  const armour = mat(o.blackened ? '#3c3f46' : C.steel, 0.9);
  const skin = mat(C.skin);
  const body = o.body ?? 'tunic';
  const parts: THREE.Object3D[] = [];
  const legMat = body === 'armour' ? armour : body === 'peasant' ? mat(C.cloth) : mat(C.trousers);

  // legs (a habit hides them down to the feet)
  if (body === 'robe') {
    for (const s of [-1, 1]) parts.push(box(1.2, 0.8, 2.0, mat(C.leather), [s * 0.9, 0.4, 0.6]));
  } else if (o.mounted) {
    for (const s of [-1, 1]) {
      parts.push(rod(0.75, 4.6, legMat, [s * 2.0, 5.8, 1.0], [-0.9, 0, s * 0.35]));
      parts.push(box(1.3, 1.6, 2.2, mat(C.boots), [s * 2.4, 3.6, 2.4]));
    }
  } else {
    for (const s of [-1, 1]) {
      parts.push(cyl(0.72, 0.62, 5.6, legMat, [s * 0.95, 0.9, 0]));
      parts.push(box(1.3, 1.1, 2.2, mat(C.boots), [s * 0.95, 0.55, 0.4]));
    }
  }

  // torso
  const habit = mat(C.habit);
  const torsoMat = body === 'armour' ? armour : body === 'peasant' ? mat(C.cloth) : body === 'robe' ? habit : team;
  parts.push(cyl(1.95, 2.25, 5.4, torsoMat, [0, 6.4, 0]));
  if (body === 'armour') {
    // team surcoat over the armour, and a skirt below the belt
    parts.push(cyl(2.3, 2.6, 3.4, team, [0, 5.4, 0]));
    parts.push(box(2.6, 4.6, 0.3, team, [0, 9.2, 2.05]));
  } else if (body === 'coat') {
    parts.push(cyl(2.3, 3.0, 4.6, team, [0, 3.2, 0]));
    parts.push(box(0.5, 5.2, 0.3, mat(C.linen), [0, 9.0, 2.1]));
  } else if (body === 'robe') {
    parts.push(cyl(2.25, 3.1, 6.4, habit, [0, 3.2, 0]));
    // stole hanging down both sides of the chest
    for (const s of [-1, 1]) parts.push(box(0.7, 6.8, 0.3, team, [s * 0.75, 7.0, 2.25]));
  } else if (body === 'cloak') {
    parts.push(cone(3.3, 10.2, mat('#4a5a3a'), [0, 1.6, -0.3]));
    parts.push(box(1.8, 4.0, 0.3, team, [0, 8.6, 2.1]));
  } else {
    // hem of the tunic
    parts.push(cyl(2.25, 2.7, 2.4, body === 'peasant' ? mat(tone(C.cloth, 0.85)) : team, [0, 4.6, 0]));
    if (body === 'peasant') parts.push(cyl(2.3, 2.3, 0.9, team, [0, 7.4, 0]));
  }
  parts.push(cyl(2.3, 2.3, 0.6, mat(body === 'robe' ? C.rope : C.leather), [0, 6.6, 0]));

  // shoulders and arms
  const sleeve = body === 'armour' ? armour : body === 'peasant' ? mat(C.cloth) : body === 'cloak' ? mat('#4a5a3a') : body === 'robe' ? habit : teamDark;
  for (const s of [-1, 1]) parts.push(ball(1.0, sleeve, [s * 2.2, 11.2, 0], [1, 1, 1], 0));
  const right = o.right ?? 'none';
  const left = o.left ?? 'none';
  // right arm: forward and down, hand at about (2.6, 8.4, 2.6)
  parts.push(rod(0.6, 4.6, sleeve, [2.6, 9.6, 1.3], [0.9, 0, 0.12]));
  parts.push(ball(0.7, skin, [2.7, 8.4, 2.8], [1, 1, 1], 0));
  // left arm: held forward for a shield or bow
  parts.push(rod(0.6, 4.6, sleeve, [-2.6, 9.6, 1.3], [0.9, 0, -0.12]));
  parts.push(ball(0.7, skin, [-2.7, 8.4, 2.8], [1, 1, 1], 0));

  // head
  parts.push(cyl(0.7, 0.8, 1.0, skin, [0, 11.6, 0]));
  parts.push(ball(1.65, skin, [0, 13.6, 0.1], [1, 1.08, 1], 1));
  const head = o.head ?? 'bare';
  const helmMat = o.blackened ? armour : mat(C.iron, 0.8);
  switch (head) {
    case 'bare':
      parts.push(ball(1.7, mat(C.hair), [0, 14.2, -0.35], [1.02, 0.85, 1], 1));
      break;
    case 'hood':
      parts.push(ball(1.95, mat('#4a5a3a'), [0, 14.0, -0.3], [1, 1.05, 1], 1));
      parts.push(cone(1.1, 2.0, mat('#4a5a3a'), [0, 14.2, -1.8], [-1.7, 0, 0]));
      break;
    case 'shako':
      parts.push(cyl(1.7, 1.85, 3.4, mat(tone(o.team, 0.55)), [0, 14.0, 0], undefined, 10));
      parts.push(cyl(1.75, 1.75, 0.5, mat(C.gold, 0.5), [0, 17.2, 0], undefined, 10));
      parts.push(box(2.6, 0.3, 1.4, mat(C.dark), [0, 14.1, 1.6], [0.2, 0, 0]));
      parts.push(ball(0.7, mat(C.linen), [0, 18.2, 0.6], [0.8, 1.4, 0.8], 0));
      break;
    case 'steelhelmet':
      parts.push(ball(1.9, mat(C.olive, 0.3), [0, 14.6, 0], [1.05, 0.72, 1.1], 1));
      parts.push(cyl(2.7, 2.7, 0.25, mat(C.olive, 0.3), [0, 14.3, 0], undefined, 12));
      parts.push(cyl(1.95, 1.95, 0.35, team, [0, 14.55, 0], undefined, 12));
      break;
    case 'cowl':
      parts.push(ball(1.95, mat(C.habit), [0, 14.0, -0.35], [1, 1.05, 1], 1));
      parts.push(cone(1.2, 2.4, mat(C.habit), [0, 13.2, -1.9], [-2.2, 0, 0]));
      break;
    case 'cap':
      parts.push(cyl(1.75, 1.85, 1.0, team, [0, 14.3, 0]));
      parts.push(ball(1.8, team, [0, 15.2, 0], [1, 0.5, 1], 0));
      break;
    case 'kettle':
      parts.push(ball(1.85, helmMat, [0, 14.4, 0], [1, 0.8, 1], 1));
      parts.push(cyl(3.0, 3.0, 0.3, helmMat, [0, 14.2, 0], undefined, 10));
      break;
    case 'helm':
      parts.push(ball(1.9, helmMat, [0, 14.1, 0], [1, 1.05, 1], 1));
      parts.push(box(0.4, 2.0, 0.4, helmMat, [0, 13.4, 1.8]));
      break;
    case 'greathelm':
      parts.push(cyl(1.85, 1.95, 3.6, helmMat, [0, 12.1, 0]));
      parts.push(ball(1.85, helmMat, [0, 15.7, 0], [1, 0.4, 1], 0));
      parts.push(box(2.6, 0.35, 0.2, mat(C.dark), [0, 14.0, 1.9]));
      parts.push(ball(0.9, team, [0, 16.3, 0], [0.6, 1.4, 1.8], 0));
      break;
    case 'morion':
      parts.push(ball(1.85, helmMat, [0, 14.4, 0], [1, 0.85, 1.05], 1));
      parts.push(box(0.4, 1.6, 3.8, helmMat, [0, 15.6, 0]));
      parts.push(cyl(2.4, 2.6, 0.3, helmMat, [0, 14.1, 0], [0.18, 0, 0], 10));
      break;
    case 'hat':
      parts.push(cyl(2.9, 2.9, 0.3, mat(C.dark), [0, 14.6, 0], undefined, 10));
      parts.push(cyl(1.5, 1.8, 1.6, mat(C.dark), [0, 14.8, 0]));
      parts.push(cone(0.6, 3.2, team, [-1.4, 15.4, -0.6], [-0.4, 0, 0.6], 5));
      break;
  }

  // right hand
  const shaft = mat(C.wood);
  const blade = mat(C.steel, 1);
  const hand: V3 = [2.7, 8.4, 2.8];
  switch (right) {
    case 'spear':
      parts.push(rod(0.25, 19, shaft, [hand[0], hand[1] + 3, hand[2]], [0.12, 0, 0]));
      parts.push(cone(0.6, 2.2, blade, [hand[0], hand[1] + 12.4, hand[2] + 1.2], [0.12, 0, 0], 4));
      break;
    case 'pike':
      parts.push(rod(0.25, 30, shaft, [hand[0], hand[1] + 7, hand[2] + 1.3], [0.18, 0, 0]));
      parts.push(cone(0.55, 2.4, blade, [hand[0], hand[1] + 21.6, hand[2] + 4.0], [0.18, 0, 0], 4));
      break;
    case 'sword':
      parts.push(box(0.5, 7.4, 1.0, blade, [hand[0] + 0.2, hand[1] + 4.6, hand[2] + 0.4], [0.25, 0, 0]));
      parts.push(box(2.6, 0.5, 0.6, mat(C.gold, 0.6), [hand[0] + 0.2, hand[1] + 0.8, hand[2]]));
      break;
    case 'pitchfork':
      parts.push(rod(0.25, 15, shaft, [hand[0], hand[1] + 2.4, hand[2]], [0.1, 0, 0]));
      for (const dx of [-0.9, 0, 0.9]) parts.push(rod(0.15, 2.6, mat(C.iron, 0.4), [hand[0] + dx, hand[1] + 11.3, hand[2] + 1.0], [0.1, 0, 0], 4));
      parts.push(box(2.0, 0.3, 0.3, mat(C.iron, 0.4), [hand[0], hand[1] + 10, hand[2] + 0.9]));
      break;
    case 'musket':
      // on the shoulder, barrel up and back
      parts.push(rod(0.3, 12, mat(C.dark, 0.6), [hand[0] - 0.3, hand[1] + 5.0, hand[2] - 2.4], [-0.75, 0, 0]));
      parts.push(box(0.9, 3.6, 1.2, shaft, [hand[0] - 0.3, hand[1] + 0.2, hand[2] + 1.2], [-0.75, 0, 0]));
      break;
    case 'staff':
      parts.push(rod(0.3, 16, shaft, [hand[0], hand[1] + 2, hand[2]], [0.05, 0, 0]));
      break;
    case 'lance':
      parts.push(rod(0.4, 24, shaft, [hand[0] - 0.4, hand[1] + 4.5, hand[2] + 6], [1.15, 0, 0], 6));
      parts.push(cone(0.9, 2.4, mat(C.steel, 1), [hand[0] - 0.4, hand[1] + 9.2, hand[2] + 16.6], [1.15, 0, 0], 5));
      parts.push(slab('lancepennon', [[0, 0], [3.6, -0.4], [2.6, -1.4], [3.6, -2.4], [0, -2.6]], 0.2, mat(o.team), [hand[0] - 0.4, hand[1] + 8.8, hand[2] + 12.8], [0, -Math.PI / 2, 0]));
      break;
    case 'torch':
      parts.push(rod(0.3, 6, shaft, [hand[0], hand[1] + 2, hand[2]]));
      break;
    case 'rifle':
      // held across the chest at port arms, bayonet up
      parts.push(rod(0.28, 11, mat(C.woodDark), [hand[0] - 1.6, hand[1] + 2.2, hand[2] + 0.4], [0, 0, 0.6]));
      parts.push(rod(0.18, 6, mat(C.dark, 0.6), [hand[0] - 3.6, hand[1] + 5.2, hand[2] + 0.4], [0, 0, 0.6]));
      parts.push(cone(0.22, 2.4, mat(C.steel, 1), [hand[0] - 5.0, hand[1] + 7.4, hand[2] + 0.4], [0, 0, 0.6], 4));
      break;
    case 'sabre':
      parts.push(box(0.35, 7, 0.9, mat(C.steel, 1), [hand[0] + 0.6, hand[1] + 4.2, hand[2] + 1.2], [0.5, 0, -0.15]));
      parts.push(box(1.6, 0.4, 0.6, mat(C.gold, 0.6), [hand[0] + 0.2, hand[1] + 0.8, hand[2] + 0.2]));
      break;
    case 'cross': {
      // processional cross: a tall staff with a gilded cross on top
      const gilt = mat(C.gold, 0.7);
      parts.push(rod(0.25, 17, shaft, [hand[0], hand[1] + 3.4, hand[2]]));
      parts.push(box(0.6, 4.2, 0.6, gilt, [hand[0], hand[1] + 13.4, hand[2]]));
      parts.push(box(3.0, 0.6, 0.6, gilt, [hand[0], hand[1] + 13.9, hand[2]]));
      break;
    }
    case 'none':
      break;
  }

  // left hand
  const lh: V3 = [-2.7, 8.4, 2.8];
  switch (left) {
    case 'round':
      parts.push(cyl(3.0, 3.0, 0.5, team, [-3.4, 8.6, 1.6], [Math.PI / 2 - 0.2, 0, 0.9], 12));
      parts.push(cyl(3.15, 3.15, 0.3, mat(C.iron, 0.5), [-3.45, 8.6, 1.5], [Math.PI / 2 - 0.2, 0, 0.9], 12));
      parts.push(ball(0.7, mat(C.steel, 1), [-3.0, 9.0, 2.2], [1, 1, 1], 0));
      break;
    case 'heater': {
      const s: [number, number][] = [[-2.4, 2.8], [2.4, 2.8], [2.4, 0.4], [1.6, -1.8], [0, -3.4], [-1.6, -1.8], [-2.4, 0.4]];
      parts.push(slab('heater', s, 0.5, team, [-3.4, 8.8, 2.0], [0, -0.9, 0]));
      parts.push(slab('heaterChief', [[-2.4, 2.8], [2.4, 2.8], [2.4, 1.6], [-2.4, 1.6]], 0.6, mat(tone(o.team, 1.5)), [-3.4, 8.8, 2.0], [0, -0.9, 0]));
      break;
    }
    case 'pavise':
      parts.push(slab('pavise', [[-2.6, 4.6], [2.6, 4.6], [2.4, -4.2], [-2.4, -4.2]], 0.6, team, [-3.2, 6.6, -1.4], [0, -0.7, 0]));
      parts.push(box(0.8, 7.4, 0.2, mat(C.linen), [-3.0, 6.8, -1.0], [0, -0.7, 0]));
      break;
    case 'bow': {
      const g = geo('bow', () => new THREE.TorusGeometry(6.2, 0.28, 4, 12, Math.PI * 0.78).rotateZ(-Math.PI * 0.39));
      const bow = new THREE.Mesh(g, mat(C.woodDark));
      bow.position.set(lh[0] - 4.0, lh[1] + 0.6, lh[2] + 0.4);
      bow.rotation.set(0, -Math.PI / 2 + 0.5, 0);
      parts.push(bow);
      parts.push(rod(0.08, 9.4, mat(C.linen), [lh[0] - 0.2, lh[1] + 0.6, lh[2] - 2.4], [0, 0, 0], 3).rotateY(0.5));
      parts.push(cyl(0.9, 0.8, 4.2, mat(C.leather), [1.4, 8.2, -2.4], [0.3, 0, 0]));
      break;
    }
    case 'crossbow':
      parts.push(box(0.8, 0.8, 6.2, mat(C.wood), [0, 8.6, 3.6]));
      parts.push(box(7.0, 0.5, 0.6, mat(C.iron, 0.5), [0, 8.7, 6.2]));
      break;
    case 'bundle':
      parts.push(ball(2.4, mat(C.canvas), [0.2, 10.6, -2.6], [1, 1.2, 0.8], 0));
      break;
    case 'book':
      parts.push(box(2.6, 0.7, 2.0, mat('#7a2a22'), [lh[0] + 0.4, lh[1] + 0.6, lh[2] + 0.2], [0.5, 0, 0]));
      parts.push(box(2.3, 0.75, 1.8, mat(C.linen), [lh[0] + 0.4, lh[1] + 0.62, lh[2] + 0.25], [0.5, 0, 0]));
      break;
    case 'none':
      break;
  }

  return group(parts);
}

// --------------------------------------------------------------- beasts

export interface BeastOpts {
  coat: string;
  mane?: string;
  /** team-coloured caparison down to the knees */
  caparison?: string;
  /** saddle cloth colour */
  saddle?: string;
  /** an ox: stockier, with horns */
  ox?: boolean;
}

/** A horse (or ox) about 20 long, standing on the origin, facing +z. */
export function beast(o: BeastOpts): THREE.Group {
  const coat = mat(o.coat);
  const dark = mat(o.mane ?? tone(o.coat, 0.5));
  const parts: THREE.Object3D[] = [];
  const ox = !!o.ox;
  const legH = ox ? 5.4 : 7.2;
  const bodyY = legH + (ox ? 2.6 : 2.4);
  // legs
  for (const [x, z] of [[-1.4, 4.4], [1.4, 4.4], [-1.4, -4.6], [1.4, -4.6]] as [number, number][]) {
    parts.push(cyl(0.55, 0.65, legH + 0.8, coat, [x, 0.4, z]));
    parts.push(cyl(0.7, 0.7, 0.8, mat(C.dark), [x, 0, z]));
  }
  // body
  parts.push(ball(1, coat, [0, bodyY, 0], ox ? [3.4, 3.4, 7.4] : [2.6, 2.9, 7.2], 1));
  // neck and head
  if (ox) {
    parts.push(ball(1, coat, [0, bodyY + 0.4, 7.2], [2.1, 2.2, 2.6], 1));
    parts.push(box(2.6, 2.4, 3.4, coat, [0, bodyY - 0.4, 9.2]));
    parts.push(box(2.2, 1.4, 1.2, mat(tone(o.coat, 1.25)), [0, bodyY - 1.2, 11]));
    for (const s of [-1, 1]) parts.push(cone(0.4, 2.6, mat(C.linen), [s * 1.4, bodyY + 0.8, 8.8], [0, 0, -s * 1.1], 5));
  } else {
    parts.push(cyl(1.1, 1.7, 6.0, coat, [0, bodyY + 0.6, 5.0], [0.75, 0, 0]));
    parts.push(box(1.5, 1.8, 4.6, coat, [0, bodyY + 4.6, 9.4], [0.45, 0, 0]));
    parts.push(box(0.8, 4.6, 1.0, dark, [0, bodyY + 3.4, 5.6], [0.75, 0, 0]));
    for (const s of [-1, 1]) parts.push(cone(0.3, 1.2, coat, [s * 0.5, bodyY + 6.0, 8.0], undefined, 4));
  }
  // tail
  parts.push(cone(0.9, ox ? 4 : 6, dark, [0, bodyY + 0.6, -7.0], [Math.PI - 0.5, 0, 0], 5));
  if (o.caparison) {
    const cap = mat(o.caparison);
    // a team caparison over the body, hanging to mid-leg
    const skirt = cyl(2.9, 3.3, 5.0, cap, [0, legH - 0.6, -0.4], undefined, 10);
    skirt.scale.set(1, 1, 2.3);
    parts.push(skirt);
    parts.push(box(6.8, 0.5, 4.6, mat(C.gold, 0.5), [0, legH - 0.5, -0.4]));
  } else if (o.saddle) {
    parts.push(box(5.8, 0.4, 5.0, mat(o.saddle), [0, bodyY + 2.4, -0.4]));
    parts.push(box(6.0, 3.0, 4.2, mat(o.saddle), [0, bodyY + 0.6, -0.4]));
  }
  return group(parts);
}

/** Height of a horse's back, where a rider sits. */
export const SADDLE_Y = 7.2 + 2.4 + 1.6;
