
"use client";

import { useMemo } from "react";
import { Html } from "@react-three/drei";
import {
  useFormatter,
  useTranslations,
} from "next-intl";

import { catalog } from "@/entities/planet/catalog";
import {
  getPlanetScenePosition,
  kmToSceneUnits,
} from "@/entities/planet/position";

import { PlanetOrbit } from "./PlanetOrbit";

type Props = {
  date: Date;
  showOrbits?: boolean;
  showLabels?: boolean;
};

export function SolarSystemBodies({
  date,
  showOrbits = true,
  showLabels = false,
}: Props) {
  const tPlanets = useTranslations("planets");
  const tUi = useTranslations("ui");
  const format = useFormatter();

  const timestamp = date.getTime();

  const referenceDate = useMemo(
    () => new Date(timestamp),
    [timestamp],
  );

  const bodies = useMemo(() => {
    return catalog.map((planet) => {
      const position = getPlanetScenePosition(
        planet.id,
        referenceDate,
      );

      const radius = kmToSceneUnits(
        planet.diameterKm / 2,
      );

      return {
        ...planet,
        position,
        radius,
      };
    });
  }, [referenceDate]);

  return (
    <group name="solar-system-bodies">
      {bodies.map((planet) => (
        <group key={planet.id}>
          {showOrbits && (
            <PlanetOrbit
              id={planet.id}
              date={referenceDate}
              color={planet.accent}
              opacity={0.35}
            />
          )}

          <group
            name={`planet-${planet.id}`}
            position={[
              planet.position.x,
              planet.position.y,
              planet.position.z,
            ]}
          >
            {/* Temporary low-cost planet geometry */}
            <mesh>
              <sphereGeometry
                args={[planet.radius, 24, 16]}
              />

              <meshBasicMaterial
                color={planet.accent}
                toneMapped={false}
              />
            </mesh>

            {showLabels && (
              <Html
                center
                position={[
                  0,
                  Math.max(planet.radius * 2, 0.3),
                  0,
                ]}
                style={{
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "7px 12px",
                    borderRadius: 8,
                    background:
                      "rgba(7, 12, 24, 0.82)",
                    border:
                      "1px solid rgba(255,255,255,0.15)",
                    color: "#ffffff",
                    fontSize: 12,
                  }}
                >
                  <strong>
                    {tPlanets(`${planet.id}.name`)}
                  </strong>

                  <span
                    style={{
                      opacity: 0.7,
                      fontSize: 11,
                    }}
                  >
                    {format.number(
                      planet.position.distanceAu,
                      {
                        maximumFractionDigits: 2,
                      },
                    )}{" "}
                    {tUi("au")}
                  </span>
                </div>
              </Html>
            )}
          </group>
        </group>
      ))}
    </group>
  );
}
