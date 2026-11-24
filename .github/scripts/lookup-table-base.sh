#!/usr/bin/env bash
set -euo pipefail

# A missing manifest is a cache miss. Authentication/network failures are not:
# fail those rather than unexpectedly downloading several GiB of tables.
if docker buildx imagetools inspect "$TABLES_TAG" > /tmp/cube-table-inspect.txt 2>&1; then
  echo 'exists=true' >> "$GITHUB_OUTPUT"
elif grep -Eqi 'manifest unknown|404([ :]|$)' /tmp/cube-table-inspect.txt ||
     grep -Fqi "$TABLES_TAG: not found" /tmp/cube-table-inspect.txt; then
  if [[ -n "$TABLES_SEED" ]]; then
    # Identical table inputs in a published solver can seed the initial base.
    # Same-repository manifest copying does not download the table layers.
    docker buildx imagetools create --prefer-index=false --tag "$TABLES_TAG" "$TABLES_SEED"
    echo 'exists=true' >> "$GITHUB_OUTPUT"
  else
    echo 'exists=false' >> "$GITHUB_OUTPUT"
  fi
else
  cat /tmp/cube-table-inspect.txt >&2
  exit 1
fi
