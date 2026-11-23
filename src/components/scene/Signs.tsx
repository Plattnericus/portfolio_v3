"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { MODELS, useDetail, useNodes } from "./Props";
import { candy } from "./materials";
import { SIGNS, SIGN_LIFT, SIGN_SCALE, terrain } from "./layout";
import { EVENTS, world } from "@/lib/world";

export type SignMedia = { title: string; clip: string };

const BOARD_W = 3.6;
const BOARD_H = 2.7;
const BOARD = BOARD_W / BOARD_H;

/** Fit the clip to the board: crop when the shapes are close, letterbox when they are not. */
function fit(mesh: THREE.Mesh, tex: THREE.Texture, w: number, h: number) {
  const r = w / h;
  tex.repeat.set(1, 1);
  tex.offset.set(0, 0);
  mesh.scale.set(1, 1, 1);
  if (r > BOARD * 1.15) mesh.scale.y = BOARD / r;
  else if (r < BOARD / 1.15) mesh.scale.x = r / BOARD;
  else if (r > BOARD) {
    tex.repeat.x = BOARD / r;
    tex.offset.x = (1 - tex.repeat.x) / 2;
  } else {
    tex.repeat.y = r / BOARD;
    tex.offset.y = (1 - tex.repeat.y) / 2;
  }
}

type Clip = { el: HTMLVideoElement; tex: THREE.VideoTexture | null; ready: boolean; tries: number };

/**
 * One looping, muted clip per sign. Clips load in the background after the
 * intro (all of them on capable devices, only the ones near the camera on
 * light ones), show their first frame as soon as it decodes, and only the
 * sign the camera is visiting actually plays.
 */
function Board({ index, media, eager, neighbours }: { index: number; media: SignMedia; eager: boolean; neighbours: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const clip = useRef<Clip | null>(null);
  const wanted = useRef(false);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff6e6"), toneMapped: false }),
    [],
  );

  useEffect(() => {
    const el = document.createElement("video");
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.setAttribute("muted", "");
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
    el.setAttribute("disablepictureinpicture", "");
    el.preload = "none";
    const c: Clip = { el, tex: null, ready: false, tries: 0 };
    clip.current = c;

    const show = () => {
      const m = mesh.current;
      if (!m) return;
      if (!c.tex) {
        c.tex = new THREE.VideoTexture(el);
        c.tex.colorSpace = THREE.SRGBColorSpace;
        material.map = c.tex;
        material.color.set("#ffffff");
        material.needsUpdate = true;
      }
      fit(m, c.tex, el.videoWidth || 4, el.videoHeight || 3);
      c.tex.needsUpdate = true;
      c.ready = true;
    };
    const refresh = () => {
      if (c.tex) c.tex.needsUpdate = true;
    };
    const retry = () => {
      if (c.tries >= 3) return;
      c.tries += 1;
      window.setTimeout(() => {
        el.src = `${media.clip}?r=${c.tries}`;
        el.load();
      }, 800 * c.tries);
    };
    el.addEventListener("loadeddata", show);
    el.addEventListener("seeked", refresh);
    el.addEventListener("error", retry);

    const start = () => {
      wanted.current = true;
    };
    // capable devices warm every clip up shortly after the island appears
    let timer = 0;
    const onIntro = () => {
      if (eager) timer = window.setTimeout(start, 600 + index * 450);
    };
    window.addEventListener(EVENTS.intro, onIntro, { once: true });
    if (!document.documentElement.classList.contains("is-loading")) onIntro();

    return () => {
      window.removeEventListener(EVENTS.intro, onIntro);
      window.clearTimeout(timer);
      el.removeEventListener("loadeddata", show);
      el.removeEventListener("seeked", refresh);
      el.removeEventListener("error", retry);
      el.pause();
      el.removeAttribute("src");
      el.load();
      c.tex?.dispose();
      material.dispose();
    };
  }, [eager, index, material, media.clip]);

  useFrame(() => {
    const c = clip.current;
    if (!c) return;
    const near =
      world.sign >= 0
        ? Math.abs(world.sign - index) <= 2
        : index < 2 && (world.section === "stack" || world.section === "about");
    if (!media.clip) return;
    if ((near || wanted.current) && !c.el.getAttribute("src")) {
      c.el.preload = "auto";
      c.el.src = media.clip;
      c.el.load();
    }
    // the sign being visited plays; on full quality its neighbours keep playing too
    const play = world.sign === index || (neighbours && Math.abs(world.sign - index) === 1);
    if (play && c.el.paused && c.el.readyState >= 2) c.el.play().catch(() => undefined);
    else if (!play && !c.el.paused) c.el.pause();
  });

  return (
    <mesh ref={mesh} position={[0, 0, 0.02]} material={material}>
      <planeGeometry args={[BOARD_W, BOARD_H]} />
    </mesh>
  );
}

/**
 * A board that already carries a video map, never drawn. The loader's warm-up
 * compiles its shader, so the first clip that arrives needs no new program.
 */
const warmBoard = (() => {
  const tex = new THREE.VideoTexture(document.createElement("video"));
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
})();

export function Signs({ media, eager, detail }: { media: SignMedia[]; eager: boolean; detail: number }) {
  const n = useNodes(MODELS.sign);
  const frame = useDetail(detail)(n.SignFrame, "SignFrame");
  const frames = useRef<THREE.InstancedMesh>(null);
  const count = Math.min(SIGNS.length, media.length);

  useLayoutEffect(() => {
    const m = frames.current;
    if (!m) return;
    const d = new THREE.Object3D();
    SIGNS.slice(0, count).forEach((s, i) => {
      d.position.set(s.pos[0], terrain(s.pos[0], s.pos[2]) + SIGN_LIFT * SIGN_SCALE, s.pos[2]);
      d.rotation.set(0, s.rotY, 0);
      d.scale.setScalar(SIGN_SCALE);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [count]);
  return (
    <>
      <mesh visible={false} material={warmBoard} position={[0, -60, 0]}>
        <planeGeometry args={[0.1, 0.1]} />
      </mesh>
      {count > 0 && <instancedMesh ref={frames} args={[frame, candy, count]} />}
      {SIGNS.slice(0, media.length).map((s, i) => (
        <group
          key={i}
          position={[s.pos[0], terrain(s.pos[0], s.pos[2]) + SIGN_LIFT * SIGN_SCALE, s.pos[2]]}
          rotation={[0, s.rotY, 0]}
          scale={SIGN_SCALE}
        >
          <Board index={i} media={media[i]} eager={eager} neighbours={detail === 0} />
        </group>
      ))}
    </>
  );
}
