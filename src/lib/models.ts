import { BUDGET, type Tier } from "./quality";

/** The island's model sets and which file each tier loads. */
export const SETS = [
  "candy",
  "unicorn",
  "frog",
  "smiley",
  "sea",
  "sky",
  "nature",
  "castle",
  "letters",
  "sign",
  "animals",
  "village",
  "far",
  "min",
] as const;
export type ModelSet = (typeof SETS)[number];

export type ModelConfig = {
  /** content hash of the model files, set in next.config.ts */
  rev: string;
  /** sets that ship a light variant, read from the files in next.config.ts */
  lite: string[];
  /** tiers that load the light variants */
  light: string[];
  /** tiers that also need the "Min" twins */
  min: string[];
  sets: readonly string[];
};

const tiers = Object.keys(BUDGET) as Tier[];

export const modelConfig: ModelConfig = {
  rev: process.env.NEXT_PUBLIC_MODEL_REV ?? "",
  lite: (process.env.NEXT_PUBLIC_MODEL_LITE ?? "").split(",").filter(Boolean),
  light: tiers.filter((t) => BUDGET[t].lod),
  min: tiers.filter((t) => BUDGET[t].detail >= 2),
  sets: SETS,
};

/**
 * URL of one set on one tier. Models are stored gzipped and sent with
 * Content-Encoding: gzip (see next.config.ts).
 */
export function modelUrl(cfg: ModelConfig, name: string, tier: string) {
  const lite = cfg.light.includes(tier) && cfg.lite.includes(name);
  return `/models/${name}${lite ? ".lite" : ""}.glb.gz${cfg.rev ? `?v=${cfg.rev}` : ""}`;
}

/** Whether a tier downloads a set at all: the "Min" twins only go to the oldest phones. */
export function needsSet(cfg: ModelConfig, name: string, tier: string) {
  return name !== "min" || cfg.min.includes(tier);
}
