// Portraits of the great powers' leaders, drawn as SVG in the manner of a
// painted miniature: a bust inside a gilded arch over the realm's colour.
// Every portrait shares one face builder; each leader adds the hair,
// headwear, dress and regalia they are known for.

import { MAJOR_NATIONS } from '../../core/data/nations';

/** Portraits are drawn in a 120 × 150 box. */
const W = 120;
const H = 150;

interface Face {
  skin: string;
  lips: string;
  iris: string;
  brows: string;
  /** jaw shape: soft (oval), square, or the Habsburg chin */
  jaw?: 'soft' | 'square' | 'habsburg' | 'long';
  /** lines of age */
  aged?: boolean;
  /** hide the ears (under hair, a veil or a wimple) */
  noEars?: boolean;
}

interface Figure {
  face: Face;
  /** behind the body: long hair */
  back?: string;
  /** clothes from the shoulders down */
  garment: string;
  /** over the clothes, behind the face: wigs and veils that fall over the shoulders */
  drape?: string;
  /** over the neck, under the face: ruffs, cravats, wimples */
  collar?: string;
  /** over the face: beards, moustaches */
  beard?: string;
  /** hair over the forehead */
  fringe?: string;
  /** hats, crowns, veils over the head */
  headwear?: string;
  /** jewels and chains, drawn last */
  regalia?: string;
}

let uid = 0;
/** Keeps gradient and pattern ids unique even if this module is loaded twice. */
const PREFIX = `lp${Math.random().toString(36).slice(2, 7)}`;

const JAWS = {
  soft: 'M44 64C44 49 51 44 60 44C69 44 76 49 76 64C76 79 69 92 60 92C51 92 44 79 44 64Z',
  square: 'M44 63C44 49 51 44 60 44C69 44 76 49 76 63C76 80 72 90 60 92C48 90 44 80 44 63Z',
  habsburg: 'M44 63C44 49 51 44 60 44C69 44 76 49 76 63C76 80 72 93 62 97C52 96 44 82 44 63Z',
  long: 'M45 63C45 48 51 43 60 43C69 43 75 48 75 63C75 81 69 94 60 94C51 94 45 81 45 63Z',
};

/** Darken (f < 1) or lighten (f > 1) a #rrggbb colour. */
function tone(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const x = f <= 1 ? v * f : v + (255 - v) * (f - 1);
    return Math.max(0, Math.min(255, Math.round(x)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

function face(f: Face, id: string): string {
  const shade = tone(f.skin, 0.8);
  const line = tone(f.skin, 0.62);
  const jaw = JAWS[f.jaw ?? 'soft'];
  const ears = f.noEars
    ? ''
    : `<ellipse cx="43.6" cy="67" rx="3.2" ry="5.4" fill="${f.skin}" stroke="${line}" stroke-width=".6"/>
       <ellipse cx="76.4" cy="67" rx="3.2" ry="5.4" fill="${f.skin}" stroke="${line}" stroke-width=".6"/>`;
  const eye = (x: number) => `
    <path d="M${x - 3.8} 65.2Q${x} 62.4 ${x + 3.8} 65.2Q${x} 67.6 ${x - 3.8} 65.2Z" fill="#f6f1e8"/>
    <circle cx="${x + 0.2}" cy="65.1" r="1.6" fill="${f.iris}"/>
    <circle cx="${x + 0.2}" cy="65.1" r=".7" fill="#120d0a"/>
    <circle cx="${x + 0.7}" cy="64.6" r=".35" fill="#fff"/>
    <path d="M${x - 4} 65.1Q${x} 61.9 ${x + 4} 65.1" fill="none" stroke="${tone(f.skin, 0.38)}" stroke-width=".9" stroke-linecap="round"/>
    <path d="M${x - 3.2} 67.2Q${x} 68.4 ${x + 3.2} 67.2" fill="none" stroke="${line}" stroke-width=".45" opacity=".7"/>`;
  const aged = f.aged
    ? `<path d="M52 56.5Q60 55 68 56.5M53 54Q60 52.6 67 54" fill="none" stroke="${line}" stroke-width=".5" opacity=".7"/>
       <path d="M53.6 74Q52 79 54.4 83.4M66.4 74Q68 79 65.6 83.4" fill="none" stroke="${line}" stroke-width=".6" opacity=".75"/>
       <path d="M47.4 67.4l-1.8 1.2M72.6 67.4l1.8 1.2" stroke="${line}" stroke-width=".5" opacity=".7"/>`
    : '';
  return `
    <defs>
      <linearGradient id="${id}-skin" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${tone(f.skin, 1.06)}"/><stop offset=".55" stop-color="${f.skin}"/><stop offset="1" stop-color="${shade}"/>
      </linearGradient>
    </defs>
    ${ears}
    <path d="${jaw}" fill="url(#${id}-skin)" stroke="${line}" stroke-width=".7"/>
    <circle cx="50" cy="75" r="4.6" fill="#e0786a" opacity=".16"/>
    <circle cx="70" cy="75" r="4.6" fill="#e0786a" opacity=".13"/>
    <path d="M47.6 60.6Q52.4 58.2 57 60.2" fill="none" stroke="${f.brows}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M63 60.2Q67.6 58.2 72.4 60.6" fill="none" stroke="${f.brows}" stroke-width="1.4" stroke-linecap="round"/>
    ${eye(52.4)}${eye(67.6)}
    <path d="M60.4 64.4Q59.4 71.4 57.6 75.4Q59.6 77.4 62.6 76" fill="none" stroke="${line}" stroke-width=".9" stroke-linecap="round"/>
    <path d="M60.8 66Q61.6 71 62.4 74" fill="none" stroke="${tone(f.skin, 1.12)}" stroke-width=".8" opacity=".7"/>
    <path d="M54.4 82.2Q57.4 80.6 60 81.4Q62.6 80.6 65.6 82.2Q60 85.6 54.4 82.2Z" fill="${f.lips}"/>
    <path d="M54.4 82.2Q60 83 65.6 82.2" fill="none" stroke="${tone(f.lips, 0.6)}" stroke-width=".55"/>
    ${aged}`;
}

/** Neck and the top of the chest, left bare above a low neckline. */
function neck(skin: string, low = false): string {
  const line = tone(skin, 0.62);
  return low
    ? `<path d="M51 84L51 100C51 104 44 106 40 110L80 110C76 106 69 104 69 100L69 84Z" fill="${skin}" stroke="${line}" stroke-width=".6"/>
       <path d="M52 97Q60 103 68 97" fill="none" stroke="${tone(skin, 0.78)}" stroke-width="1.6" opacity=".5"/>`
    : `<path d="M51.5 84L51.5 104Q60 110 68.5 104L68.5 84Z" fill="${skin}" stroke="${line}" stroke-width=".6"/>
       <path d="M52 94Q60 100 68 94" fill="none" stroke="${tone(skin, 0.78)}" stroke-width="2" opacity=".5"/>`;
}

/** Shoulders and chest in one cloth. */
function body(fill: string, extra = ''): string {
  return `<path d="M6 150C8 124 26 108 60 105C94 108 112 124 114 150Z" fill="${fill}" stroke="${tone(fill, 0.6)}" stroke-width=".8"/>
    <path d="M24 150C26 134 34 122 46 116M96 150C94 134 86 122 74 116" fill="none" stroke="${tone(fill, 0.7)}" stroke-width="1.4" opacity=".7"/>${extra}`;
}

/** A chain of gold links hanging across the chest, with an optional pendant. */
function chain(y: number, sag: number, pendant = ''): string {
  const links: string[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = 30 + t * 60;
    const yy = y + Math.sin(t * Math.PI) * sag;
    links.push(`<ellipse cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" rx="2.1" ry="1.4" fill="#e3b94c" stroke="#7a5a18" stroke-width=".5" transform="rotate(${((t - 0.5) * -60).toFixed(0)} ${x.toFixed(1)} ${yy.toFixed(1)})"/>`);
  }
  return links.join('') + pendant;
}

/** The ram of the Order of the Golden Fleece. */
function fleece(x: number, y: number): string {
  return `<g transform="translate(${x} ${y})">
    <path d="M-1 -4L1 -4L1 -1L-1 -1Z" fill="#c99a2e"/>
    <path d="M-6 2C-6 -1 -2 -1.6 2 -1C5 -1 7 0 7 2C7 4 5 5 2 5L-3 5C-5 5 -6 4 -6 2Z" fill="#e8c35a" stroke="#7a5a18" stroke-width=".5"/>
    <path d="M-6 2L-8 4M-4 5L-4 8M3 5L3 8" stroke="#c99a2e" stroke-width="1"/>
    <circle cx="-5.6" cy="1" r="1.6" fill="#e8c35a" stroke="#7a5a18" stroke-width=".4"/>
  </g>`;
}

/** Ermine: white fur with black tails. */
function ermine(path: string, id: string): string {
  return `<defs><pattern id="${id}-erm" width="9" height="10" patternUnits="userSpaceOnUse">
      <rect width="9" height="10" fill="#f3efe4"/>
      <path d="M4.5 2L5.3 5.4L4.5 7.2L3.7 5.4Z" fill="#141414"/><circle cx="4.5" cy="2.4" r=".7" fill="#141414"/>
    </pattern></defs>
    <path d="${path}" fill="url(#${id}-erm)" stroke="#bdb6a6" stroke-width=".6"/>`;
}

/** Pearls along a quadratic curve. */
function pearls(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, n: number, r = 1.2): string {
  let out = '';
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="#f4efe2" stroke="#a8a090" stroke-width=".35"/>`;
  }
  return out;
}

/** Curls: small overlapping circles along a list of points. */
function curls(points: [number, number][], r: number, fill: string): string {
  return points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${tone(fill, 0.65)}" stroke-width=".6"/>`).join('');
}

function gem(x: number, y: number, color: string, r = 1.5): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="#5a3a10" stroke-width=".4"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.3}" fill="#fff" opacity=".7"/>`;
}

// ----------------------------------------------------------------- leaders

const LEADERS: Record<string, (id: string) => Figure> = {
  // Elizabeth I: red curls, pearls, a great lace ruff
  england: () => {
    const hair = '#b4482a';
    const ruff: string[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      ruff.push(`<circle cx="${(60 + Math.cos(a) * 31).toFixed(1)}" cy="${(99 + Math.sin(a) * 9.5).toFixed(1)}" r="3.4" fill="#f6f3ea" stroke="#b9b2a2" stroke-width=".5"/>`);
    }
    const pleats: string[] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      pleats.push(`M${(60 + Math.cos(a) * 12).toFixed(1)} ${(99 + Math.sin(a) * 4).toFixed(1)}L${(60 + Math.cos(a) * 29).toFixed(1)} ${(99 + Math.sin(a) * 8.6).toFixed(1)}`);
    }
    return {
      face: { skin: '#f5e3d4', lips: '#b9483f', iris: '#5b4630', brows: '#c27a4e', noEars: true },
      back: `<ellipse cx="60" cy="52" rx="22" ry="15" fill="${hair}"/>${curls([[39, 56], [40, 48], [44, 41], [50, 37], [57, 35], [64, 35], [71, 37], [77, 41], [80, 48], [81, 56], [41, 63], [79, 63]], 4.6, hair)}`,
      garment: body('#1d1a24', `<path d="M48 108L60 150L72 108Z" fill="#c9a24a" stroke="#7a5a18" stroke-width=".6"/>
        ${pearls(50, 112, 60, 118, 70, 112, 6, 1.1)}${pearls(52, 122, 60, 130, 68, 122, 6, 1.1)}${pearls(54, 134, 60, 140, 66, 134, 4, 1.1)}
        <path d="M14 140C18 126 28 116 40 112L40 150L14 150ZM106 140C102 126 92 116 80 112L80 150L106 150Z" fill="#2a2433" opacity=".9"/>
        ${pearls(20, 136, 28, 124, 38, 116, 5, 1)}${pearls(100, 136, 92, 124, 82, 116, 5, 1)}`) + neck('#f5e3d4'),
      collar: `<ellipse cx="60" cy="99" rx="31" ry="9.5" fill="#f6f3ea"/>${ruff.join('')}<ellipse cx="60" cy="99" rx="29" ry="8.6" fill="#f2eee3"/><path d="${pleats.join('')}" stroke="#c8c1b0" stroke-width=".6"/>`,
      fringe: curls([[47, 47], [52, 44.6], [57, 43.4], [63, 43.4], [68, 44.6], [73, 47]], 3.4, hair),
      headwear: `<path d="M46 38Q60 30 74 38L72 41Q60 35 48 41Z" fill="#e0b640" stroke="#7a5a18" stroke-width=".6"/>${pearls(47, 38.5, 60, 31, 73, 38.5, 8, 1.1)}${gem(60, 34.6, '#b8222c', 1.8)}`,
      regalia: `<circle cx="44" cy="74" r="1.6" fill="#f4efe2" stroke="#a8a090" stroke-width=".4"/><circle cx="76" cy="74" r="1.6" fill="#f4efe2" stroke="#a8a090" stroke-width=".4"/>`,
    };
  },

  // Louis XIV: the great periwig, lace cravat, fleur-de-lis robe and ermine
  france: (id) => {
    const wig = '#3b2616';
    const side: [number, number][] = [];
    for (let k = 0; k < 7; k++) side.push([39 - (k % 2) * 3, 52 + k * 10], [81 + (k % 2) * 3, 52 + k * 10]);
    const lis: string[] = [];
    for (const [x, y] of [[24, 136], [40, 142], [80, 142], [96, 136], [32, 124], [88, 124]] as [number, number][]) {
      lis.push(`<path transform="translate(${x} ${y})" d="M0 -4C1.4 -2 1.4 0 0 2C-1.4 0 -1.4 -2 0 -4ZM-1 0C-3 -2 -4.4 0 -2.6 1.6L-.6 1.4ZM1 0C3 -2 4.4 0 2.6 1.6L.6 1.4ZM-2 2.2L2 2.2L2 3L-2 3Z" fill="#e3bf52"/>`);
    }
    return {
      face: { skin: '#ecc9ad', lips: '#b05a50', iris: '#3c2a1c', brows: '#3a2418', jaw: 'square', noEars: true },
      garment: body('#1f3f9a', lis.join('')) + ermine('M20 150C20 128 34 114 50 110L60 118L70 110C86 114 100 128 100 150L86 150C84 134 76 124 64 122L60 128L56 122C44 124 36 134 34 150Z', id) + neck('#ecc9ad'),
      collar: `<path d="M51 98L69 98L67 114Q60 119 53 114Z" fill="#f6f3ea" stroke="#c8c1b0" stroke-width=".6"/>
        <path d="M54 102L66 102M54.6 106L65.4 106M55.4 110L64.6 110" stroke="#cfc8b8" stroke-width=".7"/>`,
      drape: `<path d="M35 58C31 34 46 27 60 28C74 27 89 34 85 58C92 74 91 100 88 124C84 132 74 130 72 120L72 86L48 86L48 120C46 130 36 132 32 124C29 100 28 74 35 58Z" fill="${wig}"/>${curls(side, 6, wig)}${curls([[44, 34], [52, 29], [60, 27.6], [68, 29], [76, 34]], 6, tone(wig, 1.1))}`,
      beard: `<path d="M55 79.4Q57.6 78.2 60 79.2Q62.4 78.2 65 79.4" fill="none" stroke="#2a1a10" stroke-width="1"/><path d="M59 85.6L61 85.6L60 87.6Z" fill="#2a1a10"/>`,
      fringe: curls([[48, 45], [54, 41.6], [60, 40.6], [66, 41.6], [72, 45]], 5, wig),
    };
  },

  // Isabella I: auburn hair parted in the middle, circlet, cross pendant
  castile: () => {
    const hair = '#93522a';
    return {
      face: { skin: '#f0d4bc', lips: '#b4524a', iris: '#5c6a3a', brows: '#8a5a30', noEars: true },
      back: `<path d="M38 66C36 46 46 38 60 38C74 38 84 46 82 66C84 82 84 98 80 110L40 110C36 98 36 82 38 66Z" fill="${hair}"/>
        <path d="M44 70C44 86 42 98 40 108M76 70C76 86 78 98 80 108" fill="none" stroke="${tone(hair, 0.7)}" stroke-width="1"/>`,
      garment: body('#7a1f28', `<path d="M42 108L78 108L76 126L44 126Z" fill="#c9a24a" stroke="#7a5a18" stroke-width=".7"/>
        <path d="M45 110L75 110L73.6 124L46.4 124Z" fill="#f0d4bc"/>
        <path d="M30 150C32 136 38 126 44 126M90 150C88 136 82 126 76 126" fill="none" stroke="#c9a24a" stroke-width="2"/>`) + neck('#f0d4bc', true),
      fringe: `<path d="M44 66C43 48 51 42 60 42C69 42 77 48 76 66C74 55 67 49.6 60.6 50.4L60 46L59.4 50.4C53 49.6 46 55 44 66Z" fill="${hair}"/>
        <path d="M60 44L60 50" stroke="${tone(hair, 0.6)}" stroke-width=".8"/>`,
      headwear: `<path d="M45 44L75 44L75 39L71 34L67 39L63.6 32L60 38L56.4 32L53 39L49 34L45 39Z" fill="#e0b640" stroke="#7a5a18" stroke-width=".6"/>
        ${gem(53, 41.6, '#1e5fa8', 1.2)}${gem(60, 41.6, '#b8222c', 1.4)}${gem(67, 41.6, '#1e5fa8', 1.2)}`,
      regalia: `<path d="M46 102Q60 112 74 102" fill="none" stroke="#e0b640" stroke-width="1"/>
        <path d="M58.8 106.6h2.4v3h3v2.4h-3v6h-2.4v-6h-3v-2.4h3z" fill="#e0b640" stroke="#7a5a18" stroke-width=".4"/>`,
    };
  },

  // Henry the Navigator: the great black chaperon and drooping moustache
  portugal: () => ({
    face: { skin: '#dbb08c', lips: '#9c5a48', iris: '#3a2a20', brows: '#2e2018', jaw: 'long', aged: true },
    garment: body('#17151a', `<path d="M38 150L44 118L60 128L76 118L82 150Z" fill="#232028"/>`) + neck('#dbb08c'),
    collar: `<path d="M47 96C47 104 52 110 60 112C68 110 73 104 73 96L70 104Q60 112 50 104Z" fill="#17151a"/><path d="M49 100Q60 108 71 100L71 106Q60 114 49 106Z" fill="#232028"/>`,
    beard: `<path d="M54.2 81Q57 79.4 60 80.2Q63 79.4 65.8 81Q65.6 83.4 64.8 84.6Q62.8 81.8 60 82Q57.2 81.8 55.2 84.6Q54.4 83.4 54.2 81Z" fill="#2e2018"/>`,
    headwear: `<g transform="translate(0 2.4)"><ellipse cx="60" cy="47" rx="27" ry="9" fill="#141216"/>
      <path d="M36 46C34 30 46 20 60 20C74 20 86 30 84 46C80 40 70 37 60 37C50 37 40 40 36 46Z" fill="#1c1a1f"/>
      <path d="M42 40Q50 28 60 27M78 40Q70 28 60 27M48 44Q54 34 60 33M72 44Q66 34 60 33" fill="none" stroke="#2d2a31" stroke-width="1.3"/>
      <path d="M33 48C34 51 40 54 60 54C80 54 86 51 87 48C84 44 76 42 60 42C44 42 36 44 33 48Z" fill="#100f12"/></g>`,
  }),

  // Charles V: the imperial crown, the Habsburg jaw, the Golden Fleece
  hre: () => {
    const hair = '#6a4a2a';
    return {
      face: { skin: '#e6c3a2', lips: '#a8584c', iris: '#4a5a6a', brows: hair, jaw: 'habsburg' },
      back: `<path d="M41 64C40 50 46 44 60 44C74 44 80 50 79 64L79 74L76 74L76 60L44 60L44 74L41 74Z" fill="${hair}"/>`,
      garment: body('#141418', `<path d="M44 112L60 150L76 112L68 110L60 120L52 110Z" fill="#26242c"/>`) + neck('#e6c3a2'),
      collar: `<path d="M50 100L60 106L70 100L70 104L60 110L50 104Z" fill="#f2eee3" stroke="#c8c1b0" stroke-width=".5"/>`,
      beard: `<path d="M44.6 70C45 84 51 96 62 97.6C72 96 76 84 75.4 70C74 80 70 86.6 66 87.6L64 84.6Q60 83.6 56 84.6L54 87.6C50 86.6 46 80 44.6 70Z" fill="${hair}"/>
        <path d="M54 80.6Q57 78.6 60 79.6Q63 78.6 66 80.6Q63 81.6 60 81Q57 81.6 54 80.6Z" fill="${tone(hair, 0.85)}"/>`,
      fringe: `<path d="M44 58C45 49 51 46 60 46C69 46 75 49 76 58C70 53 64 52 60 52C56 52 50 53 44 58Z" fill="${hair}"/>`,
      headwear: `<path d="M44 34C46 22 54 18 60 18C66 18 74 22 76 34Z" fill="#a82028"/>
        <path d="M60 18L60 34" stroke="#e0b640" stroke-width="2.4"/>
        <path d="M41 50L79 50L79 36L41 36Z" fill="#e0b640" stroke="#7a5a18" stroke-width=".7"/>
        <path d="M50.5 36L50.5 50M60 36L60 50M69.5 36L69.5 50" stroke="#7a5a18" stroke-width=".5"/>
        ${gem(45.8, 43, '#1e5fa8')}${gem(55.2, 43, '#2a8a4a')}${gem(64.8, 43, '#b8222c')}${gem(74.2, 43, '#1e5fa8')}
        <path d="M41 36L44 32L47 36M73 36L76 32L79 36" fill="#e0b640" stroke="#7a5a18" stroke-width=".5"/>
        <path d="M58.6 8h2.8v4h3.4v2.6h-3.4v4h-2.8v-4h-3.4v-2.6h3.4z" fill="#e0b640" stroke="#7a5a18" stroke-width=".5"/>`,
      regalia: chain(110, 14, fleece(60, 130)),
    };
  },

  // Philip the Good: black chaperon with its trailing liripipe, the Golden Fleece
  burgundy: () => ({
    face: { skin: '#e8c4a4', lips: '#a65a50', iris: '#3a2a20', brows: '#3a2a1a', jaw: 'long', aged: true },
    garment: body('#141216', `<path d="M20 150C22 132 34 118 50 112L56 120L46 150ZM100 150C98 132 86 118 70 112L64 120L74 150Z" fill="#3a2a1e"/>`) + neck('#e8c4a4'),
    collar: `<path d="M50 100Q60 108 70 100L70 106Q60 114 50 106Z" fill="#141216"/>`,
    headwear: `<path d="M38 52C34 36 46 26 60 26C74 26 86 36 82 52C78 48 70 46 60 46C50 46 42 48 38 52Z" fill="#151316"/>
      <path d="M40 46Q50 34 62 33M80 46Q72 36 60 36M44 50Q54 42 70 42" fill="none" stroke="#2c2930" stroke-width="1.4"/>
      <path d="M37 52C36 56 44 58 60 58C76 58 84 56 83 52C80 49 72 48 60 48C48 48 40 49 37 52Z" fill="#0f0e11"/>
      <path d="M80 52C90 62 94 86 92 112L86 114C88 90 86 70 78 58Z" fill="#151316"/>`,
    regalia: chain(108, 12, fleece(60, 126)),
  }),

  // Francesco Foscari: the doge's horned cap over a linen coif, ermine and gold
  venice: (id) => ({
    face: { skin: '#e2bc9c', lips: '#a05a4e', iris: '#4a3a2a', brows: '#b0a898', jaw: 'long', aged: true, noEars: true },
    garment: body('#c8a04a', `<path d="M30 140Q36 128 44 132Q50 136 46 144M90 140Q84 128 76 132Q70 136 74 144M56 140Q60 132 64 140" fill="none" stroke="#8a6a24" stroke-width="1.4"/>
      <circle cx="44" cy="138" r="2" fill="#8a6a24"/><circle cx="76" cy="138" r="2" fill="#8a6a24"/>`) +
      ermine('M14 140C16 122 32 108 50 106L60 112L70 106C88 108 104 122 106 140C96 128 82 120 70 118L60 122L50 118C38 120 24 128 14 140Z', id) +
      neck('#e2bc9c'),
    back: `<path d="M41 52L79 52L80 80C76 84 72 84 72 84L72 60L48 60L48 84C48 84 44 84 40 80Z" fill="#f2eee3" stroke="#c8c1b0" stroke-width=".6"/>`,
    headwear: `<path d="M41 54C41 41 49 34 60 33C67 31 74 27 79 24C81 34 80.6 46 79 54Z" fill="#b5332b" stroke="#6a1a14" stroke-width=".7"/>
      <path d="M46 52C48 45 54 40 61 38M54 52C56 46 62 41 69 37M63 52C65 45 70 38 77 31" fill="none" stroke="#e0b640" stroke-width="1" opacity=".85"/>
      <path d="M41 54L79 54L79 50L41 50Z" fill="#e0b640" stroke="#7a5a18" stroke-width=".5"/>
      <path d="M41 54L79 54L79 57L41 57Z" fill="#f2eee3" stroke="#c8c1b0" stroke-width=".5"/>`,
  }),

  // Margaret I: widow's veil and wimple under a crown
  denmark: () => ({
    face: { skin: '#f1d8c4', lips: '#b25a58', iris: '#4a6a8a', brows: '#9a7a5a', noEars: true },
    drape: `<path d="M34 120C32 86 34 54 42 42C48 34 72 34 78 42C86 54 88 86 86 120Z" fill="#ebe7de" stroke="#bdb6a6" stroke-width=".7"/>
      <path d="M40 60C38 82 38 102 40 118M80 60C82 82 82 102 80 118" fill="none" stroke="#cfc8b8" stroke-width="1"/>`,
    garment: body('#1c2340', `<path d="M48 112L60 150L72 112Z" fill="#2a3358"/>`) + neck('#f1d8c4'),
    collar: `<path d="M42 62C40 86 48 104 60 106C72 104 80 86 78 62L76 66C76 80 69 92 60 92C51 92 44 80 44 66Z" fill="#f4f1ea" stroke="#c8c1b0" stroke-width=".6"/>
      <path d="M44 90Q60 104 76 90M46 96Q60 108 74 96" fill="none" stroke="#d8d2c4" stroke-width=".8"/>`,
    fringe: `<path d="M42 62C42 46 50 41 60 41C70 41 78 46 78 62C76 54 70 49 60 49C50 49 44 54 42 62Z" fill="#f4f1ea" stroke="#c8c1b0" stroke-width=".6"/>`,
    headwear: `<path d="M44 46L76 46L76 41L72.4 35L69 41L64 33L60 40L56 33L51 41L47.6 35L44 41Z" fill="#e0b640" stroke="#7a5a18" stroke-width=".6"/>
      ${gem(52, 43.6, '#b8222c', 1.2)}${gem(60, 43.6, '#1e5fa8', 1.4)}${gem(68, 43.6, '#b8222c', 1.2)}`,
  }),
};

/**
 * SVG markup for the leader of `nation`, `width` pixels wide (150:120 tall).
 * Each call has its own ids, so a portrait can appear more than once on a page.
 */
export function leaderPortrait(nation: string, width = 120): string {
  const n = MAJOR_NATIONS.find((x) => x.id === nation);
  const make = LEADERS[nation];
  if (!n || !make) return '';
  const id = `${PREFIX}-${++uid}`;
  const f = make(id);
  const bg = n.color;
  const arch = 'M8 150V58A52 52 0 0 1 112 58V150Z';
  return `<svg class="portrait" viewBox="0 0 ${W} ${H}" width="${width}" height="${Math.round((width * H) / W)}" role="img" aria-label="Portrait of ${n.leader.name}">
    <defs>
      <radialGradient id="${id}-bg" cx=".5" cy=".38" r=".75">
        <stop offset="0" stop-color="${tone(bg, 1.25)}"/><stop offset=".6" stop-color="${tone(bg, 0.72)}"/><stop offset="1" stop-color="${tone(bg, 0.38)}"/>
      </radialGradient>
      <pattern id="${id}-diaper" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 0H12M0 0V12" stroke="#000" stroke-width=".6" opacity=".16"/><circle cx="6" cy="6" r="1" fill="#fff" opacity=".12"/>
      </pattern>
      <clipPath id="${id}-clip"><path d="${arch}"/></clipPath>
      <linearGradient id="${id}-gilt" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f3d88a"/><stop offset=".5" stop-color="#b8892e"/><stop offset="1" stop-color="#f0cf78"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" rx="6" fill="#16130f"/>
    <g clip-path="url(#${id}-clip)">
      <path d="${arch}" fill="url(#${id}-bg)"/>
      <path d="${arch}" fill="url(#${id}-diaper)"/>
      <ellipse cx="60" cy="150" rx="70" ry="20" fill="#000" opacity=".25"/>
      ${f.back ?? ''}
      ${f.garment}
      ${f.drape ?? ''}
      ${f.collar ?? ''}
      ${face(f.face, id)}
      ${f.beard ?? ''}
      ${f.fringe ?? ''}
      ${f.headwear ?? ''}
      ${f.regalia ?? ''}
    </g>
    <path d="${arch}" fill="none" stroke="url(#${id}-gilt)" stroke-width="3.4"/>
    <path d="M12 150V58A48 48 0 0 1 108 58V150" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1"/>
  </svg>`;
}
