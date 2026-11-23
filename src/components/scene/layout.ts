/**
 * The island map: terrain, zones and the camera routes through them.
 * Units are metres-ish. The rider stands at the origin, the forest runs to -z,
 * the frog lagoon lies west, the castle hill north-east and Dolphin Bay east.
 */

export type V3 = [number, number, number];
export type Route = "home" | "sunshine" | "lost";

export const WATER_Y = -0.35;

export function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const gauss = (x: number, z: number, cx: number, cz: number, r: number) =>
  Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * r * r));

/** Normalised distance to the coastline: < 1 is land, > 1 is sea. */
export function coast(x: number, z: number) {
  const dx = x / 60;
  const dz = (z + 20) / 54;
  const a = Math.atan2(dz, dx);
  const wobble = 1 + 0.06 * Math.sin(a * 3 + 1) + 0.04 * Math.sin(a * 7 + 2) + 0.025 * Math.sin(a * 13);
  return Math.hypot(dx, dz) / wobble;
}

export const ZONES = {
  meadow: { pos: [0, 1.5, 0] as [number, number, number], label: "Sunny Meadow" },
  lagoon: { pos: [-22, 1.5, -20] as [number, number, number], label: "Frog Lagoon" },
  forest: { pos: [0, 3, -30] as [number, number, number], label: "Lollipop Forest" },
  castle: { pos: [21, 18, -58] as [number, number, number], label: "Candy Castle" },
  bay: { pos: [52, 1.5, 2] as [number, number, number], label: "Dolphin Bay" },
} as const;

export function terrain(x: number, z: number) {
  const e = coast(x, z);
  const rolling =
    0.9 * Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09) +
    0.45 * Math.sin(x * 0.23 + z * 0.17) +
    0.25 * Math.cos(x * 0.41 - z * 0.33);
  const meadow = smooth(7, 15, Math.hypot(x, z * 0.85));
  const beach = smooth(9, 17, Math.hypot(x - 40, z));
  let h = rolling * 0.75 * meadow * beach + 0.35 * (1 - beach) * smooth(1, 0.82, e);
  h += 6.2 * gauss(x, z, 21, -58, 8.5);
  h += 3.8 * gauss(x, z, -31, -46, 10);
  h += 2.4 * gauss(x, z, 26, -26, 7);
  h -= 2.6 * gauss(x, z, -22, -20, 5.2);
  const land = 1 - smooth(0.8, 0.97, e);
  h = h * land + 0.25 * land;
  h -= smooth(0.86, 1.02, e) * 1.1 + smooth(1.0, 1.35, e) * 7;
  return h;
}

/** Dry, grassy land: not beach, lagoon or sea. */
export function isMeadow(x: number, z: number) {
  return terrain(x, z) > 0.12 && coast(x, z) < 0.84 && gauss(x, z, -22, -20, 5.2) < 0.25;
}

export const RIDER = { pos: [0, 0, 0] as V3, rotY: -2.55, scale: 1.15 };
/** Where the 3D wordmark lands (and the 404 on the lost page). */
export const LETTERS = { pos: [0, 0, -10.5] as V3, scale: 1.6, lostScale: 2.5 };
export const FROG = { pos: [-22, WATER_Y + 0.08, -20] as V3, rotY: 0.75, scale: 1.45 };
export const SMILEY = { pos: [40.5, 0, 3] as V3, rotY: -0.9, scale: 1.15 };
export const CASTLE = { pos: [21, 0, -58] as V3, rotY: -0.35, scale: 2.6 };

/** Project signs along the forest trail. */
export const SIGNS: { pos: V3; rotY: number }[] = [
  { pos: [-4.4, 0, -11.5], rotY: 0.42 },
  { pos: [4.6, 0, -17], rotY: -0.42 },
  { pos: [-4.8, 0, -22.5], rotY: 0.42 },
  { pos: [4.4, 0, -28], rotY: -0.42 },
  { pos: [-4.6, 0, -33.5], rotY: 0.42 },
  { pos: [4.8, 0, -39], rotY: -0.42 },
  { pos: [-4.2, 0, -44.5], rotY: 0.42 },
];
export const SIGN_SCALE = 0.95;
/** board centre above the ground, in sign-model units */
export const SIGN_LIFT = 4.05;

export const HERO_LOLLIS: { pos: V3; s: number; rotY: number; pastel?: boolean; sunny?: boolean }[] = [
  { pos: [-8.4, 0, -1.6], s: 1.25, rotY: 0.35, sunny: true },
  { pos: [8, 0, 4], s: 1.6, rotY: -0.45 },
  { pos: [11, 0, -26], s: 2.4, rotY: -0.55 },
  { pos: [-11, 0, -9], s: 1.9, rotY: 0.6, pastel: true },
  { pos: [12.5, 0, -10], s: 2.1, rotY: -0.6, sunny: true },
];
export const HERO_TWISTS: { pos: V3; s: number; rotY: number }[] = [
  { pos: [-10, 0, -28], s: 2.0, rotY: 0.2 },
  { pos: [-10.2, 0, -4.6], s: 1.1, rotY: 0.8 },
];

export const SPECIMEN_CLOUD = { pos: [10, 15, -30] as V3, s: 4.2 };
export const RAINBOW = { pos: [4, -6, -70] as V3, radius: 46, band: 1.6 };

export type CameraKey = { id: string; pos: V3; target: V3; mPos?: V3; mTarget?: V3 };

function signKey(i: number): CameraKey {
  const s = SIGNS[i];
  const y = terrain(s.pos[0], s.pos[2]) + SIGN_LIFT * SIGN_SCALE;
  const fx = Math.sin(s.rotY);
  const fz = Math.cos(s.rotY);
  const dist = 7.2;
  // camera right vector; shift the target so the board sits on the right half
  const rx = fz;
  const rz = -fx;
  return {
    id: `work-${i}`,
    pos: [s.pos[0] + fx * dist, y + 0.5, s.pos[2] + fz * dist],
    target: [s.pos[0] - rx * 2.1, y, s.pos[2] - rz * 2.1],
    mPos: [s.pos[0] + fx * 9.5, y + 1.4, s.pos[2] + fz * 9.5],
    mTarget: [s.pos[0], y - 1.9, s.pos[2]],
  };
}

const lagoonY = 2.2;
const castleTop = 10.2;

export const ROUTES: Record<Route, CameraKey[]> = {
  home: [
    { id: "map", pos: [-14, 70, 64], target: [-16, 0, -16], mPos: [4, 76, 34], mTarget: [4, 0, -24] },
    { id: "about", pos: [1.2, 7.6, 12.6], target: [0.3, 2.3, -4.8], mPos: [0.6, 9.2, 17], mTarget: [0, 3, -5] },
    { id: "stack", pos: [-15.2, 3.4, -11.8], target: [-22.6, lagoonY, -20.4], mPos: [-20.9, 4.6, -10.4], mTarget: [-22, lagoonY + 0.4, -20] },
    ...SIGNS.map((_, i) => signKey(i)),
    { id: "github", pos: [9.5, 9.5, -39], target: [21, castleTop, -58], mTarget: [21, castleTop - 1, -58] },
    { id: "contact", pos: [29, 4.4, 12], target: [48, 2.2, -2], mTarget: [44, 3.4, 0] },
  ],
  sunshine: [
    { id: "hero", pos: [0.9, 2.0, 9.4], target: [0.55, 2.2, 0] },
    { id: "ride", pos: [1.5, 3.0, 5.2], target: [0.1, 2.75, 0] },
    { id: "ride-out", pos: [0.7, 2.85, 4.3], target: [0, 2.8, 0] },
    { id: "forest-in", pos: [0.4, 5.8, -2.6], target: [0, 2.4, -16] },
    { id: "forest-out", pos: [1.0, 2.6, -15], target: [6, 4.5, -26] },
    { id: "swirl", pos: [6.4, 7.4, -18.6], target: [11, 7.6, -26] },
    { id: "twist", pos: [-5.4, 5.4, -20.5], target: [-10, 5.8, -28] },
    { id: "cloud", pos: [3.5, 13.5, -17], target: [10, 15.5, -30] },
    { id: "sky", pos: [0, 10, -12], target: [2, 18, -66] },
    { id: "finale", pos: [0, 8.5, 11], target: [0, 0.2, -1.5] },
  ],
  lost: [
    { id: "lost", pos: [-3.4, 6.2, 11], target: [-3.6, 3.0, -8], mPos: [0.4, 9.5, 18], mTarget: [0, 4.6, -8] },
    { id: "lost-orbit", pos: [13, 4.8, 2], target: [-1, 2.6, -10.5], mPos: [13, 6, 7], mTarget: [0, 3.2, -10.5] },
    { id: "lost-end", pos: [-2, 15, 9], target: [0, 1.2, -8], mPos: [-1, 21, 13], mTarget: [0, 1.5, -9] },
  ],
};

/** Cupcake cottages, see Village in Props.tsx. */
export const HOUSE_SPOTS: [number, number][] = [
  [-13.5, 1.5],
  [13.2, -0.5],
  [-15.5, -30],
  [16.5, -33],
  [29, -6],
];

/** Every camera path, desktop and portrait framing, plus the 404's sightlines to the letters. */
const FLIGHT_PATHS: V3[][] = (() => {
  const paths: V3[][] = [];
  for (const keys of Object.values(ROUTES)) {
    paths.push(keys.map((k) => k.pos));
    paths.push(keys.map((k) => k.mPos ?? k.pos));
  }
  const letters: V3 = [LETTERS.pos[0] - 2, 3, LETTERS.pos[2]];
  for (const k of ROUTES.lost) {
    if (k.pos[1] < 12) paths.push([k.pos, letters]);
    if (k.mPos && k.mPos[1] < 12) paths.push([k.mPos, letters]);
  }
  return paths;
})();

/** Keep instanced props out of the flight paths and off the set pieces. */
export function blocked(x: number, z: number) {
  if (Math.hypot(x, z) < 4.2) return true;
  if (Math.hypot(x - SMILEY.pos[0], z - SMILEY.pos[2]) < 10) return true;
  if (Math.hypot(x - FROG.pos[0], z - FROG.pos[2]) < 6.5) return true;
  for (const [hx, hz] of HOUSE_SPOTS) if (Math.hypot(x - hx, z - hz) < 3.4) return true;
  if (Math.abs(x) < 9.5 && z < LETTERS.pos[2] + 2.6 && z > LETTERS.pos[2] - 2.4) return true;
  for (const s of SIGNS) if (Math.hypot(x - s.pos[0], z - s.pos[2]) < 3.4) return true;
  for (const path of FLIGHT_PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay, az] = path[i];
      const [bx, by, bz] = path[i + 1];
      if (ay > 20 || by > 20) continue;
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2));
      if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < 3.2) return true;
    }
  }
  return false;
}

/** Deterministic PRNG so layouts don't jump between renders. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The candy road that ties the zones together, as map waypoints (x, z). */
export const ROAD: [number, number][] = [
  [0, 9],
  [0.6, 3.6],
  [-2.4, -1.6],
  [-8, -8],
  [-14.5, -13.5],
  [-15.5, -20.5],
  [-10.5, -21],
  [-2.2, -14],
  [0.2, -20],
  [-0.4, -30],
  [0.4, -40],
  [-0.2, -48],
  [6, -52],
  [13.5, -51.5],
  [19, -47],
  [26, -38],
  [30, -24],
  [32, -11],
  [36, -3],
  [40, 0.5],
];
