"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { catalog } from "@/entities/planet/catalog";
import { kmToSceneUnits } from "@/entities/planet/position";
import type { SolarMapFocus } from "../model/types";
import { clusterMapMarkers, markerOpacity } from "./marker-layout";
import type { MarkerStore, ProjectedMarker } from "./marker-store";
import type { SimulationStore } from "../simulation/simulation-store";

type Props = {
  simulation: SimulationStore;
  selected: SolarMapFocus;
  bottomInset: number;
  sideInset: number;
  topInset: number;
  store: MarkerStore;
};

export function MarkerProjection({
  simulation,
  selected,
  bottomInset,
  sideInset,
  topInset,
  store,
}: Props) {
  const vector = useRef(new Vector3());
  const elapsed = useRef(0);
  const bodies = useMemo(
    () => [
      { id: "sun" as const, position: { x: 0, y: 0, z: 0 }, radius: 2 },
      ...catalog.map((planet) => ({
        id: planet.id,
        position: simulation.getFrame().positions[planet.id],
        radius: kmToSceneUnits(planet.diameterKm / 2),
      })),
    ],
    [simulation],
  );

  // Registered after CameraRig; project its final camera pose, at most 30 times/s.
  useFrame(({ camera, size }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 1 / 30) return;
    elapsed.current = 0;
    camera.updateMatrixWorld();
    const height = Math.max(0, size.height - bottomInset);
    const candidates: ProjectedMarker[] = [];
    const pixelsPerUnit =
      (size.height * camera.projectionMatrix.elements[5]) / 2;
    for (const body of bodies) {
      const { x, y, z } = body.position;
      const distance = Math.hypot(
        camera.position.x - x,
        camera.position.y - y,
        camera.position.z - z,
      );
      const opacity = markerOpacity(
        (body.radius * pixelsPerUnit) / Math.max(distance, 0.001),
      );
      vector.current
        .set(
          x,
          y + (body.id === "sun" ? 0 : Math.max(body.radius * 1.7, 0.015)),
          z,
        )
        .project(camera);
      const point = vector.current;
      const screenX = ((point.x + 1) * size.width) / 2;
      const screenY = ((1 - point.y) * size.height) / 2;
      if (
        opacity <= 0.05 ||
        point.z < -1 ||
        point.z > 1 ||
        screenX < sideInset ||
        screenX > size.width ||
        screenY < topInset ||
        screenY > height ||
        height - topInset < 100
      )
        continue;
      candidates.push({
        id: body.id,
        x: Math.max(sideInset + 64, Math.min(size.width - 64, screenX)),
        y: Math.max(topInset + 50, Math.min(height - 50, screenY)),
        width: 112,
        height: 84,
        opacity,
        priority:
          body.id === store.getFocused()
            ? 5
            : body.id === selected
              ? 4
              : body.id === store.getHovered()
                ? 3
                : body.id === "sun"
                  ? 2
                  : 0,
      });
    }
    store.publish({
      groups: clusterMapMarkers(
        candidates,
        store
          .getSnapshot()
          .groups.map((group) => group.map((marker) => marker.id)),
      ),
      width: size.width,
      height,
    });
  });
  return null;
}
