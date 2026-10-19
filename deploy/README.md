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

1. Add the public key printed by the bootstrap (also in the staged `setup/git-read.pub`) at repository **Settings → Deploy keys**. Keep **Allow write access** unchecked. Flux reads `master` over SSH; no personal SSH keys go into the cluster.
2. The `release` workflow tests the app with MongoDB and publishes `cube_studio-frontend` and `cube_studio-backend` to GHCR. Make these two packages public once at their package settings pages. The source repository is already public; GHCR packages initially default to private. No package token is stored on the server.
3. After both images build successfully, the workflow uses its repository-scoped `GITHUB_TOKEN` to pin their commit tags in `deploy/app/kustomization.yaml`. These automated image-only commits have the message `deploy`. They do not trigger another build. Git remotes and Flux use SSH; the workflow uses GitHub's API to update the manifest without a Git SSH write key or a long-lived token.
4. Flux checks Git every minute and applies the new images. A failed test or build leaves the deployed image references unchanged.

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

Roll back an app release by restoring the previous `newTag` values in `deploy/app/kustomization.yaml` and committing with a short message. That image-only change does not launch a new build; Flux applies it directly. Database migrations need a separate rollback plan. Deleting Flux's app Kustomization or GitRepository does not automatically delete its workloads. Do not delete the namespace or PVCs as part of application rollback.

A single node restarts failed pods, but does not provide host-level high availability. K3s also changes host networking rules, so check existing Docker apps and VPN access after installation.
