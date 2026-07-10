#!/usr/bin/env bash
set -euo pipefail

VERSION="latest"
IMAGE_REPOSITORY="614626370/kkflow-guide-api"
INSTALL_DIR=""
PORT="8787"
PUBLIC_ORIGIN="https://kkflow.org"

usage() {
  cat <<USAGE
Usage:
  install-guide-api.sh --version v1.0.0 [options]

Options:
  --version VERSION       Image tag, for example v1.0.0. Default: latest.
  --image IMAGE           Docker image repository. Default: 614626370/kkflow-guide-api.
  --install-dir DIR       Install directory. Default: current directory.
  --port PORT             Host port. Default: 8787.
  --public-origin URL     Public origin. Default: https://kkflow.org.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="${2:?}"; shift 2 ;;
    --image) IMAGE_REPOSITORY="${2:?}"; shift 2 ;;
    --install-dir) INSTALL_DIR="${2:?}"; shift 2 ;;
    --port) PORT="${2:?}"; shift 2 ;;
    --public-origin) PUBLIC_ORIGIN="${2:?}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "${INSTALL_DIR}" ]]; then
  INSTALL_DIR="$(pwd)"
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

IMAGE_REF="${IMAGE_REPOSITORY}:${VERSION}"

mkdir -p "${INSTALL_DIR}/data"
cd "${INSTALL_DIR}"

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
GUIDE_API_LOG_LEVEL=warn
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

echo "Pulling Docker image: ${IMAGE_REF}"
if ! docker pull "${IMAGE_REF}"; then
  echo "Docker image pull failed: ${IMAGE_REF}" >&2
  echo "If the Docker Hub repository is private, run docker login on this server first." >&2
  exit 1
fi

cat > docker-compose.yml <<EOF
services:
  guide-api:
    image: ${IMAGE_REF}
    container_name: kkflow-guide-api
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "${PORT}:8787"
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
echo "Image: ${IMAGE_REF}"
echo "Config: ${INSTALL_DIR}/.env"
echo "Compose: ${INSTALL_DIR}/docker-compose.yml"
