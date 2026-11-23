"use client";

import { useEffect } from "react";
import { gsap } from "@/lib/scroll";
import { EVENTS, emit, world, type Cue, type Shout } from "@/lib/world";
import { chime } from "@/lib/sound";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const WORD = "lollipop";
const DANCE = 16;
const SPIN = 8;

function say(text: string) {
  emit<Shout>(EVENTS.shout, { x: window.innerWidth / 2, y: window.innerHeight * 0.42, text });
}

/** Candy over the whole island, a few showers at a time. */
function shower() {
  const spots: [number, number][] = [
    [0, -2],
    [-7, -9],
    [8, -12],
    [-22, -18],
    [3, -30],
    [40, 2],
    [21, -52],
    [-12, 6],
  ];
  spots.forEach(([x, z], i) => window.setTimeout(() => emit(EVENTS.rain, { x, z, n: 8 }), i * 260));
}

/**
 * The home page keeps a few things to itself. Nothing on the page points at
 * them: a word to type, an old cheat code (also as swipes on a phone), and
 * what happens when someone scrolls far too fast.
 */
export default function Secrets() {
  useEffect(() => {
    const party = () => {
      chime();
      say("PARTY!!");
      gsap.killTweensOf(world.fx);
      gsap
        .timeline()
        .to(world.fx, { disco: 1, party: 1, duration: 0.8 })
        .to(world.fx, { disco: 0, party: 0, duration: 1.8 }, "+=9");
      emit<Cue>(EVENTS.cue, { who: "all", tags: DANCE });
    };

    let keys: string[] = [];
    let typed = "";
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys = [...keys, k].slice(-KONAMI.length);
      if (keys.join() === KONAMI.join()) {
        keys = [];
        party();
      }
      if (k.length === 1) {
        typed = (typed + k).slice(-WORD.length);
        if (typed === WORD) {
          typed = "";
          chime();
          say("LOLLIPOPS!!");
          shower();
        }
      }
    };

    // the code as swipes: arrows by direction, taps for b and a
    let start: { x: number; y: number; t: number } | null = null;
    const onDown = (e: TouchEvent) => {
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, t: performance.now() };
    };
    const onUp = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const quick = performance.now() - start.t < 400;
      start = null;
      if (!quick) return;
      let k: string;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) k = keys.at(-1) === "b" ? "a" : "b";
      else if (Math.abs(dx) > Math.abs(dy)) k = dx > 0 ? "ArrowRight" : "ArrowLeft";
      else k = dy > 0 ? "ArrowDown" : "ArrowUp";
      onKey({ key: k } as KeyboardEvent);
    };

    // scrolling flat out for a second and a half sends the island spinning
    let fast = 0;
    let last = performance.now();
    let cooldown = 0;
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      // raw scroll speed, so a party (which lifts the mood) does not count
      fast = Math.abs(world.velocity) > 26 ? fast + dt : 0;
      if (fast > 1.5 && now > cooldown) {
        fast = 0;
        cooldown = now + 20000;
        say("WHEEEEE");
        world.scream = 1;
        window.setTimeout(() => (world.scream = 0), 1400);
        emit<Cue>(EVENTS.cue, { who: "all", tags: SPIN });
      }
    };
    gsap.ticker.add(tick);

    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("touchend", onUp, { passive: true });
    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("touchend", onUp);
      gsap.killTweensOf(world.fx);
      world.fx.disco = 0;
      world.fx.party = 0;
    };
  }, []);
  return null;
}
