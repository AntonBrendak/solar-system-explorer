import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const local = resolve(
  process.platform === "win32"
    ? ".venv-atlas/Scripts/python.exe"
    : ".venv-atlas/bin/python",
);
const python =
  process.env.SKY_ATLAS_PYTHON || (existsSync(local) ? local : "python3");
const result = spawnSync(
  python,
  ["scripts/star-atlas/prepare_star_atlas.py", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
if (result.error) console.error(result.error.message);
if (result.status !== 0) process.exit(result.status ?? 1);
const coverage = spawnSync(python, ["scripts/star-atlas/prepare_coverage.py"], {
  stdio: "inherit",
});
if (coverage.error) console.error(coverage.error.message);
process.exit(coverage.status ?? 1);
