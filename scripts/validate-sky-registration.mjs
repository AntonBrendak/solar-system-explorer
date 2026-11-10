import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const lock = JSON.parse(
  readFileSync("widgets/solar-system/sky/model/sky-atlas.lock.json", "utf8"),
);
if (!/^[a-f0-9]{64}$/.test(lock.revision))
  throw new Error("Prepare an immutable Sky revision first");
const local = resolve(
  process.platform === "win32"
    ? ".venv-atlas/Scripts/python.exe"
    : ".venv-atlas/bin/python",
);
const python =
  process.env.SKY_ATLAS_PYTHON || (existsSync(local) ? local : "python3");
const result = spawnSync(
  python,
  [
    "scripts/star-atlas/validate.py",
    "--encoded",
    resolve("public/textures/space/revisions/v2", lock.revision),
    "--output",
    resolve("artifacts", `sky-registration-${lock.revision}.json`),
  ],
  { stdio: "inherit" },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
