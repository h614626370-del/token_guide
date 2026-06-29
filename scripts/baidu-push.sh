#!/usr/bin/env bash
set -euo pipefail

SITE="${BAIDU_PUSH_SITE:-https://kkflow.org}"
URLS="${BAIDU_PUSH_URLS:-https://kkflow.org/
https://kkflow.org/guide/}"

if [[ -z "${BAIDU_PUSH_TOKEN:-}" ]]; then
  echo "BAIDU_PUSH_TOKEN is required." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

API="http://data.zz.baidu.com/urls?site=${SITE}&token=${BAIDU_PUSH_TOKEN}"

echo "Pushing URLs to Baidu:"
printf '%s\n' "$URLS" | sed 's/^/  /'
echo "Endpoint:"
echo "  $API"

response="$(curl -sS \
  -X POST \
  -H "Content-Type:text/plain" \
  --data-binary "$URLS" \
  "$API")"

echo "Baidu response:"
echo "$response"

if printf '%s' "$response" | grep -q '"error"'; then
  exit 1
fi
