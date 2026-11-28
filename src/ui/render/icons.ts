// Small vector icons drawn straight onto the canvas: resource badges and
// the emblems on unit shields. Each icon is drawn in a box of about ±5 units
// around (0, 0); callers translate and scale.

import type { ResourceId } from '../../core/data/terrain';

type Ctx = CanvasRenderingContext2D;

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

const RESOURCE_ICONS: Record<ResourceId, (ctx: Ctx) => void> = {
  wheat(ctx) {
    ctx.strokeStyle = '#8a6514';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, 5.2);
    ctx.lineTo(0, -4.5);
    ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const y = -3.6 + k * 2;
      ellipse(ctx, -1.4, y, 1.5, 0.8, -0.6);
      ellipse(ctx, 1.4, y, 1.5, 0.8, 0.6);
    }
    ellipse(ctx, 0, -5, 0.8, 1.3);
    ctx.fillStyle = '#d6a325';
    ctx.fill();
  },
  cattle(ctx) {
    ctx.beginPath();
    ctx.moveTo(-2.4, -3);
    ctx.quadraticCurveTo(-5.6, -3.2, -5, -5.4);
    ctx.moveTo(2.4, -3);
    ctx.quadraticCurveTo(5.6, -3.2, 5, -5.4);
    ctx.strokeStyle = '#efe6cf';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-3.2, -3.8, 6.4, 7.6, 2.6);
    ctx.fillStyle = '#7a4a2c';
    ctx.fill();
    ctx.beginPath();
    ellipse(ctx, 0, 2.6, 2.8, 1.9);
    ctx.fillStyle = '#d9b49a';
    ctx.fill();
    ctx.beginPath();
    ellipse(ctx, -1, 2.6, 0.45, 0.6);
    ellipse(ctx, 1, 2.6, 0.45, 0.6);
    ellipse(ctx, -1.4, -1.2, 0.55, 0.55);
    ellipse(ctx, 1.4, -1.2, 0.55, 0.55);
    ctx.fillStyle = '#2a1a10';
    ctx.fill();
  },
  fish(ctx) {
    ctx.beginPath();
    ellipse(ctx, -0.8, 0, 4.2, 2.4);
    ctx.moveTo(2.8, 0);
    ctx.lineTo(5.6, -2.6);
    ctx.lineTo(5.6, 2.6);
    ctx.closePath();
    ctx.fillStyle = '#3b7db3';
    ctx.fill();
    ctx.beginPath();
    ellipse(ctx, -1.2, 0.9, 2.8, 0.9);
    ctx.fillStyle = '#9fd0f2';
    ctx.fill();
    ctx.beginPath();
    ellipse(ctx, -3.1, -0.6, 0.6, 0.6);
    ctx.fillStyle = '#10202e';
    ctx.fill();
  },
  wine(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -3.6);
    ctx.quadraticCurveTo(2.5, -6, 4.6, -4.4);
    ctx.quadraticCurveTo(2.4, -3.1, 0, -3.6);
    ctx.fillStyle = '#5e8c34';
    ctx.fill();
    ctx.beginPath();
    const grapes: [number, number][] = [[-3, -1.8], [0, -1.8], [3, -1.8], [-1.5, 0.8], [1.5, 0.8], [0, 3.4]];
    for (const [x, y] of grapes) ellipse(ctx, x, y, 1.6, 1.6);
    ctx.fillStyle = '#6a1d4a';
    ctx.fill();
    ctx.beginPath();
    for (const [x, y] of grapes) ellipse(ctx, x - 0.5, y - 0.5, 0.45, 0.45);
    ctx.fillStyle = 'rgba(255,220,240,0.6)';
    ctx.fill();
  },
  iron(ctx) {
    ctx.beginPath();
    ctx.moveTo(-5, 3.2);
    ctx.lineTo(5, 3.2);
    ctx.lineTo(3.2, -1);
    ctx.lineTo(-3.2, -1);
    ctx.closePath();
    ctx.fillStyle = '#4e5861';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-3.2, -1);
    ctx.lineTo(3.2, -1);
    ctx.lineTo(2.2, -3.4);
    ctx.lineTo(-2.2, -3.4);
    ctx.closePath();
    ctx.fillStyle = '#8f9ba6';
    ctx.fill();
  },
  horses(ctx) {
    ctx.beginPath();
    ctx.moveTo(-3.6, 4.4);
    ctx.lineTo(-3.8, -0.6);
    ctx.arc(0, -0.6, 3.8, Math.PI, 0);
    ctx.lineTo(3.6, 4.4);
    ctx.strokeStyle = '#6f4b2a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    for (const [x, y] of [[-3.7, 2.2], [-3.4, -2.4], [3.7, 2.2], [3.4, -2.4], [0, -4.4]] as [number, number][]) ellipse(ctx, x, y, 0.45, 0.45);
    ctx.fillStyle = '#e8dcc4';
    ctx.fill();
  },
  furs(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.bezierCurveTo(3, -5.2, 2.4, -2.6, 4.8, -3);
    ctx.bezierCurveTo(4.4, -0.6, 3.2, 1.4, 4.6, 4);
    ctx.bezierCurveTo(2, 3.6, 1.6, 5.2, 0, 5);
    ctx.bezierCurveTo(-1.6, 5.2, -2, 3.6, -4.6, 4);
    ctx.bezierCurveTo(-3.2, 1.4, -4.4, -0.6, -4.8, -3);
    ctx.bezierCurveTo(-2.4, -2.6, -3, -5.2, 0, -5);
    ctx.fillStyle = '#8a5a33';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-1.6, -2.2);
    ctx.lineTo(-1.2, 2.6);
    ctx.moveTo(1.6, -2.2);
    ctx.lineTo(1.2, 2.6);
    ctx.strokeStyle = '#4e301a';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  },
  silver(ctx) {
    ctx.beginPath();
    ellipse(ctx, 1.2, 1.4, 3.6, 3.6);
    ctx.fillStyle = '#9aa2ab';
    ctx.fill();
    ctx.beginPath();
    ellipse(ctx, -1, -0.8, 3.8, 3.8);
    ctx.fillStyle = '#dfe4ea';
    ctx.fill();
    ctx.strokeStyle = '#7d858e';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ellipse(ctx, -1, -0.8, 2.3, 2.3);
    ctx.stroke();
  },
  salt(ctx) {
    ctx.beginPath();
    ctx.moveTo(-5, 4);
    ctx.quadraticCurveTo(0, -6.5, 5, 4);
    ctx.closePath();
    ctx.fillStyle = '#f6f6f2';
    ctx.fill();
    ctx.strokeStyle = '#8a8f96';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.5, 1);
    ctx.lineTo(1, -1.5);
    ctx.moveTo(0.5, 3);
    ctx.lineTo(2.6, 1);
    ctx.strokeStyle = '#b7c0c9';
    ctx.stroke();
  },
  olives(ctx) {
    ctx.beginPath();
    ctx.moveTo(-5, 4);
    ctx.quadraticCurveTo(0, 1, 5, -4.5);
    ctx.strokeStyle = '#6b5a32';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ellipse(ctx, -1.5, -2.2, 2.6, 0.9, -0.9);
    ellipse(ctx, 2.6, 0.6, 2.6, 0.9, 0.5);
    ctx.fillStyle = '#7f9a4a';
    ctx.fill();
    ctx.beginPath();
    ellipse(ctx, -2.4, 1.8, 1.5, 1.9, 0.3);
    ellipse(ctx, 0.9, 2.6, 1.5, 1.9, -0.3);
    ctx.fillStyle = '#3d4a1c';
    ctx.fill();
  },
};

/** A resource badge: parchment disc with the resource's icon. */
export function drawResourceBadge(ctx: Ctx, res: ResourceId, x: number, y: number, r = 7.6) {
  ctx.save();
  ctx.beginPath();
  ellipse(ctx, x + 0.8, y + 1.1, r, r);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  ctx.beginPath();
  ellipse(ctx, x, y, r, r);
  ctx.fillStyle = '#f1e8d2';
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = '#3a2c18';
  ctx.stroke();
  ctx.translate(x, y);
  const k = r / 7.6;
  ctx.scale(k, k);
  RESOURCE_ICONS[res](ctx);
  ctx.restore();
}

// ------------------------------------------------------------- unit emblems

type Emblem = (ctx: Ctx) => void;

const line = (ctx: Ctx, pts: number[]) => {
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
};

const EMBLEMS: Record<string, Emblem> = {
  nuke(ctx) {
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, 6, a - 0.52, a + 0.52);
      ctx.arc(0, 0, 1.8, a + 0.52, a - 0.52, true);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 1.1, 0, Math.PI * 2);
    ctx.fill();
  },
  tank(ctx) {
    ctx.beginPath();
    ctx.roundRect(-6, 1, 12, 4.4, 2.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-4.6, -2.6, 7, 3.6, 1);
    ctx.fill();
    ctx.beginPath();
    line(ctx, [2, -1, 6.5, -2.6]);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  },
  gatling(ctx) {
    ctx.beginPath();
    line(ctx, [-5, 1, 5.5, -2]);
    line(ctx, [-5, 3, 5.5, 0]);
    line(ctx, [-2, 3, -4, 6]);
    line(ctx, [-2, 3, 0, 6]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-4.4, 2, 2, 0, Math.PI * 2);
    ctx.fill();
  },
  cross(ctx) {
    ctx.beginPath();
    line(ctx, [0, -6, 0, 6]);
    line(ctx, [-4, -2.4, 4, -2.4]);
    ctx.lineWidth = 2.2;
    ctx.stroke();
  },
  house(ctx) {
    ctx.beginPath();
    line(ctx, [-4.5, 5, -4.5, -0.5, 0, -5, 4.5, -0.5, 4.5, 5]);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-1.3, 1.6, 2.6, 3.4);
    ctx.fill();
  },
  eye(ctx) {
    ctx.beginPath();
    ctx.moveTo(-5.5, 0);
    ctx.quadraticCurveTo(0, -5.5, 5.5, 0);
    ctx.quadraticCurveTo(0, 5.5, -5.5, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();
  },
  pitchfork(ctx) {
    ctx.beginPath();
    line(ctx, [0, 6, 0, -2]);
    line(ctx, [-3.5, -6, -3.5, -2, 3.5, -2, 3.5, -6]);
    line(ctx, [0, -2, 0, -6]);
    ctx.stroke();
  },
  spear(ctx) {
    ctx.beginPath();
    line(ctx, [-5, 6, 3, -2]);
    ctx.stroke();
    ctx.beginPath();
    line(ctx, [5.6, -5.6, 1.4, -3.2, 3.2, -1.4]);
    ctx.closePath();
    ctx.fill();
  },
  sword(ctx) {
    ctx.beginPath();
    line(ctx, [0, -6.5, 0, 3]);
    line(ctx, [-3.6, 2.6, 3.6, 2.6]);
    line(ctx, [0, 3, 0, 5.6]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 6.2, 1.1, 0, Math.PI * 2);
    ctx.fill();
  },
  bow(ctx) {
    ctx.beginPath();
    ctx.arc(-2.5, 0, 6.2, -1.1, 1.1);
    ctx.stroke();
    ctx.lineWidth *= 0.5;
    ctx.beginPath();
    line(ctx, [0.3, -5.5, 0.3, 5.5]);
    line(ctx, [-5.5, 0, 5.5, 0]);
    ctx.stroke();
    ctx.beginPath();
    line(ctx, [6, 0, 3.6, -1.6, 3.6, 1.6]);
    ctx.closePath();
    ctx.fill();
  },
  crossbow(ctx) {
    ctx.beginPath();
    ctx.arc(0, 3.5, 6, -Math.PI * 0.85, -Math.PI * 0.15);
    line(ctx, [0, -2.5, 0, 6]);
    ctx.stroke();
    ctx.beginPath();
    line(ctx, [0, -6.5, -1.8, -3.6, 1.8, -3.6]);
    ctx.closePath();
    ctx.fill();
  },
  horseshoe(ctx) {
    ctx.beginPath();
    ctx.moveTo(-3.8, 5.2);
    ctx.lineTo(-4, -0.2);
    ctx.arc(0, -0.2, 4, Math.PI, 0);
    ctx.lineTo(3.8, 5.2);
    ctx.stroke();
  },
  lance(ctx) {
    ctx.beginPath();
    line(ctx, [-5.5, 6, 4.5, -4]);
    ctx.stroke();
    ctx.beginPath();
    line(ctx, [-3.2, 0.6, 0.4, 0.2, -0.4, 4]);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    line(ctx, [4.5, -4, 0.8, -2.6, 2.6, -0.8]);
    ctx.closePath();
    ctx.fill();
  },
  catapult(ctx) {
    ctx.beginPath();
    line(ctx, [-5.5, 3, 5.5, 3]);
    line(ctx, [-2, 3, 4, -5]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(4.6, -5.4, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-3.5, 4.4, 1.9, 0, Math.PI * 2);
    ctx.arc(3.5, 4.4, 1.9, 0, Math.PI * 2);
    ctx.fill();
  },
  cannon(ctx) {
    ctx.save();
    ctx.rotate(-0.45);
    ctx.beginPath();
    ctx.roundRect(-5.5, -2.2, 10.5, 4.4, 1.6);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(-1, 3.4, 2.6, 0, Math.PI * 2);
    ctx.stroke();
  },
  musket(ctx) {
    ctx.beginPath();
    line(ctx, [-4.5, 5.5, 5.5, -5.5]);
    ctx.stroke();
    ctx.beginPath();
    line(ctx, [-6, 4, -2.8, 7.2, -1.4, 3.6, -4, 2.2]);
    ctx.closePath();
    ctx.fill();
  },
};

const UNIT_EMBLEM: Record<string, string> = {
  settler: 'house',
  missionary: 'cross',
  rifleman: 'musket',
  infantry: 'musket',
  mechInfantry: 'musket',
  cavalry: 'sword',
  tank: 'tank',
  modernArmor: 'tank',
  gatlingGun: 'gatling',
  machineGun: 'gatling',
  artillery: 'cannon',
  rocketArtillery: 'cannon',
  atomicBomb: 'nuke',
  nuclearMissile: 'nuke',
  scout: 'eye',
  levy: 'pitchfork',
  spearman: 'spear',
  pikeman: 'spear',
  archer: 'bow',
  crossbowman: 'crossbow',
  swordsman: 'sword',
  manAtArms: 'sword',
  horseman: 'horseshoe',
  knight: 'lance',
  cuirassier: 'lance',
  catapult: 'catapult',
  trebuchet: 'catapult',
  cannon: 'cannon',
  musketeer: 'musket',
};

/** Draw a unit's emblem centred at (0,0) in the current transform. */
export function drawUnitEmblem(ctx: Ctx, unitType: string, color: string) {
  const e = EMBLEMS[UNIT_EMBLEM[unitType] ?? 'sword'];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  e(ctx);
  ctx.restore();
}

/** Heraldic shield outline centred on (0,0), about 22 × 26 units. */
export function shieldPath(ctx: Ctx, w = 11, top = -11, bottom = 14) {
  ctx.moveTo(-w, top + 2);
  ctx.quadraticCurveTo(-w, top, -w + 2, top);
  ctx.lineTo(w - 2, top);
  ctx.quadraticCurveTo(w, top, w, top + 2);
  ctx.lineTo(w, 1);
  ctx.quadraticCurveTo(w, bottom - 4, 0, bottom);
  ctx.quadraticCurveTo(-w, bottom - 4, -w, 1);
  ctx.closePath();
}
