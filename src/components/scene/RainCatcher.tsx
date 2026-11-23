"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { WATER_Y, isMeadow, terrain, type Route } from "./layout";
import { EVENTS, emit, world } from "@/lib/world";

/** Taps on the beach (contact section) or anywhere on the lost page rain candy. */
export function RainCatcher({ route }: { route: Route }) {
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!(world.rainMode || route === "lost")) return;
    const target = e.nativeEvent.target as HTMLElement | null;
    if (target?.closest("a, button")) return;
    e.stopPropagation();
    if (!isMeadow(e.point.x, e.point.z) && terrain(e.point.x, e.point.z) < WATER_Y - 1.5) return;
    emit(EVENTS.rain, { x: e.point.x, z: e.point.z });
  };
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={route === "lost" ? [0, 0.05, -2] : [42, 0.1, 0]} onClick={onClick}>
      <planeGeometry args={route === "lost" ? [40, 30] : [34, 40]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}
