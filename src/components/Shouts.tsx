"use client";

import { useRef } from "react";
import { EVENTS, type Shout } from "@/lib/world";
import { gsap, useGSAP } from "@/lib/scroll";

/** TikTok-caption pops that fly out of the hamster when you click it. */
export default function Shouts() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const onShout = (e: Event) => {
        const { x, y, text } = (e as CustomEvent<Shout>).detail;
        const el = document.createElement("span");
        el.className = "shout";
        el.textContent = text;
        root.current?.appendChild(el);
        const w = el.offsetWidth;
        const left = Math.min(Math.max(x - w / 2, 12), window.innerWidth - w - 12);
        gsap
          .timeline({ onComplete: () => el.remove() })
          .fromTo(
            el,
            { x: left, y: y - 40, scale: 0, rotation: gsap.utils.random(-14, 14) },
            { scale: 1, duration: 0.45, ease: "back.out(3)" },
          )
          .to(el, { y: y - 160, opacity: 0, duration: 0.9, ease: "power2.in" }, "+=0.35");
      };
      window.addEventListener(EVENTS.shout, onShout);
      return () => window.removeEventListener(EVENTS.shout, onShout);
    },
    { scope: root },
  );

  return <div className="shouts" ref={root} aria-hidden />;
}
