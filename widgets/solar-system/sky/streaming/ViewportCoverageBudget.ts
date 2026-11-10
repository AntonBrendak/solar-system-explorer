import { pageBytes } from "../model/sky-config.ts";
import type { DetailLevel, PageCore, SkyLevel } from "../model/sky-types";

export type CoverageRequirement = {
  level: DetailLevel;
  pages: number;
  peakPages: number;
};

/** The working set includes all visible ancestors; transition storage is separate. */
export function viewportCoverageBudget(input: {
  requirements: readonly CoverageRequirement[];
  desiredLevel: DetailLevel;
  core: PageCore;
  maxPages: number;
}) {
  const transitionPages = (2048 / input.core) ** 2;
  let coverage: SkyLevel = 4;
  let workingPages = 0;
  for (const item of input.requirements) {
    if (item.level <= input.desiredLevel && item.peakPages <= input.maxPages) {
      coverage = item.level;
      workingPages = item.peakPages - transitionPages;
    }
  }
  const lookAheadPages = Math.max(
    0,
    Math.min(
      Math.max(2 * transitionPages, Math.ceil(workingPages / 4)),
      input.maxPages - workingPages - transitionPages,
    ),
  );
  const next = input.requirements.find((item) => item.level === coverage * 2);
  const capacity =
    coverage === 4
      ? 0
      : Math.min(
          input.maxPages,
          Math.max(
            workingPages + transitionPages + lookAheadPages,
            next?.peakPages ?? 0,
          ),
        );
  const cachePages = Math.max(0, capacity - workingPages - transitionPages);
  return {
    coverage,
    workingPages,
    transitionPages,
    cachePages,
    capacity,
    workingBytes: workingPages * pageBytes(input.core),
    transitionBytes: transitionPages * pageBytes(input.core),
  };
}
