# Validation

## Reproduction

Use the locked npm dependencies, restore the pinned Sky release, then run:

```sh
npm ci
npm run restore:sky
npm run lint
npm test
npm run build
npm run typecheck
npm run test:e2e
npm run build:vinext
```

The atlas numerical checks require the image-processing environment described
in [Sky v2](sky.md). Activate it before running:

```sh
python -m unittest discover -s scripts/star-atlas/tests -v
npm run validate:sky-registration
```

Browser tests use production Next.js on port 3100 by default. For an externally
managed server, set `PLAYWRIGHT_EXTERNAL_SERVER=1` and optionally
`PLAYWRIGHT_BASE_URL`. This also avoids relying on child-server shutdown during
Windows runs. Start and stop that server separately.

For local Workers validation, start:

```sh
npm run start:vinext -- --ip 127.0.0.1 --port 8787 --local
```

Then run in another terminal:

```powershell
$env:PLAYWRIGHT_EXTERNAL_SERVER = "1"
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:8787"
npm run test:e2e
```

Use the equivalent environment-variable syntax on POSIX shells. No deployment
or remote Worker credentials are needed for the local run.

## Scope

The Node suite covers module boundaries, catalog/localization/weather contracts,
texture policy, shared GPU accounting, atomic model presentation, simulation,
marker geometry, request backoff, worker cancellation and spatial LOD planning.
The release-gate regression additionally rejects changed, failed or mismatched
external registration reports.

Python checks cover known subpixel shifts, missing stars, rejection of an
out-of-tolerance displacement and complete tile-major sample coverage. The
standalone registration command reads the actual encoded images, validates
their hashes and compares all five adjacent level pairs on the complete
512-pixel sampling grid.

Browser tests cover both locales, accessibility/focus, history, all eight
models and their resource lifetimes, staged texture upgrades, optional-resource
failures, Solar System navigation, camera controls, delayed previews, preview
context loss, HTML fallbacks and collapsed diagnostics. Tests that require 4K
model upgrades explicitly fix the device and connection profile; machine
network estimates do not change the intended test case.

Resource estimates include controlled allocations, not measured driver VRAM.
Browser runs use headless Chrome with SwiftShader enabled; their timing checks
do not establish performance across physical GPUs or every context/fence
interleaving. Numerical registration uses qualified spatially stratified stars,
not an exhaustive catalog of every feature in the sky.

## Recorded run

Recorded on 2026-11-10, Windows, Node.js 24.11.0, npm 7.6.0, Python 3.11.9,
the pinned atlas toolchain and the Playwright Chrome channel:

| Check                                              | Result                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ESLint                                             | Passed                                                                                |
| Node tests                                         | 37 passed                                                                             |
| Python numerical tests                             | 4 passed                                                                              |
| Production Next.js build and typecheck             | Passed                                                                                |
| Next.js browser suite                              | 29 passed; all 13 affected map cases passed again after the final allocation barrier  |
| vinext/Workers build                               | Passed                                                                                |
| Local Workers browser suite                        | All 16 observatory cases passed; all 13 map cases passed after the allocation barrier |
| Existing local Sky restoration                     | Passed; all file hashes verified                                                      |
| Clean-checkout extraction to a temporary directory | Passed; complete revision and per-file hashes verified                                |
| Public release download without authentication     | Passed; report SHA-256 verified, ZIP byte range matched the local archive             |
| Post-codec registration                            | All 5 pairs passed; 21,824 matched stars, zero unmatched                              |

The source tree is based on `f0e14a66e435f00af71d9d9d0e052cb4714693db`.
The allocation barrier waits for mandatory model leases before sizing the
Sky base/pool; a quarter of the combined budget remains available for the
Full-model transition peak. Only affected map cases needed rerunning after
this change; the observatory implementations and their passing checks were
unchanged.

The immutable archive was not regenerated. Its byte count and SHA-256 were
checked against the [published release asset](https://github.com/AntonBrendak/solar-system-explorer/releases/tag/sky-v2-fafbe0927e770783d1e9ff33a91211beb21515ff1ed2d34f6b0ff2eb2199951e).
The separate
[registration report](../widgets/solar-system/sky/model/sky-registration.json)
is bound to the archive revision and manifest hash, with its own hash in the
lock file. Maximum measured displacements, in the coarser pair's pixel grid:

| Adjacent levels | Matched stars | Maximum error, pixels |
| --------------- | ------------: | --------------------: |
| 2K / 4K         |            64 |              0.053654 |
| 4K / 8K         |           256 |              0.098697 |
| 8K / 16K        |         1,024 |              0.114383 |
| 16K / 32K       |         4,096 |              0.015763 |
| 32K / 64K       |        16,384 |              0.018476 |

The build succeeds with upstream vinext warnings about ineffective dynamic
imports and sourcemaps. These are bundler dependency warnings, not failed
application tests. This run did not deploy the application or push its source.

Ignored `artifacts/*.log` and Playwright `test-results/` contain local execution
output; the reproducible resource proof is versioned with the Sky model.
