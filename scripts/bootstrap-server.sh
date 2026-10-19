#!/usr/bin/env bash
# Run once with sudo on windogs. Never run with bash -x: it creates credentials.
set -euo pipefail
umask 077
[[ ${EUID} -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
setup_dir="$(cd "$(dirname "$0")/.." && pwd)"
state_dir=/var/lib/cube-studio
k3s_version='v1.36.5+k3s1'
flux_version='2.9.6'
bridge_ip='172.22.0.1'

# Fail before touching services if this host is not the server we inspected.
[[ $(uname -m) == x86_64 ]] || { echo 'This bootstrap targets x86_64.' >&2; exit 1; }
[[ -f /home/andy/apps/caddy_proxy/Caddyfile ]] || { echo 'Existing Caddy configuration not found.' >&2; exit 1; }
docker network inspect web --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' | grep -Fx "$bridge_ip" >/dev/null
python3 - <<'PY'
import ipaddress, json, subprocess
planned = [ipaddress.ip_network('172.28.0.0/16'), ipaddress.ip_network('172.29.0.0/16')]
for item in json.loads(subprocess.check_output(['ip','-j','-4','route'])):
    destination = item.get('dst', 'default')
    if destination == 'default': continue
    actual = ipaddress.ip_network(destination, strict=False)
    # The exact two ranges are expected on subsequent runs after K3s starts.
    if any(actual.overlaps(net) for net in planned):
        if not subprocess.run(['systemctl','is-active','--quiet','k3s']).returncode == 0:
            raise SystemExit(f'Conflicting route: {actual}. Review before installing.')
PY
# Free only unused build cache older than a week. No volumes or app images are pruned.
if [[ $(df --output=pcent / | tail -1 | tr -dc '0-9') -ge 90 ]]; then
  docker builder prune --force --filter 'until=168h'
fi
available_kib=$(df --output=avail / | tail -1 | tr -d ' ')
[[ "$available_kib" -ge 20971520 ]] || { echo 'Need at least 20 GiB free before installing.' >&2; exit 1; }
install -d -m 0700 "$state_dir" /var/backups/cube-studio
if [[ ! -f "$state_dir/Caddyfile.before" ]]; then
  cp /home/andy/apps/caddy_proxy/Caddyfile "$state_dir/Caddyfile.before"
fi

if ! command -v k3s >/dev/null; then
  # Reserve the following CIDRs for K3s; do not allocate them to future Docker networks.
  install -d -m 0755 /etc/rancher/k3s
  if [[ -e /etc/rancher/k3s/config.yaml ]]; then
    echo 'A K3s config already exists; refusing to overwrite it.' >&2; exit 1
  fi
  cat > /etc/rancher/k3s/config.yaml <<CONFIG
write-kubeconfig-mode: "0600"
secrets-encryption: true
bind-address: ${bridge_ip}
advertise-address: ${bridge_ip}
node-ip: ${bridge_ip}
cluster-cidr: 172.28.0.0/16
service-cidr: 172.29.0.0/16
flannel-backend: host-gw
disable:
  - traefik
  - servicelb
  - metrics-server
kubelet-arg:
  - "address=${bridge_ip}"
  - "image-gc-high-threshold=75"
  - "image-gc-low-threshold=60"
kube-proxy-arg:
  - "nodeport-addresses=${bridge_ip}/32"
CONFIG
  curl --fail --silent --show-error --location https://get.k3s.io -o "$state_dir/install-k3s.sh"
  INSTALL_K3S_VERSION="$k3s_version" INSTALL_K3S_EXEC=server sh "$state_dir/install-k3s.sh"
else
  echo 'K3s is already installed; leaving its configuration and version in place.'
fi
# Use the private listener even if this K3s release writes a loopback kubeconfig.
python3 - "$state_dir/kubeconfig" <<'PYCONFIG'
import pathlib,re,sys
text=pathlib.Path('/etc/rancher/k3s/k3s.yaml').read_text()
text=re.sub(r'^(\s*server:)\s*.*$', r'\1 https://172.22.0.1:6443', text, flags=re.M)
pathlib.Path(sys.argv[1]).write_text(text)
PYCONFIG
export KUBECONFIG="$state_dir/kubeconfig"
k3s kubectl wait --for=condition=Ready nodes --all --timeout=180s
# Preserve any existing kubectl configuration; give the server owner a separate one.
install -d -m 0700 -o andy -g andy /home/andy/.kube
install -m 0600 -o andy -g andy "$state_dir/kubeconfig" /home/andy/.kube/cube-studio.yaml

if [[ ! -x "$state_dir/flux" ]]; then
  work_dir=$(mktemp -d)
  trap 'rm -rf "$work_dir"' EXIT
  curl -fsSL "https://github.com/fluxcd/flux2/releases/download/v${flux_version}/flux_${flux_version}_linux_amd64.tar.gz" -o "$work_dir/flux.tar.gz"
  curl -fsSL "https://github.com/fluxcd/flux2/releases/download/v${flux_version}/flux_${flux_version}_checksums.txt" -o "$work_dir/checksums.txt"
  expected=$(awk "/flux_${flux_version}_linux_amd64.tar.gz\$/ {print \$1}" "$work_dir/checksums.txt")
  [[ -n "$expected" ]] || { echo 'Flux checksum missing.' >&2; exit 1; }
  printf '%s  %s\n' "$expected" "$work_dir/flux.tar.gz" | sha256sum --check --status
  tar -xzf "$work_dir/flux.tar.gz" -C "$work_dir" flux
  install -m 0755 "$work_dir/flux" "$state_dir/flux"
fi
"$state_dir/flux" check --pre
"$state_dir/flux" install --components=source-controller,kustomize-controller --timeout=5m
k3s kubectl apply -f "$setup_dir/deploy/app/namespace.yaml"
if ! k3s kubectl -n cube-studio get secret mongo-credentials >/dev/null 2>&1; then
  # Retain the generated secret only on this server, outside the Git checkout.
  if [[ ! -f "$state_dir/mongo-secret.json" ]]; then
  python3 - "$state_dir/mongo-secret.json" <<'PY'
import base64,json,secrets,sys
root_password=secrets.token_hex(32)
app_password=secrets.token_hex(32)
data={
    'MONGO_INITDB_ROOT_USERNAME':'cube_admin',
    'MONGO_INITDB_ROOT_PASSWORD':root_password,
    'MONGO_APP_USER':'cube_app',
    'MONGO_APP_PASSWORD':app_password,
    'MONGO_URL':f'mongodb://cube_app:{app_password}@mongo:27017/cube_studio?authSource=cube_studio',
}
with open(sys.argv[1],'x') as f:
    json.dump({'apiVersion':'v1','kind':'Secret','metadata':{'name':'mongo-credentials','namespace':'cube-studio'},'type':'Opaque','data':{k:base64.b64encode(v.encode()).decode() for k,v in data.items()}},f)
PY
  fi
  k3s kubectl apply -f "$state_dir/mongo-secret.json" >/dev/null
fi
if [[ ! -f "$state_dir/git-read" ]]; then
  ssh-keygen -q -t ed25519 -N '' -C cube-studio-flux -f "$state_dir/git-read"
fi
# Pin the published GitHub host key through the SSH host trust already used by andy.
if ! ssh-keygen -F github.com -f /home/andy/.ssh/known_hosts > "$state_dir/known_hosts"; then
  echo 'GitHub is missing from andy’s SSH known_hosts. Verify GitHub host keys before continuing.' >&2
  exit 1
fi
k3s kubectl -n flux-system create secret generic cube-studio-git \
  --from-file=identity="$state_dir/git-read" \
  --from-file=identity.pub="$state_dir/git-read.pub" \
  --from-file=known_hosts="$state_dir/known_hosts" \
  --dry-run=client -o yaml | k3s kubectl apply -f - >/dev/null
k3s kubectl apply -f "$setup_dir/deploy/flux/sync.yaml"
echo
echo 'K3s and Flux are installed. Add this READ-ONLY key to the repository Deploy keys:'
cat "$state_dir/git-read.pub"
echo
install -m 0644 "$state_dir/git-read.pub" "$setup_dir/git-read.pub"
echo 'Then make both GHCR image packages public and verify the app before routing Caddy.'
