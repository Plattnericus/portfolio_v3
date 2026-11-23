"use client";

import { useRef } from "react";
import { gsap, SplitText, useGSAP } from "@/lib/scroll";
import { EVENTS, world } from "@/lib/world";

const CANDY = ["var(--red)", "var(--orange)", "var(--sun)", "var(--green)", "var(--blue)", "var(--violet)", "var(--pink)"];

export default function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const title = root.current!.querySelector(".hero__title")!;
      const split = SplitText.create(title, { type: "chars", charsClass: "char" });
      split.chars.forEach((c, i) => (c as HTMLElement).style.setProperty("--c", CANDY[i % CANDY.length]));
      const lines = gsap.utils.toArray<HTMLElement>(".hero__line");
      const pov = root.current!.querySelector(".hero__pov");
      const foot = gsap.utils.toArray<HTMLElement>(".hero__hint");

      gsap.set(split.chars, { yPercent: -130, rotation: () => gsap.utils.random(-35, 35), opacity: 0 });
      gsap.set(pov, { scale: 0 });
      gsap.set(foot, { opacity: 0, y: 16 });

      const intro = () => {
        const reduce = world.reducedMotion;
        gsap
          .timeline()
          .to(split.chars, {
            yPercent: 0,
            rotation: 0,
            opacity: 1,
            duration: reduce ? 0.4 : 1.5,
            ease: reduce ? "power1.out" : "elastic.out(1, 0.42)",
            stagger: reduce ? 0 : { each: 0.045, from: "start" },
          })
          .to(pov, { scale: 1, duration: 0.6, ease: "back.out(2.6)" }, "-=0.9")
          .to(foot, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out" }, "-=0.4");
      };
      window.addEventListener(EVENTS.intro, intro, { once: true });

      // scroll away: the two lines fling apart, the caption drops
      gsap
        .timeline({
          scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
        })
        .to(lines[0], { xPercent: -38, rotation: -7, ease: "none" }, 0)
        .to(lines[1], { xPercent: 38, rotation: 7, ease: "none" }, 0)
        .to([pov, ...foot], { y: 120, opacity: 0, ease: "none" }, 0);

      return () => window.removeEventListener(EVENTS.intro, intro);
    },
    { scope: root },
  );

  return (
    <section className="hero" ref={root} id="top">
      <i className="cam" data-cam="hero" style={{ top: 0 }} />
      <h1 className="hero__title" aria-label="Sunshine Lollipops">
        <span className="hero__line">Sunshine</span>
        <span className="hero__line">Lollipops</span>
      </h1>
      <p className="hero__pov tt">pov: how that one friend views life</p>
      <p className="hero__hint hero__hint--hamster">Click the hamster. He likes it.</p>
      <p className="hero__hint hero__hint--scroll">Scroll if you&apos;re happy and you know it.</p>
    </section>
  );
}
