"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { ZONES, terrain } from "./layout";

const ZONE_LIST = Object.values(ZONES);
const ROW = 128;

/** All place names on one canvas, one row each. */
function makeAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = ROW * ZONE_LIST.length;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const rects = ZONE_LIST.map(() => ({ u0: 0, u1: 1, v0: 0, v1: 1, aspect: 4 }));
  return { canvas, texture, rects };
}

function drawAtlas(atlas: ReturnType<typeof makeAtlas>) {
  const ctx = atlas.canvas.getContext("2d");
  if (!ctx) return;
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-fredoka").trim() || "system-ui";
  ctx.clearRect(0, 0, atlas.canvas.width, atlas.canvas.height);
  ctx.font = `700 76px ${family}`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ZONE_LIST.forEach((z, i) => {
    const y = i * ROW + ROW / 2;
    const w = Math.min(atlas.canvas.width - 40, ctx.measureText(z.label).width);
    const x = 20;
    // a soft dark edge so the cream reads on grass, sand and sea alike
    ctx.lineWidth = 14;
    ctx.strokeStyle = "rgba(42, 21, 32, 0.38)";
    ctx.strokeText(z.label, x, y + 4);
    ctx.fillStyle = "#fff6e6";
    ctx.fillText(z.label, x, y);
    const r = atlas.rects[i];
    r.u0 = 0;
    r.u1 = (w + 40) / atlas.canvas.width;
    r.v0 = 1 - (i + 1) / ZONE_LIST.length;
    r.v1 = 1 - i / ZONE_LIST.length;
    r.aspect = (w + 40) / ROW;
  });
  atlas.texture.needsUpdate = true;
}

const vert = /* glsl */ `
attribute vec4 aRect;
attribute float aAspect;
varying vec2 vUv;
void main() {
  // billboard: the quad is laid out in view space around the instance's position
  vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(instanceMatrix[0].xyz);
  centre.xy += vec2(position.x * aAspect, position.y) * s;
  gl_Position = projectionMatrix * centre;
  vUv = vec2(mix(aRect.x, aRect.y, uv.x), mix(aRect.z, aRect.w, uv.y));
}`;

const frag = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.02) discard;
  gl_FragColor = c;
  #include <colorspace_fragment>
}`;

/**
 * The place names grow out of the island when the camera rises into map view,
 * one after another with a little bounce, and sink back when it comes down.
 * One instanced draw for all of them.
 */
export function MapLabels() {
  const atlas = useMemo(() => makeAtlas(), []);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const springs = useRef(ZONE_LIST.map(() => ({ x: 0, v: 0, delay: 0 })));
  const was = useRef(false);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const { geometry, material } = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    const rect = new Float32Array(ZONE_LIST.length * 4);
    const aspect = new Float32Array(ZONE_LIST.length);
    g.setAttribute("aRect", new THREE.InstancedBufferAttribute(rect, 4));
    g.setAttribute("aAspect", new THREE.InstancedBufferAttribute(aspect, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      uniforms: { uMap: { value: atlas.texture } },
    });
    return { geometry: g, material: m };
  }, [atlas]);

  useEffect(() => {
    const paint = () => {
      drawAtlas(atlas);
      const m = mesh.current;
      if (!m) return;
      const rect = m.geometry.getAttribute("aRect") as THREE.InstancedBufferAttribute;
      const aspect = m.geometry.getAttribute("aAspect") as THREE.InstancedBufferAttribute;
      atlas.rects.forEach((r, i) => {
        rect.setXYZW(i, r.u0, r.u1, r.v0, r.v1);
        aspect.setX(i, r.aspect);
      });
      rect.needsUpdate = true;
      aspect.needsUpdate = true;
    };
    paint();
    // redraw once the display face has arrived
    document.fonts?.ready.then(paint);
  }, [atlas]);

  useFrame(({ camera, clock }, dt) => {
    const m = mesh.current;
    if (!m) return;
    const up = camera.position.y > 30;
    const t = clock.elapsedTime;
    if (up !== was.current) {
      was.current = up;
      springs.current.forEach((s, i) => (s.delay = up ? t + 0.15 + i * 0.12 : t));
    }
    const h = Math.min(dt, 1 / 30);
    let any = false;
    ZONE_LIST.forEach((z, i) => {
      const s = springs.current[i];
      const target = up && t >= s.delay ? 1 : 0;
      s.v += ((target - s.x) * 140 - s.v * (target ? 9 : 16)) * h;
      s.x += s.v * h;
      if (s.x < 0.001 && !target) s.x = 0;
      any ||= s.x > 0.001;
      const ground = Math.max(terrain(z.pos[0], z.pos[2]), -0.35);
      // rises out of the ground as it grows
      dummy.position.set(z.pos[0], ground + (z.pos[1] + 2.6) * Math.min(1, Math.max(0, s.x)), z.pos[2]);
      dummy.scale.setScalar(Math.max(0, s.x) * 3.4);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.visible = any;
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, ZONE_LIST.length]} frustumCulled={false} renderOrder={5} />;
}
