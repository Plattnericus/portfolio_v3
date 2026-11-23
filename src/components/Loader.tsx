"use client";

import { useRef } from "react";
import { EVENTS } from "@/lib/world";
import { gsap, useGSAP } from "@/lib/scroll";
import { makeSyrupWorker, syrup } from "./syrup";

const { SYRUP, BACK, crest, now, paint } = syrup;

const SWIRL = ["#ff3d6e", "#ff8a1f", "#ffd23b", "#3fcf74", "#2f9bff", "#9a5cff"];
const TURNS = 3.4;
const R = 44;

/** An Archimedean spiral cut into one arc per colour, centre outwards. */
const ARCS = (() => {
  const total = TURNS * Math.PI * 2;
  const steps = 36;
  return SWIRL.map((color, i) => {
    const a0 = (i / SWIRL.length) * total;
    const a1 = ((i + 1) / SWIRL.length) * total;
    let d = "";
    for (let k = 0; k <= steps; k++) {
      const a = a0 + ((a1 - a0) * k) / steps;
      const r = 3 + (a / total) * (R - 3);
      d += `${k ? "L" : "M"}${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
    }
    return { color, d };
  });
})();

/** Sugar sprinkles that burst out when the lollipop pops. */
const SPRINKLES = Array.from({ length: 26 }, (_, i) => {
  const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.21;
  return { a, d: 95 + (i % 4) * 30, color: SWIRL[i % SWIRL.length], spin: (i % 2 ? 1 : -1) * (180 + i * 37) };
});

/**
 * The island loads behind a sea of candy syrup. Six layers of waves rise with
 * the progress, each with its own swell; the lollipop rides between them. When
 * everything is ready a flood wave covers the screen, the lollipop shoots up
 * and pops, and the syrup drains away layer by layer onto the map.
 */
export default function Loader({ lines }: { lines: string[] }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current!;
      const candy = el.querySelector<HTMLElement>(".loader__candy")!;
      const num = el.querySelector<HTMLElement>(".loader__num span")!;
      const line = el.querySelector<HTMLElement>(".loader__line span")!;
      const arcs = gsap.utils.toArray<SVGPathElement>(".loader__arc", el);
      const spin = el.querySelector<HTMLElement>(".loader__spin")!;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // fresh canvases each time, since a canvas can hand its drawing to a worker only once
      const back = document.createElement("canvas");
      const front = document.createElement("canvas");
      back.className = "loader__sea loader__sea--back";
      front.className = "loader__sea loader__sea--front";
      back.setAttribute("aria-hidden", "true");
      front.setAttribute("aria-hidden", "true");
      el.insertBefore(back, candy);
      candy.after(front);

      const layers = SYRUP.map(() => ({ level: 0.05 }));
      const sea = { slosh: reduce ? 0.35 : 1 };
      const candyBox = { scale: 1, up: 0, gone: 0 };
      const state = { levels: layers.map((l) => l.level), slosh: 1 };
      const ratio = () => Math.min(window.devicePixelRatio || 1, 2) * 0.55;
      let W = window.innerWidth;
      let H = window.innerHeight;

      // the syrup is drawn by a worker when the browser allows, so it keeps flowing while the page is busy
      let worker: Worker | null = null;
      let cb: CanvasRenderingContext2D | null = null;
      let cf: CanvasRenderingContext2D | null = null;
      if (typeof OffscreenCanvas !== "undefined" && "transferControlToOffscreen" in back) {
        try {
          worker = makeSyrupWorker();
          const ob = back.transferControlToOffscreen();
          const of = front.transferControlToOffscreen();
          worker.postMessage({ type: "init", back: ob, front: of, w: W, h: H, ratio: ratio() }, [ob, of]);
        } catch {
          worker?.terminate();
          worker = null;
        }
      }
      const fitLocal = () => {
        const r = ratio();
        for (const [c, ctx] of [
          [back, cb],
          [front, cf],
        ] as const) {
          if (!ctx) continue;
          c.width = Math.ceil(W * r);
          c.height = Math.ceil(H * r);
          ctx.setTransform(r, 0, 0, r, 0, 0);
        }
      };
      if (!worker) {
        cb = back.getContext("2d");
        cf = front.getContext("2d");
        fitLocal();
      }
      const fit = () => {
        W = window.innerWidth;
        H = window.innerHeight;
        if (worker) worker.postMessage({ type: "size", w: W, h: H, ratio: ratio() });
        else fitLocal();
      };
      window.addEventListener("resize", fit);

      // the lollipop floats on the third layer, tilting with the swell
      const float = (t: number) => {
        const x = W / 2;
        const y = crest(BACK - 1, x, t, W, H, state.levels, state.slosh);
        const slope = (crest(BACK - 1, x + 6, t, W, H, state.levels, state.slosh) - crest(BACK - 1, x - 6, t, W, H, state.levels, state.slosh)) / 12;
        const ride = y - candy.offsetHeight * 0.8 - candyBox.up * H;
        candy.style.transform = `translate3d(-50%, ${ride.toFixed(1)}px, 0) rotate(${(Math.atan(slope) * 0.9).toFixed(3)}rad) scale(${candyBox.scale.toFixed(3)})`;
      };

      let running = true;
      let sent = "";
      const tick = () => {
        if (!running) return;
        const t = now();
        for (let i = 0; i < layers.length; i++) state.levels[i] = layers[i].level;
        state.slosh = sea.slosh;
        if (worker) {
          const key = state.levels.map((v) => v.toFixed(4)).join() + state.slosh.toFixed(3);
          if (key !== sent) {
            sent = key;
            worker.postMessage({ type: "state", levels: [...state.levels], slosh: state.slosh });
          }
        } else if (cb && cf) {
          paint(cb, 0, BACK, t, W, H, state.levels, state.slosh);
          paint(cf, BACK, SYRUP.length, t, W, H, state.levels, state.slosh);
        }
        if (!candyBox.gone) float(t);
      };
      gsap.ticker.add(tick);

      const shown = { v: 0 };
      let target = 0;
      let done = false;
      const start = performance.now();

      const render = () => {
        num.textContent = String(Math.round(shown.v));
        const p = shown.v / 100;
        // the swirl fills with the progress, the syrup rises with it
        arcs.forEach((a, i) => a.style.setProperty("stroke-dashoffset", String(1 - Math.min(1, Math.max(0, p * arcs.length - i)))));
        if (!done) layers.forEach((L) => (L.level = 0.05 + p * 0.25));
      };
      render();
      const chase = gsap.quickTo(shown, "v", { duration: 0.8, ease: "power3.out", onUpdate: render });

      gsap.from(candyBox, { scale: 0, duration: reduce ? 0.3 : 1.2, ease: "elastic.out(1, 0.5)" });
      gsap.fromTo(".loader__num", { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: "power3.out", delay: 0.15 });

      let li = 0;
      const lineTimer = window.setInterval(() => {
        li = (li + 1) % lines.length;
        gsap
          .timeline()
          .to(line, { yPercent: -110, opacity: 0, duration: 0.25, ease: "power2.in" })
          .add(() => {
            line.textContent = lines[li];
          })
          .fromTo(line, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.35, ease: "power3.out" });
      }, 1300);

      const finish = () => {
        if (done) return;
        done = true;
        window.clearInterval(lineTimer);
        const wait = Math.max(0, 600 - (performance.now() - start)) / 1000;
        const m = new DOMMatrixReadOnly(getComputedStyle(spin).transform);
        spin.style.animation = "none";
        gsap.set(spin, { rotation: (Math.atan2(m.b, m.a) * 180) / Math.PI });

        gsap
          .timeline({ delay: wait })
          .to(shown, { v: 100, duration: 0.3, ease: "power2.out", onUpdate: render })
          .addLabel("flood")
          // the flood: every layer surges up past the top while the swell grows
          .to(".loader__text", { yPercent: -40, opacity: 0, duration: 0.35, ease: "power2.in" }, "flood")
          .to(sea, { slosh: reduce ? 0.35 : 2.6, duration: 0.5, ease: "power2.out" }, "flood")
          // the colours climb one after another, back to front, a rainbow breaking over the screen
          .to(layers, { level: 1.3, duration: reduce ? 0.3 : 0.62, ease: "power3.in", stagger: { each: 0.06, from: "start" } }, "flood")
          // the lollipop rides the flood up and pops at the top
          .to(candyBox, { up: 0.22, duration: 0.5, ease: "power2.in" }, "flood")
          .to(spin, { rotation: "+=720", duration: reduce ? 0.01 : 0.9, ease: "power2.in" }, "flood")
          .addLabel("pop", "flood+=0.5")
          .to(candyBox, { scale: 1.35, duration: 0.18, ease: "power2.out" }, "pop")
          .fromTo(
            ".loader__sprinkle",
            { x: 0, y: 0, rotation: 0, opacity: 1, scale: 0.4 },
            {
              x: (i) => Math.cos(SPRINKLES[i].a) * SPRINKLES[i].d,
              y: (i) => Math.sin(SPRINKLES[i].a) * SPRINKLES[i].d,
              rotation: (i) => SPRINKLES[i].spin,
              scale: 1.3,
              duration: reduce ? 0.01 : 0.8,
              ease: "power3.out",
              stagger: 0.005,
              transformOrigin: "50% 50%",
            },
            "pop",
          )
          .to(".loader__sprinkle", { opacity: 0, duration: 0.3 }, "pop+=0.5")
          .to(candyBox, { scale: 0, duration: 0.35, ease: "back.in(2.4)" }, "pop+=0.18")
          // under the flood the cream goes, then the syrup drains off the island
          .set(el, { backgroundColor: "transparent" }, "pop+=0.22")
          .addLabel("drain", "pop+=0.25")
          .to(sea, { slosh: reduce ? 0.35 : 1.8, duration: 0.6 }, "drain")
          .to(layers, { level: -0.45, duration: reduce ? 0.4 : 0.95, ease: "expo.inOut", stagger: { each: 0.05, from: "end" } }, "drain")
          .add(() => {
            candyBox.gone = 1;
            document.documentElement.classList.remove("is-loading");
            window.dispatchEvent(new Event(EVENTS.intro));
          }, "drain+=0.25")
          .add(() => {
            running = false;
            gsap.ticker.remove(tick);
            worker?.postMessage({ type: "stop" });
          })
          .set(el, { display: "none" });
      };

      // never trap anyone behind the loader: let go when loading stalls, and on
      // a very slow line after a while anyway, while it still makes progress
      let stall = window.setTimeout(finish, 12000);
      const cap = window.setTimeout(finish, 45000);
      const onProgress = (e: Event) => {
        target = Math.max(target, Math.min(96, (e as CustomEvent<number>).detail ?? 0));
        if (!done) chase(target);
        window.clearTimeout(stall);
        stall = window.setTimeout(finish, 12000);
      };
      window.addEventListener(EVENTS.progress, onProgress);
      window.addEventListener(EVENTS.ready, finish);

      return () => {
        running = false;
        gsap.ticker.remove(tick);
        worker?.terminate();
        back.remove();
        front.remove();
        window.removeEventListener("resize", fit);
        window.removeEventListener(EVENTS.progress, onProgress);
        window.removeEventListener(EVENTS.ready, finish);
        window.clearInterval(lineTimer);
        window.clearTimeout(stall);
        window.clearTimeout(cap);
      };
    },
    { scope: root, dependencies: [lines] },
  );

  return (
    <div className="loader" ref={root} role="status" aria-live="polite" aria-label="Loading the island">
      <div className="loader__candy" aria-hidden>
        <svg viewBox="-60 -60 120 176">
          <g className="loader__sprinkles">
            {SPRINKLES.map((p, i) => (
              <rect key={i} className="loader__sprinkle" x="-7" y="-2.5" width="14" height="5" rx="2.5" fill={p.color} opacity="0" />
            ))}
          </g>
          <rect className="loader__stick" x="-4" y="44" width="8" height="70" rx="4" />
          <circle className="loader__disc" r="50" />
        </svg>
        <div className="loader__spin">
          <svg viewBox="-50 -50 100 100">
            {ARCS.map((a) => (
              <path key={a.color} className="loader__arc" d={a.d} stroke={a.color} pathLength={1} />
            ))}
          </svg>
        </div>
        <svg className="loader__gloss" viewBox="-60 -60 120 176">
          <circle className="loader__shine" cx="-18" cy="-22" r="9" />
        </svg>
      </div>
      <div className="loader__text">
        <p className="loader__num">
          <span>0</span>
          <small>%</small>
        </p>
        <p className="loader__line">
          <span>{lines[0]}</span>
        </p>
      </div>
    </div>
  );
}
