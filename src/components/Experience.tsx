"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, type ReactNode } from "react";
import { ROUTES, type Route } from "./scene/layout";
import type { SignMedia } from "./scene/Signs";
import { EVENTS, emit, world } from "@/lib/world";
import { Lenis, ScrollTrigger, gsap, setLenis } from "@/lib/scroll";
import Loader from "./Loader";
import Header from "./Header";
import Shouts from "./Shouts";
import Secrets from "./Secrets";

const Scene = dynamic(() => import("./scene/Scene"), { ssr: false });

/** Without WebGL the page still works; only the 3D layer is skipped. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    document.documentElement.classList.add("no-webgl");
    emit(EVENTS.ready);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function Experience({
  route,
  signs,
  loaderLines,
  children,
}: {
  route: Route;
  signs?: SignMedia[];
  loaderLines: string[];
  children: ReactNode;
}) {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    world.reducedMotion = reduce;
    world.progress = 0;
    world.section = "";
    world.sign = -1;
    world.rainMode = false;
    world.plantMode = false;
    world.dropped = false;
    world.fx.disco = 0;
    world.fx.flight = 0;
    world.fx.party = 0;
    document.documentElement.classList.add("is-loading");
    if (!hasWebGL()) {
      document.documentElement.classList.add("no-webgl");
      emit(EVENTS.ready);
    }

    const lenis = new Lenis({ lerp: reduce ? 1 : 0.085, smoothWheel: !reduce, wheelMultiplier: 0.95 });
    setLenis(lenis);
    lenis.stop();
    lenis.on("scroll", (l: { velocity: number }) => {
      world.velocity = l.velocity;
      ScrollTrigger.update();
    });
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const keys = ROUTES[route];
    const measure = () => {
      const max = ScrollTrigger.maxScroll(window) || 1;
      world.anchors = keys.map((k) => {
        const el = document.querySelector<HTMLElement>(`[data-cam="${k.id}"]`);
        if (!el) return 0;
        return Math.min(1, Math.max(0, (el.getBoundingClientRect().top + window.scrollY) / max));
      });
    };
    const bar = document.querySelector<HTMLElement>(".progress span");
    const progress = ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) => {
        world.progress = self.progress;
        if (bar) bar.style.transform = `scaleX(${self.progress})`;
      },
    });

    // big type leans into fast scrolling (pointer devices only: on phones it would cost a repaint per frame)
    const leans = reduce || !window.matchMedia("(pointer: fine)").matches
      ? []
      : gsap.utils.toArray<HTMLElement>("[data-skew]").map((el) => gsap.quickTo(el, "skewY", { duration: 0.6, ease: "power3.out" }));
    const lean = () => {
      const v = gsap.utils.clamp(-4, 4, -world.velocity * 0.16);
      for (const q of leans) q(v);
    };
    gsap.ticker.add(lean);
    ScrollTrigger.addEventListener("refresh", measure);

    // which section is on screen drives the world: letters, signs, candy rain
    const sections = gsap.utils.toArray<HTMLElement>("[data-section]").map((el) =>
      ScrollTrigger.create({
        trigger: el,
        start: "top 55%",
        end: "bottom 45%",
        onToggle: (self) => {
          const id = el.dataset.section ?? "";
          if (self.isActive) {
            world.section = id;
            if (id.startsWith("work-")) world.sign = Number(id.slice(5));
            if (id === "about" && !world.dropped) {
              world.dropped = true;
              emit(EVENTS.drop);
            }
          } else if (world.section === id) {
            world.section = "";
          }
          if (!id.startsWith("work-") || !self.isActive) {
            if (!world.section.startsWith("work-")) world.sign = -1;
          }
          world.rainMode = world.section === "contact";
        },
      }),
    );

    const onPointer = (e: PointerEvent) => {
      world.pointer.active = true;
      if (e.pointerType !== "mouse" && e.type === "pointermove" && e.pressure === 0) return;
      world.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      world.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    const onLeave = () => {
      world.pointer.active = false;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    const onIntro = () => {
      lenis.start();
      ScrollTrigger.refresh();
    };
    window.addEventListener(EVENTS.intro, onIntro);
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener(EVENTS.intro, onIntro);
      ScrollTrigger.removeEventListener("refresh", measure);
      sections.forEach((s) => s.kill());
      progress.kill();
      gsap.ticker.remove(raf);
      gsap.ticker.remove(lean);
      lenis.destroy();
      setLenis(null);
    };
  }, [route]);

  return (
    <>
      <SceneBoundary>
        <Scene route={route} signs={signs} />
      </SceneBoundary>
      <Loader lines={loaderLines} />
      <Header route={route} />
      <main id="content">{children}</main>
      <Shouts />
      {route === "home" && <Secrets />}
    </>
  );
}
