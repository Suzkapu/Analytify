#!/usr/bin/env bash

set -Eeuo pipefail

source_file="${1:-}"
snippet_file="/etc/nginx/snippets/analytify-security.conf"
legacy_file="/etc/nginx/conf.d/analytify-security.conf"
snippet_backup="$(mktemp /tmp/analytify-nginx-snippet.XXXXXX)"
legacy_backup="$(mktemp /tmp/analytify-nginx-legacy.XXXXXX)"
site_backup="$(mktemp /tmp/analytify-nginx-site.XXXXXX)"
rendered_site="$(mktemp /tmp/analytify-nginx-rendered.XXXXXX)"
had_snippet=false
had_legacy=false
site_changed=false
site_file=""

if [[ -z "$source_file" || ! -f "$source_file" ]]; then
  echo "Nginx security configuration source is missing." >&2
  exit 1
fi

cleanup() {
  rm -f "$snippet_backup" "$legacy_backup" "$site_backup" "$rendered_site"
}

restore_previous() {
  if [[ "$had_snippet" == true ]]; then
    sudo -n install -o root -g root -m 0644 "$snippet_backup" "$snippet_file"
  else
    sudo -n rm -f "$snippet_file"
  fi
  if [[ "$had_legacy" == true ]]; then
    sudo -n install -o root -g root -m 0644 "$legacy_backup" "$legacy_file"
  else
    sudo -n rm -f "$legacy_file"
  fi
  if [[ "$site_changed" == true ]]; then
    sudo -n install -o root -g root -m 0644 "$site_backup" "$site_file"
  fi
  sudo -n nginx -t >/dev/null 2>&1 && sudo -n systemctl reload nginx || true
}

trap 'restore_previous; cleanup' ERR

declare -a matching_sites=()
for candidate in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [[ -f "$candidate" ]] || continue
  if sudo -n grep -Eq 'server_name[^;]*analytify[.]dynv6[.]net' "$candidate"; then
    matching_sites+=("$(readlink -f "$candidate")")
  fi
done
if [[ "${#matching_sites[@]}" -gt 0 ]]; then
  mapfile -t matching_sites < <(printf '%s\n' "${matching_sites[@]}" | sort -u)
fi
if [[ "${#matching_sites[@]}" -ne 1 ]]; then
  echo "Nginx security installation requires exactly one Analytify virtual-host file; found ${#matching_sites[@]}." >&2
  exit 1
fi
site_file="${matching_sites[0]}"

if sudo -n test -f "$snippet_file"; then
  sudo -n cp "$snippet_file" "$snippet_backup"
  had_snippet=true
fi
if sudo -n test -f "$legacy_file"; then
  sudo -n cp "$legacy_file" "$legacy_backup"
  had_legacy=true
fi
sudo -n cp "$site_file" "$site_backup"

sudo -n install -d -o root -g root -m 0755 /etc/nginx/snippets
sudo -n install -o root -g root -m 0644 "$source_file" "$snippet_file"
if ! sudo -n grep -Fq 'include /etc/nginx/snippets/analytify-security.conf;' "$site_file"; then
  node "$(dirname "$0")/inject-nginx-security-include.mjs" "$site_file" "$rendered_site"
  sudo -n install -o root -g root -m 0644 "$rendered_site" "$site_file"
  site_changed=true
fi
sudo -n rm -f "$legacy_file"

sudo -n nginx -t
sudo -n systemctl reload nginx

trap - ERR
cleanup
echo "Nginx security headers installed in the Analytify location and verified."
