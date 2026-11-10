"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCursor } from "@react-three/drei";
import { MathUtils, Vector3 } from "three";
import { planetIds, type PlanetId } from "@/entities/planet/types";
import { markerOpacity } from "./markers/marker-layout";
import {
  CINEMATIC_ORBIT_STYLE as STYLE,
  orbitOpacity,
} from "./orbits/orbit-appearance";
import { createCinematicOrbit } from "./orbits/cinematic-orbit";

type Props = {
  id: PlanetId;
  date: Date;
  bodyPosition: { x: number; y: number; z: number };
  bodyRadius: number;
  color?: string;
  opacity?: number;
  segments?: number;
  active?: boolean;
  dimmed?: boolean;
  animate: boolean;
  onSelect?: (id: PlanetId) => void;
};
const NO_RAYCAST = () => {};

export function PlanetOrbit({
  id,
  date,
  bodyPosition,
  bodyRadius,
  color = "#a8c8e0",
  opacity = STYLE.opacity,
  segments = 512,
  active = false,
  dimmed = false,
  animate,
  onSelect,
}: Props) {
  const { size } = useThree();
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const highlight = useRef(0);
  const baseOpacity = useRef(0);
  const wholeVisibility = useRef(1);
  const phase = useRef(planetIds.indexOf(id) / planetIds.length);
  const cameraPosition = useRef(new Vector3());
  const timestamp = date.getTime();
  const orbit = useMemo(
    () => createCinematicOrbit(id, new Date(timestamp), segments, color),
    [id, timestamp, segments, color],
  );
  const frame = useRef<typeof orbit | null>(null);

  useLayoutEffect(() => {
    orbit.material.resolution.set(size.width, size.height);
    orbit.hitMaterial.resolution.set(size.width, size.height);
  }, [size.width, size.height, orbit]);

  useLayoutEffect(() => {
    frame.current = orbit;
    return () => {
      frame.current = null;
      orbit.geometry.dispose();
      orbit.hitGeometry.dispose();
      orbit.material.dispose();
      orbit.hitMaterial.dispose();
    };
  }, [orbit]);

  useFrame(({ camera, size }, delta) => {
    const orbit = frame.current;
    if (!orbit) return;
    const dt = Math.min(Math.max(delta, 0), 0.1);
    highlight.current = MathUtils.damp(
      highlight.current,
      hovered || active ? 1 : 0,
      8,
      dt,
    );
    camera.getWorldPosition(cameraPosition.current);
    const position = cameraPosition.current;
    const pixelsPerUnit =
      (size.height * camera.projectionMatrix.elements[5]) / 2;
    // Observer incidence, not mouse-look direction, controls a planar orbit's collapse.
    // Inside a large orbit, cap the projection distance by its radius to avoid bright horizon rails.
    const projectionDistance = Math.max(position.length(), orbit.radius, 0.001);
    const radiusPixels = (orbit.radius * pixelsPerUnit) / projectionDistance;
    const targetOpacity = orbitOpacity({
      elevation: position.dot(orbit.normal) / projectionDistance,
      radiusPixels,
      highlight: highlight.current,
      dimmed,
      opacity,
    });
    const distanceToBody = Math.hypot(
      position.x - bodyPosition.x,
      position.y - bodyPosition.y,
      position.z - bodyPosition.z,
    );
    const bodyPixels =
      (bodyRadius * pixelsPerUnit) / Math.max(distanceToBody, 0.0001);
    const closeVisibility = markerOpacity(bodyPixels);
    // Never let highlight or its easing bring back an orbit hidden by a close-up.
    wholeVisibility.current =
      closeVisibility === 0
        ? 0
        : MathUtils.damp(wholeVisibility.current, closeVisibility, 8, dt);
    baseOpacity.current = MathUtils.damp(
      baseOpacity.current,
      targetOpacity,
      6,
      dt,
    );
    orbit.material.opacity = baseOpacity.current * wholeVisibility.current;
    orbit.line.visible = closeVisibility > 0 && orbit.material.opacity > 0.001;
    orbit.material.linewidth = MathUtils.lerp(
      STYLE.ribbonWidth,
      STYLE.activeRibbonWidth,
      highlight.current,
    );
    orbit.uniforms.orbitCoreWidth.value = MathUtils.lerp(
      STYLE.coreWidth,
      STYLE.activeCoreWidth,
      highlight.current,
    );
    orbit.uniforms.orbitHighlight.value = highlight.current;
    orbit.uniforms.orbitMotion.value = animate ? 1 : 0;
    if (animate) phase.current = (phase.current + dt / STYLE.waveDuration) % 1;
    orbit.uniforms.orbitPhase.value = phase.current;
    const high = orbit.uniforms.orbitCameraHigh.value;
    high.set(
      Math.fround(position.x),
      Math.fround(position.y),
      Math.fround(position.z),
    );
    orbit.uniforms.orbitCameraLow.value.copy(position).sub(high);
    const interactive =
      orbit.line.visible && orbit.material.opacity > 0.04 && !dimmed;
    orbit.hit.raycast = interactive ? orbit.raycast : NO_RAYCAST;
    if (!interactive && hovered) setHovered(false);
  });

  return (
    <group name={`orbit-${id}`}>
      <primitive object={orbit.line} />
      <primitive
        object={orbit.hit}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          if (
            event.delta > 5 ||
            !orbit.line.visible ||
            orbit.hit.raycast === NO_RAYCAST
          )
            return;
          event.stopPropagation();
          onSelect?.(id);
        }}
      />
    </group>
  );
}
