import { Fragment } from "react";
import type { SkyMetrics } from "../model/sky-types";

export function SkyDiagnostics({
  sample,
}: {
  sample: SkyMetrics | null | undefined;
}) {
  if (!sample) return null;
  const rows = [
    ["Base / page", `${sample.base} / ${sample.profile || "—"} px`],
    ["CPU + reserve", `${(sample.cpuBytes / 1048576).toFixed(1)} MiB`],
    ["GPU + reserve", `${(sample.gpuBytes / 1048576).toFixed(1)} MiB`],
    ["Pages", `${sample.used} / ${sample.slots}`],
    ["Requests", String(sample.requests)],
    ["View generation", String(sample.viewGeneration)],
    ["Upload CPU", `${sample.uploadMs.toFixed(2)} ms`],
    ["Sky CPU peak", `${sample.cpuPeakMs.toFixed(2)} ms`],
    [
      "Shader compile wait",
      sample.shaderCompileMs === null
        ? "—"
        : `${sample.shaderCompileMs.toFixed(1)} ms`,
    ],
    [
      "Warmup → GPU ready",
      sample.warmupMs === null ? "—" : `${sample.warmupMs.toFixed(1)} ms`,
    ],
    [
      "Sky draw GPU",
      sample.skyGpuMs === null ? "—" : `${sample.skyGpuMs.toFixed(2)} ms`,
    ],
    ["Streaming", sample.state],
  ];
  return (
    <section data-sky-metrics aria-label="Sky">
      <h3>Sky</h3>
      <dl>
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
      {sample.error && <small>{sample.error}</small>}
    </section>
  );
}
