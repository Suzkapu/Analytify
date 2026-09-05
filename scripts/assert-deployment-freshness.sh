#!/usr/bin/env bash

set -Eeuo pipefail

# Asserts that a deployment is running against an authorized, protected ref
# and has not been superseded by a newer commit on that ref.

expected_ref="${1:-${GITHUB_REF:-${DEPLOY_REF:-refs/heads/main}}}"
expected_sha="${2:-${DEPLOY_COMMIT_SHA:-${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo "")}}}"
remote_name="${REMOTE_NAME:-origin}"

if [[ -z "$expected_sha" ]]; then
  echo "Deployment freshness error: commit SHA could not be determined." >&2
  exit 1
fi

# Normalize ref
if [[ "$expected_ref" == "main" ]]; then
  expected_ref="refs/heads/main"
fi

is_main_branch=false
is_release_tag=false

if [[ "$expected_ref" == "refs/heads/main" ]]; then
  is_main_branch=true
elif [[ "$expected_ref" =~ ^refs/tags/v[0-9]+(\.[0-9]+)*.*$ ]]; then
  is_release_tag=true
fi

if [[ "$is_main_branch" != "true" && "$is_release_tag" != "true" ]]; then
  echo "Deployment freshness error: '${expected_ref}' is not an authorized production deployment ref. Only protected main or v* release tags may deploy." >&2
  exit 1
fi

# Check remote freshness for branch deployments
if [[ "$is_main_branch" == "true" ]]; then
  latest_remote_sha="${SIMULATE_REMOTE_SHA:-}"

  if [[ -z "$latest_remote_sha" ]]; then
    # Query remote ref
    latest_remote_sha="$(git ls-remote --heads "$remote_name" refs/heads/main 2>/dev/null | awk '{print $1}')"
  fi

  if [[ -n "$latest_remote_sha" && "$latest_remote_sha" != "$expected_sha" ]]; then
    echo "Stale deployment detected: commit '${expected_sha}' has been superseded by '${latest_remote_sha}' on ${expected_ref}. Aborting deployment to prevent newer releases from being rolled back." >&2
    exit 1
  fi
fi

if [[ "$is_release_tag" == "true" ]]; then
  tag_remote_sha="${SIMULATE_REMOTE_SHA:-}"
  if [[ -z "$tag_remote_sha" ]]; then
    tag_remote_sha="$(git ls-remote --tags "$remote_name" "${expected_ref}^{}" 2>/dev/null | awk '{print $1}')"
    if [[ -z "$tag_remote_sha" ]]; then
      tag_remote_sha="$(git ls-remote --tags "$remote_name" "$expected_ref" 2>/dev/null | awk '{print $1}')"
    fi
  fi

  if [[ -n "$tag_remote_sha" && "$tag_remote_sha" != "$expected_sha" ]]; then
    echo "Tag mismatch detected: tag '${expected_ref}' points to '${tag_remote_sha}', but workflow commit is '${expected_sha}'. Aborting deployment." >&2
    exit 1
  fi
fi

echo "Deployment freshness confirmed: commit ${expected_sha} on ${expected_ref} is current."
