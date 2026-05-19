#!/usr/bin/env bash
# scripts/indexnow-batch-ping.sh — manual IndexNow batch ping.
#
# Usage:
#   ./scripts/indexnow-batch-ping.sh <url> [<url> ...]
#   ./scripts/indexnow-batch-ping.sh -f urls.txt
#
# Reads INDEXNOW_KEY from wrangler.toml [vars] and pings api.indexnow.org so
# Bing and Yandex pick up content drops within seconds. Use after big content
# batches (blog/glossary deploys) — the per-listing auto-ping in the API
# handles individual CRUD already.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WRANGLER="$ROOT/wrangler.toml"

KEY=$(awk -F'"' '/^INDEXNOW_KEY[[:space:]]*=/ { print $2; exit }' "$WRANGLER")
SITE=$(awk -F'"' '/^PUBLIC_SITE_URL[[:space:]]*=/ { print $2; exit }' "$WRANGLER")

if [[ -z "$KEY" ]]; then
  echo "ERROR: INDEXNOW_KEY not set in $WRANGLER" >&2
  exit 1
fi
if [[ -z "$SITE" ]]; then
  echo "ERROR: PUBLIC_SITE_URL not set in $WRANGLER" >&2
  exit 1
fi

# Collect URLs — either positional args, or from -f <file>.
URLS=()
if [[ "${1:-}" == "-f" ]]; then
  FILE="${2:?missing file path after -f}"
  while IFS= read -r line; do
    [[ -n "$line" && "$line" != \#* ]] && URLS+=("$line")
  done < "$FILE"
else
  URLS=("$@")
fi

if [[ "${#URLS[@]}" -eq 0 ]]; then
  echo "ERROR: no URLs provided" >&2
  echo "Usage: $0 <url> [<url> ...]   |   $0 -f urls.txt" >&2
  exit 1
fi

HOST=$(echo "$SITE" | awk -F/ '{print $3}')
KEY_LOCATION="$SITE/$KEY.txt"

# Build JSON urlList
URL_JSON=$(printf '"%s",' "${URLS[@]}")
URL_JSON="[${URL_JSON%,}]"

PAYLOAD=$(cat <<EOF
{"host":"$HOST","key":"$KEY","keyLocation":"$KEY_LOCATION","urlList":$URL_JSON}
EOF
)

echo "Pinging IndexNow with ${#URLS[@]} URL(s)…"
curl -sS -X POST "https://api.indexnow.org/indexnow" \
  -H "content-type: application/json; charset=utf-8" \
  -w "\nHTTP %{http_code}\n" \
  -d "$PAYLOAD"
