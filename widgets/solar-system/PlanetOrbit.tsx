
"use client";

import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Line,
  LineBasicMaterial,
} from "three";

import { getPlanetOrbitPoints } from "@/entities/planet/orbit";
import type { PlanetId } from "@/entities/planet/types";

type PlanetOrbitProps = {
  id: PlanetId;
  date: Date;
  color?: string;
  opacity?: number;
  segments?: number;
};

export function PlanetOrbit({
  id,
  date,
  color = "#8294b4",
  opacity = 0.35,
  segments = 256,
}: PlanetOrbitProps) {
  const timestamp = date.getTime();

  const orbitLine = useMemo(() => {
    const points = getPlanetOrbitPoints(
      id,
      new Date(timestamp),
      segments,
    );

    const vertices = new Float32Array(
      points.length * 3,
    );

    for (let i = 0; i < points.length; i++) {
      const [x, y, z] = points[i];

      const offset = i * 3;

      vertices[offset] = x;
      vertices[offset + 1] = y;
      vertices[offset + 2] = z;
    }

    const geometry = new BufferGeometry();

    geometry.setAttribute(
      "position",
      new BufferAttribute(vertices, 3),
    );

    geometry.computeBoundingSphere();

    const material = new LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
    });

    return new Line(geometry, material);
  }, [id, timestamp, segments, color, opacity]);

  useEffect(() => {
    return () => {
      orbitLine.geometry.dispose();
      orbitLine.material.dispose();
    };
  }, [orbitLine]);

  return <primitive object={orbitLine} />;
}
