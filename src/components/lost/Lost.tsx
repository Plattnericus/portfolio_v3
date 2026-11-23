"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { gsap, SplitText, useGSAP } from "@/lib/scroll";
import { EVENTS, emit, world, type Shout } from "@/lib/world";
import { chime } from "@/lib/sound";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const WORD = "sunshine";
const TOTAL = 4;

const SAY: Record<string, string> = {
  konami: "INFINITE CANDY",
  sunshine: "SUNSHINE MODE",
  flight: "UNICORNS CAN FLY??",
  zero: "0 problems",
};

function centreShout(text: string) {
  emit<Shout>(EVENTS.shout, { x: window.innerWidth / 2, y: window.innerHeight * 0.42, text });
}

function storm(n = 26) {
  for (let i = 0; i < n; i++) {
    window.setTimeout(() => {
      emit(EVENTS.rain, { x: (Math.random() - 0.5) * 18, z: -3 + (Math.random() - 0.5) * 10, n: 3 });
    }, i * 110);
  }
}

export default function Lost() {
  const root = useRef<HTMLElement>(null);
  const [found, setFound] = useState<string[]>([]);

  useGSAP(
    () => {
      const title = root.current!.querySelector(".lost__title")!;
      const split = SplitText.create(title, { type: "words, chars" });
      gsap.set(split.chars, { yPercent: -140, rotation: () => gsap.utils.random(-30, 30), opacity: 0 });
      gsap.set(".lost__pov, .lost__hint", { opacity: 0, y: 20 });
      const intro = () =>
        gsap
          .timeline()
          .to(split.chars, { yPercent: 0, rotation: 0, opacity: 1, duration: 1.3, ease: "elastic.out(1, 0.45)", stagger: 0.04 })
          .to(".lost__pov, .lost__hint", { opacity: 1, y: 0, stagger: 0.1, duration: 0.5, ease: "power3.out" }, "-=0.8");
      window.addEventListener(EVENTS.intro, intro, { once: true });

      // the rest of the story is told by scrolling around the letters
      gsap
        .timeline({ scrollTrigger: { trigger: root.current, start: "top top", end: "bottom bottom", scrub: 0.9 } })
        .to(".lost__top, .lost__hint", { yPercent: -40, opacity: 0, ease: "none", duration: 0.25 }, 0.08)
        .fromTo(".lost__mid", { y: 70, opacity: 0 }, { y: 0, opacity: 1, ease: "none", duration: 0.18 }, 0.3)
        .to(".lost__mid", { y: -70, opacity: 0, ease: "none", duration: 0.14 }, 0.6)
        .fromTo(".lost__rest > *", { y: 70, opacity: 0 }, { y: 0, opacity: 1, ease: "none", duration: 0.16, stagger: 0.05 }, 0.76);
      return () => window.removeEventListener(EVENTS.intro, intro);
    },
    { scope: root },
  );

  useEffect(() => {
    const done = new Set<string>();
    const unlock = (id: string) => {
      if (done.has(id)) return;
      done.add(id);
      setFound([...done]);
      chime();
      centreShout(SAY[id]);
    };

    const run = (id: string) => {
      unlock(id);
      if (id === "konami") storm(32);
      if (id === "zero") storm(10);
      if (id === "sunshine") {
        gsap.killTweensOf(world.fx, "disco");
        gsap.timeline().to(world.fx, { disco: 1, duration: 0.8 }).to(world.fx, { disco: 0, duration: 1.6 }, "+=9");
      }
      if (id === "flight") {
        gsap.killTweensOf(world.fx, "flight");
        gsap
          .timeline()
          .to(world.fx, { flight: 1, duration: 1.4, ease: "power2.inOut" })
          .to(world.fx, { flight: 0, duration: 1.6, ease: "power2.inOut" }, "+=7");
      }
    };

    const onSecret = (e: Event) => run((e as CustomEvent<string>).detail);

    let keys: string[] = [];
    let typed = "";
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys = [...keys, k].slice(-KONAMI.length);
      if (keys.join() === KONAMI.join()) {
        keys = [];
        run("konami");
      }
      if (k.length === 1) {
        typed = (typed + k).slice(-WORD.length);
        if (typed === WORD) {
          typed = "";
          run("sunshine");
        }
      }
    };

    // the same code on touch: swipes for the arrows, two taps for b a
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
      const quick = performance.now() - start.t < 600;
      start = null;
      if (!quick) return;
      let k: string;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) k = keys.at(-1) === "b" ? "a" : "b";
      else if (Math.abs(dx) > Math.abs(dy)) k = dx > 0 ? "ArrowRight" : "ArrowLeft";
      else k = dy > 0 ? "ArrowDown" : "ArrowUp";
      onKey({ key: k } as KeyboardEvent);
    };

    window.addEventListener(EVENTS.secret, onSecret);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("touchend", onUp, { passive: true });
    return () => {
      window.removeEventListener(EVENTS.secret, onSecret);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("touchend", onUp);
      gsap.killTweensOf(world.fx);
      world.fx.disco = 0;
      world.fx.flight = 0;
    };
  }, []);

  return (
    <section className="lost" ref={root} data-section="lost">
      <i className="cam" data-cam="lost" style={{ top: 0 }} />
      <i className="cam" data-cam="lost-orbit" style={{ top: "calc(50% - 50svh)" }} />
      <i className="cam" data-cam="lost-end" style={{ top: "calc(100% - 100svh)" }} />
      <div className="lost__stick">
        <div className="lost__top">
          <p className="lost__pov">You took a wrong turn at the lollipop forest.</p>
          <h1 className="lost__title" data-skew>
            Lost in <em>candy land.</em>
          </h1>
        </div>
        <p className="lost__mid">
          <span className="hl">This page does not exist. The unicorn has been looking for it for a while now.</span>
        </p>
        <div className="lost__rest">
          <p className="lost__home">Nothing here but candy. The map is this way.</p>
          <Link className="btn" href="/">
            Back to the map
          </Link>
        </div>
        <p className="lost__hint">Scroll to look around</p>
      </div>
      {found.length > 0 && (
        <p className="lost__found" aria-live="polite">
          {found.length}/{TOTAL}
        </p>
      )}
    </section>
  );
}
