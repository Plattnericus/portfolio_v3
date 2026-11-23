"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import gsap from "gsap";
import {
  candy,
  candySolo,
  cloud,
  plant,
  sugar,
  swirlPastelSolo,
  swirlRainbowSolo,
  swirlSunSolo,
  wing,
  groveCotton,
  groveLolli,
  groveSwirlPastel,
  groveSwirlRainbow,
  groveSwirlSun,
  groveTwist,
} from "./materials";
import {
  CASTLE,
  FROG,
  HERO_LOLLIS,
  HERO_TWISTS,
  HOUSE_SPOTS,
  ROAD,
  SPECIMEN_CLOUD,
  WATER_Y,
  blocked,
  coast,
  isMeadow,
  rng,
  terrain,
  type V3,
} from "./layout";
import { useRoadGrid } from "./Nature";
import { chime, pop } from "@/lib/sound";
import { EVENTS, emit, world } from "@/lib/world";
import { detectTier, type Budget } from "@/lib/quality";
import { SETS, modelConfig, modelUrl, needsSet, type ModelSet } from "@/lib/models";

/**
 * Model URLs for this visit's tier: light variants on phones, and a content hash
 * of the model files (see next.config.ts), so they can be cached for good.
 */
const tier = typeof window === "undefined" ? "high" : detectTier();
export const MODELS = Object.fromEntries(SETS.map((name) => [name, modelUrl(modelConfig, name, tier)])) as Record<
  ModelSet,
  string
>;

type Nodes = Record<string, THREE.Mesh>;

export function useNodes(url: string) {
  return (useGLTF(url) as unknown as { nodes: Nodes }).nodes;
}

/** Everything the tier draws; the "Min" twins only on the oldest phones. */
export function preloadModels() {
  for (const name of SETS) if (needsSet(modelConfig, name, tier)) useGLTF.preload(MODELS[name]);
}

/** "Min" twins on the oldest phones; elsewhere an already loaded file that has none. */
export function useTwins(detail: number) {
  return useNodes(detail >= 2 ? MODELS.min : MODELS.village);
}

/**
 * Picks the lightest geometry a tier allows for a model: its "Min" twin on the
 * oldest phones, its "Lo" twin on light tiers, the model itself otherwise.
 */
export function useDetail(detail: number) {
  const twins = useTwins(detail);
  return (full: THREE.Mesh, name: string) => {
    if (detail >= 2 && twins[`${name}Min`]) return twins[`${name}Min`].geometry;
    if (detail >= 1 && twins[`${name}Lo`]) return twins[`${name}Lo`].geometry;
    return full.geometry;
  };
}

/** Cheap pointer test against the bounding sphere, for meshes far too detailed to raycast per triangle. */
const hitSphere = new THREE.Sphere();
const hitPoint = new THREE.Vector3();
export function sphereRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, out: THREE.Intersection[]) {
  const g = this.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  hitSphere.copy(g.boundingSphere!).applyMatrix4(this.matrixWorld);
  hitSphere.radius *= 0.8;
  if (!raycaster.ray.intersectSphere(hitSphere, hitPoint)) return;
  const distance = raycaster.ray.origin.distanceTo(hitPoint);
  if (distance < raycaster.near || distance > raycaster.far) return;
  out.push({ distance, point: hitPoint.clone(), object: this });
}

/**
 * Swaps a mesh between its full model and a light twin by distance, every
 * few frames. Geometry only: the material and its shader stay the same.
 */
export function useDistanceLod(
  refs: React.RefObject<(THREE.Mesh | null)[]>,
  near: (i: number) => THREE.BufferGeometry,
  far: (i: number) => THREE.BufferGeometry,
  range: (i: number) => number,
) {
  const tick = useRef(0);
  useFrame(({ camera }) => {
    if (tick.current++ % 6) return;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const r = range(i);
      const d = camera.position.distanceToSquared(m.position);
      const close = m.geometry === near(i);
      const want = d < (close ? r * r * 1.3 : r * r);
      const g = want ? near(i) : far(i);
      if (m.geometry !== g) m.geometry = g;
    });
  });
}

/**
 * Light tiers swap the heaviest meshes of a character for their decimated
 * twins. Same local space, so only the geometry changes.
 */
export function useLod(scene: THREE.Object3D, detail: number, names: readonly string[]) {
  const twins = useTwins(detail);
  useLayoutEffect(() => {
    if (!detail) return;
    for (const name of names) {
      const mesh = scene.getObjectByName(name);
      const twin = (detail >= 2 && twins[`${name}Min`]) || twins[`${name}Lo`];
      if (mesh instanceof THREE.Mesh && twin) mesh.geometry = twin.geometry;
    }
  }, [scene, detail, twins, names]);
}

/* stick length below the candy centre, in model units */
const LOLLI_STICK = 3.4;
const TWIST_STICK = 1.8;

function spin(obj: THREE.Object3D) {
  if (gsap.isTweening(obj.rotation)) return;
  pop(0.8 + Math.random() * 0.6);
  gsap.to(obj.rotation, { y: obj.rotation.y + Math.PI * 2, duration: 1.4, ease: "elastic.out(1, 0.45)" });
}

/* ================================================================== hero candy */

function heroLolli(
  l: (typeof HERO_LOLLIS)[number],
  n: Nodes,
  v: Nodes,
  lod: boolean,
  flat: boolean,
): [THREE.BufferGeometry, THREE.Material] {
  if (flat) return [v.LollipopFlat.geometry, l.pastel ? swirlPastelSolo : l.sunny ? swirlSunSolo : swirlRainbowSolo];
  if (l.pastel) return [n.LollipopPastel.geometry, candySolo];
  if (l.sunny) return [(lod ? n.LollipopSun : n.LollipopSunHi).geometry, candySolo];
  return [(lod ? n.LollipopLo : n.Lollipop).geometry, candySolo];
}

export function HeroCandy({ detail, flat }: { detail: number; flat: boolean }) {
  const n = useNodes(MODELS.candy);
  const v = useNodes(MODELS.village);
  const pick = useDetail(detail);
  const lod = detail > 0;
  const group = useRef<THREE.Group>(null);
  const lollis = useRef<(THREE.Mesh | null)[]>([]);
  useDistanceLod(
    lollis,
    (i) => heroLolli(HERO_LOLLIS[i], n, v, lod, flat)[0],
    (i) => {
      const l = HERO_LOLLIS[i];
      if (flat) return heroLolli(l, n, v, lod, flat)[0];
      return (l.pastel ? n.LollipopPastel : l.sunny ? n.LollipopSun : n.LollipopLo).geometry;
    },
    (i) => 9 * HERO_LOLLIS[i].s,
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = 0.025 * (1 + world.energy * 4);
    group.current?.children.forEach((c, i) => {
      c.rotation.z = Math.sin(t * (0.7 + world.energy * 2.5) + i * 1.7) * k;
    });
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    spin(e.eventObject);
  };

  return (
    <group ref={group}>
      {HERO_LOLLIS.map((l, i) => {
        const [geometry, material] = heroLolli(l, n, v, lod, flat);
        return (
          <mesh
            key={`l${i}`}
            ref={(m) => {
              lollis.current[i] = m;
            }}
            geometry={geometry}
            material={material}
            position={[l.pos[0], terrain(l.pos[0], l.pos[2]) + (LOLLI_STICK - 0.35) * l.s, l.pos[2]]}
            rotation={[0, l.rotY, 0]}
            scale={l.s}
            onClick={onClick}
            raycast={sphereRaycast}
          />
        );
      })}
      {HERO_TWISTS.map((t, i) => (
        <mesh
          key={`t${i}`}
          geometry={detail >= 2 ? pick(v.TwistLo, "Twist") : (lod ? v.TwistLo : n.Twist).geometry}
          material={candySolo}
          position={[t.pos[0], terrain(t.pos[0], t.pos[2]) + (TWIST_STICK - 0.25) * t.s, t.pos[2]]}
          rotation={[0, t.rotY, 0]}
          scale={t.s}
          onClick={onClick}
          raycast={sphereRaycast}
        />
      ))}
    </group>
  );
}

/* ================================================================== instanced fields */

type Item = { x: number; z: number; s: number; ry: number; phase: number };

function scatter(
  n: number,
  seed: number,
  gap: number,
  pick: (rand: () => number) => [number, number],
  ok: (x: number, z: number) => boolean,
  size: [number, number] = [0.55, 1.3],
) {
  const rand = rng(seed);
  const out: Item[] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 80) {
    const [x, z] = pick(rand);
    if (!ok(x, z)) continue;
    if (out.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < gap * gap)) continue;
    out.push({ x, z, s: size[0] + rand() * (size[1] - size[0]), ry: (rand() - 0.5) * 1.6, phase: rand() * 10 });
  }
  return out;
}

type Far = { geometry: THREE.BufferGeometry; material: THREE.Material; distance: number };

/** Forest props switch to their light twins beyond this many times their own size. */
const FAR = 8;

/**
 * Props that never move: their matrices are built once. Each frame only the
 * split into near and far draws is redone, and only when the camera has moved.
 * `world.density` thins the crowd evenly when the frame rate needs it.
 */
export function Crowd({
  geometry,
  material,
  matrices,
  centers,
  far,
  colors,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrices: Float32Array;
  /** x, y, z, scale per instance */
  centers: Float32Array;
  far?: Far;
  colors?: Float32Array;
}) {
  const n = centers.length / 4;
  const ref = useRef<THREE.InstancedMesh>(null);
  const farRef = useRef<THREE.InstancedMesh>(null);
  const flagRef = useRef<Uint8Array | null>(null);
  const last = useRef({ x: 1e9, y: 0, z: 0, density: -1 });

  useFrame(({ camera }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const cam = camera.position;
    const l = last.current;
    const moved = (cam.x - l.x) ** 2 + (cam.y - l.y) ** 2 + (cam.z - l.z) ** 2;
    if (moved < 0.09 && l.density === world.density) return;
    l.x = cam.x;
    l.y = cam.y;
    l.z = cam.z;
    l.density = world.density;
    let flags = flagRef.current;
    if (!flags || flags.length !== n) flags = flagRef.current = new Uint8Array(n).fill(1);
    const lo = far ? farRef.current : null;
    const A = mesh.instanceMatrix.array as Float32Array;
    const B = lo ? (lo.instanceMatrix.array as Float32Array) : null;
    const CA = mesh.instanceColor?.array as Float32Array | undefined;
    const CB = lo?.instanceColor?.array as Float32Array | undefined;
    const limit = Math.ceil(n * world.density);
    let a = 0;
    let b = 0;
    for (let i = 0; i < limit; i++) {
      let near = true;
      if (B && far) {
        const dx = centers[i * 4] - cam.x;
        const dy = centers[i * 4 + 1] - cam.y;
        const dz = centers[i * 4 + 2] - cam.z;
        const lim = far.distance * centers[i * 4 + 3] * (flags[i] ? 1.15 : 1);
        near = dx * dx + dy * dy + dz * dz < lim * lim;
        flags[i] = near ? 1 : 0;
      }
      // plain index copies: a subarray view per instance per frame was the biggest source of garbage
      const dst = near || !B ? A : B;
      const k = near || !B ? a++ : b++;
      for (let e = 0; e < 16; e++) dst[k * 16 + e] = matrices[i * 16 + e];
      const cd = near || !B ? CA : CB;
      if (cd && colors) {
        cd[k * 3] = colors[i * 3];
        cd[k * 3 + 1] = colors[i * 3 + 1];
        cd[k * 3 + 2] = colors[i * 3 + 2];
      }
    }
    mesh.count = a;
    mesh.visible = a > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (lo) {
      lo.count = b;
      lo.visible = b > 0;
      lo.instanceMatrix.needsUpdate = true;
      if (lo.instanceColor) lo.instanceColor.needsUpdate = true;
    }
  });

  // one sphere around every instance, so a crowd that is off screen costs nothing
  useLayoutEffect(() => {
    const sphere = new THREE.Sphere();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(centers[i * 4], centers[i * 4 + 1], centers[i * 4 + 2]));
    sphere.setFromPoints(pts);
    let size = 0;
    for (let i = 0; i < n; i++) size = Math.max(size, centers[i * 4 + 3]);
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    sphere.radius += size * geometry.boundingSphere!.radius;
    for (const m of [ref.current, farRef.current]) if (m) m.boundingSphere = sphere.clone();
  }, [centers, geometry, n]);

  // colour buffers exist from the start, so the shader never has to be rebuilt for them
  useLayoutEffect(() => {
    if (!colors) return;
    const c = new THREE.Color();
    for (const m of [ref.current, farRef.current]) {
      if (!m) continue;
      for (let i = 0; i < n; i++) m.setColorAt(i, c.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }, [colors, n]);

  return (
    <>
      <instancedMesh ref={ref} args={[geometry, material, n]} />
      {far && <instancedMesh ref={farRef} args={[far.geometry, far.material, n]} />}
    </>
  );
}

/**
 * Props that move every frame (clouds, balloons): one instanced draw per kind
 * and distance band. `place` poses instance i into the dummy; `range` is the
 * distance beyond which it uses the far geometry.
 */
function Flock({
  kinds,
  count,
  kindOf,
  place,
  range,
  material,
}: {
  kinds: { near: THREE.BufferGeometry; far: THREE.BufferGeometry }[];
  count: number;
  kindOf: (i: number) => number;
  place: (i: number, t: number, d: THREE.Object3D, cam: THREE.Vector3) => void;
  range: (i: number) => number;
  material: THREE.Material;
}) {
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const d = useMemo(() => new THREE.Object3D(), []);
  const fill = useRef<number[]>([]);
  useFrame(({ clock, camera }) => {
    const meshes = refs.current;
    const n = fill.current;
    for (let k = 0; k < kinds.length * 2; k++) n[k] = 0;
    for (let i = 0; i < count; i++) {
      place(i, clock.elapsedTime, d, camera.position);
      d.updateMatrix();
      const r = range(i);
      const slot = kindOf(i) * 2 + (camera.position.distanceToSquared(d.position) < r * r ? 0 : 1);
      const m = meshes[slot];
      if (!m) continue;
      m.setMatrixAt(n[slot]++, d.matrix);
    }
    meshes.forEach((m, k) => {
      if (!m) return;
      m.count = n[k];
      m.visible = n[k] > 0;
      m.instanceMatrix.needsUpdate = true;
    });
  });
  return (
    <>
      {kinds.flatMap((k, i) =>
        [k.near, k.far].map((g, j) => (
          <instancedMesh
            key={`${i}-${j}`}
            ref={(m) => {
              refs.current[i * 2 + j] = m;
            }}
            args={[g, material, count]}
            frustumCulled={false}
          />
        )),
      )}
    </>
  );
}

/** Builds the matrices and LOD centres for a list of placements. */
export function bake(list: { x: number; y: number; z: number; rx?: number; ry: number; rz?: number; s: number; sy?: number }[]) {
  const matrices = new Float32Array(list.length * 16);
  const centers = new Float32Array(list.length * 4);
  const d = new THREE.Object3D();
  list.forEach((it, i) => {
    d.position.set(it.x, it.y, it.z);
    d.rotation.set(it.rx ?? 0, it.ry, it.rz ?? 0);
    d.scale.set(it.s, it.s * (it.sy ?? 1), it.s);
    d.updateMatrix();
    d.matrix.toArray(matrices, i * 16);
    centers.set([it.x, it.y, it.z, it.s], i * 4);
  });
  return { matrices, centers };
}

const forestPick = (rand: () => number): [number, number] =>
  rand() < 0.62 ? [(rand() - 0.5) * 40, -6 - rand() * 46] : [(rand() - 0.5) * 110, -20 + (rand() - 0.5) * 100];

export function CandyForest({ budget }: { budget: Budget }) {
  const n = useNodes(MODELS.candy);
  const v = useNodes(MODELS.village);
  const f = useNodes(MODELS.far);
  const pick = useDetail(budget.detail);
  const flat = budget.flatLollis;
  const twist = budget.detail >= 2 ? { geometry: pick(v.TwistLo, "Twist") } : budget.lod ? v.TwistLo : n.Twist;
  const onRoad = useRoadGrid();
  const ok = useMemo(
    () => (x: number, z: number) => isMeadow(x, z) && !blocked(x, z) && !onRoad(x, z, 1.8) && terrain(x, z) < 4.2,
    [onRoad],
  );

  const sets = useMemo(() => {
    const total = budget.lollis + budget.pastel + budget.sunny + budget.twists + budget.trees;
    const all = scatter(total, 7, 2.6, forestPick, ok);
    const counts: number[] = [budget.lollis, budget.pastel, budget.sunny, budget.twists, budget.trees];
    const starts = counts.map((_, i) => counts.slice(0, i).reduce((a, b) => a + b, 0));
    const take = (i: number) => all.slice(starts[i], starts[i] + counts[i]);
    return {
      lollis: take(0),
      pastel: take(1),
      sunny: take(2),
      twists: take(3).map((i) => ({ ...i, s: i.s * 0.8 })),
      trees: take(4).map((i) => ({ ...i, s: i.s * 0.85 + 0.25 })),
    };
  }, [budget, ok]);

  const half = (arr: Item[], odd: boolean) => arr.filter((_, i) => i % 2 === (odd ? 1 : 0));
  // planted once: the sway is wind in the shader, so nothing here is recomputed per frame
  const plant = (items: Item[], lift: number) =>
    bake(
      items.map((it) => ({
        x: it.x,
        y: terrain(it.x, it.z) + lift * it.s,
        z: it.z,
        rx: (it.phase - 5) * 0.006,
        ry: it.ry,
        rz: (it.phase % 1 - 0.5) * 0.06,
        s: it.s,
      })),
    );
  const beds = useMemo(
    () => ({
      lollis: plant(sets.lollis, LOLLI_STICK - 0.3),
      pastel: plant(sets.pastel, LOLLI_STICK - 0.3),
      sunny: plant(sets.sunny, LOLLI_STICK - 0.3),
      twists: plant(sets.twists, TWIST_STICK - 0.3),
      pink: plant(half(sets.trees, false), -0.05),
      blue: plant(half(sets.trees, true), -0.05),
    }),
    [sets],
  );
  const lolliFar = (material: THREE.Material) => (flat ? undefined : { geometry: v.LollipopFlat.geometry, material, distance: FAR });

  return (
    <>
      <Crowd
        geometry={(flat ? v.LollipopFlat : n.LollipopLo).geometry}
        material={flat ? groveSwirlRainbow : groveLolli}
        {...beds.lollis}
        far={lolliFar(groveSwirlRainbow)}
      />
      <Crowd
        geometry={(flat ? v.LollipopFlat : n.LollipopPastel).geometry}
        material={flat ? groveSwirlPastel : groveLolli}
        {...beds.pastel}
        far={lolliFar(groveSwirlPastel)}
      />
      <Crowd
        geometry={(flat ? v.LollipopFlat : n.LollipopSun).geometry}
        material={flat ? groveSwirlSun : groveLolli}
        {...beds.sunny}
        far={lolliFar(groveSwirlSun)}
      />
      <Crowd
        geometry={twist.geometry}
        material={groveTwist}
        {...beds.twists}
        far={budget.lod ? undefined : { geometry: v.TwistLo.geometry, material: groveTwist, distance: FAR }}
      />
      <Crowd
        geometry={n.CottonPink.geometry}
        material={groveCotton}
        {...beds.pink}
        far={{ geometry: f.CottonPinkLo.geometry, material: groveCotton, distance: FAR * 1.6 }}
      />
      <Crowd
        geometry={n.CottonBlue.geometry}
        material={groveCotton}
        {...beds.blue}
        far={{ geometry: f.CottonBlueLo.geometry, material: groveCotton, distance: FAR * 1.6 }}
      />
    </>
  );
}

/* ================================================================== flowers */

const FLOWER_KINDS = 4;

export function Flowers({ count, near = 16 }: { count: number; near?: number }) {
  const n = useNodes(MODELS.nature);
  const f = useNodes(MODELS.far);
  const onRoad = useRoadGrid();
  const kinds = [
    [n.Daisy, f.DaisyLo],
    [n.DaisyPink, f.DaisyPinkLo],
    [n.Cosmos, f.CosmosLo],
    [n.Tulip, f.TulipLo],
  ] as const;
  const per = Math.floor(count / FLOWER_KINDS);

  const beds = useMemo(() => {
    const rand = rng(99);
    return Array.from({ length: FLOWER_KINDS }, (_, k) => {
      const list: { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number }[] = [];
      let guard = 0;
      while (list.length < per && guard++ < per * 20) {
        const near = rand() < 0.6;
        const r = near ? Math.sqrt(rand()) * 14 : 4 + rand() * 50;
        const a = rand() * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = near ? Math.sin(a) * r - 1 : Math.sin(a) * r * 0.9 - 20;
        if (!isMeadow(x, z) || onRoad(x, z, 1.0)) continue;
        const s = (0.75 + rand() * 0.7) * (k === 2 ? 1.1 : 1);
        list.push({ x, y: terrain(x, z) - 0.04, z, rx: (rand() - 0.5) * 0.35, ry: rand() * Math.PI * 2, rz: (rand() - 0.5) * 0.35, s });
      }
      return bake(list);
    });
  }, [per, onRoad]);

  return (
    <>
      {kinds.map(([full, lite], k) => (
        <Crowd
          key={full.name}
          geometry={full.geometry}
          material={plant}
          matrices={beds[k].matrices}
          centers={beds[k].centers}
          far={{ geometry: lite.geometry, material: plant, distance: near }}
        />
      ))}
    </>
  );
}

/* ================================================================== village */

const HOUSES = HOUSE_SPOTS.map(([x, z], i) => ({
  pos: [x, 0, z] as V3,
  rotY: [0.55, -0.65, 0.2, -0.3, -1.1][i] ?? 0,
  s: [1.05, 1.0, 1.15, 1.1, 0.95][i] ?? 1,
  kind: (i % 3 === 1 || i === 2 ? "HouseMint" : "HouseRose") as "HouseRose" | "HouseMint",
}));

const MALLOW_TINTS = ["#ffffff", "#ffd9ec", "#e8ddff", "#d9f5ea", "#fff1cc"];

export function Village({ budget }: { budget: Budget }) {
  const n = useNodes(MODELS.village);
  const f = useNodes(MODELS.far);
  const pick = useDetail(budget.detail);
  const onRoad = useRoadGrid();
  const fenceRef = useRef<THREE.InstancedMesh>(null);

  const fences = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(ROAD.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
    const out: { x: number; z: number; ry: number }[] = [];
    const L = curve.getLength();
    for (let d = 3; d < L; d += 2.2) {
      const t = d / L;
      if (t > 0.2 && t < 0.62) continue; // the forest keeps its trail open
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const side = Math.floor(d / 2.2) % 2 ? 1 : -1;
      const x = p.x - tan.z * 1.7 * side;
      const z = p.z + tan.x * 1.7 * side;
      if (terrain(x, z) < WATER_Y + 0.1 || blocked(x, z)) continue;
      out.push({ x, z, ry: Math.atan2(-tan.z, tan.x) });
    }
    return out;
  }, []);

  const scatterOn = (count: number, seed: number, ok: (x: number, z: number) => boolean) => {
    const rand = rng(seed);
    const out: Item[] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 80) {
      const x = (rand() - 0.5) * 110;
      const z = -20 + (rand() - 0.5) * 100;
      if (!ok(x, z)) continue;
      out.push({ x, z, s: 0.6 + rand() * 0.9, ry: rand() * 6.28, phase: rand() });
    }
    return out;
  };

  const bushes = useMemo(
    () => scatterOn(budget.bushes, 41, (x, z) => isMeadow(x, z) && !blocked(x, z) && !onRoad(x, z, 1.6)),
    [budget.bushes, onRoad],
  );
  const mallows = useMemo(
    () =>
      scatterOn(budget.marshmallows, 52, (x, z) => {
        const h = terrain(x, z);
        return h > WATER_Y - 0.3 && h < 0.6 && !blocked(x, z) && !onRoad(x, z, 1.2);
      }),
    [budget.marshmallows, onRoad],
  );

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    const fm = fenceRef.current;
    if (fm) {
      fences.forEach((p, i) => {
        d.position.set(p.x, terrain(p.x, p.z), p.z);
        d.rotation.set(0, p.ry, 0);
        d.scale.setScalar(0.9);
        d.updateMatrix();
        fm.setMatrixAt(i, d.matrix);
      });
      fm.instanceMatrix.needsUpdate = true;
    }
  }, [fences]);

  const houses = useMemo(() => {
    const of = (kind: string) =>
      bake(HOUSES.filter((h) => h.kind === kind).map((h) => ({ x: h.pos[0], y: terrain(h.pos[0], h.pos[2]) - 0.05, z: h.pos[2], ry: h.rotY, s: h.s })));
    return { HouseRose: of("HouseRose"), HouseMint: of("HouseMint") };
  }, []);
  const bushBake = useMemo(() => bake(bushes.map((p) => ({ x: p.x, y: terrain(p.x, p.z) - 0.05, z: p.z, ry: p.ry, s: p.s * 1.3 }))), [bushes]);
  const mallowBake = useMemo(
    () =>
      bake(
        mallows.map((p) => ({
          x: p.x,
          y: Math.max(terrain(p.x, p.z), WATER_Y - 0.25) - 0.05,
          z: p.z,
          rx: (p.phase - 0.5) * 0.3,
          ry: p.ry,
          s: p.s,
          sy: 0.8,
        })),
      ),
    [mallows],
  );
  const mallowColors = useMemo(() => {
    const c = new THREE.Color();
    const out = new Float32Array(mallows.length * 3);
    mallows.forEach((_, i) => c.set(MALLOW_TINTS[i % MALLOW_TINTS.length]).toArray(out, i * 3));
    return out;
  }, [mallows]);

  return (
    <>
      {(["HouseRose", "HouseMint"] as const).map((kind) => (
        <Crowd
          key={kind}
          geometry={pick(n[kind], kind)}
          material={candy}
          matrices={houses[kind].matrices}
          centers={houses[kind].centers}
        />
      ))}
      {fences.length > 0 && <instancedMesh ref={fenceRef} args={[pick(n.Fence, "Fence"), candy, fences.length]} frustumCulled={false} />}
      {mallows.length > 0 && (
        <Crowd geometry={n.Marshmallow.geometry} material={sugar} matrices={mallowBake.matrices} centers={mallowBake.centers} colors={mallowColors} />
      )}
      {bushes.length > 0 && (
        <Crowd
          geometry={n.Bush.geometry}
          material={plant}
          matrices={bushBake.matrices}
          centers={bushBake.centers}
          far={{ geometry: f.BushLo.geometry, material: plant, distance: 12 }}
        />
      )}
    </>
  );
}

/* ================================================================== lagoon + beach dressing */

export function LilyPads({ detail }: { detail: number }) {
  const n = useNodes(MODELS.nature);
  const pad = useDetail(detail)(n.LilyPad, "LilyPad");
  const baked = useMemo(() => {
    const rand = rng(31);
    const list = [{ x: FROG.pos[0], y: WATER_Y + 0.04, z: FROG.pos[2], ry: 0, s: 2.3 }];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
      const r = 2.2 + rand() * 2.2;
      list.push({ x: FROG.pos[0] + Math.cos(a) * r, y: WATER_Y + 0.03, z: FROG.pos[2] + Math.sin(a) * r, s: 0.6 + rand() * 0.6, ry: rand() * 6.28 });
    }
    return bake(list);
  }, []);
  return <Crowd geometry={pad} material={plant} matrices={baked.matrices} centers={baked.centers} />;
}

export function Palms() {
  const n = useNodes(MODELS.nature);
  const f = useNodes(MODELS.far);
  const palms = useMemo(() => {
    const rand = rng(12);
    const out: { pos: V3; s: number; ry: number }[] = [];
    let guard = 0;
    while (out.length < 11 && guard++ < 400) {
      const x = 33 + rand() * 18;
      const z = -18 + rand() * 36;
      const e = coast(x, z);
      if (e < 0.78 || e > 0.92 || Math.hypot(x - 40.5, z - 3) < 4 || Math.hypot(x - 29, z - 12) < 9) continue;
      if (out.some((o) => Math.hypot(o.pos[0] - x, o.pos[2] - z) < 3.5)) continue;
      out.push({ pos: [x, terrain(x, z) - 0.1, z], s: 0.9 + rand() * 0.6, ry: rand() * 6.28 });
    }
    return out;
  }, []);
  const baked = useMemo(() => bake(palms.map((p) => ({ x: p.pos[0], y: p.pos[1], z: p.pos[2], ry: p.ry, s: p.s }))), [palms]);
  return (
    <Crowd
      geometry={n.Palm.geometry}
      material={plant}
      matrices={baked.matrices}
      centers={baked.centers}
      far={{ geometry: f.PalmLo.geometry, material: plant, distance: 9 }}
    />
  );
}

/** Three quick knocks on the castle and it answers with fireworks of candy. */
function useCastleKnock() {
  const knocks = useRef<number[]>([]);
  return (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    pop(0.6);
    const now = performance.now();
    knocks.current = [...knocks.current.filter((t) => now - t < 1500), now];
    if (knocks.current.length < 3) return;
    knocks.current = [];
    chime();
    for (let i = 0; i < 6; i++) {
      window.setTimeout(() => {
        const a = (i / 6) * Math.PI * 2;
        emit(EVENTS.rain, { x: CASTLE.pos[0] + Math.cos(a) * 5, z: CASTLE.pos[2] + 6 + Math.sin(a) * 4, n: 6 });
      }, i * 220);
    }
  };
}

export function Castle({ detail }: { detail: number }) {
  const n = useNodes(MODELS.castle);
  const f = useNodes(MODELS.far);
  const pick = useDetail(detail);
  const lod = detail > 0;
  const knock = useCastleKnock();
  const y = terrain(CASTLE.pos[0], CASTLE.pos[2]) - 0.2;
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useDistanceLod(
    refs,
    () => (lod ? f.CastleLo : n.Castle).geometry,
    () => (detail >= 2 ? pick(n.Castle, "Castle") : f.CastleLo.geometry),
    () => (detail >= 2 ? 22 : 34),
  );
  return (
    <mesh
      ref={(m) => {
        refs.current[0] = m;
      }}
      geometry={f.CastleLo.geometry}
      material={candySolo}
      onClick={knock}
      raycast={sphereRaycast}
      position={[CASTLE.pos[0], y, CASTLE.pos[2]]}
      rotation={[0, CASTLE.rotY, 0]}
      scale={CASTLE.scale}
    />
  );
}

/* ================================================================== sky dressing */

const CLOUDS: { pos: V3; s: number; v: number; kind: number }[] = [
  { pos: SPECIMEN_CLOUD.pos, s: SPECIMEN_CLOUD.s, v: 0, kind: 0 },
  { pos: [-18, 17, -42], s: 4.5, v: 0.12, kind: 1 },
  { pos: [-34, 21, -70], s: 6.5, v: 0.08, kind: 2 },
  { pos: [22, 24, -82], s: 7, v: 0.07, kind: 1 },
  { pos: [-8, 27, -98], s: 8, v: 0.05, kind: 0 },
  { pos: [40, 16, -44], s: 5, v: 0.1, kind: 2 },
  { pos: [-28, 12, -18], s: 3.2, v: 0.14, kind: 0 },
  { pos: [4, 21, -56], s: 4, v: 0.11, kind: 2 },
  { pos: [18, 11, -12], s: 2.6, v: 0.16, kind: 1 },
  { pos: [-14, 9, 6], s: 2.2, v: 0.15, kind: 2 },
  { pos: [62, 14, -12], s: 3.4, v: 0.12, kind: 3 },
  { pos: [56, 18, 14], s: 2.8, v: 0.1, kind: 3 },
  { pos: [-40, 15, -2], s: 3, v: 0.12, kind: 3 },
  { pos: [70, 22, -30], s: 6, v: 0.06, kind: 0 },
];

export function Clouds() {
  const n = useNodes(MODELS.sky);
  const kinds = useMemo(
    () => [n.Cloud0, n.Cloud1, n.Cloud2, n.HeartCloud].map((m) => ({ near: m.geometry, far: m.geometry })),
    [n],
  );
  return (
    <Flock
      kinds={kinds}
      count={CLOUDS.length}
      kindOf={(i) => CLOUDS[i].kind}
      range={() => 1e6}
      material={cloud}
      place={(i, t, d, cam) => {
        const c = CLOUDS[i];
        d.position.set(c.pos[0] + Math.sin(t * c.v * 0.6 + i) * 4 * Math.min(1, c.v * 10), c.pos[1] + Math.sin(t * 0.3 + i * 2) * 0.25, c.pos[2]);
        // hearts always turn their good side to the camera
        d.rotation.set(0, c.kind === 3 ? Math.atan2(cam.x - d.position.x, cam.z - d.position.z) : (i * 0.7) % 1, 0);
        d.scale.setScalar(c.s);
      }}
    />
  );
}

const BALLOONS: { pos: V3; s: number; kind: 0 | 1; phase: number }[] = [
  { pos: [48, 14, -8], s: 1.6, kind: 0, phase: 0 },
  { pos: [58, 19, 8], s: 1.3, kind: 1, phase: 2 },
  { pos: [36, 22, -24], s: 1.9, kind: 1, phase: 4 },
  { pos: [-20, 18, -34], s: 1.5, kind: 0, phase: 1 },
  { pos: [8, 26, -46], s: 2.2, kind: 0, phase: 3 },
  { pos: [-6, 15, 4], s: 1.1, kind: 1, phase: 5 },
];

export function Balloons({ detail }: { detail: number }) {
  const n = useNodes(MODELS.sky);
  const f = useNodes(MODELS.far);
  const twins = useTwins(detail);
  const kinds = useMemo(() => {
    const twin = (full: THREE.Mesh, name: "BalloonA" | "BalloonB") => {
      const lo = f[`${name}Lo`].geometry;
      const min = twins[`${name}Min`]?.geometry;
      if (detail >= 2 && min) return { near: min, far: min };
      return { near: detail ? lo : full.geometry, far: lo };
    };
    return [twin(n.BalloonA, "BalloonA"), twin(n.BalloonB, "BalloonB")];
  }, [n, f, twins, detail]);
  return (
    <Flock
      kinds={kinds}
      count={BALLOONS.length}
      kindOf={(i) => BALLOONS[i].kind}
      range={(i) => 14 * BALLOONS[i].s}
      material={candy}
      place={(i, t, d) => {
        const b = BALLOONS[i];
        d.position.set(b.pos[0] + Math.sin(t * 0.07 + b.phase) * 3, b.pos[1] + Math.sin(t * 0.35 + b.phase) * 0.8, b.pos[2]);
        d.rotation.set(0, t * 0.05 + b.phase, Math.sin(t * 0.5 + b.phase) * 0.03);
        d.scale.setScalar(b.s);
      }}
    />
  );
}

/* ================================================================== butterflies */

const bm = new THREE.Matrix4();
const wm = new THREE.Matrix4();
const flapM = new THREE.Matrix4();
const bq = new THREE.Quaternion();
const bs = new THREE.Vector3();
const bp = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

/** The whole swarm is three instanced draws: bodies, left wings, right wings. */
export function Butterflies({ count }: { count: number }) {
  const { scene } = useGLTF(MODELS.nature);
  const parts = useMemo(() => {
    const t = scene.getObjectByName("Butterfly")!;
    t.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(t.matrixWorld).invert();
    const local = (name: string) => {
      const o = t.getObjectByName(name) as THREE.Mesh;
      return { geometry: o.geometry, matrix: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) };
    };
    return { body: local("BflyBody"), wl: local("BflyWingL"), wr: local("BflyWingR") };
  }, [scene]);

  const flock = useMemo(() => {
    const rand = rng(5);
    const anchors: V3[] = [
      [0, 3, 0],
      [-3, 2.4, -8],
      [3, 2.8, -14],
      [-2, 3.2, -20],
      [6, 5, -22],
      [-5, 4, -4],
      [-20, 2.5, -16],
      [40, 3, 2],
    ];
    return Array.from({ length: count }, (_, i) => ({
      anchor: anchors[i % anchors.length],
      r: 1.5 + rand() * 2.5,
      speed: 0.25 + rand() * 0.35,
      phase: rand() * 10,
      s: 0.45 + rand() * 0.25,
      yaw: 0,
      x: 0,
      z: 0,
    }));
  }, [count]);

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const leftRef = useRef<THREE.InstancedMesh>(null);
  const rightRef = useRef<THREE.InstancedMesh>(null);

  useFrame(({ clock }) => {
    const B = bodyRef.current;
    const L = leftRef.current;
    const R = rightRef.current;
    if (!B || !L || !R) return;
    const t = clock.elapsedTime;
    flock.forEach((b, i) => {
      const k = t * b.speed + b.phase;
      const x = b.anchor[0] + Math.sin(k) * b.r;
      const z = b.anchor[2] + Math.cos(k * 0.8) * b.r * 0.7;
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz > 1e-8) b.yaw = Math.atan2(dx, dz) + Math.PI;
      b.x = x;
      b.z = z;
      bp.set(x, b.anchor[1] + Math.sin(k * 2.3) * 0.6 + Math.sin(t * 9 + b.phase) * 0.05, z);
      bq.setFromAxisAngle(up, b.yaw);
      bs.setScalar(b.s);
      bm.compose(bp, bq, bs);
      B.setMatrixAt(i, wm.multiplyMatrices(bm, parts.body.matrix));
      const flap = Math.sin(t * 16 + b.phase) * 1.05;
      L.setMatrixAt(i, wm.multiplyMatrices(bm, parts.wl.matrix).multiply(flapM.makeRotationZ(flap)));
      R.setMatrixAt(i, wm.multiplyMatrices(bm, parts.wr.matrix).multiply(flapM.makeRotationZ(-flap)));
    });
    for (const m of [B, L, R]) m.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;
  return (
    <>
      <instancedMesh ref={bodyRef} args={[parts.body.geometry, plant, count]} frustumCulled={false} />
      <instancedMesh ref={leftRef} args={[parts.wl.geometry, wing, count]} frustumCulled={false} />
      <instancedMesh ref={rightRef} args={[parts.wr.geometry, wing, count]} frustumCulled={false} />
    </>
  );
}
