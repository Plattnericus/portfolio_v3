"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createPortal, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { candy, deformable, glossy, makeDeform, marine, marineSolo, toy, type Deform } from "./materials";
import { MODELS, useDetail, useLod, useNodes } from "./Props";
import { FROG, RIDER, SMILEY, WATER_Y, rng, terrain, type Route } from "./layout";
import { AIR, BIG, CATALOG, Performer, REACT, SHOW, SPIN, TRAVEL, dolphinTricks, type Pose } from "./moves";
import { EVENTS, emit, world, type Cue, type Shout } from "@/lib/world";
import { boing, pop } from "@/lib/sound";

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const q = new THREE.Quaternion();
const sc = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const TAU = Math.PI * 2;

/** Characters live on layer 1: on camera, but out of the baked contact shadows and the pointer raycasts. */
export const CHARACTER_LAYER = 1;
/**
 * Their small parts (eyes, limbs, ears, legs, tail) live on layer 2, which the
 * camera drops while it is up in map view: there a character is a few pixels
 * tall, and each part would still cost a draw call.
 */
export const PARTS_LAYER = 2;

function layerOf(name: string, core: readonly string[]) {
  return core.includes(name) ? CHARACTER_LAYER : PARTS_LAYER;
}

function shout(e: ThreeEvent<MouseEvent>, list: string[]) {
  emit<Shout>(EVENTS.shout, {
    x: e.nativeEvent.clientX,
    y: e.nativeEvent.clientY,
    text: list[Math.floor(Math.random() * list.length)],
  });
}

function hover(on: boolean) {
  document.body.style.cursor = on ? "pointer" : "";
}

/** A damped spring, for jiggle that feels physical. */
export class Spring {
  v = 0;
  x = 0;
  private k: number;
  private d: number;
  constructor(k = 120, d = 9) {
    this.k = k;
    this.d = d;
  }
  step(target: number, dt: number) {
    const h = Math.min(dt, 1 / 30);
    const a = (target - this.x) * this.k - this.v * this.d;
    this.v += a * h;
    this.x += this.v * h;
    return this.x;
  }
  kick(v: number) {
    this.v += v;
  }
}

/**
 * Follow-through: limbs and ears lag behind when the body jumps or lands, so a
 * character moves as one soft body rather than a set of stiff parts.
 */
class Lag {
  private last = Number.NaN;
  private vel = 0;
  private spring = new Spring(55, 5.5);
  step(y: number, dt: number) {
    if (dt <= 0) return this.spring.x;
    if (Number.isNaN(this.last)) this.last = y;
    const v = (y - this.last) / dt;
    this.last = y;
    const acc = THREE.MathUtils.clamp((v - this.vel) / dt, -60, 60);
    this.vel = v;
    this.spring.kick(-acc * 0.012);
    return this.spring.step(0, dt);
  }
}

/* ================================================================== shared staging */

/** Soft round shadow under a character, cheap enough for any phone. */
const blobTexture = (() => {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
      const a = Math.max(0, 1 - d) ** 1.6;
      const i = (y * n + x) * 4;
      data[i] = 40;
      data[i + 1] = 70;
      data[i + 2] = 40;
      data[i + 3] = Math.round(a * 255);
    }
  const t = new THREE.DataTexture(data, n, n);
  t.needsUpdate = true;
  return t;
})();
const blobGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function Blob({ shadow }: { shadow: React.RefObject<THREE.Mesh | null> }) {
  return (
    <mesh ref={shadow} geometry={blobGeometry} renderOrder={1}>
      <meshBasicMaterial map={blobTexture} transparent depthWrite={false} opacity={0.35} toneMapped={false} />
    </mesh>
  );
}

/** Sits the blob under a character: smaller and fainter the higher it is. */
function placeBlob(sh: THREE.Mesh | null, x: number, y: number, z: number, air: number, size: number, opacity: number) {
  if (!sh) return;
  sh.position.set(x, y, z);
  sh.scale.setScalar(size * (1 - Math.min(0.6, air * 0.2)));
  (sh.material as THREE.MeshBasicMaterial).opacity = opacity * (1 - Math.min(0.85, air * 0.28));
}

const frustum = new THREE.Frustum();
const projM = new THREE.Matrix4();

/** Is a point roughly on screen and close enough to read? */
function onCamera(camera: THREE.Camera, p: THREE.Vector3, range: number) {
  projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projM);
  return frustum.containsPoint(p) && camera.position.distanceTo(p) < range;
}

/** Writes a pose's body channels into the deformer of a character. */
function deformFrom(d: Deform, body: THREE.Object3D, p: Pose, t: number) {
  body.updateWorldMatrix(true, false);
  body.matrixWorld.decompose(d.origin, q, sc);
  d.basis.setFromMatrix4(m4.makeRotationFromQuaternion(q));
  d.def.set(p.sq, p.bx, p.bz, p.tw);
  d.wob.set(p.wb, t * 9);
}

/** Places root and pivot from a pose. Offsets are in character heights, turned with the root. */
function stage(root: THREE.Object3D, pivot: THREE.Object3D, p: Pose, x: number, y: number, z: number, yaw: number, height: number, scale: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const ox = p.x * height;
  const oz = p.z * height;
  root.position.set(x + ox * c + oz * s, y + p.y * height, z - ox * s + oz * c);
  root.rotation.y = yaw;
  root.scale.setScalar(scale * (1 + p.s));
  pivot.rotation.set(p.rx, p.ry, p.rz, "YXZ");
}

/** Lets the rest of the page ask a character for a move (secrets use this). */
function useCueListener(perf: Performer, who: Cue["who"]) {
  useEffect(() => {
    const on = (e: Event) => {
      const c = (e as CustomEvent<Cue>).detail;
      if (c.who !== who && c.who !== "all") return;
      if (c.move) perf.play(c.move);
      else perf.cue(c.tags ?? REACT);
    };
    window.addEventListener(EVENTS.cue, on);
    return () => window.removeEventListener(EVENTS.cue, on);
  }, [perf, who]);
}

function useShowCue(perf: Performer, spots: string[]) {
  const last = useRef({ section: "", kick: 0 });
  return () => {
    const l = last.current;
    if (world.section !== l.section) {
      l.section = world.section;
      if (spots.includes(world.section)) perf.cue(SHOW | BIG);
    }
    if (world.kick !== l.kick) {
      l.kick = world.kick;
      if (Math.random() < 0.5) perf.cue(REACT);
    }
  };
}

/* ================================================================== unicorn + hamster */

const LEGS: [string, number][] = [
  ["LegFL", 0],
  ["LegFR", 0.7],
  ["LegBL", Math.PI],
  ["LegBR", Math.PI + 0.7],
];

const RIDER_SHOUTS = ["SUNSHINE!", "LOLLIPOPS!", "AAAAAAA", "man happy", "RAINBOWS!!", "wheeee", ":D"];
const RIDER_LOD = ["UnicornBody", "Hamster", "Tail", "WingL", "WingR"] as const;
const RIDER_CORE = ["UnicornBody", "Hamster", "WingL", "WingR"] as const;
const FROG_CORE = ["FrogBody", "EyeL", "EyeR", "Tongue"] as const;
const SMILEY_CORE = ["SmileyBody", "Propeller"] as const;

const FROG_LOD = ["FrogBody"] as const;
const SMILEY_LOD = ["SmileyBody", "SmileyLolli"] as const;

/** model units: the unicorn and rider stand about 2.6 tall, feet to ears */
const RIDER_H = 2.6;
const riderDeform = makeDeform(RIDER_H * RIDER.scale);
const riderMat = deformable(toy, riderDeform, "rider");

type Part = { obj: THREE.Object3D; rest: THREE.Euler; pos: THREE.Vector3 };

/** A posable node of a model. A node the file lacks becomes a detached stand-in, so a mismatched model never breaks the page. */
const part = (obj: THREE.Object3D | undefined): Part => {
  const o = obj ?? new THREE.Object3D();
  return { obj: o, rest: o.rotation.clone(), pos: o.position.clone() };
};

type Rig = {
  legs: { p: Part; phase: number }[];
  tail: Part;
  wings: [Part, Part];
  hamster: Part;
  arms: [Part, Part];
  feet: [Part, Part];
  ears: [Part, Part];
};

export function Rider({ route, detail }: { route: Route; detail: number }) {
  const { scene } = useGLTF(MODELS.unicorn);
  useLod(scene, detail, RIDER_LOD);
  const root = useRef<THREE.Group>(null);
  const pivot = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const rig = useRef<Rig | null>(null);
  const squash = useRef(new Spring(160, 7));
  const clicks = useRef({ n: 0, t: 0 });
  const perf = useMemo(() => new Performer(CATALOG.rider(), 11), []);
  const cue = useShowCue(perf, route === "sunshine" ? ["hero", "ride", "finale"] : ["about"]);
  useCueListener(perf, "rider");
  const look = useRef(0);
  const lag = useRef(new Lag());

  // swap materials before the hit-box portal mounts into the hamster
  const hamster = useMemo(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = riderMat;
        m.layers.set(layerOf(m.name, RIDER_CORE));
      }
    });
    return scene.getObjectByName("Hamster") ?? scene;
  }, [scene]);

  useEffect(() => {
    const get = (n: string) => part(scene.getObjectByName(n));
    rig.current = {
      legs: LEGS.map(([n, phase]) => ({ p: get(n), phase })),
      tail: get("Tail"),
      wings: [get("WingL"), get("WingR")],
      hamster: get("Hamster"),
      arms: [get("HamArmL"), get("HamArmR")],
      feet: [get("HamFootL"), get("HamFootR")],
      ears: [get("HamEarL"), get("HamEarR")],
    };
  }, [scene]);

  useFrame(({ clock, camera }, dt) => {
    const r = rig.current;
    const g = root.current;
    const pv = pivot.current;
    const b = body.current;
    if (!r || !g || !pv || !b) return;
    const t = clock.elapsedTime;
    cue();
    const seen = onCamera(camera, tmp.set(RIDER.pos[0], 1.5, RIDER.pos[2]), 30);
    // up close he performs on the spot, so he never runs out of the shot
    perf.restrict(camera.position.distanceTo(tmp) < 11 || route !== "home" ? TRAVEL : 0);
    const p = perf.update(dt, world.energy, seen, world.reducedMotion ? 0.4 : 1);
    const fly = world.fx.flight;

    // the sunshine ride keeps him galloping; at home he stands and shows off
    const riding = route === "sunshine" && (world.section === "ride" || world.section === "hero");
    const gait = Math.min(1.2, p.gait + (riding ? 0.9 : 0) + fly * 0.6);
    const speed = world.reducedMotion ? 3.2 : 8.5;
    const ph = t * speed;
    // eslint-disable-next-line react-hooks/immutability -- three.js nodes are animated imperatively, as R3F intends
    for (const leg of r.legs) leg.p.obj.rotation.z = leg.p.rest.z + Math.sin(ph + leg.phase) * 0.55 * gait - fly * 0.5;
    const flap = Math.sin(ph * (0.6 + (p.wing + fly) * 0.9)) * (0.12 + p.wing * 0.6 + fly * 0.6);
    r.wings[0].obj.rotation.x = r.wings[0].rest.x - 0.15 - flap - p.wing * 0.4;
    r.wings[1].obj.rotation.x = r.wings[1].rest.x + 0.15 + flap + p.wing * 0.4;
    r.tail.obj.rotation.z = r.tail.rest.z - 0.1 + Math.sin(ph * 0.5) * (0.12 + gait * 0.15) + p.tail * 0.5;
    r.tail.obj.rotation.x = r.tail.rest.x + Math.sin(ph * 0.25) * 0.2 + p.tail * 0.3;

    // where he stands: lost page laps around the 404, flight secret loops the sky
    let x = RIDER.pos[0];
    let y = RIDER.pos[1];
    let z = RIDER.pos[2];
    let yaw = RIDER.rotY + Math.PI / 2;
    if (route === "lost") {
      const lap = t * 0.45;
      const R = 4.2;
      x = Math.cos(lap) * R * 1.5;
      z = -4.2 + Math.sin(lap) * R * 0.75;
      yaw = -lap + 0.4;
    }
    if (fly > 0) {
      const k = t * 0.9;
      y += fly * (5 + Math.sin(k) * 1.5);
      x += fly * Math.sin(k * 0.7) * 4;
      yaw += fly * k * 0.6;
    }
    const height = RIDER_H * RIDER.scale;
    const gallopBob = Math.abs(Math.sin(ph)) * 0.05 * gait;
    p.y += gallopBob;
    stage(g, pv, p, x, y, z, yaw, height, RIDER.scale);

    // the hamster: his own hops and spins on top, screaming on cue, eyes on the camera
    const h = r.hamster;
    const s = squash.current.step(0, dt);
    const scream = Math.max(world.scream, p.scream);
    h.obj.position.copy(h.pos);
    h.obj.position.y += Math.abs(Math.sin(ph + 0.9)) * 0.08 * Math.max(0.3, gait) + p.sy;
    const breathe = Math.sin(t * 2.6) * 0.035;
    const grow = 1 + scream * 0.09;
    h.obj.scale.set(grow * (1 + s * 0.22 - breathe), grow * (1 - s * 0.2 + breathe), grow * (1 + s * 0.22 - breathe));
    if (h.obj.parent) {
      h.obj.parent.worldToLocal(tmp.copy(camera.position));
      const dx = tmp.x - h.pos.x;
      const dz = tmp.z - h.pos.z;
      const want = THREE.MathUtils.clamp(Math.atan2(-dz, dx), -1.5, 1.5);
      look.current = THREE.MathUtils.damp(look.current, want, 4, dt);
      const lift = Math.atan2(tmp.y - (h.pos.y + 1.2), Math.hypot(dx, dz));
      h.obj.rotation.set(p.rz * 0.5, look.current + p.sry, THREE.MathUtils.clamp(lift * 0.35, -0.25, 0.3) + p.srz, "YXZ");
    }
    const wave = Math.sin(t * 3) * 0.08;
    const flop = lag.current.step(g.position.y + h.obj.position.y * RIDER.scale, dt);
    r.arms[0].obj.rotation.set(r.arms[0].rest.x + p.aLz + scream * 1.4 + wave + flop * 0.8, r.arms[0].rest.y, r.arms[0].rest.z - p.aLx);
    r.arms[1].obj.rotation.set(r.arms[1].rest.x - p.aRz - scream * 1.4 - wave - flop * 0.8, r.arms[1].rest.y, r.arms[1].rest.z - p.aRx);
    r.ears[0].obj.rotation.x = r.ears[0].rest.x + p.eL * 0.6 + Math.sin(t * 5) * 0.04 + flop * 1.2;
    r.ears[1].obj.rotation.x = r.ears[1].rest.x - p.eR * 0.6 - Math.sin(t * 5) * 0.04 - flop * 1.2;
    r.feet[0].obj.rotation.z = r.feet[0].rest.z + p.fL * 0.7;
    r.feet[1].obj.rotation.z = r.feet[1].rest.z + p.fR * 0.7;

    deformFrom(riderDeform, b, p, t);
    const gx = g.position.x;
    const gz = g.position.z;
    placeBlob(shadow.current, gx, terrain(gx, gz) + 0.04, gz, Math.max(0, g.position.y - y), 3.4, 0.34);
  });

  const onHamster = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    boing();
    squash.current.kick(9);
    perf.cue(REACT | BIG);
    shout(e, RIDER_SHOUTS);
    const now = performance.now();
    const c = clicks.current;
    c.n = now - c.t < 900 ? c.n + 1 : 1;
    c.t = now;
    if (c.n >= 7 && route === "lost") {
      c.n = 0;
      emit(EVENTS.secret, "flight");
    }
  };

  return (
    <>
      <group ref={root} position={RIDER.pos} scale={RIDER.scale}>
        <group ref={pivot} position-y={1.2}>
          <group ref={body} position-y={-1.2}>
            <primitive object={scene} rotation-y={-Math.PI / 2} />
          </group>
        </group>
        {createPortal(
          <mesh position={[0.1, 0.95, 0]} onClick={onHamster} onPointerOver={() => hover(true)} onPointerOut={() => hover(false)}>
            <sphereGeometry args={[0.85, 12, 8]} />
            <meshBasicMaterial visible={false} />
          </mesh>,
          hamster,
        )}
      </group>
      <Blob shadow={shadow} />
    </>
  );
}

/* ================================================================== frog */

const FROG_SHOUTS = ["AAAAAAAAA", "SUNSHINE", "ribbit!!", "LOLLIPOPS", "YAY", "happy happy happy"];
const FROG_H = 2.45;
const frogDeform = makeDeform(FROG_H * FROG.scale);
const frogMat = deformable(glossy, frogDeform, "frog");

type FrogRig = {
  tongue: Part;
  pupils: [Part, Part];
  eyes: [Part, Part];
  arms: [Part, Part];
  feet: [Part, Part];
};

export function Frog({ detail }: { detail: number }) {
  const { scene } = useGLTF(MODELS.frog);
  useLod(scene, detail, FROG_LOD);
  const root = useRef<THREE.Group>(null);
  const pivot = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const rig = useRef<FrogRig | null>(null);
  const jiggle = useRef(new Spring(90, 5));
  const googly = useRef([new Spring(60, 3), new Spring(60, 3), new Spring(55, 2.5), new Spring(55, 2.5)]);
  const perf = useMemo(() => new Performer(CATALOG.frog(), 23), []);
  const cue = useShowCue(perf, ["stack"]);
  useCueListener(perf, "frog");
  const taps = useRef<number[]>([]);
  const lag = useRef(new Lag());

  useMemo(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = frogMat;
        m.layers.set(layerOf(m.name, FROG_CORE));
      }
    });
  }, [scene]);

  useEffect(() => {
    const get = (n: string) => part(scene.getObjectByName(n));
    rig.current = {
      tongue: get("Tongue"),
      pupils: [get("PupilL"), get("PupilR")],
      eyes: [get("EyeL"), get("EyeR")],
      arms: [get("FrogArmL"), get("FrogArmR")],
      feet: [get("FrogFootL"), get("FrogFootR")],
    };
  }, [scene]);

  useFrame(({ clock, camera }, dt) => {
    const r = rig.current;
    const g = root.current;
    const pv = pivot.current;
    const b = body.current;
    if (!r || !g || !pv || !b) return;
    const t = clock.elapsedTime;
    cue();
    const seen = onCamera(camera, tmp.set(FROG.pos[0], FROG.pos[1] + 1.5, FROG.pos[2]), 32);
    perf.restrict(camera.position.distanceTo(tmp) < 7 ? TRAVEL : 0);
    const p = perf.update(dt, world.energy, seen, world.reducedMotion ? 0.4 : 1);
    const j = jiggle.current.step(0, dt);
    p.sq += j * 0.12 + Math.sin(t * 2.4) * 0.03;
    p.wb += j * 0.05;
    const height = FROG_H * FROG.scale;
    stage(g, pv, p, FROG.pos[0], FROG.pos[1], FROG.pos[2], FROG.rotY, height, FROG.scale);

    const tg = r.tongue;
    const out = Math.max(0, p.mouth);
    tg.obj.rotation.set(tg.rest.x + 0.12 + Math.sin(t * 3.1) * 0.1 + j * 0.3 - out * 0.9, tg.rest.y + p.srz, tg.rest.z + Math.sin(t * 1.7) * 0.15);
    tg.obj.scale.setScalar(1 + out * 0.55);

    const flop = lag.current.step(g.position.y, dt);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const arm = r.arms[i];
      arm.obj.rotation.set(arm.rest.x + (i ? p.aRx : p.aLx), arm.rest.y, arm.rest.z + side * ((i ? p.aRz : p.aLz) + flop));
      const foot = r.feet[i];
      const f = i ? p.fR : p.fL;
      foot.obj.rotation.x = foot.rest.x - f * 0.7;
      foot.obj.position.y = foot.pos.y + f * 0.08;
      r.eyes[i].obj.scale.setScalar(1 + p.sry * 0.4);
    }
    // googly pupils: chase the camera with springy lag, plus spins on cue
    b.updateWorldMatrix(true, false);
    b.worldToLocal(tmp.copy(camera.position));
    r.pupils.forEach((pu, i) => {
      const eye = r.eyes[i];
      tmp2.copy(tmp).sub(eye.pos).normalize();
      const wobble = Math.sin(t * (5 + i) + i * 2) * 0.12;
      const ry = googly.current[i].step(THREE.MathUtils.clamp(tmp2.x * 0.8, -0.6, 0.6) + wobble, dt);
      const rx = googly.current[i + 2].step(THREE.MathUtils.clamp(-tmp2.y * 0.6, -0.5, 0.5) + wobble * 0.5, dt);
      pu.obj.rotation.set(rx, 0, -ry + p.eyes * TAU * (i ? -1 : 1), "ZXY");
      pu.obj.scale.setScalar(1 + p.sry * 0.4);
    });

    deformFrom(frogDeform, b, p, t);
    const under = g.position.y < WATER_Y;
    placeBlob(shadow.current, g.position.x, WATER_Y + 0.1, g.position.z, Math.max(0, g.position.y - FROG.pos[1]), 3.2, under ? 0 : 0.3);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    pop(0.5);
    jiggle.current.kick(10);
    googly.current.forEach((s, i) => s.kick((i % 2 ? -1 : 1) * 14));
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 1800), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      perf.play("tongue-helicopter");
      emit<Shout>(EVENTS.shout, { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, text: "WHIRRRR" });
      return;
    }
    perf.cue(REACT | AIR);
    shout(e, FROG_SHOUTS);
  };

  return (
    <>
      <group ref={root} position={FROG.pos} rotation={[0, FROG.rotY, 0]} scale={FROG.scale}>
        <group ref={pivot} position-y={1.1}>
          <group ref={body} position-y={-1.1}>
            <primitive object={scene} />
          </group>
        </group>
        <mesh position={[0, 1.2, 0]} onClick={onClick} onPointerOver={() => hover(true)} onPointerOut={() => hover(false)}>
          <sphereGeometry args={[1.15, 12, 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </group>
      <Blob shadow={shadow} />
    </>
  );
}

/* ================================================================== smiley */

const SMILEY_SHOUTS = ["hehe", "LOLLIPOP?", "wheee", ":)", "best day ever"];
/** the ball rides this high on its legs, in model units */
const LEG = 0.34;

/** A soft yellow leg, stretched between hip and sneaker every frame. */
const legGeometry = (() => {
  const g = new THREE.CapsuleGeometry(0.07, 1, 4, 10);
  const c = new THREE.Color("#ffc928");
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) c.toArray(col, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
})();
const legUp = new THREE.Vector3(0, 1, 0);
const hip = new THREE.Vector3();
const ankle = new THREE.Vector3();
const SMILEY_H = 2.4;
const smileyDeform = makeDeform(SMILEY_H * SMILEY.scale);
const smileyToy = deformable(toy, smileyDeform, "smiley");
const smileyCandy = deformable(candy, smileyDeform, "smiley-candy");

/** spots on the beach he strolls between, around his home */
const STROLL: [number, number][] = [
  [0, 0],
  [2.2, -1.6],
  [-1.8, -2.4],
  [1.4, 2.0],
  [-2.4, 0.6],
  [0.4, -3.2],
];

export function Smiley({ detail }: { detail: number }) {
  const { scene } = useGLTF(MODELS.smiley);
  useLod(scene, detail, SMILEY_LOD);
  const root = useRef<THREE.Group>(null);
  const pivot = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const parts = useRef<{ prop: THREE.Object3D; armL: Part; armR: Part; feet: [Part, Part] } | null>(null);
  const hop = useRef(new Spring(40, 4));
  const spinRate = useRef(6);
  const perf = useMemo(() => new Performer(CATALOG.smiley(), 37), []);
  const cue = useShowCue(perf, ["contact"]);
  useCueListener(perf, "smiley");
  const walk = useRef({ x: SMILEY.pos[0], z: SMILEY.pos[2], yaw: SMILEY.rotY, target: 0, stride: 0, wait: 2 });
  const legs = useRef<(THREE.Mesh | null)[]>([]);
  const lag = useRef(new Lag());

  useMemo(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = m.name === "SmileyLolli" ? smileyCandy : smileyToy;
        m.layers.set(layerOf(m.name, SMILEY_CORE));
      }
    });
  }, [scene]);

  useEffect(() => {
    const get = (n: string) => part(scene.getObjectByName(n));
    parts.current = {
      prop: scene.getObjectByName("Propeller") ?? new THREE.Object3D(),
      armL: get("ArmL"),
      armR: get("ArmR"),
      feet: [get("SmileyFootL"), get("SmileyFootR")],
    };
  }, [scene]);

  useFrame(({ clock, camera }, dt) => {
    const pr = parts.current;
    const g = root.current;
    const pv = pivot.current;
    const b = body.current;
    if (!pr || !g || !pv || !b) return;
    const t = clock.elapsedTime;
    cue();
    const w = walk.current;
    const seen = onCamera(camera, tmp.set(w.x, 1.5, w.z), 30);
    perf.restrict(camera.position.distanceTo(tmp) < 7 ? TRAVEL : 0);
    const p = perf.update(dt, world.energy, seen, world.reducedMotion ? 0.4 : 1);

    // between moves he strolls to another spot on the beach, then turns to whoever is watching
    let stepping = 0;
    if (!perf.current) {
      const [ox, oz] = STROLL[w.target];
      const tx = SMILEY.pos[0] + ox;
      const tz = SMILEY.pos[2] + oz;
      const dx = tx - w.x;
      const dz = tz - w.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.08) {
        const v = Math.min(d, dt * (1.3 + world.energy * 1.5));
        w.x += (dx / d) * v;
        w.z += (dz / d) * v;
        w.yaw = dampAngle(w.yaw, Math.atan2(dx, dz), 8, dt);
        w.stride += v * 4.2;
        stepping = 1;
      } else {
        w.yaw = dampAngle(w.yaw, Math.atan2(camera.position.x - w.x, camera.position.z - w.z), 3, dt);
        w.wait -= dt;
        if (w.wait < 0) {
          w.target = (w.target + 1 + Math.floor(Math.random() * (STROLL.length - 1))) % STROLL.length;
          w.wait = 2 + Math.random() * 4;
        }
      }
    }
    const step = Math.sin(w.stride);
    p.fL += Math.max(0, step) * stepping;
    p.fR += Math.max(0, -step) * stepping;
    p.y += Math.abs(step) * 0.025 * stepping;
    p.rz += step * 0.06 * stepping;

    const h = hop.current.step(0, dt);
    p.y += Math.max(0, -h) * 0.15 + Math.abs(Math.sin(t * 2.2)) * 0.02 * (1 - stepping);
    const ground = terrain(w.x, w.z);
    stage(g, pv, p, w.x, ground, w.z, w.yaw, SMILEY_H * SMILEY.scale, SMILEY.scale);

    spinRate.current = THREE.MathUtils.damp(spinRate.current, 6 + p.prop * 40, 2, dt);
    pr.prop.rotation.z += spinRate.current * dt;
    const flop = lag.current.step(g.position.y, dt);
    pr.armL.obj.rotation.set(pr.armL.rest.x + Math.sin(t * 5) * 0.3 * (1 - stepping) + p.aLx, pr.armL.rest.y, pr.armL.rest.z - p.aLz + step * 0.3 * stepping - flop);
    pr.armR.obj.rotation.set(pr.armR.rest.x + p.aRx - step * 0.3 * stepping, pr.armR.rest.y, pr.armR.rest.z + p.aRz + flop);
    for (let i = 0; i < 2; i++) {
      const f = i ? p.fR : p.fL;
      const ft = pr.feet[i];
      ft.obj.rotation.x = ft.rest.x - f * 0.6;
      // the model rides LEG higher, the sneakers stay on the ground
      ft.obj.position.y = ft.pos.y - LEG + f * 0.14;
      const leg = legs.current[i];
      if (leg) {
        const side = ft.pos.x > 0 ? 1 : -1;
        hip.set(0.3 * side, LEG + 0.24, 0.12);
        ankle.set(ft.pos.x, ft.pos.y + 0.12 + f * 0.14, ft.pos.z + 0.1);
        leg.position.copy(hip).add(ankle).multiplyScalar(0.5);
        const len = hip.distanceTo(ankle);
        leg.quaternion.setFromUnitVectors(legUp, ankle.sub(hip).normalize());
        leg.scale.set(1, len, 1);
      }
    }

    deformFrom(smileyDeform, b, p, t);
    placeBlob(shadow.current, g.position.x, ground + 0.04, g.position.z, Math.max(0, g.position.y - ground), 2.8, 0.34);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    pop(1.3);
    spinRate.current = 60;
    hop.current.kick(-14);
    perf.cue(REACT | AIR | SPIN);
    shout(e, SMILEY_SHOUTS);
  };

  return (
    <>
      <group ref={root} position={SMILEY.pos} rotation={[0, SMILEY.rotY, 0]} scale={SMILEY.scale}>
        <group ref={pivot} position-y={1.1 + LEG}>
          <group ref={body} position-y={-1.1 - LEG}>
            <primitive object={scene} position-y={LEG} />
            {[0, 1].map((i) => (
              <mesh
                key={i}
                ref={(m) => {
                  legs.current[i] = m;
                  m?.layers.set(PARTS_LAYER);
                }}
                geometry={legGeometry}
                material={smileyToy}
              />
            ))}
          </group>
        </group>
        <mesh position={[0, 1.1 + LEG, 0]} onClick={onClick} onPointerOver={() => hover(true)} onPointerOut={() => hover(false)}>
          <sphereGeometry args={[1.2, 12, 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </group>
      <Blob shadow={shadow} />
    </>
  );
}

function dampAngle(a: number, b: number, lambda: number, dt: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * (1 - Math.exp(-lambda * dt));
}

/* ================================================================== sea life */

const TRICKS = dolphinTricks();

function hash(a: number, b: number) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function SeaLife({ dolphins, fish, detail }: { dolphins: number; fish: number; detail: number }) {
  const n = useNodes(MODELS.sea);
  const pick = useDetail(detail);
  const pods = useRef<(THREE.Mesh | null)[]>([]);
  const school = useRef<THREE.InstancedMesh>(null);
  const school2 = useRef<THREE.InstancedMesh>(null);
  const reef = useRef<THREE.InstancedMesh>(null);
  const reef2 = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const jumps = useMemo(() => {
    const rand = rng(3);
    return Array.from({ length: dolphins }, (_, i) => ({
      x: 56 + rand() * 18,
      z: -14 + i * (28 / Math.max(1, dolphins - 1)) + rand() * 3,
      dir: rand() > 0.5 ? 1 : -1,
      period: 4.5 + rand() * 2.5,
      phase: rand() * 10,
      s: 1.1 + rand() * 0.4,
    }));
  }, [dolphins]);

  const corals = useMemo(() => {
    const rand = rng(8);
    return Array.from({ length: 14 }, (_, i) => {
      const x = 49 + rand() * 9;
      const z = -16 + rand() * 32;
      return { x, y: terrain(x, z) - 0.05, z, s: 0.9 + rand() * 1.3, ry: rand() * 6.28, kind: i % 2 };
    });
  }, []);

  const fishes = useMemo(() => {
    const rand = rng(17);
    return Array.from({ length: fish }, () => ({
      cx: 51 + rand() * 6,
      cz: -10 + rand() * 20,
      r: 1.2 + rand() * 2.4,
      speed: (0.4 + rand() * 0.5) * (rand() > 0.5 ? 1 : -1),
      phase: rand() * 6.28,
      y: WATER_Y - 0.5 - rand() * 0.6,
      s: 0.7 + rand() * 0.6,
    }));
  }, [fish]);

  useEffect(() => {
    [reef.current, reef2.current].forEach((mesh, kind) => {
      if (!mesh) return;
      let k = 0;
      for (const c of corals) {
        if (c.kind !== kind) continue;
        dummy.position.set(c.x, c.y, c.z);
        dummy.rotation.set(0, c.ry, 0);
        dummy.scale.setScalar(c.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(k++, dummy.matrix);
      }
      mesh.count = k;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [corals, dummy]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    jumps.forEach((j, i) => {
      const m = pods.current[i];
      if (!m) return;
      const cyc = (t + j.phase) / j.period;
      const trick = TRICKS[hash(i + 1, Math.floor(cyc)) % TRICKS.length];
      const u = cyc - Math.floor(cyc);
      const air = trick.tail ? 0.55 : 0.42;
      const k = Math.min(1, u / air);
      const len = trick.length;
      m.visible = u < air + 0.04;
      if (trick.tail) {
        // tail walk: up on the flukes, skittering backwards across the water
        const rise = Math.sin(Math.PI * k);
        m.position.set(j.x - (k - 0.5) * len * j.dir, WATER_Y - 0.6 + rise * trick.height + Math.sin(t * 30) * 0.04 * rise, j.z);
        m.rotation.set(Math.sin(t * 9) * 0.1 * rise, j.dir > 0 ? 0 : Math.PI, 1.35 * rise, "YZX");
      } else {
        const x = j.x + (k - 0.5) * len * j.dir;
        const arc = 4 * k * (1 - k);
        m.position.set(x, WATER_Y - 0.9 + arc * trick.height, j.z);
        const slope = ((1 - 2 * k) * trick.height * 4) / len;
        const e = k * k * (3 - 2 * k);
        m.rotation.set(trick.rolls * TAU * e, (j.dir > 0 ? 0 : Math.PI) + trick.spins * TAU * e, Math.atan(slope) * 0.9 + trick.flips * TAU * e, "YZX");
      }
      m.scale.setScalar(j.s);
    });
    const meshes = [school.current, school2.current];
    meshes.forEach((mesh, which) => {
      if (!mesh) return;
      let k = 0;
      fishes.forEach((f, i) => {
        if (i % 2 !== which) return;
        const a = t * f.speed + f.phase;
        dummy.position.set(f.cx + Math.cos(a) * f.r, f.y + Math.sin(t * 2 + i) * 0.06, f.cz + Math.sin(a) * f.r);
        dummy.rotation.set(0, -a - (f.speed > 0 ? Math.PI / 2 : -Math.PI / 2), Math.sin(t * 9 + i) * 0.08);
        dummy.scale.setScalar(f.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(k++, dummy.matrix);
      });
      mesh.count = k;
      mesh.instanceMatrix.needsUpdate = true;
    });
  });

  const half = Math.ceil(corals.length / 2);
  return (
    <>
      {jumps.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            pods.current[i] = m;
          }}
          geometry={pick(n.Dolphin, "Dolphin")}
          material={marineSolo}
        />
      ))}
      <instancedMesh ref={reef} args={[pick(n.CoralPink, "CoralPink"), marine, half]} />
      <instancedMesh ref={reef2} args={[pick(n.CoralOrange, "CoralOrange"), marine, half]} />
      <instancedMesh ref={school} args={[n.FishClown.geometry, marine, Math.ceil(fish / 2)]} frustumCulled={false} />
      <instancedMesh ref={school2} args={[n.FishTang.geometry, marine, Math.ceil(fish / 2)]} frustumCulled={false} />
    </>
  );
}
