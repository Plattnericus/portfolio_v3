"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/scroll";
import { pop } from "@/lib/sound";

/** "Life is NOT sunshine and rainbows." Then the NOT gets crossed out and falls off the page. */
export default function Nope() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const words = gsap.utils.toArray<HTMLElement>(".nope__line .w");
      const not = root.current!.querySelector<HTMLElement>(".nope__not")!;
      const notText = not.querySelector("span")!;
      const strike = not.querySelector(".nope__strike")!;
      const who = root.current!.querySelector(".nope__who");
      let popped = false;

      gsap.set(words, { yPercent: 110, opacity: 0, rotation: 4 });
      gsap.set(strike, { rotation: -5, scaleX: 0, visibility: "visible" });
      gsap.set(who, { opacity: 0, y: 24 });

      gsap
        .timeline({
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.7,
            onUpdate: (self) => {
              // a little pop the moment the word drops
              if (self.progress > 0.52 && !popped) {
                popped = true;
                pop(0.6);
              } else if (self.progress < 0.48) popped = false;
            },
          },
        })
        .to(words, { yPercent: 0, opacity: 1, rotation: 0, stagger: 0.12, duration: 0.6, ease: "back.out(2)" })
        .to({}, { duration: 0.6 })
        .to(strike, { scaleX: 1, duration: 0.5, ease: "power2.inOut" })
        .to(not, { rotation: -8, duration: 0.25, ease: "power1.inOut" }, "+=0.3")
        .addLabel("drop")
        .to(notText, { y: "120vh", rotation: 70, duration: 1.2, ease: "power2.in" }, "drop")
        .to(strike, { y: "120vh", rotation: 40, duration: 1.2, ease: "power2.in" }, "drop")
        .to(not, { width: 0, marginRight: 0, duration: 0.7, ease: "power3.inOut" }, "drop+=0.45")
        .to(who, { opacity: 1, y: 0, duration: 0.5 }, "-=0.1")
        .to({}, { duration: 0.8 });
    },
    { scope: root },
  );

  return (
    <section className="nope" ref={root}>
      <i className="cam" data-cam="sky" style={{ top: "35svh" }} />
      <div className="nope__stick">
        <p className="nope__line">
          <span className="w">Life</span> <span className="w">is</span>{" "}
          <span className="w nope__not">
            <span>NOT</span>
            <b className="nope__strike" aria-hidden />
          </span>
          <span className="w">sunshine</span> <span className="w">and</span>{" "}
          <span className="w">rainbows.</span>
        </p>
        <p className="nope__who">
          <span className="hl">— someone who has clearly never met this hamster</span>
        </p>
      </div>
    </section>
  );
}
