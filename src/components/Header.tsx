"use client";

import Link from "next/link";
import { useState } from "react";
import { setSound, pop } from "@/lib/sound";
import { getLenis } from "@/lib/scroll";
import type { Route } from "./scene/layout";

function jump(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const lenis = getLenis();
  if (lenis) lenis.scrollTo(el, { duration: 2.2 });
  else el.scrollIntoView({ behavior: "smooth" });
}

export default function Header({ route }: { route: Route }) {
  const [on, setOn] = useState(false);

  return (
    <header className="top">
      <p className="progress" aria-hidden>
        <span />
      </p>
      <Link href="/" className="top__brand" aria-label="Nexor, home">
        Nexor
      </Link>
      <nav className="top__nav" aria-label="Main">
        {route === "home" ? (
          <>
            <a href="#work" onClick={(e) => (e.preventDefault(), jump("work"))}>
              work
            </a>
            <a href="#contact" onClick={(e) => (e.preventDefault(), jump("contact"))}>
              contact
            </a>
          </>
        ) : (
          <Link href="/">the map</Link>
        )}
        <button
          type="button"
          aria-pressed={on}
          onClick={() => {
            const next = !on;
            setSound(next);
            setOn(next);
            if (next) pop(1.2);
          }}
        >
          sound <span>{on ? "on" : "off"}</span>
        </button>
      </nav>
    </header>
  );
}
