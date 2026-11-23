import * as THREE from "three";
import { windy } from "./weather";

const FULL = new Map<THREE.MeshPhysicalMaterial, { clearcoat: number; sheen: number }>();
const SHINY = new Set<THREE.MeshPhysicalMaterial>();

/** Hard candy: vertex-coloured, lacquered, with a thin-film rainbow sheen on capable devices. */
export const candy = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.26,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
});

/** Soft vinyl-toy look for the unicorn, hamster and smiley. */
export const toy = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.5,
  metalness: 0,
  sheen: 0.7,
  sheenRoughness: 0.45,
  sheenColor: new THREE.Color("#ffe3f0"),
  clearcoat: 0.25,
  clearcoatRoughness: 0.4,
});

/** Wet and shiny, for the frog. */
export const glossy = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.18,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
});

/** Dolphins, fish and coral. */
export const marine = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.3,
  metalness: 0,
  clearcoat: 0.8,
  clearcoatRoughness: 0.1,
});

export const plant = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, side: THREE.DoubleSide });

export const cloud = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1,
  emissive: new THREE.Color("#ffffff"),
  emissiveIntensity: 0.32,
});

export const wing = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.5,
  side: THREE.DoubleSide,
  emissive: new THREE.Color("#ff9fd0"),
  emissiveIntensity: 0.15,
});

/** Sugar-coated gumdrops. Colour comes from instanceColor. */
export const sugar = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.62,
  sheen: 1,
  sheenRoughness: 0.3,
  sheenColor: new THREE.Color("#ffffff"),
  clearcoat: 0.4,
  clearcoatRoughness: 0.35,
});

/** Candy-cane stripes painted in object space, for the 3D letters. */
export const striped = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.22,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
});
striped.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float band = abs(fract((vObj.x * 0.9 + vObj.y) * 1.6) - 0.5) * 2.0;
      float stripe = smoothstep(0.46, 0.54, band);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.97, 0.95), stripe * 0.82);`,
    );
};
striped.customProgramCacheKey = () => "striped-candy";

/** Bird material: the wings flap in the vertex shader, so a whole flock is one draw call. */
export const flapping = toy.clone();
const flapTime = { value: 0 };
flapping.onBeforeCompile = (shader) => {
  shader.uniforms.uFlap = flapTime;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nuniform float uFlap;")
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float seed = float(gl_InstanceID) * 1.7;
      #else
        float seed = 0.0;
      #endif
      float span = max(0.0, abs(transformed.z) - 0.035);
      transformed.y += sin(uFlap * 15.0 + seed) * span * 1.15;`,
    );
};
flapping.customProgramCacheKey = () => "flapping-bird";
export function tickFlap(t: number) {
  flapTime.value = t;
}

/**
 * Light lollipop LOD: the geometry is a plain domed disc and the rope swirl is
 * drawn per pixel, so it stays crisp at any distance for ~1k triangles.
 */
function swirl(palette: string[], key: string) {
  const m = candy.clone();
  const colors = palette.map((c) => new THREE.Color(c));
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSwirl = { value: colors };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        #define SWIRL_N ${colors.length}
        uniform vec3 uSwirl[SWIRL_N];
        varying vec3 vObj;
        vec3 swirlPick(float k) {
          vec3 c = uSwirl[0];
          for (int i = 1; i < SWIRL_N; i++) if (float(i) == k) c = uSwirl[i];
          return c;
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float rr = length(vObj.xy);
        if (abs(vObj.z) > 0.05 && rr < 0.925) {
          float u = atan(vObj.y, vObj.x) / 6.2831853 + rr * 2.4;
          float f = fract(u) * float(SWIRL_N);
          float rope = sin(fract(f) * 3.14159);
          vec3 c = swirlPick(floor(f));
          c = mix(c, vec3(1.0), smoothstep(0.82, 1.0, rope) * 0.22);
          c *= mix(0.7, 1.0, smoothstep(0.0, 0.4, rope));
          diffuseColor.rgb = c;
        } else if (rr > 0.89 && (vObj.y > -0.9 || abs(vObj.x) > 0.06)) {
          float a = atan(vObj.y, vObj.x) / 6.2831853;
          diffuseColor.rgb = swirlPick(mod(floor(a * 20.0 + 20.0), float(SWIRL_N)));
        }`,
      );
  };
  m.customProgramCacheKey = () => `swirl-${key}`;
  return m;
}

export const swirlRainbow = swirl(["#ff3d6e", "#ff8a1f", "#ffd23b", "#3fcf74", "#2f9bff", "#9a5cff"], "rainbow");
export const swirlPastel = swirl(["#ff8fc7", "#ffb48a", "#ffe27a", "#8ef0b8", "#8ccfff", "#b99cff"], "pastel");
export const swirlSun = swirl(["#ffcf3f", "#fff3d6", "#ff9a2e", "#ffe27a", "#ff6f5e", "#fff3d6"], "sun");

for (const m of [candy, toy, glossy, marine, striped, sugar, flapping, swirlRainbow, swirlPastel, swirlSun])
  FULL.set(m, { clearcoat: m.clearcoat, sheen: m.sheen });
for (const m of [candy, marine, glossy]) SHINY.add(m);

/**
 * The same look for single, non-instanced meshes. three keeps a separate
 * program per instancing mode and re-derives it whenever one material is drawn
 * in both modes, which costs work and garbage on every draw call. So the
 * shared materials above are only ever used by instanced meshes, and single
 * meshes get these twins.
 */
function solo(m: THREE.MeshPhysicalMaterial) {
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  FULL.set(c, { clearcoat: c.clearcoat, sheen: c.sheen });
  if (SHINY.has(m)) SHINY.add(c);
  return c;
}

export const candySolo = solo(candy);
export const marineSolo = solo(marine);
export const swirlRainbowSolo = solo(swirlRainbow);
export const swirlPastelSolo = solo(swirlPastel);
export const swirlSunSolo = solo(swirlSun);

/* ================================================================== wind */

// meadow plants bend in the wind (instanced only: flowers, bushes, palms, reeds)
windy(plant, "plant", 0, 0.12);

/** Forest candy on sticks: the stick is planted `base` below the model origin. */
function grove(m: THREE.MeshPhysicalMaterial, base: number, k: number) {
  return windy(solo(m), "grove", base, k);
}

export const groveLolli = grove(candy, 3.4, 0.035);
export const groveTwist = grove(candy, 1.8, 0.035);
export const groveCotton = grove(candy, 0, 0.03);
export const groveSwirlRainbow = grove(swirlRainbow, 3.4, 0.035);
export const groveSwirlPastel = grove(swirlPastel, 3.4, 0.035);
export const groveSwirlSun = grove(swirlSun, 3.4, 0.035);


/* ================================================================== character deformer */

/**
 * Squash, stretch, bend, twist and jelly for a whole character, applied in the
 * vertex shader around the character's feet. Every part of a character shares
 * one set of uniforms, so a bend runs through body, limbs and hat alike.
 */
export type Deform = {
  origin: THREE.Vector3;
  basis: THREE.Matrix3;
  /** squash (-) / stretch (+), bend x, bend z, twist */
  def: THREE.Vector4;
  /** jelly amplitude, phase */
  wob: THREE.Vector2;
  height: number;
};

export function makeDeform(height: number): Deform {
  return { origin: new THREE.Vector3(), basis: new THREE.Matrix3(), def: new THREE.Vector4(), wob: new THREE.Vector2(), height };
}

const DEFORM_VERT = `
vec4 dW = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  dW = instanceMatrix * dW;
#endif
dW = modelMatrix * dW;
vec3 dL = ( dW.xyz - uDOrigin ) * uDBasis;
float dh = clamp( dL.y / uDH, 0.0, 1.6 );
float dS = 1.0 + uDef.x;
dL.y *= dS;
dL.xz *= inversesqrt( max( dS, 0.3 ) );
float dA = uDef.w * dh;
float dc = cos( dA );
float ds = sin( dA );
dL.xz = mat2( dc, ds, -ds, dc ) * dL.xz;
dL.x += ( uDef.y * dh * dh + uDWob.x * sin( dh * 5.0 + uDWob.y ) * dh ) * uDH;
dL.z += uDef.z * dh * dh * uDH;
dW.xyz = uDOrigin + uDBasis * dL;
vec4 mvPosition = viewMatrix * dW;
gl_Position = projectionMatrix * mvPosition;
`;

/** A copy of `base` that bends with `d`. Same lighting model, its own program. */
export function deformable(base: THREE.MeshPhysicalMaterial, d: Deform, key: string) {
  const m = base.clone();
  const uniforms = {
    uDOrigin: { value: d.origin },
    uDBasis: { value: d.basis },
    uDef: { value: d.def },
    uDWob: { value: d.wob },
    uDH: { value: d.height },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uDOrigin;\nuniform mat3 uDBasis;\nuniform vec4 uDef;\nuniform vec2 uDWob;\nuniform float uDH;",
      )
      .replace("#include <project_vertex>", DEFORM_VERT);
  };
  m.customProgramCacheKey = () => `deform-${key}`;
  FULL.set(m, { clearcoat: m.clearcoat, sheen: m.sheen });
  if (base === candy || base === glossy || base === marine) SHINY.add(m);
  return m;
}

/**
 * Lite drops the extra BRDF lobes (clearcoat, sheen, thin film) for weak GPUs;
 * full brings them back, with the shimmer only where it is affordable.
 * Called once, before anything compiles: flipping these later would rebuild
 * every shader mid-scroll, which is exactly the stutter this avoids.
 */
export function tuneMaterials(lite: boolean, shine: boolean) {
  for (const [m, full] of FULL) {
    m.clearcoat = lite ? 0 : full.clearcoat;
    m.sheen = lite ? 0 : full.sheen;
    m.needsUpdate = true;
  }
  for (const m of SHINY) {
    m.iridescence = !lite && shine ? 0.35 : 0;
    m.iridescenceIOR = 1.35;
    m.iridescenceThicknessMinimum = 180;
    m.iridescenceThicknessMaximum = 520;
    m.needsUpdate = true;
  }
}
