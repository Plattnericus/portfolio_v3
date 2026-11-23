"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { plant } from "./materials";
import { Crowd, bake } from "./Props";
import { useRoadGrid } from "./Nature";
import { FROG, WATER_Y, blocked, coast, isMeadow, rng, terrain } from "./layout";
import { WIND_GLSL, weather } from "./weather";
import { world } from "@/lib/world";

/* Small things that make the ground look lived in: sugar pebbles along the
   beach and the road, mushroom rings under the forest, reeds at the water. All
   built here from a few primitives and vertex colours, one instanced draw each. */

function painted(g: THREE.BufferGeometry, color: (p: THREE.Vector3) => THREE.Color) {
  const geo = g.index ? g.toNonIndexed() : g;
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) color(v.fromBufferAttribute(pos, i)).toArray(col, i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute("uv");
  return geo;
}

const C = (hex: string) => new THREE.Color(hex);

/** A smooth, slightly lumpy sugar pebble; the colour comes per instance. */
function pebbleGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const r = rng(5);
  for (let i = 0; i < p.count; i++) {
    const k = 0.88 + r() * 0.2;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.55, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const white = C("#ffffff");
  const shade = C("#e9dcea");
  return painted(g, (v) => white.clone().lerp(shade, THREE.MathUtils.smoothstep(v.y, 0.1, -0.5)));
}

/** Stem, domed cap and a few sugar dots. */
function mushroomGeometry() {
  const stem = new THREE.CylinderGeometry(0.07, 0.1, 0.32, 8, 1, true).translate(0, 0.16, 0);
  const capProfile = [0, 0.35, 0.62, 0.82, 0.95, 1].map((t) => new THREE.Vector2(Math.sin(t * Math.PI * 0.5) * 0.26, 0.3 + Math.cos(t * Math.PI * 0.5) * 0.17));
  capProfile.reverse();
  const cap = new THREE.LatheGeometry([new THREE.Vector2(0.0, 0.47), ...capProfile.slice(1), new THREE.Vector2(0.24, 0.29)], 12);
  const dots = [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const r = i === 4 ? 0 : 0.14;
    return new THREE.SphereGeometry(0.03, 6, 4).translate(Math.cos(a) * r, i === 4 ? 0.47 : 0.42, Math.sin(a) * r);
  });
  const stemC = C("#fff4e6");
  const capC = C("#ff6f95");
  const dotC = C("#ffffff");
  return mergeGeometries([
    painted(stem, () => stemC),
    painted(cap, (v) => capC.clone().lerp(C("#ffb3c8"), THREE.MathUtils.smoothstep(v.y, 0.32, 0.46) * 0.4)),
    ...dots.map((d) => painted(d, () => dotC)),
  ])!;
}

/** Three blades and a cattail, leaning out a little. */
function reedGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const green = C("#3f9e48");
  const tip = C("#a6e07a");
  for (let i = 0; i < 3; i++) {
    const h = 0.9 + i * 0.25;
    const blade = new THREE.PlaneGeometry(0.06, h, 1, 3).translate(0, h / 2, 0);
    const p = blade.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) / h;
      p.setX(k, p.getX(k) * (1 - y * 0.8) + y * y * 0.18);
    }
    blade.rotateY((i / 3) * Math.PI * 2 + 0.3).translate((i - 1) * 0.05, 0, (i % 2) * 0.04);
    parts.push(painted(blade, (v) => green.clone().lerp(tip, THREE.MathUtils.clamp(v.y / h, 0, 1))));
  }
  const stalk = new THREE.CylinderGeometry(0.012, 0.016, 1.25, 4, 1, true).translate(0.02, 0.62, 0);
  const head = new THREE.CylinderGeometry(0.045, 0.045, 0.22, 6).translate(0.02, 1.32, 0);
  parts.push(painted(stalk, () => green), painted(head, () => C("#8a4f32")));
  return mergeGeometries(parts)!;
}

const stone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
const PEBBLE_TINTS = ["#ffd1e6", "#d6ecff", "#fff1c2", "#e3d6ff", "#d8f5e4", "#ffe0cc"];

export function Details({ pebbles, mushrooms, reeds }: { pebbles: number; mushrooms: number; reeds: number }) {
  const onRoad = useRoadGrid();
  const geo = useMemo(() => ({ pebble: pebbleGeometry(), mushroom: mushroomGeometry(), reed: reedGeometry() }), []);

  const stones = useMemo(() => {
    const rand = rng(61);
    const list: { x: number; y: number; z: number; ry: number; rx: number; s: number }[] = [];
    let guard = 0;
    while (list.length < pebbles && guard++ < pebbles * 60) {
      const x = (rand() - 0.5) * 120;
      const z = -20 + (rand() - 0.5) * 110;
      const e = coast(x, z);
      const h = terrain(x, z);
      const beach = e > 0.8 && e < 0.93 && h > WATER_Y + 0.05;
      const verge = isMeadow(x, z) && onRoad(x, z, 2.2) && !onRoad(x, z, 1.25);
      if (!(beach || verge) || blocked(x, z)) continue;
      list.push({ x, y: h - 0.02, z, ry: rand() * 6.28, rx: (rand() - 0.5) * 0.3, s: 0.07 + rand() * 0.12 });
    }
    const colors = new Float32Array(list.length * 3);
    const c = new THREE.Color();
    list.forEach((_, i) => c.set(PEBBLE_TINTS[i % PEBBLE_TINTS.length]).toArray(colors, i * 3));
    return { ...bake(list), colors };
  }, [pebbles, onRoad]);

  const rings = useMemo(() => {
    const rand = rng(83);
    const list: { x: number; y: number; z: number; ry: number; s: number }[] = [];
    let guard = 0;
    while (list.length < mushrooms && guard++ < mushrooms * 80) {
      const cx = (rand() - 0.5) * 70;
      const cz = -8 - rand() * 50;
      if (!isMeadow(cx, cz) || blocked(cx, cz) || onRoad(cx, cz, 1.6)) continue;
      // a little cluster of two to four
      const n = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < n && list.length < mushrooms; k++) {
        const x = cx + (rand() - 0.5) * 0.9;
        const z = cz + (rand() - 0.5) * 0.9;
        list.push({ x, y: terrain(x, z) - 0.02, z, ry: rand() * 6.28, s: 0.7 + rand() * 0.9 });
      }
    }
    return bake(list);
  }, [mushrooms, onRoad]);

  const reedBeds = useMemo(() => {
    const rand = rng(97);
    const list: { x: number; y: number; z: number; ry: number; rx: number; rz: number; s: number }[] = [];
    let guard = 0;
    while (list.length < reeds && guard++ < reeds * 120) {
      // mostly around the frog's lagoon, the rest at the other ponds
      const lagoon = rand() < 0.6;
      const x = lagoon ? FROG.pos[0] + (rand() - 0.5) * 22 : (rand() - 0.5) * 110;
      const z = lagoon ? FROG.pos[2] + (rand() - 0.5) * 22 : -20 + (rand() - 0.5) * 100;
      const h = terrain(x, z);
      if (h < WATER_Y - 0.12 || h > WATER_Y + 0.45 || coast(x, z) > 0.78) continue;
      if (Math.hypot(x - FROG.pos[0], z - FROG.pos[2]) < 4.5) continue;
      list.push({ x, y: Math.max(h, WATER_Y) - 0.05, z, ry: rand() * 6.28, rx: (rand() - 0.5) * 0.2, rz: (rand() - 0.5) * 0.2, s: 0.8 + rand() * 0.6 });
    }
    return bake(list);
  }, [reeds]);

  return (
    <>
      {pebbles > 0 && <Crowd geometry={geo.pebble} material={stone} matrices={stones.matrices} centers={stones.centers} colors={stones.colors} />}
      {mushrooms > 0 && <Crowd geometry={geo.mushroom} material={plant} matrices={rings.matrices} centers={rings.centers} />}
      {reeds > 0 && <Crowd geometry={geo.reed} material={plant} matrices={reedBeds.matrices} centers={reedBeds.centers} />}
    </>
  );
}

/* ================================================================== petals */

const petalVert = /* glsl */ `
uniform float uPixel;
attribute vec4 aSeed;
varying float vFade;
varying float vTint;
varying float vSpin;
#include <common>
#include <fog_pars_vertex>
__WIND__
void main() {
  // each petal rides the wind across its own lane and wraps around, fading at the ends
  float life = fract(uWindT * (0.018 + aSeed.y * 0.02) * (1.0 + uGust * 1.5) + aSeed.x);
  vec3 p = position;
  p.xz += vec2(0.8, 0.45) * (life - 0.5) * 46.0;
  p.y += sin(life * 18.0 + aSeed.z * 20.0) * 0.6 - life * 1.5;
  p.x += sin(uWindT * 2.1 + aSeed.w * 30.0) * 0.25;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vFade = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.85, 1.0, life));
  vTint = aSeed.z;
  vSpin = uWindT * (2.0 + aSeed.w * 4.0) + aSeed.x * 20.0;
  gl_PointSize = uPixel * (0.7 + aSeed.y * 0.6) * 9.0 / -mvPosition.z;
  #include <fog_vertex>
}`;

const petalFrag = /* glsl */ `
varying float vFade;
varying float vTint;
varying float vSpin;
#include <common>
#include <fog_pars_fragment>
void main() {
  // a small petal that turns as it tumbles
  vec2 f = gl_PointCoord - 0.5;
  float c = cos(vSpin);
  float s = sin(vSpin);
  f = mat2(c, s, -s, c) * f;
  f.y *= 1.0 + 0.8 * abs(sin(vSpin * 0.7));
  float d = length(f * vec2(1.0, 2.1));
  if (d > 0.36) discard;
  vec3 col = mix(vec3(1.0, 0.72, 0.85), vec3(1.0, 0.96, 0.98), step(0.55, vTint));
  col = mix(col, vec3(1.0, 0.88, 0.55), step(0.9, vTint));
  gl_FragColor = vec4(col * (0.85 + 0.15 * (1.0 - d * 2.5)), vFade * 0.95);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Blossom petals carried across the island by the same wind as the flowers. */
export function Petals({ count }: { count: number }) {
  const { geometry, material } = useMemo(() => {
    const rand = rng(29);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const x = (rand() - 0.5) * 90;
      const z = -18 + (rand() - 0.5) * 80;
      pos[i * 3] = x;
      pos[i * 3 + 1] = Math.max(terrain(x, z), WATER_Y) + 1 + rand() * 5;
      pos[i * 3 + 2] = z;
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    const m = new THREE.ShaderMaterial({
      vertexShader: petalVert.replace("__WIND__", WIND_GLSL),
      fragmentShader: petalFrag,
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uPixel: { value: 1 } }]),
    });
    Object.assign(m.uniforms, weather);
    return { geometry: g, material: m };
  }, [count]);

  const points = useRef<THREE.Points>(null);
  useFrame(({ size, viewport }) => {
    const p = points.current;
    if (!p) return;
    (p.material as THREE.ShaderMaterial).uniforms.uPixel.value = (size.height * viewport.dpr) / 40;
    p.geometry.setDrawRange(0, Math.ceil(count * world.density));
  });

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}
