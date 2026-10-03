#!/usr/bin/env bash
set -Eeuo pipefail

for name in DEPLOY_HOST DEPLOY_USER DEPLOY_TARGET DEPLOY_SSH_KEY DEPLOY_SSH_KNOWN_HOSTS GITHUB_SHA; do
  [[ -n "${!name:-}" ]] || { echo "Missing preview deployment setting: $name" >&2; exit 1; }
done
[[ "${GITHUB_REF:-}" == refs/heads/codex/design-v2 ]] || { echo 'Only the development branch may deploy this frontend.' >&2; exit 1; }
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ "$DEPLOY_HOST" == analytify.dynv6.net ]] || exit 1
[[ "$DEPLOY_USER" =~ ^[A-Za-z_][A-Za-z0-9._-]*$ ]] || exit 1
[[ "$DEPLOY_TARGET" =~ ^/[A-Za-z0-9._/-]+$ && "$DEPLOY_TARGET" != *..* && "$DEPLOY_TARGET" != / ]] || exit 1
[[ -f dist/spoti-front/index.html && -f dist/spoti-front/version.json ]] || exit 1
grep -q '<base href="/new/">' dist/spoti-front/index.html || exit 1
node -e 'const manifest=require("./dist/spoti-front/ngsw.json");if(manifest.index!=="/new/index.html"||Object.keys(manifest.hashTable).some(path=>!path.startsWith("/new/")))throw Error("Preview worker assets must stay inside /new/")'
current_sha="$(git ls-remote --exit-code origin refs/heads/codex/design-v2 | awk 'NR == 1 {print $1}')"
[[ "$current_sha" == "$GITHUB_SHA" ]] || { echo 'Preview deployment was superseded.' >&2; exit 1; }

key="$(mktemp)"
known_hosts="$(mktemp)"
trap 'rm -f "$key" "$known_hosts"' EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' > "$key"
printf '%s\n' "$DEPLOY_SSH_KNOWN_HOSTS" | tr -d '\r' > "$known_hosts"
chmod 600 "$key" "$known_hosts"
ssh-keygen -F "$DEPLOY_HOST" -f "$known_hosts" >/dev/null || exit 1
ssh_args=(-i "$key" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$known_hosts" -o GlobalKnownHostsFile=/dev/null -o ConnectTimeout=20)
remote="$DEPLOY_USER@$DEPLOY_HOST"
preview_root="$(dirname "${DEPLOY_TARGET%/}")/analytify-preview"
release="$preview_root/releases/$GITHUB_SHA"
infra="$preview_root/.deploy-$GITHUB_SHA"
ssh "${ssh_args[@]}" "$remote" "mkdir -p '$release' '$infra'"
rsync -az -e "ssh -i $key -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$known_hosts -o GlobalKnownHostsFile=/dev/null" dist/spoti-front/ "$remote:$release/"
rsync -az -e "ssh -i $key -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$known_hosts -o GlobalKnownHostsFile=/dev/null" scripts/preview-nginx.mjs "$remote:$infra/"
current_sha="$(git ls-remote --exit-code origin refs/heads/codex/design-v2 | awk 'NR == 1 {print $1}')"
[[ "$current_sha" == "$GITHUB_SHA" ]] || { echo 'Preview was superseded during upload; leaving the live site unchanged.' >&2; exit 1; }

ssh "${ssh_args[@]}" "$remote" bash -s -- "$preview_root" "$release" "$infra" "$GITHUB_SHA" <<'REMOTE'
set -Eeuo pipefail
preview_root="$1"; release="$2"; infra="$3"; sha="$4"
[[ ! -e "$preview_root/new" || -L "$preview_root/new" ]] || { echo 'Preview mount is not a managed symlink.' >&2; exit 1; }
mapfile -t sites < <(sudo -n grep -lE 'server_name[^;]*analytify[.]dynv6[.]net' /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf | xargs -r -n1 readlink -f | sort -u)
[[ "${#sites[@]}" == 1 ]] || { echo 'Expected one application virtual-host file.' >&2; exit 1; }
site="${sites[0]}"
backup="$(mktemp -d /tmp/analytify-preview-config.XXXXXX)"
sudo -n cp "$site" "$backup/site.conf"
previous="$(readlink "$preview_root/new" || true)"
site_changed=false
link_changed=false
rollback() {
  if [[ "$link_changed" == true ]]; then
    if [[ -n "$previous" ]]; then
      ln -s "$previous" "$preview_root/.rollback-$sha"
      mv -Tf "$preview_root/.rollback-$sha" "$preview_root/new"
    elif [[ "$(readlink "$preview_root/new" || true)" == "$release" ]]; then
      rm "$preview_root/new"
    fi
  fi
  if [[ "$site_changed" == true ]]; then
    sudo -n install -o root -g root -m 0644 "$backup/site.conf" "$site"
    sudo -n nginx -t && sudo -n systemctl reload nginx
  fi
}
trap rollback ERR
node "$infra/preview-nginx.mjs" "$site" "$backup/rendered.conf" "$preview_root"
ln -s "$release" "$preview_root/.next-$sha"
mv -Tf "$preview_root/.next-$sha" "$preview_root/new"
link_changed=true
site_changed=true
sudo -n install -o root -g root -m 0644 "$backup/rendered.conf" "$site"
sudo -n nginx -t
sudo -n systemctl reload nginx
# A graceful reload starts new workers asynchronously. Old workers can still
# answer the first request using the previous /new fallback; allow that bounded
# handover before deciding the release is unhealthy and rolling it back.
verified=false
for attempt in {1..15}; do
  if curl --fail --silent --show-error --max-time 5 -H 'Cache-Control: no-cache' https://analytify.dynv6.net/new/version.json | node -e 'let body="";process.stdin.on("data",x=>body+=x);process.stdin.on("end",()=>{try{if(JSON.parse(body).commit!==process.argv[1])process.exitCode=1}catch{process.exitCode=1}})' "$sha"; then
    verified=true
    break
  fi
  sleep 1
done
[[ "$verified" == true ]] || { echo 'Preview activation did not become healthy.' >&2; false; }
trap - ERR
echo "Preview frontend activated independently at /new/. Previous config preserved in $backup"
REMOTE
