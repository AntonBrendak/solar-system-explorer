"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { catalog } from "@/entities/planet/catalog";
import type { PlanetId } from "@/entities/planet/types";
import { kmToSceneUnits } from "@/entities/planet/position";
import {
  PlanetModel,
  PlanetModelFallback,
  retryPlanetTextures,
} from "@/features/planet-viewer";
import { mapLiteTextures } from "./model/map-lite-textures";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";
import { PlanetOrbit } from "./PlanetOrbit";
import type { SimulationStore } from "./simulation/simulation-store";

type Props = {
  simulation: SimulationStore;
  orbitDate: Date;
  animate: boolean;
  focusedPlanet: PlanetId | null;
  hoveredPlanet: PlanetId | null;
  focusActive: boolean;
  onPlanetSelect: (id: PlanetId) => void;
  onPlanetReady: (id: PlanetId) => void;
  onDetailError: (id: PlanetId | null) => void;
};

export function SolarSystemBodies({
  simulation,
  orbitDate,
  animate,
  focusedPlanet,
  hoveredPlanet,
  focusActive,
  onPlanetSelect,
  onPlanetReady,
  onDetailError,
}: Props) {
  const [detail, setDetail] = useState<{
    id: PlanetId | null;
    ready: boolean;
    failed: boolean;
    session: number;
    pixelDiameter: number;
  }>({ id: null, ready: false, failed: false, session: 0, pixelDiameter: 0 });
  const detailCandidate = useRef({
    id: null as PlanetId | null,
    since: 0,
    measuredAt: 0,
  });
  const projection = useRef(new Vector3());
  const groups = useRef<Partial<Record<PlanetId, Group>>>({});
  const bodies = useMemo(
    () =>
      catalog.map((planet) => {
        const position = simulation.getFrame().positions[planet.id];
        return {
          ...planet,
          position,
          motion: {
            date: simulation.getFrame().date,
            rotation: simulation.getFrame().rotations[planet.id],
          },
          sunDirection: new Vector3(
            -position.x,
            -position.y,
            -position.z,
          ).normalize(),
          radius: kmToSceneUnits(planet.diameterKm / 2),
        };
      }),
    [simulation],
  );

  // Update before environments, camera tracking and marker projection consume this frame.
  useFrame(() => {
    for (const body of bodies) {
      const { x, y, z } = body.position;
      groups.current[body.id]?.position.set(x, y, z);
      body.sunDirection.set(-x, -y, -z).normalize();
    }
  }, -1.5);

  // Only the selected, visible globe can own a Full model. Hysteresis prevents
  // repeated mounts while the camera hovers around the detail threshold.
  useFrame(({ camera, size }) => {
    const selected = bodies.find((planet) => planet.id === focusedPlanet);
    let next: PlanetId | null = null;
    let pixelDiameter = 0;
    if (selected) {
      camera.updateMatrixWorld();
      const { x, y, z } = selected.position;
      const point = projection.current.set(x, y, z).project(camera);
      const distance = Math.hypot(
        camera.position.x - x,
        camera.position.y - y,
        camera.position.z - z,
      );
      const radiusPixels =
        (selected.radius * size.height * camera.projectionMatrix.elements[5]) /
        (2 * Math.max(distance, 0.0001));
      const threshold = detail.id === selected.id ? 40 : 64;
      pixelDiameter = radiusPixels * 2;
      if (
        radiusPixels >= threshold &&
        point.z >= -1 &&
        point.z <= 1 &&
        Math.abs(point.x) <= 1.2 &&
        Math.abs(point.y) <= 1.2
      )
        next = selected.id;
    }
    const now = performance.now();
    if (next !== detailCandidate.current.id)
      detailCandidate.current = { id: next, since: now, measuredAt: now };
    if (
      next &&
      next !== detail.id &&
      now - detailCandidate.current.since < 1000
    )
      return;
    if (next !== detail.id) {
      if (next) retryPlanetTextures();
      setDetail((previous) => ({
        id: next,
        ready: false,
        failed: false,
        session: previous.session + 1,
        pixelDiameter,
      }));
      onDetailError(null);
    } else if (
      next &&
      now - detailCandidate.current.measuredAt > 500 &&
      Math.abs(pixelDiameter - detail.pixelDiameter) >
        Math.max(32, detail.pixelDiameter * 0.25)
    ) {
      detailCandidate.current.measuredAt = now;
      setDetail((current) => ({ ...current, pixelDiameter }));
    }
  });

  return (
    <group name="solar-system-bodies">
      {bodies.map((planet) => {
        const selected = focusedPlanet === planet.id;
        const highlighted = selected || hoveredPlanet === planet.id;
        return (
          <group key={planet.id}>
            <PlanetOrbit
              animate={animate}
              id={planet.id}
              date={orbitDate}
              color={planet.accent}
              bodyPosition={planet.position}
              bodyRadius={planet.radius}
              active={highlighted}
              dimmed={focusActive && !highlighted}
              onSelect={onPlanetSelect}
            />
            <group
              ref={(group) => {
                if (group) groups.current[planet.id] = group;
                else delete groups.current[planet.id];
              }}
              name={`planet-${planet.id}`}
              position={[
                planet.position.x,
                planet.position.y,
                planet.position.z,
              ]}
            >
              <ErrorBoundary
                onError={() => onDetailError(planet.id)}
                fallback={
                  <PlanetModelFallback
                    radius={planet.radius}
                    color={planet.accent}
                    visible={
                      !selected || detail.id !== planet.id || !detail.ready
                    }
                    onReady={() => onPlanetReady(planet.id)}
                  />
                }
              >
                <Suspense fallback={null}>
                  <PlanetModel
                    planetId={planet.id}
                    radius={planet.radius}
                    quality="2k"
                    detail="lite"
                    fallback
                    textureSources={mapLiteTextures}
                    visible={
                      !selected || detail.id !== planet.id || !detail.ready
                    }
                    sunDirection={planet.sunDirection}
                    motion={planet.motion}
                    animate={animate}
                    onReady={() => onPlanetReady(planet.id)}
                  />
                </Suspense>
              </ErrorBoundary>
              {selected && detail.id === planet.id && (
                <ErrorBoundary
                  key={detail.session}
                  onError={() => {
                    setDetail((current) =>
                      current.session === detail.session
                        ? { ...current, ready: false, failed: true }
                        : current,
                    );
                    onDetailError(planet.id);
                  }}
                >
                  <Suspense fallback={null}>
                    <PlanetModel
                      planetId={planet.id}
                      radius={planet.radius}
                      quality="8k"
                      detail="full"
                      pixelDiameter={detail.pixelDiameter}
                      sunDirection={planet.sunDirection}
                      motion={planet.motion}
                      animate={animate}
                      onPrepared={() =>
                        setDetail((current) =>
                          current.session === detail.session &&
                          !current.ready &&
                          !current.failed
                            ? { ...current, ready: true }
                            : current,
                        )
                      }
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
}
