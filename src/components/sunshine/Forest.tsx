"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/scroll";
import { world } from "@/lib/world";

const PHRASE = (
  <>
    Everything is <em>candy</em> now.&nbsp;
  </>
);

export default function Forest() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const marquee = root.current!.querySelector<HTMLElement>(".marquee")!;
      const track = root.current!.querySelector<HTMLElement>(".marquee__track")!;
      const copy = root.current!.querySelector(".forest__copy");

      gsap.fromTo(
        track,
        { xPercent: 4 },
        {
          xPercent: -58,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: true },
        },
      );

      // lean into the scroll
      const skew = gsap.quickTo(marquee, "skewX", { duration: 0.5, ease: "power3.out" });
      const tick = () => {
        skew(gsap.utils.clamp(-14, 14, -world.velocity * 0.45));
      };
      gsap.ticker.add(tick);

      gsap.from(copy, {
        y: 60,
        opacity: 0,
        rotation: 3,
        duration: 0.9,
        ease: "back.out(2)",
        scrollTrigger: { trigger: root.current, start: "top 20%", toggleActions: "play none none reverse" },
      });

      return () => gsap.ticker.remove(tick);
    },
    { scope: root },
  );

  return (
    <section className="forest" ref={root}>
      <i className="cam" data-cam="forest-in" style={{ top: 0 }} />
      <i className="cam" data-cam="forest-out" style={{ top: "calc(100% - 100svh)" }} />
      <div className="forest__stick">
        <p className="marquee" aria-label="Everything is candy now.">
          <span className="marquee__track" aria-hidden>
            {PHRASE}
            {PHRASE}
          </span>
        </p>
        <p className="forest__copy">
          <span className="hl" style={{ ["--hl" as string]: "var(--pink)", ["--hl-ink" as string]: "#fff" }}>
            Somewhere between the third lollipop and the fifth rainbow, every problem simply left. Nobody knows
            where they went. Nobody is looking.
          </span>
        </p>
      </div>
    </section>
  );
}
