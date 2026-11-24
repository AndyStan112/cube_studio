# Deployment

Target: `andy@ssh.windogs.win`, single-node K3s alongside existing Docker apps. Caddy keeps ports 80/443 and routes `cube.windogs.win` through the Docker `web` bridge to `172.22.0.1:30573`.

## One-time server setup

The bootstrap is deliberately run with sudo by the server owner. It prunes only unused Docker build cache older than seven days if the root filesystem is over 90% full, saves a copy of Caddy's configuration, installs pinned K3s and Flux releases, creates the app's database credentials, and generates a dedicated read-only Git SSH key. It does not change Caddy routes or migrate other apps.

Review `scripts/bootstrap-server.sh`, then run the staged copy:

```sh
ssh -t andy@ssh.windogs.win 'sudo bash /home/andy/apps/cube_studio/setup/scripts/bootstrap-server.sh'
```

The script creates a separate kubeconfig at `/home/andy/.kube/cube-studio.yaml`. Existing kubeconfigs stay in place. The Kubernetes API and kubelet bind to the private Docker bridge IP; NodePorts are restricted to that address. Pod CIDR `172.28.0.0/16` and service CIDR `172.29.0.0/16` are reserved for this cluster and must not be used by future Docker networks. Existing VPN routes in `10.0.0.0/8` are avoided.

## GitHub setup

1. Add the public key printed by the bootstrap (also in the staged `setup/git-read.pub`) at repository **Settings → Deploy keys**. Keep **Allow write access** unchecked. Flux reads `deployments` over SSH; no personal SSH keys go into the cluster.
2. The `release` workflow tests the app with MongoDB and publishes `cube_studio-frontend`, `cube_studio-backend`, and `cube_studio-solver` to GHCR. Make these three packages public once at their package settings pages. The source repository is already public; GHCR packages initially default to private. No package token is stored on the server.
3. The release planner compares the current source with the last successful release recorded on **`deployments`**. It builds only affected services and keeps the exact pinned images of unchanged services. Integration tests run against that selected combination. On success, the workflow publishes a complete snapshot of `deploy/app/` and `deploy/release.json`, recording the tested source and image references. New images are pinned by registry digest. Commit messages use `chore(deploy): release <sha>`. Git remotes and Flux use SSH; publication uses the repository-scoped `GITHUB_TOKEN` without a long-lived write key.
4. Flux checks `deployments` every minute and applies the snapshot. A failed test or build leaves that branch and the running release unchanged. Deployment branch updates do not trigger builds.

Keep working on **`master`** and push normally. Do not merge `deployments` back into `master`; it contains generated manifests only, with its own release history. Every successful release copies added, changed, and deleted deployment manifests automatically. `deploy/app/kustomization.yaml` on `master` is a source template; the workflow supplies the release image tags on `deployments`. Documentation-only commits do not trigger releases; use the workflow’s Run workflow button on `master` if needed.

For an existing installation, initialize `deployments` with the currently deployed manifests, then apply `deploy/flux/sync.yaml` using the owner kubeconfig to switch Flux. This migration is one-time; regular releases need no SSH or manual branch maintenance.

## Incremental releases and table bases

Changes under `frontend/`, `backend/` and `solver/` build their corresponding
service. Changes to the shared `.github/workflows/build-image.yaml` build all
three because that file controls how images are assembled. Deployment and
pipeline-only changes reuse existing images and still run integration tests.
Unit checks run for affected services; solver changes also run backend unit
checks because the method tests exercise solver code. Release-planner and
publisher tests always run.

The baseline is the last successfully published source, not the previous push.
Changes from a failed intervening release therefore remain included. Missing
history or a first release safely rebuilds every service. The planner can migrate
the old same-commit image tags without manual branch edits. A concurrent edit to
`deployments` during testing stops publication; rerun against that new baseline.
Use **Run workflow → rebuild_all** to force service builds when needed. Optional
build jobs may skip; failed or cancelled jobs cannot publish a release.

The solver table stage is versioned by a SHA-256 of its Docker instructions,
engine revision, downloader and table manifest. The base is published under
`cube_studio-solver:tables-<hash>` in the existing public solver package; runtime
builds use its immutable digest. An existing published solver with identical
table inputs can seed the initial version by copying its registry manifest,
without downloading or rebuilding the tables. Otherwise that table stage builds
once. Registry authentication/network failures fail the job rather than being
mistaken for a cache miss.

Runtime code is copied into `/opt/cube-solver/nxn` in separate linked layers,
allowing BuildKit to reuse the remote table layers. Registry build caches avoid
repeatedly exporting the large base into GitHub's repository cache quota. Local
`docker build ./solver` remains self-contained and prepares the tables when no
`SOLVER_TABLES_IMAGE` override is supplied. To refresh an unchanged OS/Python base,
change its pinned `FROM` version or add/bump a `TABLE_BASE_REVISION` ARG inside the
`nxn-tables` stage; that produces a new table-base version.

Validate release selection and publication locally with:

```sh
node --test .github/scripts/*.test.cjs
```

`compose.ci.yaml` accepts `FRONTEND_IMAGE`, `BACKEND_IMAGE` and `SOLVER_IMAGE` as
complete pinned references. The integration job and publisher consume the same
selection; deployment never substitutes an untested tag for a reused service.

## CI database compatibility

The integration override lets glibc own restartable sequences (`GLIBC_TUNABLES=glibc.pthread.rseq=1`), which disables MongoDB's TCMalloc per-CPU caches on the runner. This avoids the known allocator/kernel incompatibility [SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912) that produces startup error 12257600 on affected Linux kernels. An isolated check confirmed `serverStatus().tcmalloc.usingPerCPUCaches` is false with this setting. Production MongoDB configuration is unchanged.

## Route the app

First verify workloads and the private endpoint:

```sh
ssh andy@ssh.windogs.win 'KUBECONFIG=$HOME/.kube/cube-studio.yaml /usr/local/bin/kubectl -n cube-studio get pods,pvc'
ssh andy@ssh.windogs.win 'docker exec windogs-proxy wget -qO- http://172.22.0.1:30573/api/health'
```

Add the block in `deploy/Caddyfile` to the existing Caddyfile, validate inside `windogs-proxy`, then reload Caddy. Preserve the existing file and certificate volume. The subdomain must resolve to this server; Cloudflare is currently proxying it. Verify public HTTPS and the existing domains after reloading.

## Backups and rollback

MongoDB uses a local-path PVC and an application account restricted to `cube_studio`. A daily job at 03:00 Europe/Bucharest writes gzip archives to `/var/backups/cube-studio`, retaining seven days. Credentials and the kubeconfig stay under root-only `/var/lib/cube-studio` (with a separate owner-readable kubeconfig). Backups are **on the same server**; offsite storage is still required for recovery from server/disk loss.

Create and verify a backup after the first deployment:

```sh
KUBECONFIG=$HOME/.kube/cube-studio.yaml kubectl -n cube-studio create job --from=cronjob/mongo-backup mongo-backup-check
KUBECONFIG=$HOME/.kube/cube-studio.yaml kubectl -n cube-studio logs job/mongo-backup-check
```

Roll back an app release by restoring the desired manifest snapshot on `deployments` and committing with a message such as `revert(deploy): restore previous release`. That branch does not launch builds; Flux applies it directly. The next successful release from `master` replaces the rollback with its tested snapshot. Database migrations need a separate rollback plan. Deleting Flux's app Kustomization or GitRepository does not automatically delete its workloads. Do not delete the namespace or PVCs as part of application rollback.

A single node restarts failed pods, but does not provide host-level high availability. K3s also changes host networking rules, so check existing Docker apps and VPN access after installation.

### Larger-cube solving

The versioned solver base bundles the pinned NxN engine and predownloaded 4×4/5×5 lookup tables. A new table version downloads about 1.9 GiB compressed; normal runtime-code builds reuse the published base. Solver pods keep the existing private service on port 8081, use a 4 GiB memory limit, and mount a 512 MiB temporary volume for isolated reduction jobs. No lookup tables are downloaded from the running pod; readiness requires all bundled tables and the native 3×3 engine.
