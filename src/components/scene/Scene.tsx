"use client";

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, events as createPointerEvents, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, useProgress } from "@react-three/drei";
import { BUDGET, detectTier } from "@/lib/quality";
import { EVENTS, emit, world } from "@/lib/world";
import { CameraRig } from "./CameraRig";
import { Grass, Island, Rainbow, Road, Sea, Sky, Sparkles } from "./Nature";
import {
  Balloons,
  Butterflies,
  CandyForest,
  Castle,
  Clouds,
  Flowers,
  HeroCandy,
  LilyPads,
  Palms,
  MODELS,
  Village,
  preloadModels,
  useDetail,
  useNodes,
} from "./Props";
import { Animals } from "./Animals";
import { Details, Petals } from "./Details";
import { CHARACTER_LAYER, Frog, PARTS_LAYER, Rider, SeaLife, Smiley } from "./Characters";
import { Signs, type SignMedia } from "./Signs";
import { Planted } from "./Planted";
import { MapLabels } from "./MapLabels";
import { RainCatcher } from "./RainCatcher";
import { striped, sugar, tuneMaterials } from "./materials";
import { tickWeather } from "./weather";
import type { Route } from "./layout";

// Rapier is the heaviest download by far and nothing needs it before the visitor
// reaches the meadow, so it comes after the island (except on the 404, which opens on it)
const loadPlayground = () => import("./Playground");
const Playground = lazy(loadPlayground);

preloadModels();

// R3F still drives its loop with THREE.Clock, which three now flags as deprecated.
// Swallow exactly that notice; everything else passes through untouched.
THREE.setConsoleFunction((type: string, message: string, ...rest: unknown[]) => {
  if (type === "warn" && typeof message === "string" && message.includes("Clock: This module has been deprecated")) return;
  const fn = type === "error" ? console.error : type === "warn" ? console.warn : console.log;
  fn(message, ...rest);
});

/**
 * Pointer handling that stays off the scroll path: no raycasts for wheel
 * events, none for touch moves (there is no hover on glass), and at most one
 * hover raycast per frame for a mouse. Taps and clicks work as before.
 */
function quietEvents(store: Parameters<typeof createPointerEvents>[0]) {
  const base = createPointerEvents(store);
  const h = base.handlers as unknown as Record<string, (e: Event) => void>;
  delete h.onWheel;
  const move = h.onPointerMove;
  let pending: Event | null = null;
  let frame = 0;
  h.onPointerMove = (e: Event) => {
    if ((e as PointerEvent).pointerType !== "mouse") return;
    pending = e;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (pending) move(pending);
      pending = null;
    });
  };
  return base;
}

/**
 * Runs once everything has mounted: compiles every shader and uploads every
 * buffer while the loader is still up, so nothing has to be built the first
 * time it scrolls into view. Then lets the loader go.
 */
function Ready() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let alive = true;
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    (async () => {
      await frame();
      await frame();
      const saved: [THREE.Object3D, boolean, boolean][] = [];
      try {
        await gl.compileAsync(scene, camera);
        // upload in slices over a few frames, so the loader's animation never stalls for long
        const drawable: THREE.Object3D[] = [];
        scene.traverse((o) => {
          saved.push([o, o.visible, o.frustumCulled]);
          if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) drawable.push(o);
        });
        const slices = 6;
        for (let k = 0; k < slices && alive; k++) {
          for (const [o] of saved) o.visible = !((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints);
          drawable.forEach((o, i) => {
            if (i % slices !== k) return;
            o.visible = true;
            o.frustumCulled = false;
          });
          gl.render(scene, camera);
          await frame();
        }
      } catch {
        // a slow first scroll is the worst case here
      } finally {
        for (const [o, v, f] of saved) {
          o.visible = v;
          o.frustumCulled = f;
        }
      }
      if (alive) emit(EVENTS.ready);
    })();
    return () => {
      alive = false;
    };
  }, [gl, scene, camera]);
  return null;
}

/** Forwards loader progress to the DOM without re-rendering React mid-load. */
function ProgressBridge() {
  useEffect(() => {
    emit(EVENTS.progress, useProgress.getState().progress);
    return useProgress.subscribe((s) => emit(EVENTS.progress, s.progress));
  }, []);
  return null;
}

/** Scroll speed becomes the characters' mood; a sharp change of direction startles them. */
function Mood() {
  const sign = useRef(0);
  useFrame(({ clock, camera }, dt) => {
    tickWeather(clock.elapsedTime, world.energy, dt);
    // up in map view the characters' small parts are too small to see
    if (camera.position.y > 28) camera.layers.disable(PARTS_LAYER);
    else camera.layers.enable(PARTS_LAYER);
    const v = world.velocity;
    const target = Math.max(Math.min(1, Math.abs(v) / 30), world.fx.party);
    world.energy = THREE.MathUtils.damp(world.energy, target, target > world.energy ? 5 : 1.2, dt);
    const s = Math.abs(v) > 6 ? Math.sign(v) : 0;
    if (s && sign.current && s !== sign.current) world.kick++;
    if (s) sign.current = s;
    world.velocity *= Math.exp(-dt * 3);
  });
  return null;
}

/**
 * Keeps the frame rate at the display's own refresh rate. It judges the median
 * frame of each half second, so a single slow frame (a video frame upload, a
 * garbage collection) never counts, and it only starts once the intro is over.
 * When frames run long it lowers the resolution first, then thins the
 * instanced crowds; it never touches materials, so it never rebuilds a shader.
 */
function Governor({ top, floor }: { top: number; floor: number }) {
  // straight into the renderer: no React render of the scene for a resolution step
  const setDpr = useThree((s) => s.setDpr);
  const st = useRef({ win: [] as number[], acc: 0, slow: 0, fast: 0, level: 0, ups: 0, refresh: 0, samples: [] as number[], armed: 0 });
  useEffect(() => {
    const arm = () => {
      st.current.armed = performance.now() + 1500;
    };
    if (!document.documentElement.classList.contains("is-loading")) arm();
    window.addEventListener(EVENTS.intro, arm);
    return () => window.removeEventListener(EVENTS.intro, arm);
  }, []);
  useFrame((_, dt) => {
    const s = st.current;
    if (dt > 0.25 || document.hidden || !s.armed || performance.now() < s.armed) return;
    // learn the refresh rate from the quickest frames
    if (s.samples.length < 90) {
      s.samples.push(dt);
      if (s.samples.length === 90) {
        const sorted = [...s.samples].sort((a, b) => a - b);
        s.refresh = Math.min(144, Math.max(30, Math.round(1 / sorted[Math.floor(sorted.length * 0.2)])));
      }
      return;
    }
    s.win.push(dt);
    s.acc += dt;
    if (s.acc < 0.5) return;
    const sorted = s.win.sort((a, b) => a - b);
    const fps = 1 / sorted[Math.floor(sorted.length / 2)];
    s.win.length = 0;
    s.acc = 0;
    if (fps < s.refresh * 0.85) {
      s.slow++;
      s.fast = 0;
    } else if (fps > s.refresh * 0.95) {
      s.fast++;
      s.slow = 0;
    } else {
      s.slow = 0;
      s.fast = 0;
    }
    let next = s.level;
    if (s.slow >= 2 && s.level < 5) next = s.level + 1;
    else if (s.fast >= 8 && s.level > 0 && s.ups < 3) {
      next = s.level - 1;
      s.ups++;
    }
    if (next === s.level) return;
    s.level = next;
    s.slow = 0;
    s.fast = 0;
    const scale = [1, 0.86, 0.74, 0.64, 0.56, 0.5][next];
    setDpr(Math.max(floor, Math.round(top * scale * 100) / 100));
    world.density = [1, 1, 0.85, 0.7, 0.55, 0.4][next];
    world.degraded = next >= 4;
  });
  return null;
}

/**
 * The playground's materials, drawn in the warm-up like everything else, so
 * physics can arrive later without compiling a shader mid-scroll.
 */
function PlaygroundShaders({ detail }: { detail: number }) {
  const letters = useNodes(MODELS.letters);
  const candy = useNodes(MODELS.candy);
  const drop = useDetail(detail)(candy.Gumdrop, "Gumdrop");
  const letter = (letters.W1 ?? letters.D1)?.geometry;
  const gums = useMemo(() => {
    const m = new THREE.InstancedMesh(drop, sugar, 1);
    m.setColorAt(0, new THREE.Color("#ff5c8a"));
    m.frustumCulled = false;
    m.visible = false;
    return m;
  }, [drop]);
  return (
    <>
      {letter && <mesh visible={false} geometry={letter} material={striped} />}
      <primitive object={gums} />
    </>
  );
}

/** Mounts physics once the intro has played and the main thread has a quiet moment. */
function useLatePhysics(eager: boolean) {
  const [on, setOn] = useState(eager);
  useEffect(() => {
    if (on) return;
    let idle = 0;
    let timer = 0;
    // start the download once the models are in, so it never competes with them
    const fetchEarly = () => void loadPlayground();
    const mount = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(() => setOn(true), { timeout: 2000 });
      else timer = window.setTimeout(() => setOn(true), 800);
    };
    window.addEventListener(EVENTS.ready, fetchEarly, { once: true });
    window.addEventListener(EVENTS.intro, mount, { once: true });
    return () => {
      window.removeEventListener(EVENTS.ready, fetchEarly);
      window.removeEventListener(EVENTS.intro, mount);
      if (idle) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
    };
  }, [on]);
  return on;
}

export default function Scene({ route, signs = [] }: { route: Route; signs?: SignMedia[] }) {
  const [tier] = useState(detectTier);
  const budget = BUDGET[tier];
  const lite = tier !== "high";
  const weak = tier === "low";
  const top = Math.min(budget.dpr, window.devicePixelRatio || 1);
  const eager = route === "lost";
  const physics = useLatePhysics(eager);
  // material quality is fixed before the first shader compiles and never flips later
  useState(() => {
    tuneMaterials(weak, budget.shine);
    world.density = 1;
    world.degraded = false;
    document.documentElement.dataset.tier = tier;
    return true;
  });

  return (
    <Canvas
      className="scene"
      dpr={top}
      gl={{ antialias: !lite && top < 1.5, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: 42, near: 0.1, far: 900, position: [2, 74, 66] }}
      events={quietEvents}
      eventSource={document.body}
      eventPrefix="client"
      onCreated={({ gl, camera }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.05;
        camera.layers.enable(CHARACTER_LAYER);
        camera.layers.enable(PARTS_LAYER);
      }}
      aria-hidden
    >
      <Governor top={top} floor={weak ? 0.7 : 0.85} />
      <Mood />
      <fog attach="fog" args={["#ffd8cc", 60, 260]} />
      <hemisphereLight args={["#e4f1ff", "#d8e8b8", weak ? 1.5 : 1.1]} />
      <directionalLight position={[10, 16, 12]} intensity={2.7} color="#ffe6c2" />
      <directionalLight position={[-12, 8, -14]} intensity={0.9} color="#ffc2d8" />

      <ProgressBridge />
      <Sky />
      <Suspense fallback={null}>
        <Environment resolution={weak ? 32 : 64} frames={1}>
          <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 6, 6]} scale={[10, 4, 1]} />
          <Lightformer form="rect" intensity={2} color="#ffd1ea" position={[-8, 3, -2]} scale={[6, 6, 1]} />
          <Lightformer form="rect" intensity={2} color="#bfe6ff" position={[8, 3, -4]} scale={[6, 6, 1]} />
          <Lightformer form="ring" intensity={4} color="#fff2b8" position={[0, 4, -12]} scale={4} />
        </Environment>
        <Island detail={budget.island} />
        <Sea segments={budget.sea} low={weak || budget.lowSea} />
        <Road />
        {budget.grass > 0 && <Grass count={budget.grass} />}
        <Rainbow />
        <Clouds />
        <Balloons detail={budget.detail} />
        <Flowers count={budget.flowers} near={[16, 11, 7][budget.detail]} />
        <CandyForest budget={budget} />
        <Village budget={budget} />
        <Details pebbles={budget.pebbles} mushrooms={budget.mushrooms} reeds={budget.reeds} />
        {budget.petals > 0 && <Petals count={budget.petals} />}
        <Animals bunnies={budget.bunnies} sheep={budget.sheep} ducks={budget.ducks} birds={budget.birds} detail={budget.detail} />
        <HeroCandy detail={budget.detail} flat={budget.heroFlat} />
        <LilyPads detail={budget.detail} />
        <Palms />
        <Castle detail={budget.detail} />
        <Rider route={route} detail={budget.detail} />
        <Frog detail={budget.detail} />
        <Smiley detail={budget.detail} />
        <SeaLife dolphins={budget.dolphins} fish={budget.fish} detail={budget.detail} />
        <Butterflies count={budget.butterflies} />
        {route === "home" && <Signs media={signs} eager={budget.clips} detail={budget.detail} />}
        {route === "home" && <MapLabels />}
        {route === "sunshine" && <Planted />}
        {route !== "sunshine" && <RainCatcher route={route} />}
        {budget.sparkles > 0 && <Sparkles count={budget.sparkles} />}
        {budget.shadows && (
          <ContactShadows
            position={[0, 0.03, 0]}
            scale={route === "lost" ? 16 : 9}
            blur={2.4}
            far={3.5}
            opacity={0.42}
            resolution={tier === "high" ? 512 : 256}
            frames={1}
            color="#2b5d2a"
          />
        )}
        {eager ? (
          <Playground route={route} gumdrops={budget.gumdrops} rain={budget.rain} detail={budget.detail} />
        ) : (
          <PlaygroundShaders detail={budget.detail} />
        )}
        <Ready />
      </Suspense>
      {!eager && physics && (
        <Suspense fallback={null}>
          <Playground route={route} gumdrops={budget.gumdrops} rain={budget.rain} detail={budget.detail} />
        </Suspense>
      )}
      <CameraRig route={route} />
    </Canvas>
  );
}
