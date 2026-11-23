"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/scroll";
import { world } from "@/lib/world";

/** Word-by-word TikTok captions while the camera sits in the hamster's face. */
export default function Ride() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const [l1, l2] = gsap.utils.toArray<HTMLElement>(".ride__line");
      const w1 = l1.querySelectorAll("span");
      const w2 = l2.querySelectorAll("span");
      const after = root.current!.querySelector(".ride__after");

      gsap.set([...w1, ...w2], { scale: 0, rotation: () => gsap.utils.random(-12, 12) });
      gsap.set(after, { opacity: 0, y: 20 });

      const pop = { scale: 1, rotation: 0, ease: "back.out(3.2)", duration: 0.5 };
      gsap
        .timeline({
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.6,
            onUpdate: (self) => {
              world.scream = Math.sin(Math.min(1, self.progress * 1.1) * Math.PI);
            },
            onLeave: () => (world.scream = 0),
            onLeaveBack: () => (world.scream = 0),
          },
        })
        .to({}, { duration: 0.3 })
        .to(w1[0], pop)
        .to(w1[1], pop, "+=0.25")
        .to(w1[2], pop, "+=0.25")
        .to(l1, { scale: 0.6, opacity: 0, duration: 0.4, ease: "power2.in" }, "+=0.7")
        .to(w2[0], pop)
        .to(w2[1], pop, "+=0.3")
        .to(after, { opacity: 1, y: 0, duration: 0.5 }, "+=0.2")
        .to({}, { duration: 1.2 });
    },
    { scope: root },
  );

  return (
    <section className="ride" ref={root} aria-label="Man see sun. Man happy.">
      <i className="cam" data-cam="ride" style={{ top: 0 }} />
      <i className="cam" data-cam="ride-out" style={{ top: "calc(100% - 100svh)" }} />
      <div className="ride__stick">
        <div className="ride__lines">
          <p className="ride__line tt">
            <span>man</span> <span>see</span> <span>sun.</span>
          </p>
          <p className="ride__line tt">
            <span>man</span> <span>happy.</span>
          </p>
        </div>
        <p className="ride__after">
          <span className="hl">That&apos;s the whole philosophy. There is no page two.</span>
        </p>
      </div>
    </section>
  );
}
