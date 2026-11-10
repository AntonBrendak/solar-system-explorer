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
