"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { Component, startTransition, useCallback, useEffect, useState, type ReactNode } from "react";
import type { Planet } from "@/data/planets";
import { afterPaint } from "@/lib/idle-task";
import { getPlanetVisual } from "./registry";
import type { CachedPlanetScene, PlanetPresentation } from "./types";

const PlanetStage = dynamic(() => import("./PlanetStage"), { ssr: false });

type Props = {
  planet: Planet;
  presentation?: PlanetPresentation;
  motionPaused?: boolean;
  priority?: boolean;
};

class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

function StageSlot({ entries, activeId, label, presentation, motionPaused }: {
  entries: CachedPlanetScene[];
  activeId: string;
  label: string;
  presentation: PlanetPresentation;
  motionPaused: boolean;
}) {
  const [drawnId, setDrawnId] = useState<string | null>(null);
  const ready = useCallback((id: string) => {
    setDrawnId(id);
  }, []);
  const failed = useCallback((id: string) => {
    setDrawnId((previous) => previous === id ? null : previous);
  }, []);
  const active = entries.some((entry) => entry.id === activeId);
  const visible = active && drawnId === activeId;
  return (
    <div
      className="planet-model"
      data-active={active}
      data-ready={visible}
      data-interactive={presentation === "lab" || presentation === "hero"}
      role="img"
      aria-label={label}
      aria-hidden={!visible}
    >
      <PlanetStage
        entries={entries}
        activeId={activeId}
        presentation={presentation}
        motionPaused={motionPaused}
        onReady={ready}
        onError={failed}
      />
    </div>
  );
}

/** Generic persistent stage: no object-specific loading or rendering branches. */
export function PlanetVisual({
  planet,
  presentation = "hero",
  motionPaused = false,
  priority = false,
}: Props) {
  const definition = getPlanetVisual(planet.id);
  const [entries, setEntries] = useState<CachedPlanetScene[]>([]);
  const candidate = presentation === "thumbnail"
    ? definition.PreviewScene
    : definition.PreviewScene ?? definition.Scene;
  useEffect(() => {
    if (!candidate || entries.some((entry) => entry.id === planet.id)) return;
    return afterPaint(() => {
      startTransition(() => setEntries((previous) =>
        previous.some((entry) => entry.id === planet.id)
          ? previous
          : [...previous, { id: planet.id, definition }],
      ));
    });
  }, [candidate, definition, entries, planet.id]);

  const hero = presentation === "hero";
  const card = presentation === "card";
  const decorative = card || presentation === "thumbnail";
  const label = `${planet.name}, seen from space`;
  const imageSize = presentation === "thumbnail" ? 55 : card ? 360 : 720;
  return (
    <>
      {hero && definition.rings === "saturn" && (
        <span className="saturn-ring saturn-ring-back" aria-hidden="true" />
      )}
      {card && definition.rings === "saturn" && (
        <span className="feature-saturn-ring" aria-hidden="true" />
      )}
      <div
        className={`planet-object planet-object-${presentation}${hero ? " planet-drift" : ""}${card ? " feature-spin" : ""}`}
        data-planet-object={planet.id}
        aria-hidden={decorative || undefined}
      >
        <div className={`planet-image-spin${hero ? " planet-spin" : ""}`}>
          <Image
            src={planet.image}
            alt={decorative ? "" : label}
            width={imageSize}
            height={imageSize}
            priority={priority}
            className={card ? "feature-planet" : "planet-render"}
          />
        </div>
        {entries.length > 0 && (
          <ModelBoundary>
            <StageSlot
              entries={entries}
              activeId={candidate ? planet.id : ""}
              label={label}
              presentation={presentation}
              motionPaused={motionPaused}
            />
          </ModelBoundary>
        )}
        {candidate && !decorative && definition.credits && (
          <a
            className="planet-object-credits"
            href={definition.credits.href}
            title={definition.credits.description}
            target="_blank"
            rel="noreferrer"
          >
            {definition.credits.label}
          </a>
        )}
      </div>
      {hero && definition.rings === "saturn" && (
        <span className="saturn-ring saturn-ring-front" aria-hidden="true" />
      )}
    </>
  );
}
