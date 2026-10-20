# 3×3 Solver milestone

The Solver page accepts physically valid 3×3 states, solves online through a private
Rust service, or uses a bundled browser two-phase solver. Exactness and speed are
separate: **the IDA* engine is correct but is not a competitive arbitrary-state
optimal solver**. Its small pattern databases mostly support shallow proofs.
Arbitrary cubes have a verified two-phase fallback; a short result is never used
as evidence of optimality.

## Version 1 boundary

`POST /api/solver/jobs` returns 202 with an unguessable job ID. Read the snapshot at
`GET /api/solver/jobs/{id}`, receive typed SSE at `.../{id}/events`, and cancel with
`DELETE .../{id}`. `/api/solver/capabilities` describes supported capabilities.
The request is:

```json
{"schema_version":1,"puzzle":{"type":"cube","size":3},"state":{"encoding":"cube_facelets_v1","face_order":["U","R","F","D","L","B"],"value":"UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"},"solver":{"metric":"HTM","objective":"optimal","method":"unrestricted","constraints":[]},"execution":{"fallback_after_ms":5000,"continue_search":true}}
```

Only the stated puzzle, encoding, HTM metric, optimal objective and unrestricted
method are supported. Other capabilities produce 422 `unsupported_capability`;
invalid or impossible cubes produce 422 `invalid_state`. Unknown fields are
rejected. The whole request is limited to 8 KiB, including streamed bodies.
Reserved constraints use `{schema_version, kind, parameters}` where future kinds
include `allowed_moves`, `state_invariant`, and `stage_goal`. All nonempty
constraints are rejected today. Future method/stage goal code can live beside
`cube.rs` independently of UI code. Global, method-constrained, and stage proof
scopes must remain distinct; only `global_proved` is currently emitted.

Moves discriminate on `kind`. A cube outer turn is
`{"kind":"cube_layer_turn","face":"R","layer_start":0,"layer_count":1,"amount":1}`.
For this kind, amount is 1, 2, or -1 quarter turns clockwise as seen from outside
the named face. Each costs one HTM move, including half turns. Responses also
contain a `notation` token array. No universal quarter-turn property is defined.
Slices, wide turns, rotations, other metrics, and other puzzles are not implemented;
the existing algorithm catalog and its notation remain compatible.

## Facelet convention and validation

Canonical letters represent fixed faces, not arbitrary detected colors:
U yellow, R blue, F red, D white, L green, B orange. Every face is row-major
looking directly at that face from outside; its center is index 4 locally.
Concatenate U (0–8), R (9–17), F (18–26), D (27–35), L (36–44), B (45–53).
In world coordinates +x=R, +y=U, +z=F, row r and column c (both 0–2) map to:

| Face | Sticker position | Top neighbor | Right neighbor |
| --- | --- | --- | --- |
| U | (c−1, 1, r−1) | B | R |
| R | (1, 1−r, 1−c) | U | B |
| F | (c−1, 1−r, 1) | U | R |
| D | (c−1, −1, 1−r) | F | R |
| L | (−1, 1−r, c−1) | U | F |
| B | (1−c, 1−r, −1) | U | L |

The unfolded net is U above F, L/F/R/B across, D below F. This is standard
URFDLB indexing, including the outside view of B. Centers stay fixed. Counts,
piece inventory (including mirrored/duplicated corners), twists modulo 3,
flips modulo 2, and matching permutation parity are checked in Python, Rust,
and TypeScript. Even-order normalization must use an explicit future convention.

`faceletsToCubies` reconstructs each physical piece's position and one of the 24
proper cube rotations. Existing viewer stickers remain attached to their original
home pieces. `algorithmStates(moves, initialState?)` preserves inverse-solved
algorithm playback when no starting state is supplied. Cross-checks compare all
18 basic turns and random states against cubejs. Solutions replay independently
through the viewer's move implementation before playback.

## Algorithms and narrow dependency assessment

- [cubejs](https://github.com/ldez/cubejs), pinned 1.3.2, MIT: usable browser
  Kociemba two-phase implementation, default depth 22, without symmetry reduction.
  Only its two library files are vendored with their MIT notice (avoiding its
  obsolete npm package-manager dependency). Tables initialize inside a dedicated
  Web Worker; its 42 kB compiled bundle is
  included in the service worker precache. Nothing is fetched from a CDN.
  Initialization is announced without a fabricated percentage. Missing assets,
  network failure, exceptions, cancellation and a three-minute worker watchdog
  are handled. Its output is verified both inside the worker and through the
  independent viewer conversion on the main thread. Only short replay/validation
  occurs on the main thread. Tables are regenerated after worker termination.
- [min2phase](https://github.com/cs0x7f/min2phase_rust), 0.2.4, MIT: optimized
  symmetry-reduced two-phase search, compact in-memory tables reused by a long-lived
  worker. Vendored source and LICENSE are retained. The original entry point lacked
  cancellation, so a documented small local extension checks cancellation/deadlines
  inside recursive search (`solver/vendor/min2phase/PATCHES.md`). Its optimization
  is for quickly finding two-phase candidates, not globally optimal solutions.
- [cubr-core's Korf solver](https://docs.rs/cubr-core/0.2.0/cubr_core/solver/index.html)
  was assessed as an exact/PDB reuse candidate. Its documented hybrid entry point
  automatically substitutes two-phase after its own exact budget. It was not
  adopted: this milestone needs separate proof status, orchestration and bound
  progress; the dependency's full source/license/resource audit was not completed.
  No performance claim from its documentation is relied on here.

Our exact engine uses IDA* over all 18 outer HTM moves, integer corner/edge
permutation and orientation arrays. It increases integer cost bounds from an
admissible lower bound. Pruning combines adjacent same-face turns and orders
commuting opposite-face turns; either transformation preserves an equally short
representative. It uses the maximum of:

1. Exact BFS distance in combined corner-orientation × edge-orientation space
   (2187 × 2048 = 4,478,976 one-byte entries).
2. Exact BFS distance in corner-permutation space (40,320 one-byte entries).
3. Ceiling of misplaced edge count / 4 (a face turn moves at most four edges).

Each projection maps every physical move to one abstract move of equal cost,
so an abstract shortest path cannot exceed a physical shortest path. The maximum
of these lower bounds is admissible; they must not be added. A candidate becomes
`global_proved` only when found in the first successful exact bound, or when a
verified fallback upper bound meets the proved lower bound. Interrupted or
partially explored bounds never become completed bounds. Cancellation is checked
at most every 4096 exact nodes and throughout two-phase recursion.

PDB version 1 is built deterministically at startup. Exact distance storage is
4,519,296 bytes, coordinate transitions 1,603,980 bytes; total retained exact tables
are 6,123,276 bytes (excluding object headers and the 18 move cubes). No large
binary assets or disk cache are committed. Startup logs include the FNV-1a checksum
of the distance bytes; see measurements below. Small startup cost makes file-backed
tables unnecessary here. Stronger full-piece PDBs and more optimized coordinates
remain the main unfinished work for competitive deep exact solving.

## Lifecycle and operational limits

FastAPI does no search. One asynchronous consumer sends work to the private worker;
two CPU threads run the exact and fast searches concurrently, reusing tables.
The worker refuses overlapping jobs. The API offers a verified fallback after
five seconds of execution (queue time excluded); selecting it changes playback
only. Exact work continues until proof, cancellation or the 300,000 ms budget.
`continue_search:false` explicitly cancels exact work when fallback becomes
available. `fallback_after_ms` may increase the offer delay, never reduce it below
5000. Progress reports actual nodes, current bound and fully completed bounds.
No search percentage is estimated.

Snapshots include the input and results, allowing reconnection using the job ID
saved in localStorage. SSE sends heartbeats, snapshot replay and bounded event
history, and supports Last-Event-ID. Polling also works. Active jobs are local to
one API process; run one API replica and one Uvicorn worker. Jobs expire one hour
after completion, checked lazily on access/creation. A restart returns 404 for old
IDs, never a fictitious running job; no Mongo search checkpoints are stored.
If the API restarts before the native worker, its surviving work can run until
its native five-minute deadline and new worker submissions receive a busy error.

Anonymous access is intentional. Demo auth is ignored. Job IDs are bearer access
capabilities, so avoid sharing them. Limits are global: one active job, eight queued,
12 submissions/minute, 128 retained jobs, 512 events/job, 32 concurrent SSE streams.
A busy queue returns typed 429 with Retry-After; validation or capacity errors do
not trigger hidden offline computation. Worker failures emit `failed` and offer
an offline action. Automatic offline fallback occurs on failed online creation,
server errors or navigator.onLine=false. Browser refresh/termination cancels local
CPU work; leaving the page preserves remote work. Cancel explicitly stops remote
work, and API shutdown sends best-effort cancellation.

Configuration (backend): `SOLVER_WORKER_URL` (Compose/K3s: http://solver:8081),
`SOLVER_BUDGET_MS` (default/cap 300000), `SOLVER_QUEUE_LENGTH` (default 8, clamped 1–32),
`SOLVER_JOB_TTL_SECONDS` (3600). Worker listens on private port 8081 with `/health`
and `/ready`; readiness only begins after table construction. No worker host port
or public ingress exists. K3s NetworkPolicy admits only backend pods. Compose connects only backend and worker to a separate internal network. The Rust runtime contains no toolchain, runs
as UID 10001, and has two CPU / 1 GiB hard limits. SIGTERM/SIGINT stop accepting work, cooperatively cancel search threads,
and wait up to five seconds for acknowledgement; API shutdown also cancels. There
is no checkpoint to flush. Kubernetes startup probes tolerate cold initialization.

Nginx solver routes disable buffering/caching, permit an 8 KiB body, and use a
360-second read timeout. Other API rules are unchanged. The PWA precaches the
hashed worker JS with a 5 MiB per-asset cap and never caches solver/API private
responses. Offline use requires a completed prior PWA installation/cache update.

The release matrix builds frontend/backend/solver at the same source SHA, tests
Rust and application code, and publishes all three image references to the generated
deployments branch. Make the new `cube_studio-solver` GHCR package public on first
release, as for the other images. Do not modify deployments directly; push source
changes through the existing master workflow. No external Caddy changes are needed.

## Measurements and verification

See below for actual local measurements. Reproduce with:

```sh
cd solver
cargo build --release --locked
/usr/bin/time -v target/release/solver-worker --benchmark > /tmp/solver-benchmark.jsonl
# Optional longer experiment, applied to every sample:
# SOLVER_BENCH_BUDGET_MS=300000 target/release/solver-worker --benchmark
```

The benchmark uses seed 112, 32 shallow states from 0–5 random turns, six 25-random-turn
states, and six uniformly sampled valid cubie states (independent shuffled cp/ep,
uniform valid orientations, parity correction). Random-turn scrambles are not
uniform state sampling. Candidate generation precedes exact benchmarking so it
can provide an upper bound; the HTTP worker instead starts both concurrently.
Timeout latencies include budget expiry and are not solution latencies. This is
an exploratory small sample, not a production service-level guarantee.

Local Linux x86_64 measurements on an Intel Core i9-13900H, Rust 1.94.1 release
with thin LTO, concurrent workstation activity, without CPU pinning. Native
startup: **189 ms**, retained exact tables **6,123,276 bytes**, distance checksum
`7ddbaf73fc5fc415` (FNV-1a). Benchmark process peak RSS **41,640 KiB**, CPU **99%**
of one core for the serial benchmark, wall time **60.20 s**, no swap or file-backed
PDB storage. The HTTP process can use two search cores briefly because fallback
runs concurrently; hard CPU/RAM limits apply in deployment.

Nearest-rank percentiles, five-second budget per exact sample:

| Distribution | Samples | Proved ≤5 s | Exact p50 / p95 ms | Fallback p50 / p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Shallow, 0–5 random moves | 32 | 32/32 | 0.000074 / 0.003627 | 0.0106 / 0.0411 |
| 25 random moves | 6 | 0/6 | 5000.057 / 5000.081 (timeouts) | 0.166 / 0.793 |
| Uniform valid states | 6 | 0/6 | 5000.038 / 5000.069 (timeouts) | 1.007 / 1.831 |

Every fallback in this sample replayed successfully. Shallow timings are tiny
in-process search costs with a ready candidate; they exclude network, initialization
and fallback time and must not be read as user-visible solve latency. Five-minute
proof success rate is **unmeasured**. Browser RAM/CPU, browser end-to-end latency,
and production node performance are **unmeasured**. The production worker's
configured budget does not imply it can prove arbitrary cubes within that budget.

Validation completed locally:

- Frontend: 17 Vitest tests; TypeScript/Vite production build; offline worker and
  license notice included in Workbox precache.
- Rust: 7 tests, including exhaustive independent BFS through depth two (all 262
  distinct states), every one-turn solution, random uniform-state fallback replay,
  impossible states, deadline and cancellation; fmt, strict application Clippy,
  and release build passed. Upstream style lints are scoped off in vendored code.
- Backend: 15 tests with the real Compose/Mongo/Rust/Nginx stack, including the
  five-second offer, true single-turn proof, SSE streaming/replay and cancellation.
  Without a live stack, the two live tests skip; no network services are required
  for the other 13 tests. Existing Starlette TestClient deprecation warning remains.
- Production multi-stage images built locally for all three services; Compose
  isolation used port 15173 because the usual development ports were occupied.
- Chromium (headless shell 1223 via temporary playwright-core 1.58.2): desktop
  1360×1000 and mobile 390×844, no horizontal overflow, Solver and Algorithms/Sune
  navigation, online proof/fallback/playback/cancel, and real offline solve after
  PWA caching with browser network disabled all passed without JavaScript errors.
  GPU performance was not measured (software WebGL). K3s/Flux manifests were
  integrated, but no live cluster rollout or external Caddy changes were attempted.

Remaining limits: deep optimal-search performance, stronger full-piece PDBs, and
five-minute/production benchmarks. No new Trainer, slices, wide turns or additional
puzzles/constraints are implemented. Results and active searches are not durable
across API restarts. These are explicit milestone limits, not claims of a complete
production-grade arbitrary-state optimal solver.

Additional browser checks passed: reloading reconnects to the same active job,
and failed online job creation with navigator.onLine=true automatically runs
the offline solver. Worker readiness and SIGTERM shutdown are checked in Compose.
