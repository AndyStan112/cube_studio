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

The service worker caches the app, 3D assets, and public algorithm catalog. Previously loaded algorithms work offline. Accounts, scrambles, and solve storage require the API. Private API responses are not cached. Updates wait for the user to reload.

## Features

- Mock sign-in with three hardcoded, shared demo users (Andy, Alex, Sam). No passwords, registration, or real OAuth. Anyone can select any demo user and access that profile’s solves.
- Server-generated 25-move 3×3 practice scrambles. These use random moves rather than WCA random-state generation.
- Tap or Space to start/stop the timer; manual time input accepts `24.53` and `1:02.45`.
- Explicit save/discard, per-solve +2/DNF penalties, deletion, scramble history, best time, trimmed averages of 5/12, and session mean. Statistics use the most recent 1,000 saved solves across visits. One DNF can be discarded as the worst time in a trimmed average; two produce DNF.
- A small catalog of Sune, reverse Sune, J perm, and T perm across 2-look OLL, 2-look CMLL, and PLL. Algorithms can belong to multiple sets without duplication. J perm has normal/righty (Jb) and lefty (mirrored Ja) variations. Each variation starts at its own inverse setup and ends solved. These are example subsets, not complete sets. CMLL orientation and permutation follow the [Roux tutorial](https://tutorial.rouxers.com/beginners/cmll.html); J perm is also used for [2-look CMLL corner permutation](https://cubingapp.com/algorithms/2-Look-CMLL).
- Set/section filtering and a variation selector with per-variation notation, animation, and move counts. 2-look CMLL has **Corner permutation** (J/T perm, matching sides) and **Corner orientation** (Sune/reverse Sune, yellow on top) sections. An icon toggle blacks out irrelevant stickers for the current section; the mask follows stickers during turns and works with see-through mode. J/PLL sequences are sourced from [SpeedCubeDB](https://www.speedcubedb.com/a/3x3/PLL/Jb).
- Real animated layer turns, forward/back steps, move selection, reset, autoplay, playback speed, a camera reset to yellow up / red front, drag/pinch orbit controls, and see-through mode. Standard notation explanations use the perspective of the face being turned.
- Responsive layouts and mobile bottom navigation.

## Deployment

See [deploy/README.md](deploy/README.md) for the K3s + Flux release pipeline and existing Caddy integration. Pushes to `master` run tests and publish images; only successful builds publish manifests to the generated `deployments` branch, which Flux watches. Automated commits stay off `master`.

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

1. **Recognition**: camera/upload input → validated six-face state with explicit face order and orientation. Validate solvability before asking a solver to proceed.
2. **Solving**: solver adapter → standard move list plus metadata (method, elapsed time, optimality status). Add a user solver-timeout setting and run CPU work outside the async request loop. Herbert Kociemba's two-phase algorithm is generally a near-optimal solver; do not label its output globally optimal. A strict optimal search and timeout/fallback need separate implementations and result states.
3. **Algorithm sets**: `GET /api/algorithm-catalog` returns independent `sets` and `algorithms`. Each algorithm has stable `id`, `memberships`, and `variations`; each variation has stable `id`, `name`, and `moves`, plus an optional case label. Save future practice records against `(algorithm_id, variation_id)` so set membership does not duplicate progress. Each membership references a `set_id` and its `section_ids`. Sets define their own `sections` with stable IDs and sticker `focus` values (`all`, `last-layer`, `last-layer-corners`, `corner-orientation`, `corner-permutation`). Add or reorganize sections in `backend/app/algorithm_catalog.json` and update those memberships; an algorithm can be in multiple sets or sections without copying it. Orientation focus keeps yellow corner stickers; permutation focus keeps side corner stickers. The current catalog is seeded in that JSON file; a database can preserve these IDs and relationships. `GET /api/algorithms` retains the original default-variation response for older installed clients. The catalog API also derives the earlier `set_ids` field for installed clients. The new catalog has a versioned offline cache so old cached response shapes are not reused.
4. **Roux teaching**: separate curriculum for first block, second block, CMLL, and last six edges, reusing cube visualization and playback for stage-specific drills. Current OLL examples are trainer demonstrations, not a Roux curriculum.

## Replacing mock auth with Clerk

The current picker is explicitly a mock: its `mock:demo-*` tokens are public profile selectors, not credentials. Old password login, registration, and session endpoints are removed. Existing database users, sessions, and solves remain untouched, but old accounts are not accessible through the demo picker.

To integrate Clerk, replace the frontend auth adapter with Clerk session APIs (`getToken`, current user, sign-out) and replace the picker with Clerk’s sign-in UI. Keep API token retrieval asynchronous so token refresh works. On the backend, implement `AuthProvider.authenticate` to verify Clerk JWT signatures, issuer, audience, and expiry, then return an `Identity`. Configure `get_auth_provider` to use it and remove the mock-only `/api/auth/users` catalog. Map Clerk subjects to stable application user IDs; solve handlers use only `Identity.id`, so providers stay out of solve logic. Preserve that mapping if migrating demo solves or old ObjectId-owned solves; they are not automatically assigned to external accounts.

The prototype uses system fonts. Real account security and recovery belong to the future provider integration.
