# Recognition regression corpus

Run the portable recognition suite from `frontend`:

```sh
npm run test:recognition
```

`2026-11-24` comes from report `6b05c5850b824d69d7fbb199`: two camera scans,
205 exact detector observations, five exact worker requests, six face images and
one laptop image. The importer retains an archive SHA-256 and capture build.
Numerical readings preserve the actual detector inputs without JPEG changes and
run on every checkout. Full images remain in ignored
`local/diagnostic-testset/2026-11-24/`, as JPEG references decoded once to gzipped
RGB. Pixel tests run automatically when that local corpus exists and otherwise
skip explicitly. Set `CUBE_DIAGNOSTIC_PIXEL_DIR` to use a different directory.
Node tests need no image decoder, server, browser or network.

`expectations.json` was annotated from the visible cube. Patterns specify each
face's stickers, not an assumed full-cube orientation. The bright orange corner
in frame 009 is marked uncertain: its other eight pixels and temporal recovery
are tested separately. Both recordings require further orientation evidence;
accepting any arbitrary legal arrangement is a regression. The first scan's
laptop view must not overwrite its saved white face.

The older photo, muted-camera, middle-slice and measured-video fixtures remain
part of `test:recognition`. The older partial 3×3 video also needs an angled
recapture once spurious neutral background hints are removed. Known solved,
scrambled, even-cube and middle-slice videos still have positive success checks.

## Adding another diagnostic report

Keep full archives and videos in ignored `local/`. Import numerical evidence:

```sh
python frontend/scripts/import-diagnostics.py local/report.zip local/diagnostic-testset/new-report
```

To retain selected image references, add repeated arguments such as
`--frame SCAN_UUID:frame-003.jpg`. This step needs ffmpeg. The importer never
overwrites a dataset and excludes environment details, notes and client logs.
It does not generate expected answers from detector output. Inspect the source,
annotate expectations, then copy numerical fixtures into this directory and add
their behavioral checks to `diagnosticRecognition.test.ts`. Keep full images
and videos local; do not copy them into the public source repository.

Replay either an original extracted report or an imported numerical dataset:

```sh
cd frontend
npm run diagnostics:replay -- ../local/diagnostic-testset/new-report/readings.json
npm run diagnostics:replay -- src/lib/__fixtures__/diagnostics/2026-11-24/readings.json
```

The second command verifies the annotated saved patterns and unresolved state,
with a nonzero exit code for regressions. Without `expectations.json`, the
command prints replay observations and explicitly reports no regression verdict.

For full private video decoding, extract the original archive into a local
directory and place its reviewed `expectations.json` alongside `report.json`:

```sh
cd frontend
CUBE_DIAGNOSTIC_VIDEO_DIR=../local/diagnostics-6b05c5850b824d69d7fbb199 npm test -- src/lib/diagnosticVideo.test.ts
CUBE_CAMERA_VIDEO_DIR=../local npm test -- src/lib/cameraVideo.test.ts
```

Full-video tests require ffmpeg and are optional outside the device holding the
recordings. `diagnosticVideo.test.ts` currently covers the annotated unresolved
scan format; add explicit expected-state checks when importing a solvable report.
