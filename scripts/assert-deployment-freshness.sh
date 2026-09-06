#!/usr/bin/env bash

set -Eeuo pipefail

deploy_ref="${1:-${GITHUB_REF:-}}"
deploy_sha="${2:-${GITHUB_SHA:-}}"

if [[ "$deploy_ref" != "refs/heads/main" ]]; then
  echo "Production deployment rejected: ${deploy_ref:-missing ref} is not refs/heads/main." >&2
  exit 1
fi
if [[ ! "$deploy_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Production deployment rejected: commit SHA is invalid." >&2
  exit 1
fi

remote_sha="$(git ls-remote --exit-code origin refs/heads/main | awk 'NR == 1 {print $1}')"
if [[ ! "$remote_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Production deployment rejected: current main commit could not be resolved." >&2
  exit 1
fi
if [[ "$remote_sha" != "$deploy_sha" ]]; then
  echo "Production deployment rejected: ${deploy_sha} was superseded by ${remote_sha}." >&2
  exit 1
fi

echo "Deployment freshness verified for ${deploy_ref} at ${deploy_sha}."
