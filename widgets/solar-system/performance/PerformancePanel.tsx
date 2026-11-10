"use client";

import { Fragment, useSyncExternalStore } from "react";
import { Activity } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { RendererSample } from "@/shared/lib/renderer-telemetry";
import type { PerformanceStore } from "./performance-store";
import styles from "./performance-panel.module.css";
import { SkyDiagnostics } from "../sky/diagnostics/SkyDiagnostics";

type Props = { store: PerformanceStore; hidden: boolean };

export function PerformancePanel({ store, hidden }: Props) {
  const t = useTranslations("map.performance");
  const format = useFormatter();
  const sample = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const number = (value: number, decimals = 0) =>
    format.number(value, { maximumFractionDigits: decimals });
  const time = (value: number | null) =>
    value === null ? t("unavailable") : `${number(value, 1)} ms`;
  const rendererRows = (data: RendererSample) => [
    ["FPS", number(data.fps)],
    [t("frame"), time(data.frameMs)],
    [t("cpu"), time(data.cpuMs)],
    [t("gpu"), time(data.gpuMs)],
    [t("calls"), number(data.calls)],
    [t("triangles"), number(data.triangles)],
    [t("textures"), number(data.textures)],
    [t("geometries"), number(data.geometries)],
  ];
  const rows = (values: string[][]) =>
    values.map(([label, value]) => (
      <Fragment key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </Fragment>
    ));

  return (
    <details
      className={styles.root}
      hidden={hidden}
      onToggle={(event) => store.setExpanded(event.currentTarget.open)}
    >
      <summary title={t("title")} aria-label={t("title")}>
        <Activity size={16} aria-hidden="true" />
        <span>FPS</span>
      </summary>
      <div className={styles.panel}>
        <p>{t("title")}</p>
        {(["map", "previews"] as const).map((renderer) => (
          <section
            key={renderer}
            data-renderer-metrics={renderer}
            aria-label={t(renderer)}
          >
            <h3>{t(renderer)}</h3>
            {sample?.[renderer] ? (
              <dl>{rows(rendererRows(sample[renderer]))}</dl>
            ) : (
              <span>{t("collecting")}</span>
            )}
          </section>
        ))}
        {sample && (
          <section data-resource-metrics aria-label={t("shared")}>
            <h3>{t("shared")}</h3>
            <dl>
              {rows([
                [
                  t("memory"),
                  sample.heapMb === null
                    ? t("unavailable")
                    : `${number(sample.heapMb, 1)} MB`,
                ],
                [
                  t("estimated"),
                  sample.resources
                    ? `${number(sample.resources.estimatedBytes / 1048576, 1)} MB`
                    : t("unavailable"),
                ],
                [
                  t("budget"),
                  sample.resources
                    ? `${number(sample.resources.budgetBytes / 1048576)} MB`
                    : t("unavailable"),
                ],
                [t("evictions"), number(sample.resources?.evictions ?? 0)],
              ])}
            </dl>
          </section>
        )}
        <SkyDiagnostics sample={sample?.sky} />
        <small>{t("note")}</small>
      </div>
    </details>
  );
}
