"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { planetsById } from "@/entities/planet/catalog";
import type { PlanetRecord } from "@/entities/planet/types";
import { SOLAR_SCALE } from "@/entities/planet/position";
import { usePlanetStory } from "@/i18n/usePlanetStory";
import type { SimulationStore } from "../simulation/simulation-store";
import type { SolarMapFocus } from "../model/types";
import styles from "./solar-object-info.module.css";

type Props = {
  selected: Exclude<SolarMapFocus, null>;
  simulation: SimulationStore;
  collapsed: boolean;
  onToggle: () => void;
};

export function SolarObjectInfo({
  selected,
  simulation,
  collapsed,
  onToggle,
}: Props) {
  useSyncExternalStore(
    simulation.subscribe,
    simulation.getSnapshot,
    simulation.getServerSnapshot,
  );
  const positions = simulation.getFrame().positions;
  const t = useTranslations("map");
  const hud = useTranslations("map.hud");
  const ui = useTranslations("ui");
  const stories = useTranslations("planets");
  const format = useFormatter();
  const planet = selected === "sun" ? null : planetsById[selected];
  const name = planet ? stories(`${planet.id}.name`) : t("sun");
  const category = planet ? stories(`${planet.id}.category`) : t("sunCategory");
  const description = planet
    ? stories(`${planet.id}.introduction`)
    : hud("sunStudyText");
  const km = (value: number) =>
    `${format.number(value, { maximumFractionDigits: 0 })} ${ui("km")}`;
  const au = (value: number) =>
    `${format.number(value, { maximumFractionDigits: 3 })} ${ui("au")}`;
  const facts = [
    {
      label: hud("distanceFromSun"),
      value: au(planet ? positions[planet.id].distanceAu : 0),
    },
    {
      label: t("diameter"),
      value: km(planet?.diameterKm ?? SOLAR_SCALE.sunRadiusKm * 2),
    },
    {
      label: hud("orbitalPeriod"),
      value: planet
        ? `${format.number(planet.orbitDays, { maximumFractionDigits: 1 })} ${ui("days")}`
        : hud("notApplicable"),
    },
    ...(planet
      ? [
          {
            label: hud("axialPeriod"),
            value: `${format.number(Math.abs(planet.rotationHours), { maximumFractionDigits: 1 })} ${ui("hours")}`,
            note: planet.rotationHours < 0 ? ui("retrograde") : undefined,
          },
          {
            label: ui("mass"),
            value: `${format.number(planet.massKg, { notation: "scientific", maximumFractionDigits: 3 })} ${ui("kg")}`,
          },
          {
            label: ui("tilt"),
            value: `${format.number(planet.axialTilt, { maximumFractionDigits: 1 })} ${ui("degrees")}`,
          },
        ]
      : [
          {
            label: t("distanceToEarth"),
            value: au(positions.earth.distanceAu),
          },
          { label: hud("radius"), value: km(SOLAR_SCALE.sunRadiusKm) },
        ]),
  ];

  return (
    <article
      id="solar-object-information"
      className={styles.root}
      style={
        { "--object-accent": planet?.accent ?? "#f3ad77" } as CSSProperties
      }
      aria-label={t("objectInformation")}
    >
      <div className={styles.heading}>
        {planet ? (
          <Image
            className={styles.portrait}
            src={planet.image}
            width={52}
            height={52}
            alt=""
          />
        ) : (
          <span className={styles.sun} aria-hidden="true" />
        )}
        <div className={styles.identity}>
          <p className={styles.eyebrow}>{category}</p>
          <h2 id="solar-object-heading">
            {name}
            <span>.</span>
          </h2>
        </div>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={!collapsed}
          aria-controls="solar-object-body"
          aria-label={collapsed ? hud("expand") : hud("collapse")}
          onClick={onToggle}
        >
          <ChevronDown
            size={18}
            aria-hidden="true"
            style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}
          />
        </button>
      </div>
      <div
        id="solar-object-body"
        className={styles.body}
        data-collapsed={collapsed}
        inert={collapsed}
        aria-hidden={collapsed}
      >
        <div className={styles.bodyInner}>
          <div className={styles.scroll}>
            <p className={styles.description}>{description}</p>
            <dl className={styles.facts}>
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd title={"note" in fact ? fact.note : undefined}>
                    {fact.value}
                    {"note" in fact && fact.note && (
                      <span aria-label={fact.note}> ↺</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {planet && <PlanetChapters planet={planet} />}
          </div>
        </div>
      </div>
    </article>
  );
}

function PlanetChapters({ planet }: { planet: PlanetRecord }) {
  const story = usePlanetStory(planet.id);
  return (
    <div className={styles.chapters}>
      {story.chapters.map((chapter) => (
        <section key={chapter.title}>
          <h3>{chapter.title}</h3>
          <p>{chapter.text}</p>
        </section>
      ))}
      <p className={styles.discovery}>{story.discovery}</p>
    </div>
  );
}
