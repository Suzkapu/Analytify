#!/usr/bin/env bash
set -Eeuo pipefail

web_release="$1"
web_target="$2"
worker_release="$3"
worker_root="$4"
expected_sha="$5"
app_url="$6"
health_port="${7:-8787}"
release_root="$(dirname "$web_release")"
worker_current="${worker_root}/current"
previous_web=""
previous_worker=""
activated=false

rollback() {
  local status=$?
  if [[ "$activated" == true && $status -ne 0 ]]; then
    echo "Activation failed; restoring the previous web and worker releases." >&2
    if [[ -n "$previous_web" ]]; then
      ln -sfnT "$previous_web" "${web_target}.rollback" && mv -Tf "${web_target}.rollback" "$web_target"
    else
      rm -f "$web_target"
    fi
    if [[ -n "$previous_worker" ]]; then
      ln -sfnT "$previous_worker" "${worker_current}.rollback" && mv -Tf "${worker_current}.rollback" "$worker_current"
    else
      rm -f "$worker_current"
    fi
    sudo -n systemctl restart analytify-sync.service || true
  fi
  exit "$status"
}
trap rollback EXIT

mkdir -p "$release_root" "${worker_root}/releases"
if [[ -L "$web_target" ]]; then
  previous_web="$(readlink -f "$web_target")"
elif [[ -d "$web_target" ]]; then
  previous_web="${release_root}/web-pre-atomic-$(date -u +%Y%m%d%H%M%S)"
  mv "$web_target" "$previous_web"
fi
if [[ -L "$worker_current" ]]; then previous_worker="$(readlink -f "$worker_current")"; fi

# Preserve content-hashed files needed by already-open PWA clients without
# letting an older index or service-worker manifest replace the new release.
if [[ -n "$previous_web" ]]; then
  rsync --archive --ignore-existing "${previous_web}/" "${web_release}/"
fi

ln -sfnT "$web_release" "${web_target}.next"
mv -Tf "${web_target}.next" "$web_target"
ln -sfnT "$worker_release" "${worker_current}.next"
mv -Tf "${worker_current}.next" "$worker_current"
activated=true

sudo -n systemctl daemon-reload
sudo -n systemctl enable analytify-sync.service
sudo -n systemctl restart analytify-sync.service

worker_ok=false
for _attempt in 1 2 3 4 5 6; do
  worker_sha="$(curl --fail --silent --max-time 5 "http://127.0.0.1:${health_port}/health" \
    | sed -n 's/.*"commit":"\([^"]*\)".*/\1/p' || true)"
  if [[ "$worker_sha" == "$expected_sha" ]]; then worker_ok=true; break; fi
  sleep 2
done
[[ "$worker_ok" == true ]] || { echo "Worker did not become ready at ${expected_sha}." >&2; exit 1; }

web_ok=false
for _attempt in 1 2 3 4 5 6; do
  web_sha="$(curl --fail --silent --max-time 8 "${app_url}/version.json" \
    | sed -n 's/.*"commit":"\([^"]*\)".*/\1/p' || true)"
  if [[ "$web_sha" == "$expected_sha" ]]; then web_ok=true; break; fi
  sleep 2
done
[[ "$web_ok" == true ]] || { echo "Web application did not serve ${expected_sha}." >&2; exit 1; }

activated=false
trap - EXIT
echo "Activated and verified web and worker release ${expected_sha}."
