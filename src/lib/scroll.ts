"use client";

import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

let lenis: Lenis | null = null;

export function getLenis() {
  return lenis;
}

export function setLenis(l: Lenis | null) {
  lenis = l;
}

export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { duration: 2.4 });
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

export { gsap, ScrollTrigger, SplitText, useGSAP, Lenis };
