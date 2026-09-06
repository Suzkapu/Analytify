#!/usr/bin/env bash

set -Eeuo pipefail

source_file="${1:-}"
target_file="/etc/nginx/conf.d/analytify-security.conf"
backup_file="$(mktemp /tmp/analytify-nginx-security.XXXXXX)"
had_previous="false"

if [[ -z "$source_file" || ! -f "$source_file" ]]; then
  echo "Nginx security configuration source is missing." >&2
  exit 1
fi

restore_previous() {
  if [[ "$had_previous" == "true" ]]; then
    sudo -n install -o root -g root -m 0644 "$backup_file" "$target_file"
  else
    sudo -n rm -f "$target_file"
  fi
}

trap 'restore_previous; rm -f "$backup_file"' ERR
if sudo -n test -f "$target_file"; then
  sudo -n cp "$target_file" "$backup_file"
  had_previous="true"
fi

sudo -n install -o root -g root -m 0644 "$source_file" "$target_file"
sudo -n nginx -t
sudo -n systemctl reload nginx

trap - ERR
rm -f "$backup_file"
echo "Nginx security headers installed and verified."
