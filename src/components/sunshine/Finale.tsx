"use client";

import { useRef, useState, useEffect } from "react";
import { gsap, ScrollTrigger, SplitText, scrollToTop, useGSAP } from "@/lib/scroll";
import { EVENTS, world } from "@/lib/world";

function caption(n: number) {
  if (n === 0) return "0 lollipops planted";
  if (n === 1) return "1 lollipop. it's a start.";
  if (n >= 100) return `${n} planted. you can stop now.`;
  if (n >= 50) return `${n} planted. candy enlightenment.`;
  if (n >= 25) return `${n} planted. ok that's a lot of sugar.`;
  if (n >= 10) return `${n} planted. the hamster is proud.`;
  return `${n} lollipops planted`;
}

export default function Finale() {
  const root = useRef<HTMLElement>(null);
  const count = useRef<HTMLParagraphElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const onPlant = (e: Event) => setN((e as CustomEvent<number>).detail);
    window.addEventListener(EVENTS.planted, onPlant);
    return () => window.removeEventListener(EVENTS.planted, onPlant);
  }, []);

  useEffect(() => {
    if (n > 0 && count.current) {
      gsap.fromTo(count.current, { scale: 1.25, rotation: gsap.utils.random(-6, 6) }, { scale: 1, rotation: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" });
    }
  }, [n]);

  useGSAP(
    () => {
      const title = root.current!.querySelector(".finale__title")!;
      const split = SplitText.create(title, { type: "words, chars" });
      gsap.from(split.chars, {
        yPercent: 120,
        scaleY: 0.4,
        opacity: 0,
        stagger: 0.03,
        duration: 0.9,
        ease: "elastic.out(1, 0.5)",
        scrollTrigger: { trigger: root.current, start: "top 40%", toggleActions: "play none none reverse" },
      });
      ScrollTrigger.create({
        trigger: root.current,
        start: "top 30%",
        end: "bottom top", // past max scroll: stays active at the very bottom
        onToggle: (self) => {
          world.plantMode = self.isActive;
        },
      });
    },
    { scope: root },
  );

  return (
    <section className="finale" ref={root}>
      <i className="cam" data-cam="finale" style={{ top: "35svh" }} />
      <div className="finale__inner">
        <h2 className="finale__title">Go touch grass.</h2>
        <p className="finale__hint">
          <span className="hl" style={{ ["--hl" as string]: "var(--sun)" }}>
            Tap the meadow. A lollipop grows wherever you touch it.
          </span>
        </p>
        <p className="finale__count tt" ref={count} aria-live="polite">
          {caption(n)}
        </p>
        <footer className="foot">
          <p>Sunshine Lollipops. Modelled in Blender, rendered with three.js, held together with sugar.</p>
          <button type="button" onClick={scrollToTop}>
            Ride again
          </button>
        </footer>
      </div>
    </section>
  );
}
