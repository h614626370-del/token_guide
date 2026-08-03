#!/usr/bin/env bash
# 本机部署准备脚本（不远程 SSH）：下载 compose / env 模板，生成密钥，创建数据目录。
# 用法：
#   mkdir -p sub2api-guide-deploy && cd sub2api-guide-deploy
#   curl -sSL https://raw.githubusercontent.com/h614626370-del/token_guide/main/deploy/docker-deploy.sh | bash
#   docker compose up -d
set -euo pipefail

REPO_RAW_BASE="${REPO_RAW_BASE:-https://raw.githubusercontent.com/h614626370-del/token_guide/main/deploy}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-614626370/sub2api-guide}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
HOST_PORT="${HOST_PORT:-3000}"
SITE_URL="${SITE_URL:-https://guide.kkflow.org}"
SUB2API_ORIGIN="${SUB2API_ORIGIN:-https://kkflow.org}"

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

download() {
  local url="$1"
  local dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$dest" "$url"
  else
    echo "需要 curl 或 wget。" >&2
    exit 1
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"
  local file="${3:-.env}"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    # 仅在占位符或空值时覆盖，避免二次执行覆盖已有密钥
    local current
    current="$(sed -n "s/^${key}=//p" "$file" | tail -n 1)"
    if [[ -z "$current" || "$current" == replace-* || "$current" == "0" && "$key" == "DOCKER_GID" ]]; then
      if [[ "$(uname -s)" == "Darwin" ]]; then
        sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
      else
        sed -i "s|^${key}=.*|${key}=${value}|" "$file"
      fi
    fi
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

force_env_value() {
  local key="$1"
  local value="$2"
  local file="${3:-.env}"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
    else
      sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    fi
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

read_env() {
  local key="$1"
  [[ -f .env ]] || return 0
  sed -n "s/^${key}=//p" .env | tail -n 1
}

echo "==> 准备 sub2api-guide 本机部署文件"

# 1) 下载 compose 与 env 模板
if [[ -f "$(dirname "$0")/docker-compose.yml" && -f "$(dirname "$0")/.env.example" ]]; then
  # 本地仓库内直接执行时，优先复制同目录文件
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  cp -f "${SCRIPT_DIR}/docker-compose.yml" ./docker-compose.yml
  cp -f "${SCRIPT_DIR}/.env.example" ./.env.example
  echo "已从本地 deploy/ 复制 docker-compose.yml 与 .env.example"
else
  echo "下载 docker-compose.yml ..."
  download "${REPO_RAW_BASE}/docker-compose.yml" ./docker-compose.yml
  echo "下载 .env.example ..."
  download "${REPO_RAW_BASE}/.env.example" ./.env.example
fi

# 2) 数据目录
mkdir -p data
if [[ -f data/guide-api.sqlite && ! -f data/guide.sqlite ]]; then
  cp -p data/guide-api.sqlite data/guide.sqlite
  echo "已将旧库 data/guide-api.sqlite 复制为 data/guide.sqlite（原文件保留）"
fi
if [[ "$(id -u)" == "0" ]]; then
  chown -R 1000:1000 data 2>/dev/null || true
fi

# 3) 生成 .env
CREATED_ENV=0
if [[ ! -f .env ]]; then
  cp .env.example .env
  CREATED_ENV=1
  echo "已创建 .env"
else
  echo "检测到已有 .env，将保留现有密钥，仅补齐缺失项"
fi
chmod 600 .env

SESSION_PASSWORD="$(read_env NUXT_SESSION_PASSWORD)"
ADMIN_TOKEN="$(read_env NUXT_ADMIN_TOKEN)"
IP_HASH_SALT="$(read_env NUXT_IP_HASH_SALT)"

if [[ -z "${SESSION_PASSWORD}" || "${SESSION_PASSWORD}" == replace-* ]]; then
  SESSION_PASSWORD="$(random_hex)"
  force_env_value NUXT_SESSION_PASSWORD "${SESSION_PASSWORD}"
fi
if [[ -z "${ADMIN_TOKEN}" || "${ADMIN_TOKEN}" == replace-* ]]; then
  ADMIN_TOKEN="$(random_hex)"
  force_env_value NUXT_ADMIN_TOKEN "${ADMIN_TOKEN}"
fi
if [[ -z "${IP_HASH_SALT}" || "${IP_HASH_SALT}" == replace-* ]]; then
  IP_HASH_SALT="$(random_hex)"
  force_env_value NUXT_IP_HASH_SALT "${IP_HASH_SALT}"
fi

force_env_value IMAGE_REPOSITORY "${IMAGE_REPOSITORY}"
force_env_value IMAGE_TAG "${IMAGE_TAG}"
force_env_value HOST_PORT "${HOST_PORT}"
set_env_value NUXT_PUBLIC_SITE_URL "${SITE_URL}"
set_env_value NUXT_PUBLIC_SUB2API_ORIGIN "${SUB2API_ORIGIN}"
set_env_value NUXT_DATABASE_PATH "/data/guide.sqlite"
set_env_value NUXT_UPDATE_IMAGE_REPOSITORY "${IMAGE_REPOSITORY}"
set_env_value NUXT_UPDATE_CONTAINER_NAME "sub2api-guide"

DOCKER_GID="0"
if [[ -S /var/run/docker.sock ]]; then
  DOCKER_GID="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock 2>/dev/null || echo 0)"
  echo "已探测 Docker Socket，DOCKER_GID=${DOCKER_GID}"
else
  echo "未找到 /var/run/docker.sock：仍可启动服务，但后台「系统更新」不可用"
fi
force_env_value DOCKER_GID "${DOCKER_GID}"

# 重新读取最终凭证
SESSION_PASSWORD="$(read_env NUXT_SESSION_PASSWORD)"
ADMIN_TOKEN="$(read_env NUXT_ADMIN_TOKEN)"
IP_HASH_SALT="$(read_env NUXT_IP_HASH_SALT)"

echo
echo "=========================================="
echo " 部署准备完成"
echo "=========================================="
echo "目录: $(pwd)"
echo "镜像: ${IMAGE_REPOSITORY}:${IMAGE_TAG}"
echo "端口: 127.0.0.1:${HOST_PORT}"
echo
echo "请保存以下管理员凭证（仅本次完整打印）："
echo "  NUXT_ADMIN_TOKEN=${ADMIN_TOKEN}"
echo "  NUXT_SESSION_PASSWORD=${SESSION_PASSWORD}"
echo "  NUXT_IP_HASH_SALT=${IP_HASH_SALT}"
echo
echo "脚本已完成："
echo "  - 下载/写入 docker-compose.yml 与 .env.example"
echo "  - 生成 .env 安全密钥"
echo "  - 创建 data/ 数据目录（SQLite 持久化）"
if [[ "${CREATED_ENV}" == "1" ]]; then
  echo "  - 首次创建 .env"
fi
echo
echo "接下来在本机执行："
echo "  docker compose up -d"
echo "  docker compose logs -f guide"
echo
echo "健康检查："
echo "  curl -fsS http://127.0.0.1:${HOST_PORT}/api/health"
echo
echo "管理后台："
echo "  ${SITE_URL}/admin"
echo "  使用上面的 NUXT_ADMIN_TOKEN 登录"
echo "=========================================="
