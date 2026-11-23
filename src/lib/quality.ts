export type Tier = "high" | "mid" | "low";

export const BUDGET = {
  high: {
    grass: 90000,
    flowers: 900,
    lollis: 64,
    pastel: 34,
    sunny: 40,
    twists: 18,
    trees: 12,
    bushes: 46,
    marshmallows: 36,
    bunnies: 14,
    sheep: 9,
    ducks: 8,
    birds: 22,
    butterflies: 12,
    sparkles: 1400,
    gumdrops: 22,
    fish: 26,
    dolphins: 5,
    flatLollis: false,
    lod: false,
    pebbles: 170,
    mushrooms: 60,
    reeds: 130,
    petals: 420,
    detail: 0,
    heroFlat: false,
    rain: 96,
    clips: true,
    shine: true,
    shadows: true,
    lowSea: false,
    sea: 220,
    island: 210,
    dpr: 1.75,
  },
  mid: {
    grass: 26000,
    flowers: 360,
    lollis: 30,
    pastel: 14,
    sunny: 18,
    twists: 8,
    trees: 6,
    bushes: 16,
    marshmallows: 18,
    bunnies: 8,
    sheep: 5,
    ducks: 5,
    birds: 12,
    butterflies: 6,
    sparkles: 400,
    gumdrops: 14,
    fish: 12,
    dolphins: 3,
    flatLollis: true,
    lod: true,
    pebbles: 90,
    mushrooms: 30,
    reeds: 70,
    petals: 180,
    detail: 1,
    heroFlat: false,
    rain: 64,
    clips: true,
    shine: false,
    shadows: true,
    lowSea: false,
    sea: 110,
    island: 140,
    dpr: 1.25,
  },
  low: {
    grass: 4000,
    flowers: 120,
    lollis: 16,
    pastel: 0,
    sunny: 10,
    twists: 4,
    trees: 3,
    bushes: 6,
    marshmallows: 6,
    bunnies: 4,
    sheep: 2,
    ducks: 3,
    birds: 5,
    butterflies: 3,
    sparkles: 0,
    gumdrops: 6,
    fish: 4,
    dolphins: 2,
    flatLollis: true,
    lod: true,
    pebbles: 36,
    mushrooms: 12,
    reeds: 28,
    petals: 0,
    detail: 2,
    heroFlat: true,
    rain: 24,
    clips: false,
    shine: false,
    shadows: false,
    lowSea: true,
    sea: 40,
    island: 80,
    dpr: 1,
  },
} as const;

export type Budget = (typeof BUDGET)[Tier];

/** GPUs that need the lightest setting even on a fast-looking device. */
const OLD_GPU = /mali-(4|t[6-8]|g31|g51|g52)|adreno \(tm\) ([1-5]\d\d|60\d|61\d)|powervr|sgx|videocore|intel\(r\) (hd|uhd) graphics (2|3|4|5)\d{2,3}?\b|swiftshader|llvmpipe/i;

function gpuName() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return "";
  }
}

let detected: Tier | null = null;

/**
 * Cheap, synchronous guess from the device and its GPU, made once per visit:
 * the model files depend on it. `?quality=low|mid|high` overrides it. At
 * runtime the governor only trades resolution and density, never the tier.
 */
export function detectTier(): Tier {
  if (typeof window === "undefined") return "high";
  detected ??= guessTier();
  return detected;
}

function guessTier(): Tier {
  const forced = new URLSearchParams(window.location.search).get("quality");
  if (forced === "high" || forced === "mid" || forced === "low") return forced;

  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = nav.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;

  if (nav.connection?.saveData || mem <= 2 || OLD_GPU.test(gpuName()) || (coarse && cores <= 4)) return "low";
  if (coarse || cores <= 4 || mem <= 4) return "mid";
  return "high";
}
