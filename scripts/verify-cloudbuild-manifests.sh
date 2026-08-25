#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

manifests=(cloudbuild.caveworkers.yaml)
for manifest in "${manifests[@]}"; do
  while IFS= read -r dockerfile; do
    [[ -z "$dockerfile" ]] && continue
    if [[ ! -f "$dockerfile" ]]; then
      echo "Missing Dockerfile '$dockerfile' referenced by $manifest" >&2
      exit 1
    fi
    echo "Verified $manifest -> $dockerfile"
  done < <(grep -oE -- '--file=[^[:space:]]+' "$manifest" | cut -d= -f2)
done
