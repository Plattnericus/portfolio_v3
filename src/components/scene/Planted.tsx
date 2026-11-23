"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { candy } from "./materials";
import { MODELS, useNodes } from "./Props";
import { terrain } from "./layout";
import { EVENTS, emit, world } from "@/lib/world";
import { chime, pop } from "@/lib/sound";

const CAP = 300;
const GROW = 1.1;
const MILESTONES = new Set([10, 25, 50, 100]);

type Sprout = { x: number; z: number; s: number; ry: number; born: number; settled: boolean };

/** elastic-out, 0..1 */
function elastic(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

export function Planted() {
  const nodes = useNodes(MODELS.candy);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const sprouts = useRef<Sprout[]>([]);
  const total = useRef(0);
  const now = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, dt) => {
    now.current += dt;
    const m = mesh.current;
    if (!m) return;
    let dirty = false;
    sprouts.current.forEach((sp, i) => {
      if (sp.settled) return;
      const age = now.current - sp.born;
      const k = elastic(Math.min(1, age / GROW));
      const s = Math.max(0.0001, sp.s * k);
      dummy.position.set(sp.x, terrain(sp.x, sp.z) + (3.4 - 0.3) * s, sp.z);
      dummy.rotation.set(0, sp.ry + (1 - k) * 2.5, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      sp.settled = age > GROW;
      dirty = true;
    });
    m.count = sprouts.current.length;
    if (dirty) m.instanceMatrix.needsUpdate = true;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!world.plantMode) return;
    const target = e.nativeEvent.target as HTMLElement | null;
    if (target?.closest("a, button")) return;
    e.stopPropagation();
    const sp: Sprout = {
      x: e.point.x,
      z: e.point.z,
      s: 0.42 + Math.random() * 0.3,
      ry: (Math.random() - 0.5) * 1.2,
      born: now.current,
      settled: false,
    };
    const slot = total.current % CAP;
    sprouts.current[slot] = sp;
    total.current += 1;
    pop(0.7 + Math.random() * 0.8);
    if (MILESTONES.has(total.current)) chime();
    emit(EVENTS.planted, total.current);
  };

  return (
    <>
      <instancedMesh ref={mesh} args={[nodes.LollipopLo.geometry, candy, CAP]} count={0} frustumCulled={false} />
      {/* cheap, invisible catcher for clicks on the meadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -2]} onClick={onClick}>
        <planeGeometry args={[60, 44]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
}
