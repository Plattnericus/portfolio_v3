"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { MODELS, useDetail, useNodes } from "./Props";
import { flapping, tickFlap, toy } from "./materials";
import { FROG, WATER_Y, isMeadow, rng, terrain } from "./layout";
import { Performer, animalMoves, type Pose } from "./moves";
import { world } from "@/lib/world";

type Walker = { cx: number; cz: number; r: number; phase: number; speed: number; pause: number; s: number };

const TAU = Math.PI * 2;

function turnTo(a: number, b: number, lambda: number, dt: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * (1 - Math.exp(-lambda * dt));
}

/**
 * Grazing-animal wandering: pick a spot near home, turn towards it, walk there
 * (slowing as it arrives), stand a while looking about, pick the next spot.
 * Models face +x, so a heading of `yaw` walks along (cos yaw, -sin yaw).
 */
class Wander {
  x: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  wait: number;
  look = 0;
  stride = 0;
  private r: () => number;
  constructor(
    private w: Walker,
    seed: number,
    private speed: number,
  ) {
    this.r = rng(seed);
    this.x = this.tx = w.cx;
    this.z = this.tz = w.cz;
    this.yaw = this.r() * TAU;
    this.wait = this.r() * 4;
  }

  private pick() {
    for (let k = 0; k < 8; k++) {
      const a = this.r() * TAU;
      const d = (0.3 + this.r() * 0.7) * this.w.r;
      const x = this.w.cx + Math.cos(a) * d;
      const z = this.w.cz + Math.sin(a) * d;
      if (isMeadow(x, z)) {
        this.tx = x;
        this.tz = z;
        return;
      }
    }
  }

  /** Advances; returns how fast it is walking, 0..1. */
  step(dt: number, busy: boolean, hurry: number) {
    if (busy) return 0;
    if (this.wait > 0) {
      this.wait -= dt;
      // standing animals glance around now and then
      if (this.r() < dt * 0.6) this.look = (this.r() - 0.5) * 1.6;
      this.yaw = turnTo(this.yaw, this.yaw + this.look * 0.02, 2, dt);
      if (this.wait <= 0) this.pick();
      return 0;
    }
    const dx = this.tx - this.x;
    const dz = this.tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.12) {
      this.wait = 1.5 + this.r() * 4.5;
      return 0;
    }
    this.yaw = turnTo(this.yaw, Math.atan2(-dz, dx), 3.5, dt);
    // walk along the heading, so turns are arcs rather than pivots
    const v = this.speed * (1 + hurry) * Math.min(1, d / 0.8) * dt;
    this.x += Math.cos(this.yaw) * v;
    this.z -= Math.sin(this.yaw) * v;
    this.stride += v;
    return Math.min(1, d / 0.8);
  }
}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/**
 * Adds a performer's pose on top of where an animal is walking. Offsets are in
 * body lengths along the animal's own heading; squash keeps the volume.
 */
function perform(p: Pose, x: number, y: number, z: number, yaw: number, rx: number, rz: number, s: number, size: number) {
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const ox = p.z * size;
  const oz = -p.x * size;
  dummy.position.set(x + ox * c + oz * sn, y + p.y * size, z - ox * sn + oz * c);
  dummy.rotation.set(rx + p.rz + p.bx * 0.5, yaw + p.ry + p.tw * 0.4, rz + p.rx + p.bz * 0.5, "YZX");
  const st = 1 + p.sq;
  const k = s * (1 + p.s);
  const side = k / Math.sqrt(Math.max(0.3, st));
  dummy.scale.set(side, k * st, side);
}

function crowd(kind: "bunny" | "sheep" | "duck" | "bird", n: number, seed: number) {
  const moves = animalMoves(kind);
  return Array.from({ length: n }, (_, i) => new Performer(moves, seed + i * 101));
}

/** Places wanderers on dry meadow around a few anchors. */
function herd(n: number, seed: number, anchors: [number, number, number][], scale: [number, number]): Walker[] {
  const rand = rng(seed);
  const out: Walker[] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 60) {
    const [ax, az, spread] = anchors[out.length % anchors.length];
    const cx = ax + (rand() - 0.5) * spread;
    const cz = az + (rand() - 0.5) * spread;
    if (!isMeadow(cx, cz)) continue;
    out.push({
      cx,
      cz,
      r: 1.2 + rand() * 2.2,
      phase: rand() * 100,
      speed: 0.25 + rand() * 0.25,
      pause: rand() * 10,
      s: scale[0] + rand() * (scale[1] - scale[0]),
    });
  }
  return out;
}

function useTints(ref: React.RefObject<THREE.InstancedMesh | null>, count: number, colors: string[]) {
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < count; i++) m.setColorAt(i, tint.set(colors[i % colors.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [ref, count, colors]);
}

const BUNNY_TINTS = ["#ffffff", "#fff1e0", "#ffe3ec", "#f2e2d2", "#ffffff"];
const SHEEP_TINTS = ["#ffffff", "#ffd9ec", "#e8ddff", "#d9f5ea", "#fff1cc"];
const BIRD_TINTS = ["#ffffff", "#ffc2dc", "#c9f0ff", "#fff0b3"];

export function Animals({
  bunnies,
  sheep,
  ducks,
  birds,
  detail,
}: {
  bunnies: number;
  sheep: number;
  ducks: number;
  birds: number;
  detail: number;
}) {
  const n = useNodes(MODELS.animals);
  const pick = useDetail(detail);
  const bunnyRef = useRef<THREE.InstancedMesh>(null);
  const sheepRef = useRef<THREE.InstancedMesh>(null);
  const duckRef = useRef<THREE.InstancedMesh>(null);
  const birdRef = useRef<THREE.InstancedMesh>(null);

  const flock = useMemo(
    () => ({
      bunnies: herd(bunnies, 3, [[-6, 2, 8], [6, 1, 8], [-9, -14, 10], [9, -20, 10], [22, -8, 10]], [0.9, 1.25]),
      sheep: herd(sheep, 9, [[-24, -36, 12], [14, -42, 12], [-8, 6, 8], [28, -16, 10]], [1.0, 1.3]),
      ducks: Array.from({ length: ducks }, (_, i) => ({
        r: 2.2 + (i % 3) * 1.1,
        phase: (i / Math.max(1, ducks)) * Math.PI * 2,
        speed: 0.18 + (i % 4) * 0.04,
      })),
      birds: Array.from({ length: birds }, (_, i) => ({
        cx: [0, -18, 20, 40][i % 4],
        cz: [-14, -30, -40, 0][i % 4],
        h: 9 + (i % 5) * 1.8,
        r: 8 + (i % 6) * 2.4,
        phase: i * 0.9,
        speed: 0.22 + (i % 5) * 0.03,
      })),
    }),
    [bunnies, sheep, ducks, birds],
  );

  const walkers = useMemo(
    () => ({
      bunnies: flock.bunnies.map((w, i) => new Wander(w, 300 + i, 1.1)),
      sheep: flock.sheep.map((w, i) => new Wander(w, 700 + i, 0.4)),
    }),
    [flock],
  );
  const acts = useMemo(
    () => ({
      bunnies: crowd("bunny", bunnies, 5),
      sheep: crowd("sheep", sheep, 7),
      ducks: crowd("duck", ducks, 9),
      birds: crowd("bird", birds, 13),
    }),
    [bunnies, sheep, ducks, birds],
  );

  useTints(bunnyRef, bunnies, BUNNY_TINTS);
  useTints(sheepRef, sheep, SHEEP_TINTS);
  useTints(duckRef, ducks, ["#ffffff"]);
  useTints(birdRef, birds, BIRD_TINTS);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const e = world.energy;
    tickFlap(t);

    // bunnies: hop to a spot, sit and sniff, hop on
    const b = bunnyRef.current;
    if (b) {
      flock.bunnies.forEach((w, i) => {
        const act = acts.bunnies[i].update(dt, e, true);
        const wk = walkers.bunnies[i];
        const go = wk.step(dt, acts.bunnies[i].current !== "", e);
        const ph = wk.stride * 4.2;
        const hop = go > 0.05 ? Math.abs(Math.sin(ph)) : 0;
        act.sq += go > 0.05 ? -0.12 * (1 - hop) : 0.03 * Math.sin(t * 9 + i);
        const sniff = go > 0.05 ? 0 : Math.max(0, Math.sin(t * 1.3 + w.pause)) * 0.18;
        perform(act, wk.x, terrain(wk.x, wk.z) + hop * 0.3 * w.s, wk.z, wk.yaw, 0, go > 0.05 ? -0.22 * Math.cos(ph) : sniff, w.s, 0.5 * w.s);
        dummy.updateMatrix();
        b.setMatrixAt(i, dummy.matrix);
      });
      b.instanceMatrix.needsUpdate = true;
    }

    // sheep: amble to fresh grass, then graze with the head down
    const sh = sheepRef.current;
    if (sh) {
      flock.sheep.forEach((w, i) => {
        const act = acts.sheep[i].update(dt, e, true);
        const wk = walkers.sheep[i];
        const go = wk.step(dt, acts.sheep[i].current !== "", e * 0.5);
        const ph = wk.stride * 6;
        const graze = (1 - go) * (0.2 + Math.sin(t * 0.7 + w.pause) * 0.08);
        perform(
          act,
          wk.x,
          terrain(wk.x, wk.z) + Math.abs(Math.sin(ph)) * 0.035 * go,
          wk.z,
          wk.yaw,
          Math.sin(ph) * 0.04 * go,
          -graze,
          w.s,
          0.6 * w.s,
        );
        dummy.updateMatrix();
        sh.setMatrixAt(i, dummy.matrix);
      });
      sh.instanceMatrix.needsUpdate = true;
    }

    // ducks paddle in circles around the frog's lily pads
    const d = duckRef.current;
    if (d) {
      flock.ducks.forEach((w, i) => {
        const a = t * w.speed + w.phase;
        // lazy loops that wander in and out around the pads
        const rr = w.r * (1 + 0.22 * Math.sin(t * 0.09 + i * 2.3));
        const x = FROG.pos[0] + Math.cos(a) * rr * 1.15;
        const z = FROG.pos[2] + Math.sin(a) * rr;
        const act = acts.ducks[i].update(dt, e, true);
        act.y = Math.max(act.y, -0.4);
        perform(act, x, WATER_Y + 0.02 + Math.sin(t * 2.2 + i) * 0.02, z, -a - Math.PI / 2, Math.sin(t * 2 + i) * 0.05, Math.sin(t * 1.6 + i) * 0.05, 1.6, 0.45);
        dummy.updateMatrix();
        d.setMatrixAt(i, dummy.matrix);
      });
      d.instanceMatrix.needsUpdate = true;
    }

    // birds circle high over the island
    const bi = birdRef.current;
    if (bi) {
      flock.birds.forEach((w, i) => {
        // circles that widen and drift, rising on thermals and gliding down again
        const a = t * w.speed + w.phase;
        const rr = w.r * (1 + 0.28 * Math.sin(t * 0.11 + i * 1.7));
        const cx = w.cx + Math.sin(t * 0.05 + i) * 6;
        const cz = w.cz + Math.cos(t * 0.04 + i * 0.7) * 5;
        const x = cx + Math.cos(a) * rr;
        const z = cz + Math.sin(a) * rr * 0.75;
        const climb = Math.cos(t * 0.3 + i * 2.1);
        const y = w.h + Math.sin(t * 0.3 + i * 2.1) * 2.2 + Math.sin(t * 0.8 + i) * 0.35;
        const yaw = Math.atan2(-Math.cos(a) * 0.75, -Math.sin(a));
        const act = acts.birds[i].update(dt, e, true);
        perform(act, x, y, z, yaw, 0.32 + Math.sin(t * 0.5 + i) * 0.08, climb * 0.18, 2.4, 1.2);
        dummy.updateMatrix();
        bi.setMatrixAt(i, dummy.matrix);
      });
      bi.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {bunnies > 0 && <instancedMesh ref={bunnyRef} args={[pick(n.Bunny, "Bunny"), toy, bunnies]} frustumCulled={false} />}
      {sheep > 0 && <instancedMesh ref={sheepRef} args={[pick(n.Sheep, "Sheep"), toy, sheep]} frustumCulled={false} />}
      {ducks > 0 && <instancedMesh ref={duckRef} args={[pick(n.Duck, "Duck"), toy, ducks]} frustumCulled={false} />}
      {birds > 0 && <instancedMesh ref={birdRef} args={[n.Bird.geometry, flapping, birds]} frustumCulled={false} />}
    </>
  );
}
