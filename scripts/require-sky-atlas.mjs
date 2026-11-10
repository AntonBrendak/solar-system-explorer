import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

const lock = JSON.parse(
  readFileSync("widgets/solar-system/sky/model/sky-atlas.lock.json", "utf8"),
);
const fail = (message) => {
  throw new Error(`${message}. Run npm run prepare:sky -- --archive first.`);
};
if (!/^[a-f0-9]{64}$/.test(lock.revision)) fail("Sky revision is missing");
const root = resolve("public", `.${lock.root}`);
const expected = resolve("public/textures/space/revisions/v2", lock.revision);
if (root !== expected) fail("Sky revision path is invalid");
const bytes = readFileSync(resolve(root, "manifest.json"));
if (createHash("sha256").update(bytes).digest("hex") !== lock.manifestSha256)
  fail("Sky manifest hash mismatch");
const manifest = JSON.parse(bytes);
let registration = manifest.validation?.stellarRegistration;
if (lock.stellarRegistrationReportSha256) {
  const reportBytes = readFileSync(
    "widgets/solar-system/sky/model/sky-registration.json",
  );
  if (
    createHash("sha256").update(reportBytes).digest("hex") !==
    lock.stellarRegistrationReportSha256
  )
    fail("Sky registration report hash mismatch");
  const report = JSON.parse(reportBytes);
  if (
    report.revision !== lock.revision ||
    report.manifestSha256 !== lock.manifestSha256
  )
    fail("Sky registration report belongs to another revision");
  registration = report;
}
if (lock.stellarRegistration === "measured" && !registration?.passed)
  fail("Sky registration proof is missing");
if (lock.stellarRegistration !== "measured")
  console.warn(
    "Sky stellar registration is unverified; legacy pixel-centre mapping does not measure star displacement.",
  );
if (
  manifest.revision !== lock.revision ||
  Object.keys(manifest.files).length !== 676
)
  fail("Sky revision is incomplete");
for (const asset of Object.values(manifest.files)) {
  const path = resolve(root, asset.path);
  if (!path.startsWith(root + sep) || statSync(path).size !== asset.bytes)
    fail("Sky asset is missing or mixed");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, {
    highWaterMark: 1024 * 1024,
  }))
    hash.update(chunk);
  if (hash.digest("hex") !== asset.sha256)
    fail("Sky asset content hash mismatch");
}
console.log(`Sky revision ${lock.revision.slice(0, 12)}: complete`);
if (lock.schema === 2 && !lock.coverageLockSha256)
  fail("Sky coverage supplement is not pinned");
if (lock.coverageLockSha256) {
  const bytes = readFileSync(
    "widgets/solar-system/sky/model/sky-coverage.lock.json",
  );
  if (
    createHash("sha256").update(bytes).digest("hex") !== lock.coverageLockSha256
  )
    fail("Coverage lock hash mismatch");
  const coverage = JSON.parse(bytes);
  if (
    !/^[a-f0-9]{64}$/.test(coverage.revision) ||
    coverage.root !==
      `/textures/space/revisions/coverage/${coverage.revision}` ||
    coverage.parameters.parentRevision !== lock.revision ||
    !coverage.validation.decodedPixelsMatchSource ||
    Object.keys(coverage.files).length !== 8
  )
    fail("Coverage supplement is incompatible");
  const root = resolve("public", `.${coverage.root}`);
  if (
    createHash("sha256")
      .update(readFileSync(resolve(root, "manifest.json")))
      .digest("hex") !== coverage.manifestSha256
  )
    fail("Coverage manifest hash mismatch");
  for (const asset of Object.values(coverage.files)) {
    const path = resolve(root, asset.path);
    if (
      !path.startsWith(root + sep) ||
      statSync(path).size !== asset.bytes ||
      createHash("sha256").update(readFileSync(path)).digest("hex") !==
        asset.sha256
    )
      fail("Coverage asset content mismatch");
  }
  console.log(`8K coverage ${coverage.revision.slice(0, 12)}: complete`);
}
