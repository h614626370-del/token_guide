#!/usr/bin/env bash
set -euo pipefail

VERSION="latest"
IMAGE_REPOSITORY="614626370/kkflow-guide"
INSTALL_DIR=""
PORT="3000"
SITE_URL="https://guide.kkflow.org"
SUB2API_ORIGIN="https://kkflow.org"

usage() {
  cat <<USAGE
Usage: install-guide.sh [options]

Options:
  --version VERSION          Image tag. Default: latest.
  --image IMAGE              Image repository. Default: 614626370/kkflow-guide.
  --install-dir DIR          Install directory. Default: current directory.
  --port PORT                Loopback host port. Default: 3000.
  --site-url URL             Public guide origin. Default: https://guide.kkflow.org.
  --sub2api-origin URL       sub2api origin. Default: https://kkflow.org.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="${2:?}"; shift 2 ;;
    --image) IMAGE_REPOSITORY="${2:?}"; shift 2 ;;
    --install-dir) INSTALL_DIR="${2:?}"; shift 2 ;;
    --port) PORT="${2:?}"; shift 2 ;;
    --site-url) SITE_URL="${2:?}"; shift 2 ;;
    --sub2api-origin) SUB2API_ORIGIN="${2:?}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

[[ -n "${INSTALL_DIR}" ]] || INSTALL_DIR="$(pwd)"
command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 1; }

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Docker Compose is required." >&2
  exit 1
fi

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

read_env() {
  local key="$1"
  [[ -f .env ]] || return 0
  sed -n "s/^${key}=//p" .env | tail -n 1
}

append_env_if_missing() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" .env 2>/dev/null; then
    printf '%s=%s\n' "${key}" "${value}" >> .env
  fi
}

mkdir -p "${INSTALL_DIR}/data"
cd "${INSTALL_DIR}"

if [[ -f data/guide-api.sqlite && ! -f data/guide.sqlite ]]; then
  cp -p data/guide-api.sqlite data/guide.sqlite
  echo "Copied legacy SQLite data to data/guide.sqlite; the original file was retained."
fi

if [[ ! -f .env ]]; then
  touch .env
fi
chmod 600 .env

LEGACY_ADMIN_TOKEN="$(read_env GUIDE_API_ADMIN_TOKEN)"
LEGACY_IP_SALT="$(read_env GUIDE_API_IP_HASH_SALT)"
LEGACY_SUB2_ADMIN_KEY="$(read_env GUIDE_API_SUB2API_ADMIN_API_KEY)"

append_env_if_missing NODE_ENV production
append_env_if_missing HOST 0.0.0.0
append_env_if_missing PORT 3000
append_env_if_missing NUXT_PUBLIC_SITE_URL "${SITE_URL}"
append_env_if_missing NUXT_PUBLIC_SUB2API_ORIGIN "${SUB2API_ORIGIN}"
append_env_if_missing NUXT_PUBLIC_SITE_NAME "Token向云指南"
append_env_if_missing NUXT_SESSION_PASSWORD "$(random_hex)"
append_env_if_missing NUXT_ADMIN_TOKEN "${LEGACY_ADMIN_TOKEN:-$(random_hex)}"
append_env_if_missing NUXT_IP_HASH_SALT "${LEGACY_IP_SALT:-$(random_hex)}"
append_env_if_missing NUXT_DATABASE_PATH /data/guide.sqlite
append_env_if_missing NUXT_SUB2API_ADMIN_API_KEY "${LEGACY_SUB2_ADMIN_KEY}"
append_env_if_missing NUXT_PRICING_PLATFORMS openai,anthropic,gemini,antigravity,grok
append_env_if_missing NUXT_PRICING_CACHE_TTL_MS 300000
append_env_if_missing NUXT_UPSTREAM_TIMEOUT_MS 8000
append_env_if_missing NUXT_PLAYGROUND_TEXT_TIMEOUT_MS 120000
append_env_if_missing NUXT_PLAYGROUND_IMAGE_TIMEOUT_MS 300000
append_env_if_missing NUXT_FEEDBACK_DAILY_LIMIT 5
append_env_if_missing NUXT_RATE_WINDOW_MS 600000
append_env_if_missing NUXT_RATE_MAX 5
append_env_if_missing NUXT_USD_TO_CNY 6.8102
append_env_if_missing NUXT_TRUSTED_PROXY_IPS 127.0.0.1,::1

if [[ "$(id -u)" == "0" ]]; then
  chown -R 1000:1000 data
fi

IMAGE_REF="${IMAGE_REPOSITORY}:${VERSION}"
echo "Pulling ${IMAGE_REF}"
docker pull "${IMAGE_REF}"

cat > docker-compose.yml <<EOF
services:
  guide:
    image: ${IMAGE_REF}
    container_name: kkflow-guide
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "127.0.0.1:${PORT}:3000"
    volumes:
      - ./data:/data
EOF

"${COMPOSE[@]}" up -d --remove-orphans

echo "Checking health"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
    echo "Guide is running at ${SITE_URL} using ${IMAGE_REF}."
    exit 0
  fi
  sleep 1
done

echo "Health check failed. Inspect logs with: ${COMPOSE[*]} logs guide" >&2
exit 1
