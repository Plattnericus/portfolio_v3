"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { ROUTES, type Route } from "./layout";
import { world } from "@/lib/world";

const ease = (f: number) => {
  const s = f * f * (3 - 2 * f);
  return f + (s - f) * 0.7;
};

const pos = new THREE.Vector3();
const tgt = new THREE.Vector3();
const mpos = new THREE.Vector3();
const mtgt = new THREE.Vector3();

/**
 * Flies the camera along splines through the route's keys. Key n is reached
 * exactly when the [data-cam] marker n hits the top of the viewport. Portrait
 * screens follow their own framing where a key defines one.
 */
export function CameraRig({ route }: { route: Route }) {
  const curves = useMemo(() => {
    const keys = ROUTES[route];
    const mk = (pick: (i: number) => THREE.Vector3) =>
      keys.length > 1 ? new THREE.CatmullRomCurve3(keys.map((_, i) => pick(i)), false, "centripetal") : null;
    return {
      n: keys.length,
      single: keys[0],
      pos: mk((i) => new THREE.Vector3(...keys[i].pos)),
      tgt: mk((i) => new THREE.Vector3(...keys[i].target)),
      mpos: mk((i) => new THREE.Vector3(...(keys[i].mPos ?? keys[i].pos))),
      mtgt: mk((i) => new THREE.Vector3(...(keys[i].mTarget ?? keys[i].target))),
    };
  }, [route]);
  const look = useRef<THREE.Vector3 | null>(null);
  const smoothPointer = useRef({ x: 0, y: 0 });

  useFrame(({ camera, size, clock }, dt) => {
    const { n } = curves;
    let t = 0;
    if (n > 1) {
      const a = world.anchors.length === n ? world.anchors : Array.from({ length: n }, (_, i) => i / (n - 1));
      const p = world.progress;
      if (p <= a[0]) t = 0;
      else if (p >= a[n - 1]) t = 1;
      else {
        let i = 0;
        while (i < n - 2 && p > a[i + 1]) i++;
        const span = Math.max(1e-6, a[i + 1] - a[i]);
        t = (i + ease((p - a[i]) / span)) / (n - 1);
      }
    }

    const aspect = size.width / size.height;
    const portrait = THREE.MathUtils.clamp((1.15 - aspect) / 0.6, 0, 1);
    if (curves.pos && curves.tgt && curves.mpos && curves.mtgt) {
      curves.pos.getPoint(t, pos);
      curves.tgt.getPoint(t, tgt);
      curves.mpos.getPoint(t, mpos);
      curves.mtgt.getPoint(t, mtgt);
    } else {
      const k = curves.single;
      pos.set(...k.pos);
      tgt.set(...k.target);
      mpos.set(...(k.mPos ?? k.pos));
      mtgt.set(...(k.mTarget ?? k.target));
    }
    pos.lerp(mpos, portrait);
    tgt.lerp(mtgt, portrait);
    if (aspect < 1) {
      const k = 1 + (1 - aspect) * 0.75;
      pos.sub(tgt).multiplyScalar(k).add(tgt);
    }

    const sp = smoothPointer.current;
    sp.x = THREE.MathUtils.damp(sp.x, world.pointer.x, 3, dt);
    sp.y = THREE.MathUtils.damp(sp.y, world.pointer.y, 3, dt);
    const height = Math.max(1, pos.y / 12);
    pos.x += sp.x * 0.45 * height;
    pos.y += sp.y * 0.25 * height;
    if (route === "lost") pos.x += Math.sin(clock.elapsedTime * 0.3) * 0.4;

    if (!look.current) {
      look.current = tgt.clone();
      camera.position.copy(pos);
    }
    const lambda = world.reducedMotion ? 20 : 4.5;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, pos.x, lambda, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, pos.y, lambda, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, pos.z, lambda, dt);
    look.current.lerp(tgt, 1 - Math.exp(-lambda * dt));
    camera.lookAt(look.current);
  });

  return null;
}
