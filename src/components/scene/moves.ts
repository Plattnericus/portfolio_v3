/**
 * Choreography for the island's characters.
 *
 * A move is a short, self-contained piece of motion: it starts and ends at
 * rest, so any move can follow any other. Moves write additive offsets into a
 * pose (root offset and rotation, squash, bend, twist, jelly, and a handful of
 * limb channels); each character maps the channels it has onto its own parts.
 *
 * Catalogues are built from a small set of motion primitives with different
 * counts, directions, heights and tempos, plus moves that only make sense for
 * one character (a frog's tongue, a unicorn rearing up, a propeller beanie).
 */

export const CH = [
  "x", "y", "z", "rx", "ry", "rz", "s",
  "sq", "bx", "bz", "tw", "wb",
  "aLx", "aLz", "aRx", "aRz", "fL", "fR", "eL", "eR",
  "tail", "wing", "mouth", "eyes", "prop", "gait", "scream",
  "sy", "sry", "srz",
] as const;
export type Channel = (typeof CH)[number];
export type Pose = Record<Channel, number>;

export function pose(): Pose {
  const p = {} as Pose;
  for (const c of CH) p[c] = 0;
  return p;
}

function clear(p: Pose) {
  for (const c of CH) p[c] = 0;
}

/* tags steer which moves fit the moment */
export const CALM = 1;
export const BIG = 2;
export const AIR = 4;
export const SPIN = 8;
export const DANCE = 16;
export const REACT = 32;
export const SHOW = 64;
/** moves that carry a character away from its spot and back */
export const TRAVEL = 128;

type Run = (p: Pose, u: number, k: number) => void;
export type Move = { name: string; dur: number; tags: number; run: Run };

/* ------------------------------------------------------------------ shaping */

const PI = Math.PI;
const TAU = PI * 2;
const c01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ss = (a: number, b: number, x: number) => {
  const t = c01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** 0 -> 1 -> 0 */
const bump = (u: number) => Math.sin(PI * c01(u));
/** holds at 1 in the middle, eases in and out at the ends */
const fade = (u: number, a = 0.14) => ss(0, a, u) * (1 - ss(1 - a, 1, u));
const ease = (u: number) => {
  const x = c01(u);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
const wave = (u: number, n: number, ph = 0) => Math.sin(u * n * TAU + ph);

/* ------------------------------------------------------------------ primitives */

const all =
  (...runs: Run[]): Run =>
  (p, u, k) => {
    for (const r of runs) r(p, u, k);
  };

/** run `r` only during [a, b] of the move, with its own 0..1 */
const during =
  (a: number, b: number, r: Run): Run =>
  (p, u, k) => {
    if (u >= a && u <= b) r(p, (u - a) / (b - a), k);
  };

function hop(n: number, h: number, squash = 0.26): Run {
  return (p, u, k) => {
    const ph = u * n;
    const f = ph - Math.floor(ph);
    const air = 4 * f * (1 - f);
    const e = fade(u, 0.04);
    p.y += air * h * k * e;
    const edge = Math.min(f, 1 - f);
    p.sq += (bump(f) * 0.16 - (1 - ss(0, 0.14, edge)) * squash) * k * e;
  };
}

function spin(turns: number, axis: "ry" | "rx" | "rz" = "ry", lift = 0): Run {
  return (p, u, k) => {
    p[axis] += turns * TAU * ease(ss(0.08, 0.92, u));
    if (lift) {
      p.y += bump(u) * lift * k;
      p.sq += (bump(u) * 0.12 - (1 - ss(0, 0.12, Math.min(u, 1 - u))) * 0.2) * k * fade(u, 0.04);
    }
  };
}

function flip(dir: number, turns = 1, h = 0.9, axis: "rx" | "rz" = "rx"): Run {
  return (p, u, k) => {
    const air = ss(0.18, 0.82, u);
    p[axis] += dir * turns * TAU * ease(air);
    p.y += bump(ss(0.12, 0.88, u)) * h * k;
    const crouch = bump(ss(0, 0.2, u)) + bump(ss(0.82, 1, u));
    p.sq += (-crouch * 0.3 + bump(air) * 0.12) * k;
  };
}

const wiggle =
  (ch: Channel, n: number, amp: number): Run =>
  (p, u, k) => {
    p[ch] += wave(u, n) * amp * k * fade(u);
  };

const hold =
  (ch: Channel, amt: number, a = 0.2): Run =>
  (p, u, k) => {
    p[ch] += amt * k * fade(u, a);
  };

const pulse =
  (ch: Channel, amt: number): Run =>
  (p, u, k) => {
    p[ch] += amt * k * bump(u);
  };

function slide(dx: number, dz: number): Run {
  return (p, u, k) => {
    const b = bump(u);
    p.x += dx * b * k;
    p.z += dz * b * k;
  };
}

/** walks a closed loop and faces along it */
function circle(r: number, dir: number, hopH = 0): Run {
  return (p, u, k) => {
    const a = ease(u) * TAU;
    const e = fade(u, 0.08);
    p.x += Math.sin(a) * r * dir * k * e;
    p.z += (1 - Math.cos(a)) * r * k * e;
    p.ry += a * dir;
    if (hopH) p.y += Math.abs(Math.sin(u * PI * 8)) * hopH * k * e;
  };
}

function figure8(r: number): Run {
  return (p, u, k) => {
    const a = ease(u) * TAU;
    const e = fade(u, 0.08);
    p.x += Math.sin(a) * r * k * e;
    p.z += Math.sin(2 * a) * r * 0.5 * k * e;
    p.ry += Math.cos(a) * 0.8 * e;
  };
}

function zigzag(n: number, w: number): Run {
  return (p, u, k) => {
    const e = fade(u);
    p.x += Math.sin(u * n * PI) * w * k * e;
    p.rz -= Math.cos(u * n * PI) * 0.18 * k * e;
  };
}

function melt(depth: number): Run {
  return (p, u, k) => {
    const d = ss(0, 0.35, u) * (1 - ss(0.65, 1, u));
    p.sq -= d * depth * k;
    p.wb += Math.sin(u * 30) * 0.06 * d * k;
    p.y -= d * depth * 0.1 * k;
  };
}

function boing(n: number, amp: number): Run {
  return (p, u, k) => {
    p.sq += wave(u, n) * amp * k * (1 - u) * ss(0, 0.06, u);
  };
}

function jelly(amp: number, n: number): Run {
  return (p, u, k) => {
    p.wb += wave(u, n) * amp * k * fade(u);
  };
}

function tornado(turns: number): Run {
  return all(spin(turns, "ry", 0.25), (p, u, k) => {
    p.tw += bump(u) * 1.6 * k;
    p.sq += bump(u) * 0.2 * k;
  });
}

function dizzy(n: number): Run {
  return (p, u, k) => {
    const e = fade(u);
    p.rx += Math.sin(u * n * TAU) * 0.18 * k * e;
    p.rz += Math.cos(u * n * TAU) * 0.18 * k * e;
  };
}

function peek(depth: number): Run {
  return (p, u, k) => {
    const d = ss(0, 0.3, u) * (1 - ss(0.62, 0.8, u));
    p.y -= d * depth * k;
    p.sq += (bump(ss(0.75, 1, u)) * 0.25 - d * 0.15) * k;
  };
}

function bob(n: number, amp: number): Run {
  return (p, u, k) => {
    const e = fade(u);
    p.y += Math.abs(Math.sin(u * n * PI)) * amp * k * e;
    p.sq -= (1 - Math.abs(Math.sin(u * n * PI))) * 0.06 * k * e;
  };
}

function sway(n: number, amp: number): Run {
  return (p, u, k) => {
    const e = fade(u);
    p.rz += wave(u, n) * amp * k * e;
    p.x += wave(u, n) * amp * 0.4 * k * e;
  };
}

function headbang(n: number): Run {
  return (p, u, k) => {
    p.bz += Math.max(0, Math.sin(u * n * TAU)) * 0.35 * k * fade(u);
  };
}

function grow(amt: number): Run {
  return (p, u, k) => {
    p.s += bump(u) * amt * k;
  };
}

function tremble(amp: number): Run {
  return (p, u, k) => {
    const e = fade(u);
    p.x += Math.sin(u * 97) * amp * k * e;
    p.z += Math.sin(u * 83 + 1) * amp * k * e;
    p.sq += Math.sin(u * 71) * amp * 0.5 * k * e;
  };
}

/* limbs ------------------------------------------------------------ */

function armWave(side: "L" | "R", n: number): Run {
  const x: Channel = side === "L" ? "aLx" : "aRx";
  const z: Channel = side === "L" ? "aLz" : "aRz";
  return (p, u, k) => {
    p[z] += 1.5 * k * fade(u, 0.2);
    p[x] += wave(u, n) * 0.5 * k * fade(u, 0.2);
  };
}

const armsUp =
  (amt = 1.6): Run =>
  (p, u, k) => {
    const e = fade(u, 0.2) * k;
    p.aLz += amt * e;
    p.aRz += amt * e;
  };

function clap(n: number): Run {
  return (p, u, k) => {
    const e = fade(u, 0.15) * k;
    const c = Math.abs(Math.sin(u * n * PI));
    p.aLx -= (0.6 + c * 0.6) * e;
    p.aRx -= (0.6 + c * 0.6) * e;
    p.aLz += (0.5 - c * 0.6) * e;
    p.aRz += (0.5 - c * 0.6) * e;
  };
}

function flapArms(n: number): Run {
  return (p, u, k) => {
    const f = wave(u, n) * 0.8 * k * fade(u);
    p.aLz += 0.6 * k * fade(u) + f;
    p.aRz += 0.6 * k * fade(u) + f;
  };
}

function punch(n: number): Run {
  return (p, u, k) => {
    const e = fade(u) * k;
    p.aLx -= Math.max(0, Math.sin(u * n * TAU)) * 1.3 * e;
    p.aRx -= Math.max(0, -Math.sin(u * n * TAU)) * 1.3 * e;
    p.ry += wave(u, n) * 0.12 * e;
  };
}

function stomp(n: number, amp = 0.8): Run {
  return (p, u, k) => {
    const e = fade(u) * k;
    p.fL += Math.max(0, Math.sin(u * n * TAU)) * amp * e;
    p.fR += Math.max(0, -Math.sin(u * n * TAU)) * amp * e;
    p.y += Math.abs(Math.sin(u * n * TAU)) * 0.03 * e;
  };
}

function tap(side: "L" | "R", n: number): Run {
  const f: Channel = side === "L" ? "fL" : "fR";
  return (p, u, k) => {
    p[f] += Math.max(0, wave(u, n)) * 0.7 * k * fade(u);
  };
}

function kick(side: "L" | "R"): Run {
  const f: Channel = side === "L" ? "fL" : "fR";
  return (p, u, k) => {
    p[f] += bump(ss(0.2, 0.7, u)) * 1.5 * k;
    p.rx -= bump(ss(0.2, 0.7, u)) * 0.12 * k;
  };
}

const ears =
  (n: number, amp: number, alt = false): Run =>
  (p, u, k) => {
    const e = fade(u) * k;
    p.eL += wave(u, n) * amp * e;
    p.eR += wave(u, n, alt ? PI : 0) * amp * e;
  };

/* ------------------------------------------------------------------ catalogue helpers */

const mv = (name: string, dur: number, tags: number, run: Run): Move => ({ name, dur, tags, run });
const sideName = (d: number) => (d > 0 ? "left" : "right");

/** Motions every character can do with its whole body. */
function common(): Move[] {
  const out: Move[] = [];
  for (const n of [1, 2, 3, 4])
    for (const h of [0.16, 0.38]) out.push(mv(`hop-${n}-${h > 0.2 ? "high" : "low"}`, 0.2 + n * (h > 0.2 ? 0.55 : 0.42), AIR | (h > 0.2 ? BIG : CALM), hop(n, h)));
  for (const d of [1, -1])
    for (const t of [1, 2])
      for (const lift of [0, 0.3])
        out.push(mv(`spin-${sideName(d)}-${t}${lift ? "-jump" : ""}`, 0.6 + t * 0.35, SPIN | (lift ? AIR | BIG : 0), spin(d * t, "ry", lift)));
  out.push(mv("frontflip", 1.1, AIR | BIG | SHOW, flip(-1)));
  out.push(mv("backflip", 1.1, AIR | BIG | SHOW, flip(1)));
  out.push(mv("double-backflip", 1.5, AIR | BIG | SHOW, flip(1, 2, 1.4)));
  for (const d of [1, -1]) out.push(mv(`cartwheel-${sideName(d)}`, 1.2, AIR | BIG | TRAVEL, all(flip(d, 1, 0.7, "rz"), slide(d * 0.4, 0))));
  for (const n of [3, 6]) out.push(mv(`wiggle-${n}`, 0.4 + n * 0.12, DANCE | CALM, wiggle("rz", n, 0.16)));
  for (const n of [3, 6]) out.push(mv(`shimmy-${n}`, 0.4 + n * 0.14, DANCE, wiggle("ry", n, 0.28)));
  for (const d of [1, -1])
    for (const a of [0.12, 0.28]) out.push(mv(`lean-${sideName(d)}-${a > 0.2 ? "deep" : "soft"}`, 1.1, CALM, pulse("rz", d * a)));
  out.push(mv("bend-forward", 1.0, CALM, pulse("bz", 0.45)));
  out.push(mv("bend-back", 1.0, CALM, pulse("bz", -0.35)));
  for (const d of [1, -1]) out.push(mv(`bend-${sideName(d)}`, 1.0, CALM, pulse("bx", d * 0.4)));
  out.push(mv("twist-up", 1.0, CALM | SPIN, all(pulse("tw", 1.1), pulse("sq", 0.12))));
  out.push(mv("corkscrew", 1.4, BIG | SPIN, all(wiggle("tw", 2, 1.2), hop(1, 0.3))));
  out.push(mv("jelly-soft", 1.4, CALM, jelly(0.12, 4)));
  out.push(mv("jelly-wild", 1.2, BIG | DANCE, jelly(0.26, 7)));
  out.push(mv("boing-2", 0.9, REACT, boing(2, 0.3)));
  out.push(mv("boing-5", 1.4, REACT | DANCE, boing(5, 0.35)));
  out.push(mv("melt", 2.0, CALM | SHOW, melt(0.55)));
  out.push(mv("stretch-up", 0.9, CALM, pulse("sq", 0.4)));
  out.push(mv("squish", 0.8, CALM, pulse("sq", -0.35)));
  out.push(mv("peek", 1.6, SHOW, peek(0.5)));
  out.push(mv("pop-big", 0.8, REACT, grow(0.25)));
  out.push(mv("shrink", 1.0, CALM, grow(-0.25)));
  out.push(mv("nod-yes", 0.9, CALM, wiggle("bz", 3, 0.18)));
  out.push(mv("nod-yes-fast", 0.9, REACT, wiggle("bz", 6, 0.14)));
  out.push(mv("shake-no", 0.9, CALM, wiggle("ry", 3, 0.3)));
  out.push(mv("shake-no-fast", 0.8, REACT, wiggle("ry", 6, 0.22)));
  for (const [dx, dz, nm] of [[0, 0.5, "forward"], [0, -0.45, "back"], [0.5, 0, "left"], [-0.5, 0, "right"]] as const)
    out.push(mv(`scoot-${nm}`, 1.2, CALM | TRAVEL, all(slide(dx, dz), bob(4, 0.05))));
  for (const d of [1, -1])
    for (const r of [0.5, 1])
      out.push(mv(`loop-${sideName(d)}-${r > 0.6 ? "wide" : "tight"}`, 1.6 + r * 1.2, CALM | SHOW | TRAVEL, circle(r, d)));
  out.push(mv("hop-loop", 2.8, BIG | AIR | TRAVEL, circle(0.8, 1, 0.12)));
  out.push(mv("figure-eight", 3.2, DANCE | SHOW | TRAVEL, figure8(0.7)));
  out.push(mv("zigzag", 1.8, DANCE | TRAVEL, zigzag(4, 0.35)));
  out.push(mv("tremble", 0.9, REACT, tremble(0.03)));
  out.push(mv("pogo-3", 1.5, AIR | BIG, all(hop(3, 0.32, 0.4), boing(3, 0.1))));
  out.push(mv("pogo-6", 2.4, AIR | BIG | DANCE, hop(6, 0.22, 0.4)));
  out.push(mv("bob-4", 1.4, DANCE, bob(4, 0.06)));
  out.push(mv("bob-8", 2.4, DANCE, bob(8, 0.05)));
  out.push(mv("sway-slow", 2.2, DANCE | CALM, sway(2, 0.14)));
  out.push(mv("sway-fast", 1.4, DANCE, sway(4, 0.12)));
  out.push(mv("moonwalk", 2.2, DANCE | SHOW | TRAVEL, all((p, u, k) => (p.z -= u * 0.45 * k * fade(u, 0.3)), stomp(6, 0.4), sway(3, 0.05))));
  out.push(mv("headbang-4", 1.2, DANCE | BIG, headbang(4)));
  out.push(mv("headbang-8", 2.0, DANCE | BIG, headbang(8)));
  out.push(mv("dizzy", 2.0, CALM, dizzy(3)));
  out.push(mv("tornado", 1.6, SPIN | BIG | SHOW, tornado(3)));
  out.push(mv("hop-spin-land", 1.2, AIR | SPIN | BIG, all(hop(1, 0.4), spin(1))));
  out.push(mv("flip-twist", 1.4, AIR | BIG | SHOW, all(flip(1, 1, 1.1), pulse("tw", 0.8))));
  out.push(mv("jelly-hop", 1.4, AIR | DANCE, all(hop(2, 0.25), jelly(0.18, 6))));
  out.push(mv("spin-melt", 2.0, SPIN | CALM, all(during(0, 0.5, spin(1)), during(0.4, 1, melt(0.5)))));
  out.push(mv("wobble-walk", 2.0, DANCE | TRAVEL, all(slide(0, 0.4), wiggle("rz", 6, 0.14), stomp(6))));
  out.push(mv("zigzag-hop", 2.0, AIR | DANCE | TRAVEL, all(zigzag(4, 0.4), hop(4, 0.16))));
  out.push(mv("spiral-up", 1.6, AIR | SPIN | BIG, (p, u, k) => {
    p.y += bump(u) * 0.6 * k;
    p.ry += ease(u) * TAU * 2;
    p.sq += bump(u) * 0.2 * k;
  }));
  out.push(mv("bounce-lean", 1.6, DANCE, all(bob(4, 0.08), sway(2, 0.2))));
  out.push(mv("victory-hop", 1.5, AIR | REACT | BIG, all(hop(2, 0.35), armsUp())));
  out.push(mv("startle", 0.7, REACT, all(hop(1, 0.2, 0.1), pulse("sq", 0.25), tremble(0.02))));
  return out;
}

/* ------------------------------------------------------------------ characters */

function riderMoves(): Move[] {
  const out = common();
  const gallop = (dur: number, amp = 1): Run => (p, u, k) => {
    const e = fade(u, 0.1) * k;
    p.gait += amp * e;
    p.y += Math.abs(Math.sin(u * dur * 8.5)) * 0.05 * e;
    p.rx += Math.sin(u * dur * 8.5) * 0.04 * e;
  };
  out.push(mv("rear-up", 1.6, SHOW | BIG, (p, u, k) => {
    const r = bump(ss(0.05, 0.9, u));
    p.rx += 0.55 * r * k;
    p.y += 0.12 * r * k;
    p.gait += r * 0.6 * k;
    p.aLz += r * 1.2 * k;
    p.aRz += r * 1.2 * k;
  }));
  out.push(mv("buck", 1.2, BIG | REACT, (p, u, k) => {
    const r = bump(u);
    p.rx -= 0.35 * r * k;
    p.y += 0.15 * r * k;
    p.sy += 0.3 * bump(ss(0.2, 0.9, u)) * k;
  }));
  out.push(mv("rodeo", 2.4, BIG | DANCE | SHOW, (p, u, k) => {
    const e = fade(u) * k;
    p.rx += Math.sin(u * 22) * 0.22 * e;
    p.y += Math.abs(Math.sin(u * 22)) * 0.12 * e;
    p.srz += Math.sin(u * 22 + 1) * 0.35 * e;
    p.aLz += (1 + Math.sin(u * 30) * 0.4) * e;
  }));
  out.push(mv("prance", 2.0, DANCE | CALM, all(gallop(2, 0.5), hop(4, 0.08))));
  out.push(mv("gallop-burst", 2.2, BIG | SHOW, gallop(2.2)));
  out.push(mv("gallop-loop", 3.4, BIG | SHOW | TRAVEL, all(gallop(3.4), circle(1.2, 1))));
  out.push(mv("gallop-loop-back", 3.4, BIG | SHOW | TRAVEL, all(gallop(3.4), circle(1.2, -1))));
  out.push(mv("trot", 2.4, CALM, gallop(2.4, 0.45)));
  out.push(mv("hover", 2.6, AIR | SHOW, (p, u, k) => {
    const e = fade(u, 0.2) * k;
    p.wing += e;
    p.y += e * 0.8 + Math.sin(u * 14) * 0.05 * e;
    p.gait += e * 0.4;
  }));
  out.push(mv("fly-loop", 3.6, AIR | BIG | SHOW | TRAVEL, all(
    (p, u, k) => {
      const e = fade(u, 0.15) * k;
      p.wing += e;
      p.y += e * 1.4;
      p.rx += Math.sin(u * TAU) * 0.25 * e;
    },
    circle(1.4, 1),
  )));
  out.push(mv("wing-stretch", 1.4, CALM, pulse("wing", 0.9)));
  out.push(mv("wing-flutter", 1.2, CALM | REACT, wiggle("wing", 6, 0.6)));
  out.push(mv("tail-swish", 1.2, CALM, wiggle("tail", 3, 1)));
  out.push(mv("tail-helicopter", 1.4, DANCE, wiggle("tail", 7, 1.4)));
  out.push(mv("pirouette", 1.8, SPIN | SHOW, all(spin(1, "ry"), pulse("rx", 0.4), pulse("gait", 0.5))));
  out.push(mv("bow", 1.6, SHOW | CALM, all(pulse("rx", -0.3), pulse("bz", 0.3), pulse("sry", 0.6))));
  out.push(mv("shake-off", 1.0, REACT, wiggle("tw", 9, 0.35)));
  out.push(mv("sneeze", 1.2, REACT, all(during(0, 0.6, pulse("bz", -0.2)), during(0.6, 0.85, pulse("bz", 0.5)), during(0.6, 1, boing(3, 0.25)))));
  out.push(mv("sleepy-nod", 2.6, CALM, (p, u, k) => {
    const e = fade(u) * k;
    p.bz += (0.2 + Math.sin(u * 7) * 0.1) * e;
    p.eL -= 0.4 * e;
    p.eR -= 0.4 * e;
  }));
  out.push(mv("kick-back", 1.0, BIG, all(pulse("rx", -0.25), pulse("gait", 1))));
  // the hamster on top has a repertoire of his own
  for (const n of [1, 2, 3]) out.push(mv(`rider-hop-${n}`, 0.4 + n * 0.45, AIR | REACT, (p, u, k) => {
    const f = (u * n) % 1;
    p.sy += 4 * f * (1 - f) * 0.45 * k;
    p.aLz += bump(f) * 1.2 * k;
    p.aRz += bump(f) * 1.2 * k;
  }));
  for (const t of [1, 2]) out.push(mv(`rider-spin-${t}`, 0.6 + t * 0.4, SPIN, (p, u, k) => {
    p.sry += t * TAU * ease(u);
    p.sy += bump(u) * 0.25 * k;
  }));
  out.push(mv("rider-flip", 1.2, AIR | BIG | SHOW, (p, u, k) => {
    p.sy += bump(u) * 0.9 * k;
    p.srz -= TAU * ease(ss(0.15, 0.85, u));
  }));
  out.push(mv("rider-wave-left", 1.6, CALM | SHOW, armWave("L", 4)));
  out.push(mv("rider-wave-right", 1.6, CALM | SHOW, armWave("R", 4)));
  out.push(mv("rider-cheer", 1.4, REACT | BIG, all(armsUp(), hop(2, 0.06), pulse("scream", 0.7))));
  out.push(mv("rider-scream-short", 1.0, REACT, all(pulse("scream", 1), armsUp(1.2), tremble(0.015))));
  out.push(mv("rider-scream-long", 2.4, SHOW | BIG, all(hold("scream", 1, 0.1), armsUp(1.7), wiggle("srz", 10, 0.06), ears(10, 0.4))));
  out.push(mv("rider-ear-wiggle", 1.2, CALM, ears(5, 0.6, true)));
  out.push(mv("rider-ear-flop", 1.2, CALM, all(pulse("eL", -0.8), pulse("eR", -0.8))));
  out.push(mv("rider-stand", 1.8, SHOW, all(pulse("sy", 0.25), armsUp(0.8), stomp(4, 0.5))));
  out.push(mv("rider-dance", 2.4, DANCE | SHOW, all(wiggle("srz", 4, 0.25), flapArms(4), stomp(8, 0.4))));
  out.push(mv("rider-headbang", 1.6, DANCE | BIG, (p, u, k) => {
    p.srz += Math.max(0, Math.sin(u * 8 * TAU)) * 0.3 * k * fade(u);
  }));
  out.push(mv("rider-clap-3", 1.2, REACT, clap(3)));
  out.push(mv("rider-clap-6", 1.8, DANCE, clap(6)));
  out.push(mv("rider-punch", 1.4, BIG, punch(4)));
  out.push(mv("rider-flap", 1.6, AIR, all(flapArms(6), pulse("sy", 0.2))));
  out.push(mv("rider-high-five", 1.4, SHOW, all(during(0, 0.7, armWave("R", 1)), during(0.6, 1, pulse("bz", 0.2)))));
  out.push(mv("rider-surf", 2.4, DANCE | SHOW, all(pulse("sry", 1.2), wiggle("srz", 3, 0.25), hold("aLz", 1), hold("aRz", 0.6))));
  out.push(mv("rider-lookout", 2.0, CALM, all(hold("aRx", -1.2), wiggle("sry", 2, 0.5), pulse("sy", 0.15))));
  return out;
}

function frogMoves(): Move[] {
  const out = common();
  const tongue = (n: number, len: number): Run => (p, u, k) => {
    p.mouth += Math.max(0, Math.sin(u * n * PI)) * len * k;
  };
  out.push(mv("tongue-flick", 0.7, REACT, tongue(1, 1)));
  out.push(mv("tongue-flick-3", 1.3, REACT | DANCE, tongue(3, 0.9)));
  out.push(mv("tongue-slurp", 1.8, SHOW, all(during(0, 0.6, (p, u, k) => (p.mouth += ss(0, 1, u) * 1.4 * k)), during(0.6, 1, (p, u, k) => (p.mouth += (1 - ss(0, 0.4, u)) * 1.4 * k)), during(0.6, 0.9, boing(2, 0.2)))));
  out.push(mv("tongue-lasso", 2.2, SHOW | SPIN, all(hold("mouth", 1.1), (p, u, k) => (p.srz += ease(u) * TAU * 3 * k), pulse("sq", 0.1))));
  out.push(mv("tongue-wave", 1.6, DANCE, all(hold("mouth", 0.9), wiggle("srz", 5, 0.6))));
  out.push(mv("tongue-helicopter", 2.4, AIR | SHOW | SPIN, all(hold("mouth", 1.0), (p, u, k) => (p.srz += ease(u) * TAU * 6 * k), pulse("y", 0.5))));
  out.push(mv("croak-puff", 1.2, CALM, all(boing(3, 0.18), pulse("s", 0.12), pulse("mouth", 0.3))));
  out.push(mv("croak-puff-big", 1.6, SHOW, all(pulse("s", 0.3), during(0.6, 1, boing(4, 0.25)), pulse("mouth", 0.5))));
  out.push(mv("googly-spin", 1.5, REACT, (p, u, k) => (p.eyes += ease(u) * 4 * k)));
  out.push(mv("googly-backspin", 1.5, REACT, (p, u, k) => (p.eyes -= ease(u) * 4 * k)));
  out.push(mv("eye-pop", 0.9, REACT, all(pulse("sry", 0.5), pulse("sq", 0.15))));
  out.push(mv("eye-roll", 2.0, CALM, (p, u, k) => (p.eyes += Math.sin(u * TAU) * 1.2 * k)));
  out.push(mv("belly-drum", 1.8, DANCE, all(punch(6), boing(6, 0.1))));
  out.push(mv("wave-left", 1.6, CALM | SHOW, armWave("L", 4)));
  out.push(mv("wave-right", 1.6, CALM | SHOW, armWave("R", 4)));
  out.push(mv("wave-both", 1.8, SHOW, all(armWave("L", 4), armWave("R", 4))));
  out.push(mv("clap-4", 1.3, REACT, clap(4)));
  out.push(mv("clap-8", 2.0, DANCE, clap(8)));
  out.push(mv("hooray", 1.2, REACT | BIG, all(armsUp(), hop(1, 0.3))));
  out.push(mv("flex", 1.6, SHOW, all(armsUp(1.3), wiggle("aLx", 4, 0.5), wiggle("aRx", 4, 0.5), pulse("bz", -0.15))));
  out.push(mv("swim-dive", 3.0, SHOW | BIG | TRAVEL, (p, u, k) => {
    const dive = ss(0.15, 0.35, u) * (1 - ss(0.7, 0.9, u));
    p.y += (bump(ss(0, 0.3, u)) * 0.6 - dive * 1.1 + bump(ss(0.72, 1, u)) * 0.5) * k;
    p.rx -= (bump(ss(0.1, 0.35, u)) * 1.2 - bump(ss(0.7, 0.95, u)) * 0.6) * k;
    p.x += Math.sin(ss(0.25, 0.8, u) * TAU) * 0.7 * dive * k;
    p.z += (1 - Math.cos(ss(0.25, 0.8, u) * TAU)) * 0.5 * dive * k;
    p.ry += ss(0.25, 0.8, u) * TAU;
    p.fL += Math.max(0, Math.sin(u * 40)) * dive * k;
    p.fR += Math.max(0, -Math.sin(u * 40)) * dive * k;
  }));
  out.push(mv("lily-leap", 1.6, AIR | BIG | TRAVEL, all(hop(1, 0.7, 0.45), slide(0, 0.6), during(0.2, 0.8, pulse("fL", 1.2)), during(0.2, 0.8, pulse("fR", 1.2)))));
  out.push(mv("squat-jump", 1.8, AIR | BIG | SHOW, all(during(0, 0.4, pulse("sq", -0.4)), during(0.35, 1, hop(1, 0.9, 0.3)), during(0.4, 0.9, armsUp(1.4)))));
  out.push(mv("frog-kick", 1.0, BIG, all(kick("L"), kick("R"))));
  out.push(mv("tap-feet", 1.6, DANCE, all(tap("L", 4), tap("R", 4))));
  out.push(mv("frog-scream", 1.8, SHOW | BIG, all(hold("mouth", 1.3, 0.1), pulse("s", 0.15), tremble(0.025), armsUp(1.5))));
  out.push(mv("belly-flop", 1.6, AIR | BIG, all(hop(1, 0.6), during(0.3, 0.75, pulse("rx", -1.3)), during(0.75, 1, boing(3, 0.3)))));
  out.push(mv("backstroke", 2.4, CALM | SHOW | TRAVEL, all(pulse("rx", 0.9), slide(0, -0.5), flapArms(5))));
  out.push(mv("yawn", 2.2, CALM, all(pulse("mouth", 0.45), armsUp(0.9), pulse("sq", 0.2))));
  out.push(mv("frog-sneeze", 1.1, REACT, all(during(0.5, 0.8, pulse("mouth", 0.9)), during(0.5, 1, boing(3, 0.3)))));
  out.push(mv("jiggle-belly", 1.4, CALM, jelly(0.18, 9)));
  out.push(mv("surprised", 0.9, REACT, all(hop(1, 0.25, 0.1), pulse("s", 0.15), pulse("eyes", 1))));
  out.push(mv("shy", 1.8, CALM, all(pulse("sq", -0.15), pulse("rz", 0.15), clap(2))));
  out.push(mv("disco-point", 2.0, DANCE | SHOW, (p, u, k) => {
    const e = fade(u) * k;
    const side = Math.sin(u * 4 * PI) > 0;
    p[side ? "aLz" : "aRz"] += 2.0 * e;
    p.rz += (side ? 0.12 : -0.12) * e;
    p.y += Math.abs(Math.sin(u * 8 * PI)) * 0.04 * e;
  }));
  out.push(mv("conga", 2.4, DANCE | TRAVEL, all(sway(4, 0.12), stomp(8, 0.6), slide(0.3, 0))));
  out.push(mv("tongue-catch", 1.2, REACT | SHOW, all(during(0, 0.4, pulse("mouth", 1.4)), during(0.35, 0.6, boing(1, 0.2)), during(0.5, 1, pulse("s", 0.08)))));
  return out;
}

function smileyMoves(): Move[] {
  const out = common();
  const walk = (n: number, amp = 0.9): Run => stomp(n, amp);
  out.push(mv("propeller-hover", 2.6, AIR | SHOW, all(hold("prop", 1, 0.15), (p, u, k) => (p.y += ss(0, 0.3, u) * (1 - ss(0.7, 1, u)) * 1.1 * k + Math.sin(u * 16) * 0.04 * k))));
  out.push(mv("propeller-boost", 2.4, AIR | BIG | SHOW, all(hold("prop", 1.4, 0.1), (p, u, k) => (p.y += bump(u) ** 0.7 * 2.6 * k), during(0.3, 0.8, spin(1)))));
  out.push(mv("helicopter-spin", 2.0, AIR | SPIN, all(hold("prop", 1.2), spin(3, "ry", 0.9))));
  out.push(mv("propeller-loop", 3.2, AIR | SHOW | TRAVEL, all(hold("prop", 1.1), (p, u, k) => (p.y += bump(u) * 1.2 * k), circle(1.1, 1))));
  out.push(mv("lolli-twirl", 1.6, CALM | SHOW, (p, u, k) => (p.aRx += ease(u) * TAU * 2 * k)));
  out.push(mv("lolli-lick", 1.8, CALM, all(pulse("aRz", -0.4), pulse("aRx", -0.9), during(0.4, 0.7, boing(2, 0.12)))));
  out.push(mv("lolli-offer", 1.6, SHOW, all(pulse("aRx", -1.1), pulse("bz", 0.15))));
  out.push(mv("lolli-raise", 1.4, REACT, all(pulse("aRz", 1.4), hop(1, 0.2))));
  out.push(mv("wave-left", 1.6, CALM | SHOW, armWave("L", 4)));
  out.push(mv("wave-left-fast", 1.2, REACT, armWave("L", 7)));
  out.push(mv("wave-both", 1.8, SHOW, all(armWave("L", 4), armWave("R", 4))));
  out.push(mv("cheer", 1.3, REACT | BIG, all(armsUp(), hop(2, 0.25))));
  out.push(mv("tap-left", 1.4, DANCE | CALM, tap("L", 4)));
  out.push(mv("tap-right", 1.4, DANCE | CALM, tap("R", 4)));
  out.push(mv("walk-in-place", 2.0, CALM, all(walk(6), bob(6, 0.04))));
  out.push(mv("march", 2.4, DANCE, all(walk(8, 1.1), armWave("L", 8), sway(4, 0.05))));
  out.push(mv("stomp", 1.4, BIG, all(walk(4, 1.3), boing(4, 0.12))));
  out.push(mv("kick-left", 1.0, BIG, kick("L")));
  out.push(mv("kick-right", 1.0, BIG, kick("R")));
  out.push(mv("tippy-toes", 1.8, CALM, all(pulse("sq", 0.25), pulse("fL", 0.5), pulse("fR", 0.5), pulse("y", 0.05))));
  out.push(mv("skip", 2.2, DANCE | AIR | TRAVEL, all(hop(4, 0.18), walk(4, 1), slide(0, 0.5))));
  out.push(mv("run-loop", 2.8, BIG | SHOW | TRAVEL, all(circle(1.0, 1), walk(14, 1.2), bob(14, 0.05))));
  out.push(mv("run-loop-back", 2.8, BIG | SHOW | TRAVEL, all(circle(1.0, -1), walk(14, 1.2), bob(14, 0.05))));
  out.push(mv("roll-over", 1.6, BIG | TRAVEL, all(flip(1, 1, 0.15, "rz"), slide(0.5, 0))));
  out.push(mv("blush", 1.8, CALM, all(pulse("rz", 0.18), pulse("sq", -0.1), pulse("aLz", 0.5))));
  out.push(mv("jump-kick", 1.2, AIR | BIG, all(hop(1, 0.5), during(0.25, 0.75, kick("R")), during(0.25, 0.75, armsUp(1.2)))));
  out.push(mv("salute", 1.6, SHOW, all(hold("aLz", 1.8), hold("aLx", -0.5), pulse("sq", 0.08))));
  out.push(mv("conductor", 2.4, DANCE, all(wiggle("aLz", 4, 0.8), wiggle("aRz", 4, 0.6), sway(2, 0.06))));
  out.push(mv("hat-tip", 1.4, CALM | SHOW, all(pulse("bz", 0.25), pulse("prop", 0.3), pulse("aLz", 1.6))));
  out.push(mv("drool-slurp", 1.2, CALM, all(pulse("bz", -0.1), boing(2, 0.1))));
  out.push(mv("bounce-ball", 2.0, AIR | DANCE, hop(5, 0.3, 0.45)));
  out.push(mv("tumble-dry", 1.8, SPIN | BIG, all(spin(2, "rx", 0.6))));
  return out;
}

/** Dolphin tricks: a jump is an arc plus flips, barrel rolls and spins on top. */
export type Trick = { name: string; flips: number; rolls: number; spins: number; height: number; length: number; tail: boolean };

export function dolphinTricks(): Trick[] {
  const out: Trick[] = [];
  for (const flips of [0, 1, 2])
    for (const rolls of [0, 1, 2])
      for (const spins of [0, 1])
        for (const [height, hn] of [[3.2, "low"], [4.6, "high"]] as const)
          for (const [length, ln] of [[7, "short"], [10, "mid"], [13, "long"]] as const)
            out.push({ name: `jump-${hn}-${ln}-f${flips}r${rolls}s${spins}`, flips, rolls, spins, height, length, tail: false });
  for (const length of [5, 8]) out.push({ name: `tail-walk-${length}`, flips: 0, rolls: 0, spins: 0, height: 1.4, length, tail: true });
  return out;
}

/** Root-only repertoires for the instanced animals. */
export function animalMoves(kind: "bunny" | "sheep" | "duck" | "bird"): Move[] {
  const out = common();
  if (kind === "bunny") {
    out.push(mv("binky", 0.9, AIR | BIG, all(hop(1, 0.6), wiggle("ry", 2, 0.8), wiggle("rz", 2, 0.4))));
    out.push(mv("binky-double", 1.6, AIR | BIG, all(hop(2, 0.55), wiggle("ry", 4, 0.8))));
    out.push(mv("thump", 0.8, REACT, all(pulse("rx", 0.25), boing(2, 0.2))));
    out.push(mv("beg", 1.8, CALM, all(pulse("rx", -0.7), pulse("y", 0.08))));
    out.push(mv("zoomies", 2.2, BIG, circle(1.4, 1, 0.15)));
    out.push(mv("flop", 2.2, CALM, all(pulse("rz", 1.4), pulse("sq", -0.1))));
  } else if (kind === "sheep") {
    out.push(mv("pronk", 1.4, AIR | BIG, hop(3, 0.45, 0.1)));
    out.push(mv("headbutt", 1.0, BIG, all(pulse("rx", 0.3), slide(0, 0.4))));
    out.push(mv("graze", 3.0, CALM, hold("rx", 0.3, 0.25)));
    out.push(mv("wool-shake", 1.0, REACT, wiggle("rz", 8, 0.12)));
    out.push(mv("baa", 1.2, CALM, all(pulse("rx", -0.2), boing(2, 0.1))));
  } else if (kind === "duck") {
    out.push(mv("dabble", 1.8, CALM | SHOW, all(pulse("rx", 1.4), pulse("y", -0.05))));
    out.push(mv("flap-run", 1.6, BIG, all(slide(0, 0.6), tremble(0.02), pulse("y", 0.12))));
    out.push(mv("waddle", 2.0, CALM, all(wiggle("rz", 6, 0.12), slide(0, 0.4))));
    out.push(mv("preen", 1.8, CALM, wiggle("ry", 3, 0.5)));
    out.push(mv("duck-dive", 2.2, SHOW, peek(0.25)));
  } else {
    out.push(mv("loop-the-loop", 1.8, AIR | SHOW, flip(1, 1, 1.4)));
    out.push(mv("barrel-roll", 1.2, AIR, spin(1, "rz")));
    out.push(mv("swoop", 2.0, AIR | BIG, all(pulse("y", -1.6), pulse("rx", 0.4))));
    out.push(mv("climb", 2.0, AIR, all(pulse("y", 1.4), pulse("rx", -0.4))));
    out.push(mv("glide", 2.6, CALM, pulse("rz", 0.4)));
  }
  return out;
}

export const CATALOG = {
  rider: riderMoves,
  frog: frogMoves,
  smiley: smileyMoves,
};

/* ------------------------------------------------------------------ performer */

/** Small seeded generator, so each character keeps its own rhythm. */
function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Plays moves back to back. Energy (from scroll speed) picks bigger moves and
 * plays them faster; when a character is on camera it rests less between them.
 * Recent moves are skipped, so the whole repertoire comes around.
 */
export class Performer {
  readonly p = pose();
  private cur: Move | null = null;
  private u = 0;
  private rest = 0.6;
  private recent: number[] = [];
  private queued: number | null = null;
  private r: () => number;
  readonly moves: Move[];

  constructor(moves: Move[], seed: number) {
    this.moves = moves;
    this.r = rand(seed);
    this.rest = this.r() * 1.5;
  }

  get current() {
    return this.cur?.name ?? "";
  }

  private avoid = 0;

  /** Skip moves with any of these tags, e.g. travel while the camera is close. */
  restrict(tags: number) {
    this.avoid = tags;
  }

  /** Queue one move by name next, cutting the rest short. */
  play(name: string) {
    const i = this.moves.findIndex((m) => m.name === name);
    if (i < 0) return;
    this.queued = i;
    this.rest = Math.min(this.rest, 0.05);
  }

  /** Queue a move with any of `tags` next, cutting the rest short. */
  cue(tags: number) {
    const pick = this.pick(tags);
    if (pick >= 0) {
      this.queued = pick;
      this.rest = Math.min(this.rest, 0.05);
    }
  }

  private pick(tags: number) {
    const ok: number[] = [];
    for (let i = 0; i < this.moves.length; i++) {
      if (!(this.moves[i].tags & tags) || this.moves[i].tags & this.avoid) continue;
      if (this.recent.includes(i)) continue;
      ok.push(i);
    }
    if (!ok.length) return -1;
    return ok[Math.floor(this.r() * ok.length)];
  }

  update(dt: number, energy: number, seen: boolean, k = 1) {
    const p = this.p;
    clear(p);
    if (!this.cur) {
      this.rest -= dt;
      if (this.rest > 0) return p;
      let i = this.queued ?? -1;
      this.queued = null;
      if (i < 0) {
        const want = energy > 0.55 ? BIG | AIR | SPIN | DANCE : energy > 0.2 ? DANCE | SPIN | SHOW | CALM : CALM | SHOW | DANCE;
        i = this.pick(want);
        if (i < 0) i = this.pick(~0);
        if (i < 0) {
          this.recent.length = 0;
          i = this.pick(~0);
        }
        if (i < 0) i = 0;
      }
      this.recent.push(i);
      if (this.recent.length > Math.min(40, this.moves.length - 5)) this.recent.shift();
      this.cur = this.moves[i];
      this.u = 0;
    }
    const m = this.cur;
    const rate = 1 + energy * 0.5;
    this.u += (dt * rate) / m.dur;
    if (this.u >= 1) {
      this.cur = null;
      this.rest = (seen ? 0.15 : 0.9) + this.r() * (seen ? 0.7 : 2.2) * (1 - energy * 0.7);
      return p;
    }
    m.run(p, this.u, k);
    return p;
  }
}
