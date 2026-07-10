#!/usr/bin/env bash
set -euo pipefail

VERSION="latest"
OWNER="readhou"
REPO="token_guide"
INSTALL_DIR="/opt/kkflow-guide-api"
PORT="8787"
PUBLIC_ORIGIN="https://kkflow.org"
GITEE_BASE="https://gitee.com"

usage() {
  cat <<USAGE
Usage:
  install-guide-api.sh --version v1.0.0 [options]

Options:
  --version VERSION       Release tag, for example v1.0.0.
  --owner OWNER           Gitee owner. Default: readhou.
  --repo REPO             Gitee repo. Default: token_guide.
  --install-dir DIR       Install directory. Default: /opt/kkflow-guide-api.
  --port PORT             Host port. Default: 8787.
  --public-origin URL     Public origin. Default: https://kkflow.org.
  --gitee-token TOKEN     Token for private release assets.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="${2:?}"; shift 2 ;;
    --owner) OWNER="${2:?}"; shift 2 ;;
    --repo) REPO="${2:?}"; shift 2 ;;
    --install-dir) INSTALL_DIR="${2:?}"; shift 2 ;;
    --port) PORT="${2:?}"; shift 2 ;;
    --public-origin) PUBLIC_ORIGIN="${2:?}"; shift 2 ;;
    --gitee-token) GITEE_TOKEN="${2:?}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$VERSION" == "latest" ]]; then
  echo "Please specify --version vX.Y.Z" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Please install Docker first." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Docker Compose is required." >&2
  exit 1
fi

ASSET="guide-api-${VERSION}-linux-amd64.docker.tar.gz"
ASSET_SHA="${ASSET}.sha256"
DOWNLOAD_BASE="${GITEE_BASE}/${OWNER}/${REPO}/releases/download/${VERSION}"

mkdir -p "${INSTALL_DIR}/data" "${INSTALL_DIR}/releases"
cd "${INSTALL_DIR}"

AUTH_HEADER=()
if [[ -n "${GITEE_TOKEN:-}" ]]; then
  AUTH_HEADER=(-H "Authorization: token ${GITEE_TOKEN}")
fi

echo "Downloading ${ASSET} ..."
if curl -fL "${AUTH_HEADER[@]}" -o "releases/${ASSET}.parts.txt" "${DOWNLOAD_BASE}/${ASSET}.parts.txt"; then
  echo "Found split archive manifest. Downloading parts ..."
  : > "releases/${ASSET}"
  while IFS= read -r part_name; do
    [[ -z "${part_name}" ]] && continue
    curl -fL "${AUTH_HEADER[@]}" -o "releases/${part_name}" "${DOWNLOAD_BASE}/${part_name}"
    cat "releases/${part_name}" >> "releases/${ASSET}"
  done < "releases/${ASSET}.parts.txt"
else
  rm -f "releases/${ASSET}.parts.txt"
  curl -fL "${AUTH_HEADER[@]}" -o "releases/${ASSET}" "${DOWNLOAD_BASE}/${ASSET}"
fi
curl -fL "${AUTH_HEADER[@]}" -o "releases/${ASSET_SHA}" "${DOWNLOAD_BASE}/${ASSET_SHA}"

echo "Verifying checksum ..."
expected_sha="$(awk '{print $1}' "releases/${ASSET_SHA}")"
actual_sha="$(sha256sum "releases/${ASSET}" | awk '{print $1}')"
if [[ -z "${expected_sha}" || "${actual_sha}" != "${expected_sha}" ]]; then
  echo "Checksum mismatch for ${ASSET}" >&2
  echo "expected: ${expected_sha}" >&2
  echo "actual:   ${actual_sha}" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  ADMIN_TOKEN="$(openssl rand -hex 24 2>/dev/null || date +%s%N)"
  IP_HASH_SALT="$(openssl rand -hex 24 2>/dev/null || date +%s%N)"
  cat > .env <<EOF
NODE_ENV=production
GUIDE_API_HOST=0.0.0.0
GUIDE_API_PORT=8787
GUIDE_API_PREFIX=/guide-api
GUIDE_API_PUBLIC_ORIGIN=${PUBLIC_ORIGIN}
GUIDE_API_DB_PATH=/data/guide-api.sqlite
GUIDE_API_ADMIN_TOKEN=${ADMIN_TOKEN}
GUIDE_API_IP_HASH_SALT=${IP_HASH_SALT}
GUIDE_API_CORS_ORIGINS=${PUBLIC_ORIGIN}
GUIDE_API_RATE_WINDOW_MS=600000
GUIDE_API_RATE_MAX=5
GUIDE_API_FEEDBACK_DAILY_LIMIT=5
GUIDE_API_TRUST_PROXY=true
GUIDE_API_LOG_LEVEL=info
GUIDE_API_SUB2API_BASE_URL=${PUBLIC_ORIGIN}
GUIDE_API_SUB2API_ADMIN_API_KEY=
GUIDE_API_PRICING_PLATFORMS=openai,anthropic,gemini,antigravity,grok
GUIDE_API_PRICING_CACHE_TTL_MS=300000
GUIDE_API_PRICING_FETCH_TIMEOUT_MS=8000
GUIDE_API_USD_TO_CNY=6.8102
EOF
  chmod 600 .env
  echo "Created ${INSTALL_DIR}/.env. Please fill GUIDE_API_SUB2API_ADMIN_API_KEY if pricing sync is needed."
fi

echo "Loading Docker image ..."
gzip -dc "releases/${ASSET}" | docker load

cat > docker-compose.yml <<EOF
services:
  guide-api:
    image: kkflow-guide-api:${VERSION}
    container_name: kkflow-guide-api
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "127.0.0.1:${PORT}:8787"
    volumes:
      - ./data:/data
EOF

echo "Starting guide-api ..."
"${COMPOSE[@]}" up -d

echo "Checking health ..."
sleep 2
curl -fsS "http://127.0.0.1:${PORT}/guide-api/health" || {
  echo
  echo "Health check failed. Inspect logs with: cd ${INSTALL_DIR} && ${COMPOSE[*]} logs -f" >&2
  exit 1
}

echo
echo "Guide API is running."
echo "Config: ${INSTALL_DIR}/.env"
echo "Compose: ${INSTALL_DIR}/docker-compose.yml"
