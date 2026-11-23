"use client";

import Link from "next/link";
import { useRef } from "react";
import { gsap, SplitText, useGSAP } from "@/lib/scroll";
import { scrubCount, scrubIn, scrubOut } from "@/lib/reveal";
import { EVENTS, emit, world } from "@/lib/world";
import type { Portfolio } from "@/lib/portfolio";

const num = (n: number | null) => (n === null ? null : new Intl.NumberFormat("en-US").format(n));
const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/* ================================================================== map hero */

export function MapHero({ data }: { data: Portfolio }) {
  const root = useRef<HTMLElement>(null);
  const { profile } = data;

  useGSAP(
    () => {
      const title = root.current!.querySelector(".mh__title")!;
      const split = SplitText.create(title, { type: "chars", charsClass: "char" });
      const rest = gsap.utils.toArray<HTMLElement>(".mh__sub, .mh__focus, .mh__line, .mh__hint");
      gsap.set(split.chars, { yPercent: -130, rotation: () => gsap.utils.random(-35, 35), opacity: 0 });
      gsap.set(rest, { opacity: 0, y: 20 });

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
            stagger: reduce ? 0 : 0.06,
          })
          .to(rest, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power3.out" }, "-=1.0");
      };
      window.addEventListener(EVENTS.intro, intro, { once: true });

      const out = { trigger: root.current, start: "top top", end: "bottom top", scrub: 0.6 };
      // translate only: scaling the giant title would re-rasterise it and its shadow on every settle
      gsap.to(".mh__title", { yPercent: -60, ease: "none", scrollTrigger: out });
      gsap.to(".mh__sub, .mh__focus, .mh__line", { yPercent: -40, ease: "none", scrollTrigger: out });
      gsap.to(".mh__inner, .mh__hint", { opacity: 0, ease: "none", scrollTrigger: { ...out, start: "top -10%" } });
      return () => window.removeEventListener(EVENTS.intro, intro);
    },
    { scope: root },
  );

  return (
    <section className="mh" ref={root} data-section="map" id="top">
      <i className="cam" data-cam="map" style={{ top: 0 }} />
      <div className="mh__inner">
        <h1 className="mh__title" data-skew>
          <span className="sr-only">
            {profile.name} ({profile.alias}),{" "}
          </span>
          {profile.name}
        </h1>
        <p className="mh__sub">{profile.role}.</p>
        <p className="mh__focus">{profile.focus.filter((f) => !profile.role.toLowerCase().includes(f.toLowerCase())).join(" · ")}</p>
        <p className="mh__line">aka {profile.alias}</p>
      </div>
      <p className="mh__hint">Scroll to land on the island</p>
    </section>
  );
}

/* ================================================================== about */

export function About({ data }: { data: Portfolio }) {
  const root = useRef<HTMLElement>(null);
  const { profile } = data;

  useGSAP(
    () => {
      const el = root.current!;
      const split = SplitText.create(el.querySelector(".ab__hi")!, { type: "chars" });
      scrubIn(split.chars, el, { yPercent: 120, rotation: () => gsap.utils.random(-25, 25) }, { stagger: 0.04 });
      scrubIn(".ab__body > *", el, { y: 60 }, { stagger: 0.15, start: "top 70%", end: "top 10%" });
      scrubOut(".ab__stick", el);
    },
    { scope: root },
  );

  return (
    <section className="ab" ref={root} data-section="about" id="about" aria-labelledby="about-title">
      <i className="cam" data-cam="about" style={{ top: "18svh" }} />
      <div className="ab__stick">
        <h2 className="ab__hi" id="about-title" data-skew>
          <span>Hi,</span> <span>I&apos;m</span> <em>{profile.name}.</em>
        </h2>
        <div className="ab__body">
          <p>
            <span className="hl">
              {profile.intro} {profile.outro} With{" "}
              {profile.crew.map((c, i) => (
                <span key={c}>
                  {i > 0 && " and "}
                  <a href={`https://github.com/${c}`} rel="noopener" target="_blank">
                    @{c}
                  </a>
                </span>
              ))}
              .
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== skills */

export function Stack({ data }: { data: Portfolio }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const words = gsap.utils.toArray<HTMLElement>(".st__word");
      const groups = gsap.utils.toArray<HTMLElement>(".st__group-name");
      gsap.set(words, { scale: 0, rotation: () => gsap.utils.random(-18, 18) });
      gsap.set(groups, { opacity: 0, x: 30 });
      gsap
        .timeline({
          scrollTrigger: {
            trigger: root.current,
            start: "top 70%",
            end: "bottom 60%",
            scrub: 0.6,
            onUpdate: (self) => {
              world.scream = Math.sin(self.progress * Math.PI);
            },
            onLeave: () => (world.scream = 0),
            onLeaveBack: () => (world.scream = 0),
          },
        })
        .to(groups, { opacity: 1, x: 0, stagger: 0.5, duration: 0.6, ease: "power3.out" }, 0)
        .to(words, { scale: 1, rotation: 0, stagger: 0.1, duration: 0.5, ease: "back.out(2.6)" }, 0.1);
      scrubIn(".st__head > *", root.current!, { y: 70 }, { stagger: 0.2 });
      scrubOut(".st__stick", root.current!);
    },
    { scope: root },
  );

  return (
    <section className="st" ref={root} data-section="stack" aria-labelledby="stack-title">
      <i className="cam" data-cam="stack" style={{ top: "20svh" }} />
      <div className="st__stick">
        <div className="st__head">
          <h2 className="display st__title" id="stack-title" data-skew>
            My <em>skills</em>
          </h2>
        </div>
        <dl className="st__groups">
          {(data.skills ?? []).map((g) => (
            <div key={g.group} className="st__group">
              <dt className="st__group-name">{g.group}</dt>
              <dd>
                <ul className="st__words">
                  {g.items.map((s) => (
                    <li key={s} className="st__word">
                      {s}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ================================================================== work */

export function Work({ data }: { data: Portfolio }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.utils.toArray<HTMLElement>(".pj").forEach((el) => {
        const split = SplitText.create(el.querySelector(".pj__title")!, { type: "words, chars" });
        scrubIn(split.chars, el, { yPercent: 110, rotation: () => gsap.utils.random(-20, 20) }, { stagger: 0.03 });
        scrubIn(el.querySelectorAll(".pj__num, .pj__kind, .pj__text, .pj__meta, .pj__links"), el, { y: 50 }, {
          stagger: 0.12,
          start: "top 75%",
          end: "top 5%",
        });
        scrubOut(el.querySelector(".pj__stick"), el);
      });
      const intro = root.current!.querySelector(".wk__intro")!;
      const split = SplitText.create(intro.querySelector(".wk__title")!, { type: "words, chars" });
      scrubIn(split.chars, intro, { yPercent: 120 }, { stagger: 0.035 });
      gsap.to(intro, {
        opacity: 0,
        yPercent: -20,
        ease: "none",
        scrollTrigger: { trigger: intro, start: "bottom 60%", end: "bottom top", scrub: 0.9 },
      });
    },
    { scope: root },
  );

  const total = String(data.projects.length).padStart(2, "0");

  return (
    <section className="wk" ref={root} id="work" aria-labelledby="work-title">
      <div className="wk__intro">
        <h2 className="display wk__title" id="work-title" data-skew>
          Things that <em>run</em>
        </h2>
      </div>
      {data.projects.map((p, i) => (
        <article key={p.repo} className="pj" data-section={`work-${i}`} aria-labelledby={`pj-${i}`}>
          <i className="cam" data-cam={`work-${i}`} style={{ top: "20svh" }} />
          <div className="pj__stick">
            <p className="pj__num" aria-hidden>
              {String(i + 1).padStart(2, "0")}
              <small>/{total}</small>
            </p>
            <h3 className="pj__title" id={`pj-${i}`} data-skew>
              {p.title}
            </h3>
            <p className="pj__kind">{p.kind}</p>
            <p className="pj__text">
              <span className="hl">{p.summary}</span>
            </p>
            <p className="pj__meta">
              {p.tech.slice(0, 3).join(" · ")}
              {p.stars !== null && p.stars > 0 && <> · {num(p.stars)} stars</>}
            </p>
            <p className="pj__links">
              {p.live && (
                <a href={p.live} target="_blank" rel="noopener">
                  Live <span aria-hidden>↗</span>
                  <span className="sr-only"> {host(p.live)}</span>
                </a>
              )}
              <a href={p.source} target="_blank" rel="noopener">
                Source <span aria-hidden>↗</span>
                <span className="sr-only"> {p.repo} on GitHub</span>
              </a>
            </p>
          </div>
        </article>
      ))}
    </section>
  );
}

/* ================================================================== github castle */

export function GithubCastle({ data }: { data: Portfolio }) {
  const root = useRef<HTMLElement>(null);
  const { profile } = data;
  const stats = [
    { n: profile.publicRepos, label: "public repos" },
    { n: profile.totalStars, label: "stars on my repos" },
    { n: profile.followers, label: "followers" },
  ].filter((s) => s.n !== null);

  useGSAP(
    () => {
      const el = root.current!;
      gsap.utils.toArray<HTMLElement>(".gh__n").forEach((n) => scrubCount(n, el));
      const split = SplitText.create(el.querySelector(".gh__title")!, { type: "words, chars" });
      scrubIn(split.chars, el, { yPercent: 120, rotation: () => gsap.utils.random(-15, 15) }, { stagger: 0.03 });
      scrubIn(".gh__stick > :not(.gh__title)", el, { y: 60 }, { stagger: 0.15, start: "top 75%", end: "top 10%" });
      scrubOut(".gh__stick", el);
    },
    { scope: root },
  );

  return (
    <section className="gh" ref={root} data-section="github" aria-labelledby="gh-title">
      <i className="cam" data-cam="github" style={{ top: "20svh" }} />
      <div className="gh__stick">
        <h2 className="display gh__title" id="gh-title" data-skew>
          The GitHub <em>castle</em>
        </h2>
        {stats.length > 0 ? (
          <dl className="gh__stats">
            {stats.map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd className="gh__n" data-n={s.n!}>
                  {num(s.n)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>
            <span className="hl">GitHub is taking a nap right now. The castle gates are open anyway.</span>
          </p>
        )}
        <a className="btn" href={profile.github} target="_blank" rel="noopener">
          Enter the castle <span aria-hidden>↗</span>
        </a>
      </div>
    </section>
  );
}

/* ================================================================== contact */

export function Contact({ data, year }: { data: Portfolio; year: number }) {
  const root = useRef<HTMLElement>(null);
  const { profile, links } = data;

  useGSAP(
    () => {
      const el = root.current!;
      const split = SplitText.create(el.querySelector(".ct__title")!, { type: "words, chars" });
      scrubIn(split.chars, el, { yPercent: 130, scaleY: 0.5 }, { stagger: 0.05, start: "top 80%", end: "top 5%" });
      scrubIn(".ct__body > *", el, { y: 60 }, { stagger: 0.15, start: "top 55%", end: "top -15%" });

      // scrolling down onto the beach makes it rain candy
      let next = 0;
      gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: "top 75%",
          end: "bottom bottom",
          onUpdate: (self) => {
            if (self.direction < 0) {
              next = Math.min(next, self.progress);
              return;
            }
            while (self.progress >= next) {
              emit(EVENTS.rain, { x: 37 + Math.random() * 11, z: -7 + Math.random() * 14, n: 6 });
              next += 0.06;
            }
          },
        },
      });
    },
    { scope: root },
  );

  return (
    <section className="ct" ref={root} data-section="contact" id="contact" aria-labelledby="ct-title">
      <i className="cam" data-cam="contact" style={{ top: "30svh" }} />
      <div className="ct__inner">
        <h2 className="ct__title" id="ct-title" data-skew>
          Say <em>hi.</em>
        </h2>
        <div className="ct__body">
          <p className="ct__mail">
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
          </p>
          <p className="ct__links">
            {links.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener me">
                {l.label} <span aria-hidden>↗</span>
              </a>
            ))}
          </p>
        </div>
        <footer className="foot">
          <p>
            © {year} {profile.name} / {profile.alias}. Modelled in Blender, rendered with three.js.
          </p>
          <Link href="/sunshine">sunshine lollipops ↗</Link>
        </footer>
      </div>
    </section>
  );
}
