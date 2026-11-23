"use client";

import { gsap } from "./scroll";

type Target = gsap.TweenTarget;

const SCRUB = 0.9;

/**
 * Scroll-scrubbed entrance: the targets move from `from` to their natural state
 * while the trigger travels from the lower to the upper part of the viewport.
 */
export function scrubIn(targets: Target, trigger: Element, from: gsap.TweenVars, opts: { stagger?: number; start?: string; end?: string } = {}) {
  return gsap.fromTo(
    targets,
    { opacity: 0, ...from },
    {
      opacity: 1,
      x: 0,
      y: 0,
      xPercent: 0,
      yPercent: 0,
      rotation: 0,
      scale: 1,
      scaleY: 1,
      ease: "none",
      stagger: opts.stagger ?? 0,
      scrollTrigger: { trigger, start: opts.start ?? "top 88%", end: opts.end ?? "top 22%", scrub: SCRUB },
    },
  );
}

/** Scroll-scrubbed exit for a sticky block, while its section scrolls away. */
export function scrubOut(target: Target, trigger: Element) {
  return gsap.to(target, {
    yPercent: -14,
    opacity: 0,
    ease: "none",
    immediateRender: false,
    scrollTrigger: { trigger, start: "bottom 92%", end: "bottom 30%", scrub: SCRUB },
  });
}

/** Counts a number element up as the trigger scrolls in. */
export function scrubCount(el: HTMLElement, trigger: Element) {
  const end = Number(el.dataset.n ?? 0);
  const o = { v: 0 };
  return gsap.to(o, {
    v: end,
    ease: "none",
    onUpdate: () => {
      el.textContent = Math.round(o.v).toLocaleString("en-US");
    },
    scrollTrigger: { trigger, start: "top 85%", end: "top 20%", scrub: SCRUB },
  });
}
