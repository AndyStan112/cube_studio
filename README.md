# Cube Studio

A mobile-first speedcube training prototype. React + TypeScript + Vite, React Three Fiber / Three.js, FastAPI, and MongoDB.

## Run

Requires Docker with Compose:

```sh
docker compose up --build -d
```

- App: http://localhost:5173
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/health

Choose a demo user in the sign-in picker to save solves. The algorithm lab and scramble generation work without an account. MongoDB data persists in the `mongo_data` volume. `docker compose down` stops the stack and retains data.

The frontend is built with Vite and served by Nginx in Compose. Nginx forwards `/api` to FastAPI, so mobile clients on the same network can use `http://<your-computer-ip>:5173` without a separate API URL. MongoDB has no host port. The API docs port binds only to localhost.

## PWA

Serve the app through a trusted HTTPS domain to install it. On iPhone use Safari → Share → Add to Home Screen; on Android use the browser's Install app menu. Local development works on `http://localhost:5173`.

The service worker caches the app, 3D assets, and offline solver worker after the first online visit. The last successful algorithm catalog is also stored locally without an expiry: startup and reconnection refresh it, while failed requests (including HTTP 500 responses) keep the previous catalog usable.

Scrambles fall back to local practice random moves when the API is unavailable. Timer solves can be saved without signing in; new offline solves stay on this device and are labeled accordingly. Previously loaded account history and the current demo user are stored locally. Offline penalty edits and deletions of online solves are queued and retried on reconnection or the next visit. Initial sign-in still requires the API. Solution playback and solving use the bundled offline solver when the backend is unavailable. Clear browser site data to remove locally stored history and catalogs. App updates wait for the user to reload.

Install icons (including the Apple touch icon) use content-derived version URLs,
so changing the artwork updates both the manifest icon metadata and the offline
cache. Keep the manifest URL, app ID and start URL stable. Existing installed
icons are refreshed by the browser/OS separately from app content; recent Chrome
versions can ask the user to review the icon update. iOS Home Screen icons may
retain their installation-time artwork. Do not use clearing site data as an icon
refresh step: learning progress, XP and some solve history are stored locally.
See [Chrome’s icon update behavior](https://developer.chrome.com/blog/improvements-to-web-app-updates)
and [platform metadata update behavior](https://web.dev/learn/pwa/update).

## Features

- Mock sign-in with three hardcoded, shared demo users (Andy, Alex, Sam). No passwords, registration, or real OAuth. Anyone can select any demo user and access that profile’s solves.
- Shared 3×3 / 4×4 / 5×5 puzzle selector across timer, algorithms, and solver. Server and offline practice scrambles use 25 / 40 / 60 random moves respectively, including wide turns on bigger cubes. These are practice scrambles rather than WCA random-state generation. The timer can preview each scrambled cube in 3D.
- Tap or Space to start/stop the timer; manual time input accepts `24.53` and `1:02.45`.
- Explicit save/discard, per-solve +2/DNF penalties, deletion, scramble history, best time, trimmed averages of 5/12, and session mean. History, best times, means, and averages are separate for each puzzle. Statistics use the most recent 1,000 online solves per puzzle across visits; older records without an event remain 3×3. Offline solves retain their puzzle type. Changing puzzle is disabled while timing or while a time is awaiting save/discard. One DNF can be discarded as the worst time in a trimmed average; two produce DNF.
- A small catalog of Sune, reverse Sune, J perm, and T perm across 2-look OLL, 2-look CMLL, and PLL. Algorithms can belong to multiple sets without duplication. J perm has normal/righty (Jb) and lefty (mirrored Ja) variations. Each variation starts at its own inverse setup and ends solved. These are example subsets, not complete sets. CMLL orientation and permutation follow the [Roux tutorial](https://tutorial.rouxers.com/beginners/cmll.html); J perm is also used for [2-look CMLL corner permutation](https://cubingapp.com/algorithms/2-Look-CMLL).
- 4×4 and 5×5 puzzle selection in the algorithm lab, with animated 4×4 OLL/PLL parity and 5×5 edge parity. Single inner-layer turns (`2R`, `2L`) and wide turns (`Rw`, `Uw`) use the same playback controls. Parity cases start from inverse setups with yellow up and red front. The rotation-free wing-swap algorithm follows [J. A. Storer’s guide](https://www.cs.brandeis.edu/~storer/JimPuzzles/RUBIK/Rubik4x4x4/Rubik4x4x4.pdf); the PLL sequence is the [J Perm algorithm](https://jperm.net/4x4/) with an initial `U2` to isolate the opposite edge swap. [5×5 edge parity](https://bigcubes.com/5x5x5/lastedges.html) uses the same inner-slice wing swap. The 5×5 also offers the [CubeSkills wide-turn variation](https://cubeskills.com/uploads/pdf/tutorials/beginners-method-for-solving-the-5x5-cube.pdf) beginning `Rw U2 x`, with animated whole-cube rotation and a three-layer `3Rw` turn. Full 4×4 and 5×5 solving uses the online reduction engine, with 2D, text, and 3D sticker input and verified animated solutions. The 3×3 offline solver remains available; larger-cube solving needs the server. A separate scramble playback tool can reverse entered moves offline.
- Set/section filtering and a variation selector with per-variation notation, animation, and move counts. 2-look CMLL has **Corner permutation** (J/T perm, matching sides) and **Corner orientation** (Sune/reverse Sune, yellow on top) sections. An icon toggle blacks out irrelevant stickers for the current section; the mask follows stickers during turns and works with see-through mode. J/PLL sequences are sourced from [SpeedCubeDB](https://www.speedcubedb.com/a/3x3/PLL/Jb).
- Real animated layer turns, forward/back steps, move selection, reset, autoplay, playback speed, a camera reset to yellow up / red front, drag/pinch orbit controls, and see-through mode. Standard notation explanations use the perspective of the face being turned.
- Responsive layouts and mobile bottom navigation.

## Video input

The solver’s **Video** input has two sources: **Scan video** opens the live camera and **Use video** analyzes an existing recording (up to two minutes / 200 MB). Both run the same continuous recognition tracker locally. Rotate the whole cube, keep its layers still, and briefly hold each side in view. A detected grid is highlighted; a stable reading receives an on-face checkmark and fills one of the six progress thumbnails. Repeated views and quarter-turn rotations do not increase the face count. There are no individual face shutters, countdown captures, or separate calibration recording flows.

For standard 3×3 and 5×5 cubes, fixed center colors identify the faces and the progress row names the missing colors. For 4×4, identity uses the entire sticker pattern, independent of rotation and without assuming a center or requiring a solved cube. The scanner assembles the unordered faces using physical corner and piece constraints, accounting for whole-cube rotation. Color inventory checks reject impossible duplicate/occluded views. Even-cube progress shows captured patterns and how many unseen faces remain. Identical-looking sides cannot be distinguished by their face image alone; ambiguous assemblies are not marked ready.

After six faces form a valid state, the video freezes and **Use cube** updates the solver preview. Align the physical cube with that preview before following moves. If a video ends early, the collected faces stay visible and **Continue with camera** can finish the same scan. Closing the scanner, leaving the tab, or starting a new scan stops camera tracks and cancels outstanding video decoding. Validation runs in a worker, so full-cube checking does not block the capture UI.

Captured faces can still need orientation evidence. The scanner marks a target
thumbnail and asks for a slight tilt with all four corners and an adjoining side
visible; a green side marker and a small cube icon show captured side evidence.
Conflicting color readings ask for a clear recapture of the marked faces. Good
captures stay saved during these retries. Neutral desk pixels are not treated as
white side hints, and several legal arrangements are never resolved by guessing.

Detection checks grid boundaries and sticker consistency independently of camera saturation. Colors are learned from the scan; existing color profiles linked in Settings remain supported. Close color alternatives are resolved against sticker counts and physical cube constraints. All processing stays on the device; recordings are not sent to the server.

For odd cubes, visible neighboring sticker rows help resolve face rotations when the six face patterns admit multiple legal states. Several supporting strips are required; one outside patch cannot choose an orientation. The tracker collects repeated readings within a short rolling window, tolerates brief bad crops, and permits stable recaptures to replace an earlier mistaken pattern.

Frontend tests cover real photo pixels, live-camera color ranges, continuous stability and duplicate counting, unordered scrambled 4×4 reconstruction, and invalid cube states. Replay the original local video fixtures through the full tracker with:

```sh
cd frontend
CUBE_CAMERA_VIDEO_DIR=../local npm test -- src/lib/cameraVideo.test.ts
```

## Deployment

See [deploy/README.md](deploy/README.md) for the K3s + Flux release pipeline and existing Caddy integration. Pushes to `master` run tests and publish images; only successful builds publish manifests to the generated `deployments` branch, which Flux watches. Automated commits stay off `master`.

## Bigger-cube solver

The solver image includes the MIT-licensed [NxN reduction engine](https://github.com/dwalton76/rubiks-cube-NxNxN-solver) pinned to `6c9663d95bc81aadfdc069397902e0b9a163c705`, reusing the existing MIT-licensed min2phase engine for the final 3×3 stage. License notices are retained in the image. The Docker build downloads about 1.9 GiB of compressed lookup tables and bundles the extracted tables; it needs network access and space for about 6.3 GiB of extracted tables. Runtime solving uses those local tables, including inside the private solver network. The Docker layer containing tables is reused unless the engine or table manifest changes.

A private HTTP facade sends 3×3 jobs to the existing Rust engine and runs 4×4/5×5 jobs in isolated, cancellable processes. Bigger-cube results are replayed through an independent sticker model before returning a solution, and the frontend verifies them again before playback. Reduction solutions are marked verified with unproved optimality. They use OBTM: a contiguous outer block turn counts once; whole-cube rotations do not count. The 3×3 optimal search and HTM contract are unchanged.

Compose and Kubernetes allow the solver up to 4 GiB of memory. Kubernetes mounts a writable temporary directory while preserving the read-only image filesystem. The default solve budget remains five minutes. The API accepts `size: 4` or `size: 5` with `metric: "OBTM"`, `objective: "solution"`, and `method: "reduction"`; `/api/solver/capabilities` describes the supported combinations.

`POST /api/scrambles` accepts an optional `{ "event": "444" }` or `{ "event": "555" }` body (default `333`). `GET /api/solves?event=444` selects one event (default `333`, including legacy records). Saves inherit their event from the server's scramble record.

## Local development

Node 22.12+ is recommended. Run MongoDB and FastAPI in Compose with Vite on the host:

```sh
docker compose up -d --build backend
cd frontend
npm ci
npm run dev
```

To develop the backend directly with [uv](https://docs.astral.sh/uv/) (Python 3.13), use a local MongoDB on port 27017. The Compose MongoDB is intentionally internal to the Docker network:

```sh
uv sync --project backend --locked
MONGO_URL=mongodb://localhost:27017 uv run --project backend --locked uvicorn app.main:app --app-dir backend --reload
```

`backend/pyproject.toml` declares dependencies and `backend/uv.lock` locks them. Use `uv add --project backend <package>` to add a runtime dependency, or add `--dev` for development tools. Docker installs only runtime dependencies; CI includes the development group.

Vite proxies `/api` to localhost:8000. Override with `API_PROXY_TARGET` if needed.

## Checks

```sh
cd frontend
npm ci
npm test
npm run build
```

```sh
uv run --project backend --locked pytest backend/tests
# Include live integration tests against the running Compose stack:
CUBE_API_URL=http://localhost:5173/api uv run --project backend --locked pytest backend/tests
```

## Architecture and expansion

React was chosen because React Three Fiber integrates Three.js scene objects and animation with React components. Vue is also capable, but the React renderer fits this interactive trainer directly: https://r3f.docs.pmnd.rs/.

- `frontend/src/components/`: separate timer, algorithm trainer, account form, and 3D viewer components.
- `frontend/src/lib/cube.ts`: independent cube move/state engine. UI and animation consume the same piece positions and orientations; future recognition or solving should adapt into this model rather than add cube logic to screens.
- `frontend/src/components/Cube.tsx`: 3D rendering and interpolated slice animation; takes a move sequence and a target step.
- `frontend/src/lib/api.ts`: API boundary, solve types, time parsing, and statistics.
- `backend/app/domain.py`: scramble generation and initial algorithm catalog, separate from persistence/authentication.
- `backend/app/main.py`: API, user-scoped solve storage, and collection indexes.
- `backend/app/auth.py`: provider-independent identity dependency plus the current mock provider.
- `frontend/src/lib/auth.ts`: auth adapter; API requests obtain their token here rather than reading storage directly.

Next features should get separate service/router boundaries as they are implemented:

1. **Recognition**: guided camera/upload input now produces a validated six-face state with explicit face order and orientation. Future work can add automatic face tracking and perspective correction for unaligned video.
2. **Solving**: solver adapter → standard move list plus metadata (method, elapsed time, optimality status). Add a user solver-timeout setting and run CPU work outside the async request loop. Herbert Kociemba's two-phase algorithm is generally a near-optimal solver; do not label its output globally optimal. A strict optimal search and timeout/fallback need separate implementations and result states.
3. **Algorithm sets**: `GET /api/algorithm-catalog` returns independent `sets` and `algorithms`. Sets and algorithms include `puzzle_size` (3, 4, or 5; older cached entries default to 3). Each algorithm has stable `id`, `memberships`, and `variations`; each variation has stable `id`, `name`, and `moves`, plus an optional case label. Save future practice records against `(algorithm_id, variation_id)` so set membership does not duplicate progress. Each membership references a `set_id` and its `section_ids`. Sets define their own `sections` with stable IDs and sticker `focus` values (`all`, `last-layer`, `last-layer-corners`, `corner-orientation`, `corner-permutation`). Add or reorganize sections in `backend/app/algorithm_catalog.json` and update those memberships; an algorithm can be in multiple sets or sections without copying it. Orientation focus keeps yellow corner stickers; permutation focus keeps side corner stickers. The current catalog is seeded in that JSON file; a database can preserve these IDs and relationships. `GET /api/algorithms` retains the original default-variation response for older installed clients. The catalog API also derives the earlier `set_ids` field for installed clients. The new catalog has a versioned offline cache so old cached response shapes are not reused.
4. **Roux teaching**: separate curriculum for first block, second block, CMLL, and last six edges, reusing cube visualization and playback for stage-specific drills. Current OLL examples are trainer demonstrations, not a Roux curriculum.

## Replacing mock auth with Clerk

The current picker is explicitly a mock: its `mock:demo-*` tokens are public profile selectors, not credentials. Old password login, registration, and session endpoints are removed. Existing database users, sessions, and solves remain untouched, but old accounts are not accessible through the demo picker.

To integrate Clerk, replace the frontend auth adapter with Clerk session APIs (`getToken`, current user, sign-out) and replace the picker with Clerk’s sign-in UI. Keep API token retrieval asynchronous so token refresh works. On the backend, implement `AuthProvider.authenticate` to verify Clerk JWT signatures, issuer, audience, and expiry, then return an `Identity`. Configure `get_auth_provider` to use it and remove the mock-only `/api/auth/users` catalog. Map Clerk subjects to stable application user IDs; solve handlers use only `Identity.id`, so providers stay out of solve logic. Preserve that mapping if migrating demo solves or old ObjectId-owned solves; they are not automatically assigned to external accounts.

The prototype uses system fonts. Real account security and recovery belong to the future provider integration.

## Diagnostics

**Settings → Send diagnostics** sends an explicit, user-initiated diagnostic ZIP to the app server. Nothing is uploaded automatically. The two latest scans and a bounded client error log are retained locally in IndexedDB, including across reloads. Live scans record video without audio for up to two minutes, with periodic partial checkpoints; recording stops when the scanner closes or loses visibility. Original uploaded clips up to 32 MiB are retained without transcoding. Larger originals are omitted with an explicit event; analyzed-frame images and exact readings remain available. The send sheet can exclude full videos, add a note, retry failed uploads, cancel, or clear local diagnostics. Clearing all app data also clears these buffers.

Reports identify the exact frontend source fingerprint, capture-time build, loaded script URLs, active/waiting service worker, browser, viewport, camera track settings (device IDs redacted), original video metadata, sample timestamps, detected corners and RGB values, neighboring-side evidence, accepted face revisions, worker request/response payloads and timings, exceptions and failed network requests. Credentials, headers, request bodies, arbitrary browser storage and solve history are not copied. JPEG frame images are visual references; the logged detector readings and worker payloads preserve the actual numerical inputs for deterministic replay. A checkpoint recovered after an interrupted recording is marked `recordingFinalized: false`.

The API streams archives to temporary files with a 64 MiB limit, validates the ZIP and stores it in the `diagnostic_archives` GridFS bucket on the existing persistent MongoDB volume. Reports have a 30-day retention period (startup and hourly cleanup), a 1 GiB global quota and a ten-per-installation daily allowance. Guest users can send reports. There is deliberately no public listing or download API, and shared demo identities do not grant access to reports.

Retrieve reports using server access. List recent IDs with:

```sh
ssh andy@ssh.windogs.win 'KUBECONFIG=$HOME/.kube/cube-studio.yaml /usr/local/bin/kubectl -n cube-studio exec deployment/backend -- python scripts/diagnostics.py'
```

Pass a report ID to that same script and redirect stdout to a local `.zip` file. Extract it locally, then replay the recorded worker inputs against the checked-out recognition code:

```sh
cd frontend
node scripts/replay-diagnostics.mjs /path/to/extracted/report.json
```

The [recognition regression corpus](frontend/src/lib/__fixtures__/diagnostics/README.md)
contains exact readings and selected pixels from user reports, alongside the
older photo and video fixtures. Run `npm run test:recognition` from `frontend`.
The corpus guide covers importing later diagnostic ZIPs, reviewed expectations,
and optional full-video tests using private recordings in `local/`.
