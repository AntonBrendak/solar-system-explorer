import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const guard = fileURLToPath(
  new URL("../scripts/require-sky-atlas.mjs", import.meta.url),
);

test("the build gate accepts a complete certified revision and rejects altered or mismatched external proof", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "orbital-sky-proof-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const revision = "a".repeat(64);
  const root = `/textures/space/revisions/v2/${revision}`;
  const assetRoot = path.join(directory, "public", root);
  const modelRoot = path.join(directory, "widgets/solar-system/sky/model");
  await mkdir(assetRoot, { recursive: true });
  await mkdir(modelRoot, { recursive: true });
  const files = {};
  for (let index = 0; index < 676; index++) {
    const name = `fixture-${index}.webp`;
    await writeFile(path.join(assetRoot, name), "");
    files[name] = { path: name, bytes: 0, sha256: hash("") };
  }
  const manifest = JSON.stringify({ revision, files });
  await writeFile(path.join(assetRoot, "manifest.json"), manifest);
  const lock = {
    revision,
    root,
    manifestSha256: hash(manifest),
    stellarRegistration: "measured",
  };
  const original = {
    revision,
    manifestSha256: lock.manifestSha256,
    passed: true,
  };
  const save = async (report) => {
    const bytes = JSON.stringify(report);
    await writeFile(path.join(modelRoot, "sky-registration.json"), bytes);
    await writeFile(
      path.join(modelRoot, "sky-atlas.lock.json"),
      JSON.stringify({
        ...lock,
        stellarRegistrationReportSha256: hash(bytes),
      }),
    );
  };
  const run = () =>
    spawnSync(process.execPath, [guard], { cwd: directory, encoding: "utf8" });
  await save(original);
  const valid = run();
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /complete/);

  const locked = JSON.parse(
    await readFile(path.join(modelRoot, "sky-atlas.lock.json"), "utf8"),
  );
  await writeFile(
    path.join(modelRoot, "sky-atlas.lock.json"),
    JSON.stringify({ ...locked, schema: 2 }),
  );
  const missingCoverage = run();
  assert.notEqual(missingCoverage.status, 0);
  assert.match(missingCoverage.stderr, /coverage supplement is not pinned/);
  await save(original);

  await writeFile(
    path.join(modelRoot, "sky-registration.json"),
    JSON.stringify(original) + "\n",
  );
  const altered = run();
  assert.notEqual(altered.status, 0);
  assert.match(altered.stderr, /registration report hash mismatch/);

  for (const report of [
    { ...original, revision: "b".repeat(64) },
    { ...original, manifestSha256: "c".repeat(64) },
  ]) {
    await save(report);
    const mismatch = run();
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /belongs to another revision/);
  }
  await save({ ...original, passed: false });
  const failed = run();
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /registration proof is missing/);
});
