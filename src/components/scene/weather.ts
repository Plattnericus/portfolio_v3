import * as THREE from "three";

/**
 * One wind and one sky for the whole island. Gusts roll across the map as a
 * wave, so neighbouring flowers bend together and a gust visibly travels; fast
 * scrolling adds a breeze on top. Clouds drift overhead and their soft shadows
 * slide over grass and sand. Everything runs in shaders off three shared
 * uniforms, so it costs nothing on the CPU.
 */
export const weather = {
  uWindT: { value: 0 },
  uGust: { value: 0 },
};

let breeze = 0;
export function tickWeather(t: number, energy: number, dt: number) {
  breeze = THREE.MathUtils.damp(breeze, energy, energy > breeze ? 3 : 0.8, dt);
  weather.uWindT.value = t;
  weather.uGust.value = breeze;
}

/** Displacement in xz at a point: a travelling gust front plus a little flutter. */
export const WIND_GLSL = /* glsl */ `
uniform float uWindT;
uniform float uGust;
vec2 windAt(vec3 base) {
  float front = sin(dot(base.xz, vec2(0.075, 0.05)) - uWindT * 1.15);
  float gust = 0.35 + 0.65 * smoothstep(-0.2, 1.0, front) + uGust * 1.4;
  float flutter = sin(uWindT * 3.3 + base.x * 1.7 + base.z * 1.3) * 0.25;
  float sway = sin(uWindT * 1.6 + base.x * 0.31 + base.z * 0.27);
  return vec2(0.8, 0.45) * gust * (0.55 + 0.45 * sway + flutter);
}
`;

/** 0 = full sun, up to ~0.22 = under a cloud. */
export const CLOUD_GLSL = /* glsl */ `
float cloudShade(vec2 xz) {
  vec2 p = xz * 0.045 + vec2(uWindT * 0.035, uWindT * 0.012);
  float n = sin(p.x * 1.7 + sin(p.y * 1.3)) * sin(p.y * 1.9 + sin(p.x * 0.9) * 1.4);
  n += 0.5 * sin(p.x * 3.1 - p.y * 2.3 + 1.7);
  return smoothstep(0.45, 1.15, n) * 0.22;
}
`;

/**
 * Lets a material bend in the wind around a base height in object space:
 * nothing moves at the base, the top moves most. `k` sets the stiffness.
 */
export function windy<T extends THREE.Material>(m: T, key: string, base = 0, k = 0.12): T {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);
  const uniforms = { uWindBase: { value: base }, uWindK: { value: k } };
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    Object.assign(shader.uniforms, weather, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${WIND_GLSL}\nuniform float uWindBase;\nuniform float uWindK;`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 wBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          #else
            vec3 wBase = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          #endif
          float wh = max(0.0, transformed.y + uWindBase);
          float bend = wh * wh / (1.0 + wh) * uWindK;
          vec2 w = windAt(wBase) * bend;
          transformed.xz += w;
          transformed.y -= dot(w, w) * 0.5 / max(wh, 0.2);
        }`,
      );
  };
  m.customProgramCacheKey = () => `${prevKey()}|wind`;
  m.needsUpdate = true;
  return m;
}
