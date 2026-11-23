"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  useRapier,
  BallCollider,
  InstancedRigidBodies,
  Physics,
  RigidBody,
  TrimeshCollider,
  type InstancedRigidBodyProps,
  type RapierRigidBody,
} from "@react-three/rapier";
import { MODELS, useDetail, useNodes } from "./Props";
import { striped, sugar } from "./materials";
import { LETTERS, WATER_Y, rng, terrain, type Route } from "./layout";
import { EVENTS, emit, world } from "@/lib/world";
import { boing, pop } from "@/lib/sound";
import { Spring } from "./Characters";


/** Low-res copy of the terrain as a static trimesh, so candy lands where the grass is. */
function IslandCollider() {
  const { vertices, indices } = useMemo(() => {
    const x0 = -70;
    const z0 = -90;
    const W = 140;
    const H = 130;
    const nx = 64;
    const nz = 60;
    const verts = new Float32Array((nx + 1) * (nz + 1) * 3);
    const idx: number[] = [];
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + (i / nx) * W;
        const z = z0 + (j / nz) * H;
        const k = (j * (nx + 1) + i) * 3;
        verts[k] = x;
        verts[k + 1] = terrain(x, z);
        verts[k + 2] = z;
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const c = a + nx + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    return { vertices: verts, indices: new Uint32Array(idx) };
  }, []);
  return (
    <RigidBody type="fixed" colliders={false}>
      <TrimeshCollider args={[vertices, indices]} friction={0.9} restitution={0.25} />
    </RigidBody>
  );
}

/* ================================================================== letters */

function kickWobble(sp: { x: Spring; z: Spring } | undefined, power: number) {
  if (!sp) return;
  sp.x.kick((Math.random() - 0.5) * power);
  sp.z.kick((Math.random() > 0.5 ? 1 : -1) * power * (0.6 + Math.random() * 0.4));
}

/**
 * The wordmark. Bodies keep their rotation locked so the word stays readable;
 * the wobble on landing and on click is a spring on the visible mesh.
 */
function Letters({ route }: { route: Route }) {
  const n = useNodes(MODELS.letters);
  const prefix = route === "lost" ? "D" : "W";
  const names = Object.keys(n)
    .filter((k) => new RegExp(`^${prefix}\\d+$`).test(k))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const size = route === "lost" ? LETTERS.lostScale : LETTERS.scale;
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const springs = useRef(names.map(() => ({ x: new Spring(70, 4.5), z: new Spring(70, 4.5) })));
  // physics arrives after the island, so the drop may already have happened
  const [dropped, setDropped] = useState(route === "lost" || world.dropped);
  const clicks = useRef<number[]>([]);

  useEffect(() => {
    if (dropped) return;
    const go = () => setDropped(true);
    window.addEventListener(EVENTS.drop, go);
    return () => window.removeEventListener(EVENTS.drop, go);
  }, [dropped]);

  useFrame((_, dt) => {
    meshes.current.forEach((m, i) => {
      const sp = springs.current[i];
      if (!m || !sp) return;
      m.rotation.x = sp.x.step(0, dt);
      m.rotation.z = sp.z.step(0, dt);
    });
  });

  // before the drop, one hidden letter keeps its shader in the loader's warm-up
  if (!dropped) return names[0] ? <mesh visible={false} geometry={n[names[0]].geometry} material={striped} /> : null;

  const wobble = (i: number, power: number) => kickWobble(springs.current[i], power);

  const onClick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const rb = bodies.current[i];
    if (!rb) return;
    boing();
    rb.applyImpulse({ x: (Math.random() - 0.5) * 3, y: 11 + Math.random() * 4, z: (Math.random() - 0.5) * 2 }, true);
    wobble(i, 7);
    if (route === "lost" && names[i] === "D1") {
      const now = performance.now();
      clicks.current = [...clicks.current.filter((t) => now - t < 2500), now];
      if (clicks.current.length >= 4) {
        clicks.current = [];
        emit(EVENTS.secret, "zero");
      }
    }
  };

  return (
    <>
      {names.map((name, i) => {
        const node = n[name];
        const x = LETTERS.pos[0] + node.position.x * size;
        return (
          <RigidBody
            key={name}
            ref={(rb) => {
              bodies.current[i] = rb;
            }}
            colliders="hull"
            position={[x, 10 + i * 1.8, LETTERS.pos[2]]}
            lockRotations
            restitution={0.42}
            friction={0.8}
            linearDamping={0.12}
            mass={1}
            onCollisionEnter={({ other }) => {
              const rb = bodies.current[i];
              const vy = rb ? Math.abs(rb.linvel().y) : 0;
              if (vy > 1.2 || other.rigidBodyObject) wobble(i, Math.min(8, 1.5 + vy * 0.8));
            }}
          >
            <mesh
              ref={(m) => {
                meshes.current[i] = m;
              }}
              geometry={node.geometry}
              material={striped}
              scale={size}
              onClick={onClick(i)}
              onPointerOver={() => (document.body.style.cursor = "pointer")}
              onPointerOut={() => (document.body.style.cursor = "")}
            />
          </RigidBody>
        );
      })}
    </>
  );
}

/* ================================================================== gumdrops */

const GUM_COLORS = ["#ff4d7d", "#ffd23b", "#3fcf74", "#2f9bff", "#9a5cff", "#ff8a1f", "#ff8fc7", "#7ff0e6"];

function Gumdrops({ count, detail }: { count: number; detail: number }) {
  const n = useNodes(MODELS.candy);
  const drop = useDetail(detail)(n.Gumdrop, "Gumdrop");
  const mesh = useRef<THREE.InstancedMesh>(null);
  const instances = useMemo<InstancedRigidBodyProps[]>(() => {
    const rand = rng(4);
    const out: InstancedRigidBodyProps[] = [];
    let guard = 0;
    while (out.length < count && guard++ < 2000) {
      const a = rand() * Math.PI * 2;
      const r = 2.6 + rand() * 5.5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.8 - 1;
      if (Math.abs(x) < 9 && z < LETTERS.pos[2] + 2.4 && z > LETTERS.pos[2] - 2.2) continue;
      out.push({ key: `g${out.length}`, position: [x, terrain(x, z) + 0.5, z], rotation: [0, rand() * 6, 0], scale: [1.1, 1.1, 1.1] });
    }
    return out;
  }, [count]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    // nothing to draw until the first shower
    m.visible = false;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) m.setColorAt(i, c.set(GUM_COLORS[i % GUM_COLORS.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [count]);

  return (
    <InstancedRigidBodies
      instances={instances}
      colliders="cuboid"
      restitution={0.45}
      friction={0.7}
      linearDamping={0.2}
      angularDamping={1.2}
    >
      <instancedMesh ref={mesh} args={[drop, sugar, count]} frustumCulled={false} />
    </InstancedRigidBodies>
  );
}

/* ================================================================== candy rain */


function CandyRain({ count, detail }: { count: number; detail: number }) {
  const n = useNodes(MODELS.candy);
  const drop = useDetail(detail)(n.Gumdrop, "Gumdrop");
  const mesh = useRef<THREE.InstancedMesh>(null);
  const api = useRef<(RapierRigidBody | null)[] | null>(null);
  const next = useRef(0);

  const instances = useMemo<InstancedRigidBodyProps[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        key: `r${i}`,
        position: [-60 + (i % 12) * 1.2, -40, -60 + Math.floor(i / 12) * 1.2],
        scale: [0.9, 0.9, 0.9],
      })),
    [count],
  );

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    // nothing to draw until the first shower
    m.visible = false;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) m.setColorAt(i, c.set(GUM_COLORS[(i * 3) % GUM_COLORS.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [count]);

  useEffect(() => {
    const onRain = (e: Event) => {
      const at = (e as CustomEvent<{ x: number; z: number; n?: number }>).detail;
      const bodies = api.current;
      if (!bodies) return;
      if (mesh.current) mesh.current.visible = true;
      const drops = at.n ?? 7;
      for (let k = 0; k < drops; k++) {
        const rb = bodies[next.current % count];
        next.current++;
        if (!rb) continue;
        const x = at.x + (Math.random() - 0.5) * 2.4;
        const z = at.z + (Math.random() - 0.5) * 2.4;
        rb.setTranslation({ x, y: Math.max(terrain(x, z), WATER_Y) + 7 + Math.random() * 5, z }, true);
        rb.setLinvel({ x: (Math.random() - 0.5) * 2, y: -2, z: (Math.random() - 0.5) * 2 }, true);
        rb.setAngvel({ x: Math.random() * 6 - 3, y: Math.random() * 6 - 3, z: Math.random() * 6 - 3 }, true);
        rb.wakeUp();
      }
      pop(0.9 + Math.random() * 0.5);
    };
    window.addEventListener(EVENTS.rain, onRain);
    return () => window.removeEventListener(EVENTS.rain, onRain);
  }, [count]);

  return (
    <>
      <InstancedRigidBodies
        ref={api as never}
        instances={instances}
        colliders="cuboid"
        restitution={0.5}
        friction={0.6}
        linearDamping={0.1}
        angularDamping={1.2}
        canSleep
      >
        <instancedMesh ref={mesh} args={[drop, sugar, count]} frustumCulled={false} />
      </InstancedRigidBodies>
      <RigidBody type="fixed" position={[-54, -41, -54]} colliders="cuboid">
        <mesh visible={false}>
          <boxGeometry args={[30, 1, 30]} />
        </mesh>
      </RigidBody>
    </>
  );
}

/* ================================================================== pointer pusher */

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4);
const ray = new THREE.Raycaster();
const hit = new THREE.Vector3();
const ndc = new THREE.Vector2();

function Pusher() {
  const body = useRef<RapierRigidBody>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const rb = body.current;
    if (!rb) return;
    if (!world.pointer.active || (world.section !== "about" && world.section !== "lost")) {
      rb.setNextKinematicTranslation({ x: 0, y: -30, z: 0 });
      return;
    }
    ndc.set(world.pointer.x, world.pointer.y);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, hit) && Math.hypot(hit.x, hit.z + 2) < 14) {
      rb.setNextKinematicTranslation({ x: hit.x, y: terrain(hit.x, hit.z) + 0.4, z: hit.z });
    }
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -30, 0]}>
      <BallCollider args={[0.55]} />
    </RigidBody>
  );
}

/* ================================================================== physics root */

/**
 * Steps the simulation by hand, and only while something can move. Once every
 * body has settled nothing is stepped at all, which saves the step and its
 * garbage on every frame. A drop, a shower, a click or the pointer pushing
 * candy wakes it again. Stepping here instead of toggling `paused` keeps React
 * out of it: no re-render of the physics tree when the world falls asleep.
 */
function Stepper() {
  const { world: physics, step } = useRapier();
  const st = useRef({ frame: 0, awake: true, until: 0 });
  useEffect(() => {
    const wake = () => {
      st.current.until = performance.now() + 2500;
    };
    window.addEventListener(EVENTS.drop, wake);
    window.addEventListener(EVENTS.rain, wake);
    window.addEventListener("pointerdown", wake);
    return () => {
      window.removeEventListener(EVENTS.drop, wake);
      window.removeEventListener(EVENTS.rain, wake);
      window.removeEventListener("pointerdown", wake);
    };
  }, []);
  useFrame((_, dt) => {
    if (document.hidden) return;
    const s = st.current;
    // checking every body is cheap, but there is no need to do it each frame
    if (s.frame++ % 12 === 0) {
      let awake = false;
      physics.forEachRigidBody((b) => {
        if (!awake && b.isDynamic() && !b.isSleeping()) awake = true;
      });
      s.awake = awake;
    }
    const pushing = world.pointer.active && (world.section === "about" || world.section === "lost");
    if (s.awake || pushing || performance.now() < s.until) step(dt);
  });
  return null;
}

export default function Playground({ route, gumdrops, rain, detail }: { route: Route; gumdrops: number; rain: number; detail: number }) {
  return (
    <Physics gravity={[0, -9.81, 0]} timeStep="vary" paused>
      <IslandCollider />
      {route !== "sunshine" && <Letters route={route} />}
      <Gumdrops count={gumdrops} detail={detail} />
      <CandyRain count={rain} detail={detail} />
      <Pusher />
      <Stepper />
    </Physics>
  );
}
