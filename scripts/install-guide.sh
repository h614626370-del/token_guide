#!/usr/bin/env bash
# 兼容入口：本机准备 + 启动（不远程 SSH）。
# 推荐直接使用 deploy/docker-deploy.sh 做准备，再 docker compose up -d。
set -euo pipefail

VERSION="latest"
IMAGE_REPOSITORY="614626370/sub2api-guide"
INSTALL_DIR=""
PORT="3000"
SITE_URL="https://guide.kkflow.org"
SUB2API_ORIGIN="https://kkflow.org"

usage() {
  cat <<USAGE
Usage: install-guide.sh [options]

本机安装（非远程）：准备文件并 docker compose up -d。

Options:
  --version VERSION          Image tag. Default: latest.
  --image IMAGE              Image repository. Default: 614626370/sub2api-guide.
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

mkdir -p "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

export IMAGE_REPOSITORY IMAGE_TAG="${VERSION}" HOST_PORT="${PORT}" SITE_URL SUB2API_ORIGIN

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "${SCRIPT_DIR}/../deploy/docker-deploy.sh" ]]; then
  bash "${SCRIPT_DIR}/../deploy/docker-deploy.sh"
else
  curl -fsSL https://raw.githubusercontent.com/h614626370-del/token_guide/main/deploy/docker-deploy.sh | bash
fi

echo "Pulling image..."
# shellcheck disable=SC1091
set -a
# 读取 .env 中的镜像信息
# shellcheck disable=SC1091
source <(grep -E '^(IMAGE_REPOSITORY|IMAGE_TAG|HOST_PORT)=' .env | sed 's/\r$//')
set +a
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-614626370/sub2api-guide}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
HOST_PORT="${HOST_PORT:-3000}"

docker pull "${IMAGE_REPOSITORY}:${IMAGE_TAG}"
"${COMPOSE[@]}" up -d --remove-orphans

echo "Checking health"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${HOST_PORT}/api/health" >/dev/null; then
    echo "Guide is running at ${SITE_URL} using ${IMAGE_REPOSITORY}:${IMAGE_TAG}."
    exit 0
  fi
  sleep 1
done

echo "Health check failed. Inspect logs with: ${COMPOSE[*]} logs guide" >&2
exit 1
