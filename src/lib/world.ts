/**
 * Shared mutable state between the DOM (GSAP / Lenis) and the WebGL scene.
 * Written by scroll handlers and DOM events, read inside useFrame.
 */
export const world = {
  /** whole-page scroll progress, 0..1 */
  progress: 0,
  /** Lenis velocity */
  velocity: 0,
  /** 0..1, smoothed scroll speed: how lively the characters are */
  energy: 0,
  /** bumps each time the scroll direction flips at speed */
  kick: 0,
  /** normalised pointer, -1..1 */
  pointer: { x: 0, y: 0, active: false },
  /** scroll progress at which each camera key is reached */
  anchors: [] as number[],
  /** id of the section currently on screen */
  section: "",
  /** the wordmark has been asked to fall onto the meadow */
  dropped: false,
  /** finale on the sunshine route: tapping the meadow plants lollipops */
  plantMode: false,
  /** contact section: tapping the beach makes it rain candy */
  rainMode: false,
  reducedMotion: false,
  /** 0..1 how much the hamster is screaming */
  scream: 0,
  /** active project sign, -1 when none */
  sign: -1,
  /** set when the frame rate stays poor: heavy extras switch off */
  degraded: false,
  /** 0..1 share of the instanced crowds (grass, flowers, sparkles) that is drawn */
  density: 1,
  /** easter eggs; party lifts everyone's mood to full */
  fx: { disco: 0, flight: 0, party: 0 },
};

export type Shout = { x: number; y: number; text: string };

/** Ask characters for a move: by name, or any move with one of the tags. */
export type Cue = { who: "rider" | "frog" | "smiley" | "all"; move?: string; tags?: number };

export const EVENTS = {
  ready: "candy:ready",
  progress: "candy:progress",
  intro: "candy:intro",
  planted: "candy:planted",
  shout: "candy:shout",
  drop: "candy:drop",
  rain: "candy:rain",
  secret: "candy:secret",
  quality: "candy:quality",
  cue: "candy:cue",
} as const;

export function emit<T>(name: string, detail?: T) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
