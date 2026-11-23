"use client";

import { useRef } from "react";
import { gsap, SplitText, useGSAP } from "@/lib/scroll";

const ITEMS = [
  {
    cam: "swirl",
    side: "right",
    name: "The Swirl",
    hl: "var(--sun)",
    copy: "Six ropes of sugar, twisted together and coiled until the middle disappeared. Lick clockwise. Never ask why.",
    facts: [
      ["problems solved", "all of them"],
      ["flavour", "yes"],
      ["stick", "emotional support"],
    ],
  },
  {
    cam: "twist",
    side: "left",
    name: "The Twist",
    hl: "var(--cream)",
    copy: "Taller than your to-do list and twice as sweet. Grows wherever somebody says “it is what it is”.",
    facts: [
      ["height", "ambitious"],
      ["stripes", "five, all different"],
      ["regrets", "none"],
    ],
  },
  {
    cam: "cloud",
    side: "right",
    name: "The Cloud",
    hl: "#c9ecff",
    copy: "Whipped fresh this morning. Holds exactly one nap. Rain is not on the schedule today, or ever.",
    facts: [
      ["texture", "marshmallow"],
      ["forecast", "sunshine"],
      ["chance of problems", "0%"],
    ],
  },
] as const;

export default function Specimens() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.utils.toArray<HTMLElement>(".specimen").forEach((item) => {
        const name = item.querySelector(".specimen__name")!;
        const split = SplitText.create(name, { type: "words, chars" });
        const rest = item.querySelectorAll(".specimen__copy, .specimen__facts li");
        gsap
          .timeline({
            scrollTrigger: { trigger: item, start: "top 55%", toggleActions: "play none none reverse" },
          })
          .from(split.chars, {
            y: () => gsap.utils.random(80, 160),
            rotation: () => gsap.utils.random(-40, 40),
            scale: 0.2,
            opacity: 0,
            duration: 0.9,
            ease: "back.out(2.4)",
            stagger: 0.035,
          })
          .from(rest, { y: 30, opacity: 0, duration: 0.5, stagger: 0.07, ease: "power3.out" }, "-=0.55");
      });
    },
    { scope: root },
  );

  return (
    <div ref={root}>
      {ITEMS.map((it) => (
        <section key={it.cam} className="specimen" data-side={it.side}>
          <i className="cam" data-cam={it.cam} style={{ top: "22svh" }} />
          <div className="specimen__stick">
            <h2 className="specimen__name">{it.name}</h2>
            <p className="specimen__copy">
              <span className="hl" style={{ ["--hl" as string]: it.hl }}>
                {it.copy}
              </span>
            </p>
            <ul className="specimen__facts">
              {it.facts.map(([k, v]) => (
                <li key={k}>
                  <span className="hl" style={{ ["--hl" as string]: "var(--ink)", ["--hl-ink" as string]: "#fff" }}>
                    {k}: <b>{v}</b>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
