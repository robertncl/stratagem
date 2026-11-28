// 3D models for every unit type, plus the boat units ride in at sea.

import type * as THREE from 'three';
import { ball, beast, box, C, cyl, figure, FigureOpts, group, mat, pennant, rod, SADDLE_Y, slab, wheel } from './parts';
import type { Frame } from './baker';

/** Models face right and a little toward the viewer. */
const FACING = 1.3;

/** Bake frame shared by all unit models (model units around the ground point). */
export const UNIT_FRAME: Frame = { r: 22, up: 34, down: 13 };

type Spot = [x: number, z: number];
const TRIO: Spot[] = [
  [-4.6, -3.6],
  [4.8, -2.6],
  [0, 4.2],
];
const PAIR: Spot[] = [
  [-3.6, -2.6],
  [3.8, 2.6],
];

function squad(spots: Spot[], make: (i: number) => THREE.Object3D): THREE.Group {
  const members = spots.map(([x, z], i) => {
    const m = make(i);
    m.position.set(x, 0, z);
    m.rotation.y = FACING;
    return m;
  });
  members[members.length - 1].userData.deck = true;
  return group(members);
}

function foot(spots: Spot[], o: FigureOpts | ((i: number) => FigureOpts)): THREE.Group {
  return squad(spots, (i) => figure(typeof o === 'function' ? o(i) : o));
}

const HORSE_SCALE = 1.15;

function rider(horse: Parameters<typeof beast>[0], man: FigureOpts): THREE.Group {
  const h = beast(horse);
  h.scale.setScalar(HORSE_SCALE);
  const r = figure({ ...man, mounted: true });
  r.position.set(0, SADDLE_Y * HORSE_SCALE - 6.4, -0.8);
  return group([h, r], undefined, undefined, 0.92);
}

function settler(team: string): THREE.Group {
  const wood = mat(C.wood);
  const parts: THREE.Object3D[] = [
    // wagon bed and wheels
    box(6.4, 1.6, 10, wood, [0, 3.6, 0]),
    box(6.6, 0.4, 10.2, mat(C.woodDark), [0, 2.8, 0]),
    wheel(2.4, [-3.6, 2.4, 3.2]),
    wheel(2.4, [3.6, 2.4, 3.2]),
    wheel(2.4, [-3.6, 2.4, -3.2]),
    wheel(2.4, [3.6, 2.4, -3.2]),
    // canvas tilt with a team stripe
    cyl(3.4, 3.4, 9.2, mat(C.canvas), [0, 4.4, -4.6], [Math.PI / 2, 0, 0], 10),
    cyl(3.5, 3.5, 1.4, mat(team), [0, 4.4, -0.7], [Math.PI / 2, 0, 0], 10),
    // shaft
    rod(0.3, 8, wood, [0, 3.2, 8.4], [Math.PI / 2, 0, 0]),
  ];
  // hide the lower half of the tilt inside the bed
  parts.push(box(6.6, 3.2, 9.4, wood, [0, 2.9, 0]));
  const ox = beast({ coat: C.ox, ox: true });
  ox.position.set(0, 0, 13);
  ox.scale.setScalar(0.85);
  const wagon = group([...parts, ox], [-2, 0, -2], [0, FACING, 0], 0.85);
  const walker = figure({ team, body: 'peasant', head: 'cap', right: 'staff', left: 'bundle' });
  walker.position.set(4, 0, 9);
  walker.rotation.y = FACING;
  walker.userData.deck = true;
  return group([wagon, walker]);
}

function catapult(team: string): THREE.Group {
  const wood = mat(C.wood);
  const dark = mat(C.woodDark);
  const engine = group([
    box(0.9, 0.9, 13, wood, [-2.8, 2.6, 0]),
    box(0.9, 0.9, 13, wood, [2.8, 2.6, 0]),
    box(6.6, 0.8, 0.8, wood, [0, 2.6, 5.4]),
    box(6.6, 0.8, 0.8, wood, [0, 2.6, -5.4]),
    wheel(2.2, [-3.6, 2.2, 4.2]),
    wheel(2.2, [3.6, 2.2, 4.2]),
    wheel(2.2, [-3.6, 2.2, -4.2]),
    wheel(2.2, [3.6, 2.2, -4.2]),
    // uprights and crossbar the arm stops against
    box(0.8, 6.4, 0.8, wood, [-2.4, 5.6, 1.6]),
    box(0.8, 6.4, 0.8, wood, [2.4, 5.6, 1.6]),
    box(5.6, 0.9, 0.9, dark, [0, 8.6, 1.6]),
    // torsion bundle and arm, cocked back
    rod(0.9, 5.2, mat(C.rope), [0, 3.4, -2.6], [0, 0, Math.PI / 2]),
    rod(0.45, 11, dark, [0, 6.6, -5.2], [-0.9, 0, 0]),
    cyl(1.3, 0.8, 1.2, dark, [0, 10.0, -9.4], [-0.9, 0, 0]),
    pennant(team, 9, [2.4, 8.8, 1.6], 3.2),
  ]);
  engine.rotation.y = FACING;
  engine.position.set(-2.5, 0, -1);
  const crew = figure({ team, body: 'tunic', head: 'cap' });
  crew.position.set(7.5, 0, 4);
  crew.rotation.y = FACING - 0.6;
  crew.userData.deck = true;
  return group([engine, crew]);
}

function trebuchet(team: string): THREE.Group {
  const wood = mat(C.wood);
  const dark = mat(C.woodDark);
  const parts: THREE.Object3D[] = [
    box(1, 1, 16, wood, [-3, 0.5, 0]),
    box(1, 1, 16, wood, [3, 0.5, 0]),
    box(7, 0.9, 0.9, wood, [0, 0.5, 6.5]),
    box(7, 0.9, 0.9, wood, [0, 0.5, -6.5]),
  ];
  // A-frames
  for (const x of [-2.6, 2.6]) {
    parts.push(rod(0.45, 19, wood, [x, 9, 3.4], [-0.38, 0, 0]));
    parts.push(rod(0.45, 19, wood, [x, 9, -3.4], [0.38, 0, 0]));
  }
  parts.push(rod(0.5, 6.6, dark, [0, 17.6, 0], [0, 0, Math.PI / 2]));
  // throwing arm: long end down at the back, counterweight up front
  parts.push(rod(0.5, 26, dark, [0, 14.6, -4.6], [-1.2, 0, 0]));
  parts.push(box(4.2, 3.8, 3.8, mat(C.woodDark), [0, 18.2, 4.6]));
  parts.push(box(4.4, 0.6, 4.0, mat(C.iron, 0.5), [0, 20.2, 4.6]));
  parts.push(rod(0.12, 6, mat(C.rope), [0, 4.6, -13], [0.5, 0, 0], 3));
  parts.push(pennant(team, 6, [0, 18, 0], 3.2));
  const engine = group(parts, [-2, 0, -1], [0, FACING, 0], 0.95);
  const crew = figure({ team, body: 'tunic', head: 'cap' });
  crew.position.set(8, 0, 5);
  crew.rotation.y = FACING - 0.6;
  crew.userData.deck = true;
  return group([engine, crew]);
}

function cannon(team: string): THREE.Group {
  const wood = mat(C.wood);
  const bronze = mat(C.bronze, 0.35);
  const gun = group([
    // trail resting on the ground behind
    box(1.6, 1.0, 10, wood, [0, 1.6, -4.4], [-0.28, 0, 0]),
    box(0.9, 2.8, 7, wood, [-1.4, 3.6, 0.4]),
    box(0.9, 2.8, 7, wood, [1.4, 3.6, 0.4]),
    rod(0.5, 7.6, mat(C.iron), [0, 3.4, 1.4], [0, 0, Math.PI / 2]),
    wheel(3.4, [-3.4, 3.4, 1.4]),
    wheel(3.4, [3.4, 3.4, 1.4]),
    // barrel, tapering to the muzzle
    cyl(1.0, 1.45, 12, bronze, [0, 5.0, -2.6], [Math.PI / 2 - 0.1, 0, 0], 10),
    cyl(1.25, 1.25, 0.9, bronze, [0, 6.2, 9.0], [Math.PI / 2 - 0.1, 0, 0], 10),
    cyl(1.5, 1.5, 0.8, bronze, [0, 4.8, -2.8], [Math.PI / 2 - 0.1, 0, 0], 10),
    pennant(team, 9, [-1.8, 3.8, -6], 3.2),
  ]);
  gun.rotation.y = FACING;
  gun.position.set(-3, 0, -1);
  const crew = figure({ team, body: 'coat', head: 'hat', right: 'staff' });
  crew.position.set(7.4, 0, 4.4);
  crew.rotation.y = FACING - 0.5;
  crew.userData.deck = true;
  // a little pyramid of shot
  const shot = mat(C.dark, 0.5);
  const balls = group(
    ([[-0.8, 0.8, 0], [0.8, 0.8, 0], [0, 0.8, 1.3], [0, 2.1, 0.45]] as [number, number, number][]).map((at) => ball(0.8, shot, at, [1, 1, 1], 0)),
    [3.2, 0, 7.4],
  );
  return group([gun, crew, balls]);
}

// ------------------------------------------------------------ the modern age

const darkMetal = () => mat(C.gunmetal, 0.4);

/** A road wheel or tyre with its axle along x. */
function tyre(r: number, w: number, at: [number, number, number]): THREE.Object3D {
  return rod(r, w, mat(C.tyre), at, [0, 0, Math.PI / 2], 10);
}

/** A crewman standing beside a vehicle or gun, marked to ride on deck at sea. */
function crewman(team: string, head: FigureOpts['head'], at: [number, number], turn = -0.6): THREE.Object3D {
  const f = figure({ team, body: 'tunic', head });
  f.position.set(at[0], 0, at[1]);
  f.rotation.y = FACING + turn;
  f.userData.deck = true;
  return f;
}

/** A vehicle that rides on deck by itself. */
function vehicle(parts: THREE.Object3D[], scale = 1): THREE.Group {
  const v = group(parts, [0, 0, 0], [0, FACING, 0], scale);
  v.userData.deck = true;
  return group([v]);
}

function tank(team: string, modern: boolean): THREE.Group {
  const hull = mat(modern ? C.sand : C.olive, 0.3);
  const parts: THREE.Object3D[] = [];
  // tracks with road wheels
  for (const s of [-1, 1]) {
    parts.push(box(2.6, 2.6, 16, mat(C.tyre), [s * 4.4, 1.5, 0]));
    for (const z of [-5.6, -1.9, 1.9, 5.6]) parts.push(tyre(1.25, 2.8, [s * 4.4, 1.4, z]));
    parts.push(box(2.8, 0.4, 16.4, hull, [s * 4.4, 3.0, 0]));
  }
  parts.push(box(6.4, 2.6, 15, hull, [0, 3.6, 0]));
  parts.push(box(6.2, 0.5, 4.2, hull, [0, 4.0, 8.2], [-0.5, 0, 0]));
  // team stripes along the hull
  for (const s of [-1, 1]) parts.push(box(0.3, 1.2, 6, mat(team), [s * 5.85, 3.0, -2.4]));
  if (modern) {
    // wide, flat composite turret and a long smoothbore gun
    parts.push(slab('mbtTurret', [[-3.4, -4.2], [3.4, -4.2], [3.8, 1.6], [2.2, 4.2], [-2.2, 4.2], [-3.8, 1.6]], 2.2, hull, [0, 6.0, -0.8], [Math.PI / 2, 0, 0]));
    parts.push(rod(0.45, 13, darkMetal(), [0, 6.0, 9.4], [Math.PI / 2, 0, 0], 8));
    parts.push(box(4.2, 0.5, 1.6, mat(team), [0, 7.2, -3.4]));
  } else {
    parts.push(cyl(2.9, 3.2, 2.6, hull, [0, 4.9, -0.6], undefined, 10));
    parts.push(cyl(1.4, 1.5, 0.9, hull, [0, 7.5, -1.2], undefined, 8));
    parts.push(rod(0.5, 8, darkMetal(), [0, 6.2, 5.6], [Math.PI / 2, 0, 0], 8));
    parts.push(cyl(3.0, 3.0, 0.6, mat(team), [0, 6.0, -0.6], undefined, 10));
  }
  parts.push(pennant(team, 6, [-2.4, 6.4, -4.4], 3));
  return vehicle(parts, 0.95);
}

function gatlingGun(team: string): THREE.Group {
  const brass = mat(C.bronze, 0.5);
  const barrels: THREE.Object3D[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    barrels.push(rod(0.22, 7, darkMetal(), [Math.cos(a) * 0.6, 5.2 + Math.sin(a) * 0.6, 3.0], [Math.PI / 2, 0, 0], 4));
  }
  const gun = group([
    box(1.2, 0.9, 9, mat(C.wood), [0, 1.8, -3.4], [-0.25, 0, 0]),
    rod(0.35, 6.4, mat(C.iron), [0, 3.4, 0], [0, 0, Math.PI / 2]),
    wheel(3.2, [-3.0, 3.4, 0]),
    wheel(3.2, [3.0, 3.4, 0]),
    box(1.8, 1.8, 3.2, brass, [0, 5.2, -1.0]),
    cyl(0.9, 0.9, 0.5, brass, [0, 5.2, 6.6], [Math.PI / 2, 0, 0], 8),
    box(0.3, 1.8, 0.3, mat(C.iron), [1.3, 5.6, -1.4]),
    ...barrels,
    pennant(team, 7, [-1.6, 3.6, -5.6], 3),
  ]);
  gun.rotation.y = FACING;
  gun.position.set(-3, 0, -1);
  return group([gun, crewman(team, 'cap', [7.4, 4])]);
}

function machineGun(team: string): THREE.Group {
  const sand = mat('#a8946a');
  const bags: THREE.Object3D[] = [];
  for (let k = 0; k < 5; k++) {
    const a = -0.9 + k * 0.45;
    bags.push(ball(1, sand, [Math.sin(a) * 6, 1.0, Math.cos(a) * 6], [1.9, 0.9, 1.2], 0));
    if (k > 0 && k < 4) bags.push(ball(1, sand, [Math.sin(a) * 6, 2.5, Math.cos(a) * 6], [1.8, 0.8, 1.1], 0));
  }
  const gun = group([
    ...bags,
    rod(0.2, 5, darkMetal(), [-1, 2.2, 1.6], [0.4, 0, 0.4], 4),
    rod(0.2, 5, darkMetal(), [1, 2.2, 1.6], [0.4, 0, -0.4], 4),
    rod(0.2, 5, darkMetal(), [0, 2.2, -0.4], [-0.5, 0, 0], 4),
    box(1.4, 1.6, 4, darkMetal(), [0, 4.6, 1.6]),
    rod(0.45, 5.6, mat(C.olive), [0, 4.7, 6.0], [Math.PI / 2, 0, 0], 8),
    box(1.6, 0.8, 1.2, mat(team), [0, 5.7, 0.8]),
  ]);
  gun.rotation.y = FACING;
  gun.position.set(-2, 0, 0);
  return group([gun, crewman(team, 'steelhelmet', [-4.6, -4], -0.2), crewman(team, 'steelhelmet', [6.6, 3.6])]);
}

function fieldGun(team: string): THREE.Group {
  const steel = mat('#4c5446', 0.3);
  const gun = group([
    box(1.2, 0.9, 10, steel, [0, 1.7, -4.2], [-0.24, 0, 0]),
    rod(0.4, 7, mat(C.iron), [0, 3.4, 0.6], [0, 0, Math.PI / 2]),
    wheel(3.4, [-3.2, 3.4, 0.6], mat(C.woodDark)),
    wheel(3.4, [3.2, 3.4, 0.6], mat(C.woodDark)),
    box(6.2, 4.4, 0.35, steel, [0, 5.0, 2.2], [-0.12, 0, 0]),
    box(1.6, 1.6, 4, steel, [0, 4.8, 0.2]),
    rod(0.55, 10, steel, [0, 5.2, 6.4], [Math.PI / 2 - 0.08, 0, 0], 8),
    box(6.3, 0.9, 0.4, mat(team), [0, 6.8, 2.0], [-0.12, 0, 0]),
  ]);
  gun.rotation.y = FACING;
  gun.position.set(-3, 0, -1);
  return group([gun, crewman(team, 'cap', [7.4, 4.4])]);
}

function rocketArtillery(team: string): THREE.Group {
  const body = mat(C.olive, 0.3);
  const parts: THREE.Object3D[] = [];
  for (const z of [-5.2, -1.4, 5.6]) for (const s of [-1, 1]) parts.push(tyre(1.7, 1.4, [s * 3.4, 1.7, z]));
  parts.push(box(6, 1.2, 15, mat(C.gunmetal), [0, 2.6, 0]));
  // cab with team doors
  parts.push(box(6.2, 4.2, 4.2, body, [0, 5.0, 5.4]));
  parts.push(box(5.6, 1.6, 0.3, mat('#9ab4c4', 0.8), [0, 6.0, 7.55]));
  for (const s of [-1, 1]) parts.push(box(0.3, 1.8, 2.4, mat(team), [s * 3.15, 4.6, 5.2]));
  // launcher: a box of tubes, raised toward the front
  const tubes: THREE.Object3D[] = [box(5.4, 3.0, 9, body, [0, 0, 0])];
  for (const x of [-1.8, 0, 1.8]) for (const y of [-0.7, 0.7]) tubes.push(cyl(0.55, 0.55, 0.4, mat(C.dark), [x, y, 4.5], [Math.PI / 2, 0, 0], 8));
  parts.push(group(tubes, [0, 6.4, -2.6], [-0.45, 0, 0]));
  parts.push(box(5.6, 0.6, 1.4, mat(team), [0, 8.8, -5.0], [-0.45, 0, 0]));
  return vehicle(parts, 0.95);
}

function mechInfantry(team: string): THREE.Group {
  const hull = mat(C.olive, 0.3);
  const parts: THREE.Object3D[] = [];
  for (const z of [-5, -1.7, 1.7, 5]) for (const s of [-1, 1]) parts.push(tyre(1.6, 1.4, [s * 3.8, 1.6, z]));
  parts.push(box(7, 3.6, 14, hull, [0, 4.0, -0.4]));
  parts.push(box(6.8, 0.5, 4.4, hull, [0, 4.6, 7.4], [-0.75, 0, 0]));
  parts.push(box(6.0, 0.6, 12, hull, [0, 6.0, -1]));
  parts.push(cyl(1.6, 1.8, 1.4, hull, [0, 6.2, 0.6], undefined, 8));
  parts.push(rod(0.25, 5, darkMetal(), [0, 7.0, 4.4], [Math.PI / 2, 0, 0], 6));
  for (const s of [-1, 1]) parts.push(box(0.3, 1.4, 6, mat(team), [s * 3.55, 4.4, -2.6]));
  parts.push(pennant(team, 5, [-2.4, 6.2, -6], 3));
  const apc = vehicle(parts, 0.9);
  apc.position.set(-2.4, 0, -2);
  const soldier = figure({ team, body: 'tunic', head: 'steelhelmet', right: 'rifle' });
  soldier.position.set(6.4, 0, 5.4);
  soldier.rotation.y = FACING;
  return group([apc, soldier]);
}

const BUILDERS: Record<string, (team: string) => THREE.Object3D> = {
  settler,
  missionary: (team) =>
    squad([[0, 0]], () => group([figure({ team, body: 'robe', head: 'cowl', right: 'cross', left: 'book' })], undefined, undefined, 1.12)),
  scout: (team) =>
    squad([[0, 0]], () => group([figure({ team, body: 'cloak', head: 'hood', right: 'staff' })], undefined, undefined, 1.12)),
  levy: (team) => foot(TRIO, (i) => ({ team, body: 'peasant', head: i === 1 ? 'cap' : 'bare', right: 'pitchfork' })),
  spearman: (team) => foot(TRIO, { team, body: 'tunic', head: 'kettle', right: 'spear', left: 'round' }),
  pikeman: (team) => foot(TRIO, { team, body: 'tunic', head: 'morion', right: 'pike' }),
  archer: (team) => foot(TRIO, { team, body: 'tunic', head: 'hood', left: 'bow' }),
  crossbowman: (team) => foot(TRIO, (i) => ({ team, body: 'tunic', head: 'kettle', left: i === 0 ? 'pavise' : 'crossbow' })),
  swordsman: (team) => foot(TRIO, { team, body: 'tunic', head: 'helm', right: 'sword', left: 'heater' }),
  manAtArms: (team) => foot(TRIO, { team, body: 'armour', head: 'helm', right: 'sword', left: 'heater' }),
  musketeer: (team) => foot(TRIO, { team, body: 'coat', head: 'hat', right: 'musket' }),
  horseman: (team) =>
    squad(PAIR, () => rider({ coat: C.horse, saddle: team }, { team, body: 'tunic', head: 'kettle', right: 'spear', left: 'round' })),
  knight: (team) =>
    squad([[0, 0]], () => group([rider({ coat: C.horseGrey, caparison: team }, { team, body: 'armour', head: 'greathelm', right: 'lance', left: 'heater' })], undefined, undefined, 1.15)),
  cuirassier: (team) =>
    squad(PAIR, () => rider({ coat: C.horseDark, saddle: team }, { team, body: 'armour', blackened: true, head: 'morion', right: 'sword' })),
  catapult,
  trebuchet,
  cannon,
  rifleman: (team) => foot(TRIO, { team, body: 'coat', head: 'shako', right: 'rifle' }),
  infantry: (team) => foot(TRIO, { team, body: 'tunic', head: 'steelhelmet', right: 'rifle' }),
  cavalry: (team) => squad(PAIR, () => rider({ coat: C.horseDark, saddle: team }, { team, body: 'coat', head: 'shako', right: 'sabre' })),
  artillery: fieldGun,
  gatlingGun,
  machineGun,
  tank: (team) => tank(team, false),
  modernArmor: (team) => tank(team, true),
  rocketArtillery,
  mechInfantry,
};

/** A cog with a team sail, carrying a small figure of the unit. */
function boat(team: string, passenger: THREE.Object3D): THREE.Group {
  const hull = mat(C.woodDark);
  const profile: [number, number][] = [
    [-10, 5.2],
    [-8.4, 1.2],
    [-6, 0],
    [6, 0],
    [9, 1.6],
    [11.6, 6.2],
    [9.2, 5.2],
    [8.6, 4.2],
    [-8.4, 4.2],
  ];
  const parts: THREE.Object3D[] = [
    slab('hull', profile, 7.2, hull, [0, 0.4, 0]),
    box(17, 0.4, 6.4, mat(C.wood), [0, 4.2, 0]),
    box(4, 2.4, 6.6, mat(C.wood), [-7.6, 5.4, 0]),
    rod(0.4, 18, mat(C.wood), [1.4, 13, 0]),
    rod(0.25, 11, mat(C.wood), [1.4, 19.6, 0.4], [Math.PI / 2, 0, 0]),
    box(0.35, 10, 10.4, mat(team), [1.8, 14.4, 0.4]),
    box(0.4, 10, 1.4, mat(C.linen), [1.9, 14.4, 0.4]),
    box(0.4, 1.4, 10.4, mat(C.linen), [1.9, 15.4, 0.4]),
  ];
  passenger.scale.multiplyScalar(0.62);
  passenger.position.set(6.2, 4.4, 0.6);
  parts.push(passenger);
  const b = group(parts);
  // bow toward the viewer's right, so both the hull and the sail show
  b.rotation.y = -0.5;
  return b;
}

export function unitModel(type: string, team: string, embarked: boolean): THREE.Object3D {
  const make = BUILDERS[type] ?? BUILDERS.swordsman;
  if (!embarked) return make(team);
  // one figure from the unit stands on deck
  const m = make(team);
  let one: THREE.Object3D = m;
  m.traverse((o) => {
    if (o.userData.deck) one = o;
  });
  one.removeFromParent();
  one.position.set(0, 0, 0);
  return boat(team, one);
}
