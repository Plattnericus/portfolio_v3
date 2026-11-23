"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useFrame } from "@react-three/fiber";
import { RAINBOW, ROAD, WATER_Y, coast, isMeadow, rng, smooth, terrain } from "./layout";
import { world } from "@/lib/world";
import { CLOUD_GLSL, WIND_GLSL, weather } from "./weather";

/* ================================================================== sky */

export const SUN_DIR = new THREE.Vector3(0.18, 0.12, -1).normalize();

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uRay;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uDisco;
varying vec3 vDir;

vec3 hue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(-0.03, 0.22, h));
  col = mix(col, uZenith, smoothstep(0.22, 0.85, h));

  float ang = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
  vec3 sx = normalize(cross(vec3(0.0, 1.0, 0.0), uSunDir));
  vec3 sy = cross(uSunDir, sx);
  float a = atan(dot(d, sy), dot(d, sx));
  float spin = uTime * (0.006 + uDisco * 0.25);
  float rays = step(0.5, fract(a / 6.2831853 * 16.0 + spin));
  vec3 rayCol = mix(uRay, hue(a / 6.2831853 + uTime * 0.2), uDisco);
  col = mix(col, rayCol, rays * smoothstep(1.2, 0.12, ang) * (0.07 + uDisco * 0.45));
  col = mix(col, uSun, smoothstep(0.55, 0.0, ang) * 0.38);
  col = mix(col, uSun, smoothstep(0.09, 0.085, ang));
  col = mix(col, col * hue(uTime * 0.15 + h) * 1.4, uDisco * 0.35);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function Sky() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color("#4ea6ff") },
          uMid: { value: new THREE.Color("#a3dbff") },
          uHorizon: { value: new THREE.Color("#ffd6c4") },
          uSun: { value: new THREE.Color("#fff3d1") },
          uRay: { value: new THREE.Color("#fff0c4") },
          uSunDir: { value: SUN_DIR },
          uTime: { value: 0 },
          uDisco: { value: 0 },
        },
      }),
    [],
  );
  useFrame(({ camera, clock }) => {
    const m = mesh.current;
    if (!m) return;
    m.position.copy(camera.position);
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uDisco.value = world.fx.disco;
  });
  return (
    <mesh ref={mesh} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[400, 48, 24]} />
    </mesh>
  );
}

/* ================================================================== island ground */

const AREA = { x0: -86, z0: -102, w: 172, h: 164 };

export function Island({ detail }: { detail: number }) {
  const geometry = useMemo(() => {
    const segX = detail;
    const segZ = Math.round(detail * (AREA.h / AREA.w));
    const g = new THREE.PlaneGeometry(AREA.w, AREA.h, segX, segZ);
    g.rotateX(-Math.PI / 2);
    g.translate(AREA.x0 + AREA.w / 2, 0, AREA.z0 + AREA.h / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const grassA = new THREE.Color("#3da94a");
    const grassB = new THREE.Color("#86d65c");
    const grassC = new THREE.Color("#2f8f45");
    const sand = new THREE.Color("#ffe1c4");
    const sandPink = new THREE.Color("#ffc9cf");
    const tmp = new THREE.Color();
    const tmp2 = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrain(x, z);
      pos.setY(i, h);
      const e = coast(x, z);
      const n = 0.5 + 0.5 * Math.sin(x * 0.31 + Math.cos(z * 0.27) * 2.1) * Math.cos(z * 0.19 - x * 0.07);
      tmp.copy(grassA).lerp(grassB, n * 0.8);
      if (0.5 + 0.5 * Math.sin(x * 0.05 - z * 0.04) > 0.72) tmp.lerp(grassC, 0.35);
      tmp.lerp(tmp2.set("#c9e86a"), smooth(2.5, 6, h) * 0.45);
      const sandy = Math.max(smooth(0.83, 0.9, e), smooth(0.2, -0.2, h));
      tmp2.copy(sand).lerp(sandPink, 0.5 + 0.5 * Math.sin(x * 0.4 + z * 0.3));
      tmp.lerp(tmp2, sandy);
      tmp.toArray(colors, i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [detail]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    // soft cloud shadows drift across the ground
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, weather);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vGround;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nvarying vec3 vGround;\nuniform float uWindT;\n${CLOUD_GLSL}`)
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          // the sea floor is tinted per pixel, so the waterline is smooth instead of following the mesh
          float wet = smoothstep(${(WATER_Y + 0.04).toFixed(2)}, ${(WATER_Y - 0.22).toFixed(2)}, vGround.y);
          vec3 floorCol = mix(vec3(0.21, 0.81, 0.67), vec3(0.02, 0.34, 0.58), smoothstep(${(WATER_Y - 0.25).toFixed(2)}, -5.0, vGround.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, floorCol, wet);
          diffuseColor.rgb *= 1.0 - cloudShade(vGround.xz) * (1.0 - wet);`,
        );
    };
    m.customProgramCacheKey = () => "island-clouds";
    return m;
  }, []);
  return <mesh geometry={geometry} material={material} />;
}

/** Terrain heights packed into a texture for the water shader (depth, foam). */
/**
 * Terrain under the water for the sea shader: R = ground height (half float,
 * so shallow water has no contour steps), G = how much a spot is an inland
 * pond rather than open sea (ponds get calm water and their own colour).
 */
function useHeightTexture() {
  return useMemo(() => {
    // half floats remove the contour steps; 256 texels are plenty once they are smooth
    const N = 256;
    const data = new Uint16Array(N * N * 2);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = AREA.x0 + (i / (N - 1)) * AREA.w;
        const z = AREA.z0 + (j / (N - 1)) * AREA.h;
        const k = (j * N + i) * 2;
        data[k] = THREE.DataUtils.toHalfFloat(terrain(x, z));
        data[k + 1] = THREE.DataUtils.toHalfFloat(smooth(0.86, 0.74, coast(x, z)));
      }
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGFormat, THREE.HalfFloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, []);
}

/* ================================================================== sea */

const SEA_COMMON = /* glsl */ `
uniform float uTime;
uniform float uWater;
uniform sampler2D uHeight;
uniform vec4 uRect;
// ground height and pond mask at a world position; open sea outside the map
vec2 seabed(vec2 xz) {
  vec2 uv = (xz - uRect.xy) / uRect.zw;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec2(-12.0, 0.0);
  return texture2D(uHeight, uv).rg;
}
void addWave(vec2 p, vec2 d, float f, float a, float s, inout float h, inout vec2 g) {
  float ph = dot(d, p) * f + uTime * s;
  h += a * sin(ph);
  g += a * f * cos(ph) * d;
}
`;

const seaVert = /* glsl */ `
${SEA_COMMON}
varying vec3 vWorld;
varying vec2 vBed;
#include <common>
#include <fog_pars_vertex>

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 bed = seabed(wp.xz);
  // only long swells move the surface; the small waves are drawn per pixel
  float h = 0.0;
  vec2 g = vec2(0.0);
  addWave(wp.xz, normalize(vec2(1.0, 0.3)), 0.3, 0.16, 1.0, h, g);
  addWave(wp.xz, normalize(vec2(-0.4, 1.0)), 0.47, 0.07, 1.4, h, g);
  // calm in the ponds, and the swell dies out where the water gets shallow
  wp.y += h * (1.0 - bed.y * 0.9) * smoothstep(0.0, 1.4, uWater - bed.x + 0.3);
  vWorld = wp.xyz;
  vBed = bed;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const seaFrag = /* glsl */ `
${SEA_COMMON}
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uShallow;
uniform vec3 uPond;
uniform vec3 uPondDeep;
uniform vec3 uFoam;
uniform vec3 uSky;
uniform vec3 uSunDir;
varying vec3 vWorld;
varying vec2 vBed;
#include <common>
#include <fog_pars_fragment>

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 q = vWorld.xz;
  vec2 bed = seabed(q);
  float depth = uWater - bed.x;
  float pond = bed.y;

  // surface normal: the same swells as the vertices plus finer waves, all analytic, so nothing aliases
  float h = 0.0;
  vec2 g = vec2(0.0);
  addWave(q, normalize(vec2(1.0, 0.3)), 0.3, 0.16, 1.0, h, g);
  addWave(q, normalize(vec2(-0.4, 1.0)), 0.47, 0.07, 1.4, h, g);
#ifndef LOW
  addWave(q, normalize(vec2(0.7, -0.8)), 0.9, 0.04, 2.2, h, g);
  addWave(q, normalize(vec2(-1.0, -0.2)), 1.7, 0.02, 2.9, h, g);
  addWave(q, normalize(vec2(0.2, 1.0)), 2.9, 0.009, 3.7, h, g);
#endif
  g *= mix(1.0, 0.18, pond);
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWorld);

  // open sea: deep blue to turquoise over the sand; ponds: clear green-teal
  vec3 sea = mix(uDeep, uMid, smoothstep(10.0, 2.5, depth));
  sea = mix(sea, uShallow, smoothstep(2.4, 0.15, depth));
  vec3 lake = mix(uPondDeep, uPond, smoothstep(1.8, 0.1, depth));
  vec3 col = mix(sea, lake, pond);
#ifndef LOW
  float c = vnoise(q * 2.2 + uTime * 0.6) * vnoise(q * 3.1 - uTime * 0.45);
  col += smoothstep(0.22, 0.5, c) * 0.24 * smoothstep(3.0, 0.2, depth) * (1.0 - pond * 0.5);
#endif

  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col = mix(col, uSky, fres * 0.5);
  vec3 H = normalize(uSunDir + V);
  col += pow(max(dot(N, H), 0.0), 180.0) * 1.2;

  // surf on the beach, a thin soft rim at the ponds
  float n = vnoise(q * 1.6 + vec2(uTime * 0.3, -uTime * 0.2));
  float edge = depth - 0.12 * sin(uTime * 1.2 + n * 6.0) * (1.0 - pond);
  float surf = smoothstep(0.38, 0.0, edge) + smoothstep(0.72, 0.58, edge) * smoothstep(0.46, 0.6, edge) * 0.55;
  float rim = smoothstep(0.16, 0.0, depth) * 0.6;
  col = mix(col, uFoam, clamp(mix(surf * 0.9, rim, pond), 0.0, 1.0));

#ifndef LOW
  vec2 cell = floor(q * 2.2);
  float r = h21(cell);
  float tw = sin(uTime * (2.0 + r * 4.0) + r * 40.0);
  vec2 f = fract(q * 2.2) - 0.5;
  float star = max(0.0, 1.0 - (abs(f.x) * abs(f.y) * 140.0 + length(f) * 3.2));
  col += step(0.982, r) * smoothstep(0.55, 1.0, tw) * star * 1.6 * (1.0 - pond * 0.7);
#endif

  float alpha = mix(0.5, 0.97, smoothstep(0.0, 3.2, depth));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function Sea({ segments, low }: { segments: number; low: boolean }) {
  const height = useHeightTexture();
  const mesh = useRef<THREE.Mesh>(null);
  const { geometry, material } = useMemo(() => {
    // dense around the island, sparse towards the horizon: x = 450 * (0.35u + 0.65u^3)
    const g = new THREE.PlaneGeometry(2, 2, segments, segments);
    const p = g.attributes.position;
    const warp = (u: number) => 450 * (0.35 * u + 0.65 * u * u * u);
    for (let i = 0; i < p.count; i++) p.setXY(i, warp(p.getX(i)), warp(p.getY(i)));
    g.rotateX(-Math.PI / 2);
    g.computeBoundingSphere();
    const m = new THREE.ShaderMaterial({
      vertexShader: seaVert,
      fragmentShader: seaFrag,
      transparent: true,
      fog: true,
      defines: low ? { LOW: "" } : {},
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uHeight: { value: null },
          uRect: { value: new THREE.Vector4(AREA.x0, AREA.z0, AREA.w, AREA.h) },
          uDeep: { value: new THREE.Color("#1a64d6") },
          uMid: { value: new THREE.Color("#22a6ff") },
          uShallow: { value: new THREE.Color("#7ff3e4") },
          uPond: { value: new THREE.Color("#9ff0d6") },
          uPondDeep: { value: new THREE.Color("#2fb7b0") },
          uFoam: { value: new THREE.Color("#ffffff") },
          uSky: { value: new THREE.Color("#cdeaff") },
          uSunDir: { value: SUN_DIR },
          uTime: { value: 0 },
          uWater: { value: WATER_Y },
        },
      ]),
    });
    return { geometry: g, material: m };
  }, [segments, low]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value = clock.elapsedTime;
    if (u.uHeight.value !== height) u.uHeight.value = height;
  });

  return (
    <mesh ref={mesh} geometry={geometry} material={material} position={[0, WATER_Y, -20]} renderOrder={2} />
  );
}

/* ================================================================== grass */

const grassVert = /* glsl */ `
attribute vec3 aOffset;
attribute vec4 aParams;
varying float vH;
varying float vHue;
varying vec2 vGround;
#include <common>
#include <fog_pars_vertex>
${WIND_GLSL}
void main() {
  float t = position.y;
  vec3 p = vec3(position.x * aParams.y, t * aParams.x, 0.0);
  float c = cos(aParams.z);
  float s = sin(aParams.z);
  p = vec3(p.x * c, p.y, p.x * s);
  // the same gusts that move the flowers roll over the lawn
  vec2 w = windAt(aOffset) * 0.55 * t * t * aParams.x;
  p.xz += w;
  p.y -= dot(w, w) * 0.4;
  vec4 mvPosition = modelViewMatrix * vec4(p + aOffset, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vH = t;
  vHue = aParams.w;
  vGround = aOffset.xz;
  #include <fog_vertex>
}`;

const grassFrag = /* glsl */ `
uniform float uWindT;
varying vec2 vGround;
${CLOUD_GLSL}
uniform vec3 uBase;
uniform vec3 uTipA;
uniform vec3 uTipB;
uniform vec3 uTipC;
varying float vH;
varying float vHue;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec3 tip = mix(uTipA, uTipB, vHue);
  tip = mix(tip, uTipC, step(0.93, vHue));
  vec3 col = mix(uBase, tip, smoothstep(0.0, 0.95, vH));
  col *= (0.72 + 0.28 * vH) * (1.0 - cloudShade(vGround));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Road samples on a coarse grid, for "is this spot on the road?" lookups. */
export function useRoadGrid() {
  return useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(ROAD.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
    const pts = curve.getSpacedPoints(Math.round(curve.getLength() / 0.5));
    const grid = new Map<string, THREE.Vector3[]>();
    for (const p of pts) {
      const k = `${Math.floor(p.x / 2)}:${Math.floor(p.z / 2)}`;
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(p);
    }
    return (x: number, z: number, r: number) => {
      const cx = Math.floor(x / 2);
      const cz = Math.floor(z / 2);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (const p of grid.get(`${cx + i}:${cz + j}`) ?? []) if (Math.hypot(p.x - x, p.z - z) < r) return true;
      return false;
    };
  }, []);
}

export function Grass({ count }: { count: number }) {
  const onRoad = useRoadGrid();
  const mesh = useRef<THREE.Mesh>(null);
  const { geometry, material } = useMemo(() => {
    const rows = 4;
    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < rows; i++) {
      const y = i / rows;
      const hw = 0.5 * Math.pow(1 - y, 0.75);
      verts.push(-hw, y, 0, hw, y, 0);
    }
    verts.push(0, 1, 0);
    for (let i = 0; i < rows - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    idx.push((rows - 1) * 2, (rows - 1) * 2 + 1, rows * 2);

    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);

    const rand = rng(42);
    const offsets = new Float32Array(count * 3);
    const params = new Float32Array(count * 4);
    let n = 0;
    let guard = 0;
    while (n < count && guard++ < count * 6) {
      const pick = rand();
      let x: number;
      let z: number;
      if (pick < 0.45) {
        const r = Math.sqrt(rand()) * 16;
        const a = rand() * Math.PI * 2;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r * 0.9 - 1;
      } else if (pick < 0.75) {
        x = (rand() - 0.5) * 20;
        z = -6 - rand() * 46;
      } else {
        x = (rand() - 0.5) * 120;
        z = -20 + (rand() - 0.5) * 110;
      }
      if (!isMeadow(x, z) || onRoad(x, z, 1.0)) continue;
      offsets[n * 3] = x;
      offsets[n * 3 + 1] = terrain(x, z) - 0.02;
      offsets[n * 3 + 2] = z;
      params[n * 4] = 0.32 + rand() * 0.45;
      params[n * 4 + 1] = 0.05 + rand() * 0.05;
      params[n * 4 + 2] = rand() * Math.PI;
      params[n * 4 + 3] = rand();
      n++;
    }
    g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
    g.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 4));
    g.instanceCount = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -20), 90);

    const m = new THREE.ShaderMaterial({
      vertexShader: grassVert,
      fragmentShader: grassFrag,
      side: THREE.DoubleSide,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uBase: { value: new THREE.Color("#1f7a34") },
          uTipA: { value: new THREE.Color("#9be36a") },
          uTipB: { value: new THREE.Color("#c9f07a") },
          uTipC: { value: new THREE.Color("#ff9fd0") },
        },
      ]),
    });
    // shared by reference, so one tick moves every blade with the rest of the island
    Object.assign(m.uniforms, weather);
    return { geometry: g, material: m };
  }, [count, onRoad]);

  const planted = geometry.instanceCount;
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    // blades were scattered in random order, so drawing fewer thins the lawn evenly
    (m.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.ceil(planted * world.density);
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />;
}

/* ================================================================== candy road */

const roadFrag = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
#include <common>
#include <fog_pars_fragment>
vec3 tile(float i) {
  float k = mod(i, 6.0);
  if (k < 1.0) return vec3(1.0, 0.42, 0.62);
  if (k < 2.0) return vec3(1.0, 0.86, 0.38);
  if (k < 3.0) return vec3(0.52, 0.86, 1.0);
  if (k < 4.0) return vec3(0.62, 0.95, 0.66);
  if (k < 5.0) return vec3(0.8, 0.66, 1.0);
  return vec3(1.0, 0.7, 0.45);
}
void main() {
  float i = floor(vUv.y / 1.3);
  float f = fract(vUv.y / 1.3);
  vec3 col = pow(tile(i), vec3(2.2));
  float edge = smoothstep(0.08, 0.0, min(vUv.x, 1.0 - vUv.x));
  float seam = smoothstep(0.06, 0.0, min(f, 1.0 - f));
  col = mix(col, vec3(1.0), max(edge, seam) * 0.85);
  col *= 0.88 + 0.12 * sin(vUv.x * 3.14159);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const roadVert = /* glsl */ `
varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export function Road() {
  const { geometry, material } = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(ROAD.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
    const L = curve.getLength();
    const n = Math.round(L / 0.35);
    const pts = curve.getSpacedPoints(n);
    const W = 0.8;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const p = pts[i];
      const t = curve.getTangentAt(i / n);
      const sx = -t.z;
      const sz = t.x;
      for (const side of [-1, 1]) {
        const x = p.x + sx * W * side;
        const z = p.z + sz * W * side;
        pos.push(x, Math.max(terrain(x, z), WATER_Y + 0.12) + 0.16, z);
        uv.push(side < 0 ? 0 : 1, (i / n) * L);
      }
      if (i < n) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.ShaderMaterial({
      vertexShader: roadVert,
      fragmentShader: roadFrag,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    });
    return { geometry: g, material: m };
  }, []);
  return <mesh geometry={geometry} material={material} />;
}

/* ================================================================== sparkles */

const sparkVert = /* glsl */ `
uniform float uTime;
uniform float uPixel;
attribute float aSeed;
varying float vSeed;
varying float vTw;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  p.y += sin(uTime * 0.4 + aSeed * 30.0) * 0.4;
  p.x += sin(uTime * 0.23 + aSeed * 17.0) * 0.3;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vTw = 0.5 + 0.5 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 50.0);
  vSeed = aSeed;
  gl_PointSize = uPixel * (0.4 + vTw) * 14.0 / -mvPosition.z;
  #include <fog_vertex>
}`;

const sparkFrag = /* glsl */ `
varying float vSeed;
varying float vTw;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 f = gl_PointCoord - 0.5;
  float star = 1.0 - (abs(f.x) * abs(f.y) * 90.0 + length(f) * 2.2);
  if (star <= 0.0) discard;
  vec3 tint = mix(vec3(1.0), mix(vec3(1.0, 0.75, 0.9), vec3(0.75, 0.9, 1.0), step(0.5, vSeed)), 0.6);
  gl_FragColor = vec4(tint, clamp(star * 1.6, 0.0, 1.0) * vTw);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function Sparkles({ count }: { count: number }) {
  const mesh = useRef<THREE.Points>(null);
  const { geometry, material } = useMemo(() => {
    const rand = rng(77);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const sea = i % 3 === 0;
      const x = sea ? 40 + rand() * 50 : (rand() - 0.5) * 110;
      const z = sea ? -25 + rand() * 50 : -20 + (rand() - 0.5) * 100;
      const base = Math.max(terrain(x, z), WATER_Y);
      pos[i * 3] = x;
      pos[i * 3 + 1] = base + 0.6 + Math.pow(rand(), 2) * 14;
      pos[i * 3 + 2] = z;
      seed[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: sparkVert,
      fragmentShader: sparkFrag,
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uPixel: { value: 1 } }]),
    });
    return { geometry: g, material: m };
  }, [count]);

  useFrame(({ clock, size, viewport }) => {
    const m = mesh.current;
    if (!m) return;
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uPixel.value = (size.height * viewport.dpr) / 40;
    m.geometry.setDrawRange(0, Math.ceil(count * world.density));
  });

  return <points ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}

/* ================================================================== rainbow */

const RAINBOW_COLORS = ["#ff4d6d", "#ff9f1c", "#ffe14d", "#4fd27a", "#38a3ff", "#6a5cff", "#b46bff"];

/** All seven bands in one mesh, coloured per vertex, glowing a little in their own colour. */
export function Rainbow() {
  const { geometry, material } = useMemo(() => {
    const parts = RAINBOW_COLORS.map((hex, i) => {
      const radius = RAINBOW.radius - i * RAINBOW.band * 1.02;
      const g = new THREE.TorusGeometry(radius, RAINBOW.band * 0.56, 12, 160, Math.PI);
      const c = new THREE.Color(hex);
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < g.attributes.position.count; k++) c.toArray(col, k * 3);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return g;
    });
    const merged = mergeGeometries(parts)!;
    parts.forEach((g) => g.dispose());
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 });
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * 0.55;",
      );
    };
    m.customProgramCacheKey = () => "rainbow-glow";
    return { geometry: merged, material: m };
  }, []);
  return <mesh geometry={geometry} material={material} position={RAINBOW.pos} rotation={[0, -0.08, 0]} />;
}
