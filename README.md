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

Create an account in the app to save solves. The algorithm lab and scramble generation work without an account. MongoDB data persists in the `mongo_data` volume. `docker compose down` stops the stack and retains data.

The frontend is built with Vite and served by Nginx in Compose. Nginx forwards `/api` to FastAPI, so mobile clients on the same network can use `http://<your-computer-ip>:5173` without a separate API URL. MongoDB has no host port. The API docs port binds only to localhost.

## PWA

Serve the app through a trusted HTTPS domain to install it. On iPhone use Safari → Share → Add to Home Screen; on Android use the browser's Install app menu. Local development works on `http://localhost:5173`.

The service worker caches the app, 3D assets, and public algorithm catalog. Previously loaded algorithms work offline. Accounts, scrambles, and solve storage require the API. Private API responses are not cached. Updates wait for the user to reload.

## Features

- Registration, sign-in, logout, scrypt password hashes, and expiring bearer sessions stored as token hashes.
- Server-generated 25-move 3×3 practice scrambles. These use random moves rather than WCA random-state generation.
- Tap or Space to start/stop the timer; manual time input accepts `24.53` and `1:02.45`.
- Explicit save/discard, per-solve +2/DNF penalties, deletion, scramble history, best time, trimmed averages of 5/12, and session mean. Statistics use the most recent 1,000 saved solves across visits. One DNF can be discarded as the worst time in a trimmed average; two produce DNF.
- Hardcoded Sune (`R U R' U R U2 R'`) and reverse Sune (`R U2 R' U' R U' R'`). Each starts at its inverse setup and ends solved.
- Real animated layer turns, forward/back steps, move selection, reset, autoplay, playback speed, four camera presets, drag/pinch orbit controls, and see-through mode. Standard notation explanations use the perspective of the face being turned.
- Responsive layouts and mobile bottom navigation.

## Local development

Node 22.12+ is recommended. Run MongoDB and FastAPI in Compose with Vite on the host:

```sh
docker compose up -d --build backend
cd frontend
npm ci
npm run dev
```

To develop the backend directly (Python 3.13+), use a local MongoDB on port 27017. The Compose MongoDB is intentionally internal to the Docker network:

```sh
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
MONGO_URL=mongodb://localhost:27017 .venv/bin/uvicorn app.main:app --app-dir backend --reload
```

Vite proxies `/api` to localhost:8000. Override with `API_PROXY_TARGET` if needed.

## Checks

```sh
cd frontend
npm ci
npm test
npm run build
```

```sh
PYTHONPATH=backend .venv/bin/pytest backend/tests
# Include live integration tests against the running Compose stack:
CUBE_API_URL=http://localhost:5173/api PYTHONPATH=backend .venv/bin/pytest backend/tests
```

## Architecture and expansion

React was chosen because React Three Fiber integrates Three.js scene objects and animation with React components. Vue is also capable, but the React renderer fits this interactive trainer directly: https://r3f.docs.pmnd.rs/.

- `frontend/src/components/`: separate timer, algorithm trainer, account form, and 3D viewer components.
- `frontend/src/lib/cube.ts`: independent cube move/state engine. UI and animation consume the same piece positions and orientations; future recognition or solving should adapt into this model rather than add cube logic to screens.
- `frontend/src/components/Cube.tsx`: 3D rendering and interpolated slice animation; takes a move sequence and a target step.
- `frontend/src/lib/api.ts`: API boundary, solve types, time parsing, and statistics.
- `backend/app/domain.py`: scramble generation and initial algorithm catalog, separate from persistence/authentication.
- `backend/app/main.py`: API, user-scoped solve storage, sessions, and collection indexes.

Next features should get separate service/router boundaries as they are implemented:

1. **Recognition**: camera/upload input → validated six-face state with explicit face order and orientation. Validate solvability before asking a solver to proceed.
2. **Solving**: solver adapter → standard move list plus metadata (method, elapsed time, optimality status). Add a user solver-timeout setting and run CPU work outside the async request loop. Herbert Kociemba's two-phase algorithm is generally a near-optimal solver; do not label its output globally optimal. A strict optimal search and timeout/fallback need separate implementations and result states.
3. **Algorithm sets**: extend catalog records with method, stage, setup, alternatives, and user practice records. Existing `id`, `set`, and `moves` are the initial contract.
4. **Roux teaching**: separate curriculum for first block, second block, CMLL, and last six edges, reusing cube visualization and playback for stage-specific drills. Current OLL examples are trainer demonstrations, not a Roux curriculum.

This is a local prototype. Before public hosting add HTTPS, abuse controls and rate limits, account recovery, and production secret/database management. Bearer tokens currently live in browser local storage; use an appropriate hardened session strategy when deploying publicly. The UI uses system fonts.
