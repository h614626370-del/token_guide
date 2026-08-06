#!/usr/bin/env bash

set -Eeuo pipefail

NODE_VERSION="v22.16.0"
PROVIDER_ID="custom"
BASE_URL="${CODEX_BASE_URL:-{{BASE_URL}}}"
API_KEY="${CODEX_API_KEY:-}"
MODEL="${CODEX_MODEL:-{{DEFAULT_MODEL}}}"
NO_LAUNCH=false

usage() {
  cat <<'EOF'
用法: bash setup.sh [--model MODEL] [--base-url URL] [--api-key KEY] [--no-launch]

默认模型: gpt-5.6-sol
API Key 必须通过 --api-key 或 CODEX_API_KEY 传入。
EOF
}

fail() {
  echo "错误: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --model) [[ $# -ge 2 ]] || fail "--model 缺少参数"; MODEL="$2"; shift 2 ;;
    --base-url) [[ $# -ge 2 ]] || fail "--base-url 缺少参数"; BASE_URL="$2"; shift 2 ;;
    --api-key) [[ $# -ge 2 ]] || fail "--api-key 缺少参数"; API_KEY="$2"; shift 2 ;;
    --no-launch) NO_LAUNCH=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "未知参数: $1" ;;
  esac
done

BASE_URL="${BASE_URL%/}"

echo
echo "========================================"
echo "  Codex CLI 一键安装与中转站配置"
echo "========================================"

ensure_profile_path() {
  local entry="$1"
  case ":$PATH:" in
    *":$entry:"*) ;;
    *) export PATH="$entry:$PATH" ;;
  esac
}

download_file() {
  local output="$1"
  shift
  local url
  for url in "$@"; do
    echo "  尝试下载: $url"
    rm -f "$output"
    if command -v curl >/dev/null 2>&1; then
      curl -fL --connect-timeout 15 --retry 1 -o "$output" "$url" && [[ -s "$output" ]] && return 0
    elif command -v wget >/dev/null 2>&1; then
      wget -O "$output" "$url" && [[ -s "$output" ]] && return 0
    else
      fail "需要 curl 或 wget 才能自动下载 Node.js"
    fi
  done
  return 1
}

install_node() {
  local os arch platform archive_name temp_dir archive dest
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Linux) platform="linux" ;;
    Darwin) platform="darwin" ;;
    *) fail "不支持的系统: $os。请手动安装 Node.js 18+。" ;;
  esac
  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) fail "不支持的 CPU 架构: $arch。请手动安装 Node.js 18+。" ;;
  esac

  archive_name="node-${NODE_VERSION}-${platform}-${arch}.tar.gz"
  temp_dir="$(mktemp -d)"
  archive="$temp_dir/$archive_name"
  dest="$HOME/.local/lib/nodejs/node-${NODE_VERSION}-${platform}-${arch}"

  if ! download_file "$archive" \
    "https://npmmirror.com/mirrors/node/${NODE_VERSION}/${archive_name}" \
    "https://cdn.npmmirror.com/binaries/node/${NODE_VERSION}/${archive_name}"; then
    rmdir "$temp_dir" 2>/dev/null || true
    fail "Node.js 下载失败，请手动安装 Node.js 18+ 后重试"
  fi

  mkdir -p "$dest"
  tar -xzf "$archive" -C "$dest" --strip-components=1
  rm -f "$archive"
  rmdir "$temp_dir" 2>/dev/null || true
  ensure_profile_path "$dest/bin"
  NODE_BIN_DIR="$dest/bin"
  echo "  Node.js 安装完成: $dest"
}

echo
echo "[检测 Codex CLI]"
NODE_BIN_DIR=""
ensure_profile_path "$HOME/.local/bin"

# A previous interrupted run may have installed Node before updating the shell profile.
for managed_node_bin in "$HOME/.local/lib/nodejs/node-${NODE_VERSION}-"*/bin; do
  if [[ -x "$managed_node_bin/node" && -x "$managed_node_bin/npm" ]]; then
    ensure_profile_path "$managed_node_bin"
    NODE_BIN_DIR="$managed_node_bin"
    break
  fi
done

node_ok=false
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  node_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  if [[ "$node_major" -ge 18 ]]; then node_ok=true; fi
fi
if [[ "$node_ok" != true ]]; then
  echo "  未检测到 Node.js 18+ 与 npm，开始安装..."
  install_node
fi

command -v npm >/dev/null 2>&1 || fail "Node.js 安装后仍未找到 npm"

codex_ok=false
if command -v codex >/dev/null 2>&1; then
  CODEX_PATH="$(command -v codex)"
  if codex_version="$("$CODEX_PATH" --version 2>/dev/null)"; then
    codex_ok=true
    echo "  已安装: $CODEX_PATH"
    echo "  版本: $codex_version"
  else
    echo "  检测到无法运行的 Codex: $CODEX_PATH，准备重新安装..."
  fi
fi

if [[ "$codex_ok" != true ]]; then
  echo "  使用国内 npm 镜像安装 @openai/codex..."
  npm install -g --prefix "$HOME/.local" '@openai/codex' --registry 'https://registry.npmmirror.com'
  ensure_profile_path "$HOME/.local/bin"
  command -v codex >/dev/null 2>&1 || fail "Codex CLI 安装完成，但 PATH 中未找到 codex"
  CODEX_PATH="$(command -v codex)"
  "$CODEX_PATH" --version >/dev/null 2>&1 || fail "Codex CLI 安装完成，但仍无法运行"
  echo "  Codex CLI 安装成功: $CODEX_PATH"
fi

echo
echo "[配置中转站]"
[[ -n "$API_KEY" ]] || fail "API Key 不能为空，请从自动安装页面复制完整命令"

CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
CONFIG_FILE="$CODEX_DIR/config.toml"
AUTH_FILE="$CODEX_DIR/auth.json"
mkdir -p "$CODEX_DIR"
chmod 700 "$CODEX_DIR" 2>/dev/null || true

if [[ -f "$CONFIG_FILE" ]]; then
  BACKUP_FILE="$CONFIG_FILE.bak.$(date +%Y%m%d%H%M%S)"
  cp -p "$CONFIG_FILE" "$BACKUP_FILE"
  echo "  已备份原配置: $BACKUP_FILE"
fi

if [[ -f "$AUTH_FILE" ]]; then
  AUTH_BACKUP_FILE="$AUTH_FILE.bak.$(date +%Y%m%d%H%M%S)"
  cp -p "$AUTH_FILE" "$AUTH_BACKUP_FILE"
  echo "  已备份原认证: $AUTH_BACKUP_FILE"
fi

export CODEX_SETUP_BASE_URL="$BASE_URL"
export CODEX_SETUP_API_KEY="$API_KEY"
export CODEX_SETUP_MODEL="$MODEL"
node - "$CONFIG_FILE" "$PROVIDER_ID" "$AUTH_FILE" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const providerId = process.argv[3];
const authPath = process.argv[4];
const baseUrl = process.env.CODEX_SETUP_BASE_URL;
const apiKey = process.env.CODEX_SETUP_API_KEY;
const model = process.env.CODEX_SETUP_MODEL;

let auth = {};
try {
  auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  if (!auth || Array.isArray(auth) || typeof auth !== 'object') {
    throw new Error('根节点必须是 JSON 对象');
  }
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw new Error(`无法解析现有 auth.json，已保留原文件和备份: ${error.message}`);
  }
}

function tomlString(value) {
  return JSON.stringify(value);
}

function setTopLevelKey(content, key, value) {
  const lines = content.split(/\r?\n/);
  let sectionIndex = lines.findIndex((line) => /^\s*\[/.test(line));
  if (sectionIndex < 0) sectionIndex = lines.length;
  const pattern = new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=');
  for (let i = 0; i < sectionIndex; i += 1) {
    if (pattern.test(lines[i])) {
      lines[i] = `${key} = ${value}`;
      return lines.join('\n');
    }
  }
  lines.unshift(`${key} = ${value}`);
  return lines.join('\n');
}

function setProviderBlock(content) {
  const header = `[model_providers.${providerId}]`;
  const block = [
    header,
    'name = "OneKey Relay"',
    `base_url = ${tomlString(baseUrl)}`,
    'wire_api = "responses"',
    'requires_openai_auth = true',
  ];
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === header);
  if (start >= 0) {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^\s*\[/.test(lines[i])) { end = i; break; }
    }
    lines.splice(start, end - start, ...block);
  } else {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push(...block);
  }
  return lines.join('\n').trimEnd() + '\n';
}

let content = '';
try { content = fs.readFileSync(path, 'utf8'); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
content = setTopLevelKey(content, 'model_provider', tomlString(providerId));
if (model) content = setTopLevelKey(content, 'model', tomlString(model));
content = setProviderBlock(content);
const temp = `${path}.tmp.${process.pid}`;
fs.writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600 });
fs.renameSync(temp, path);

auth.OPENAI_API_KEY = apiKey;
const authTemp = `${authPath}.tmp.${process.pid}`;
fs.writeFileSync(authTemp, JSON.stringify(auth, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
fs.renameSync(authTemp, authPath);
NODE
unset CODEX_SETUP_BASE_URL CODEX_SETUP_API_KEY CODEX_SETUP_MODEL

echo "  配置已写入: $CONFIG_FILE"
echo "  认证已写入: $AUTH_FILE"
echo "  API Key 已写入 auth.json"
[[ -n "$MODEL" ]] && echo "  模型: $MODEL"

case "${SHELL:-}" in
  */zsh) SHELL_RC="$HOME/.zshrc" ;;
  *) SHELL_RC="$HOME/.bashrc" ;;
esac
export CODEX_SETUP_SHELL_RC="$SHELL_RC"
export CODEX_SETUP_NODE_BIN="$NODE_BIN_DIR"
node <<'NODE'
const fs = require('fs');
const path = process.env.CODEX_SETUP_SHELL_RC;
const nodeBin = process.env.CODEX_SETUP_NODE_BIN;
const start = '# >>> onekey-deploy Codex relay >>>';
const end = '# <<< onekey-deploy Codex relay <<<';
let content = '';
try { content = fs.readFileSync(path, 'utf8'); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const pattern = new RegExp('(?:^|\\n)' + start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\n|$)', 'g');
content = content.replace(pattern, '\n').trimEnd();
const block = [
  start,
  'export PATH="$HOME/.local/bin:$PATH"',
  ...(nodeBin ? [`export PATH="${nodeBin}:$PATH"`] : []),
  end,
].join('\n');
fs.writeFileSync(path, (content ? content + '\n\n' : '') + block + '\n', 'utf8');
NODE
unset CODEX_SETUP_SHELL_RC CODEX_SETUP_NODE_BIN

echo "  Shell 环境已更新: $SHELL_RC"

echo
echo "========================================"
echo "  安装与配置完成"
echo "========================================"

if [[ "$NO_LAUNCH" != true ]]; then
  echo
  echo "正在启动 Codex CLI..."
  echo
  if tty -s </dev/tty 2>/dev/null; then
    exec "$CODEX_PATH" </dev/tty
  else
    echo "当前环境没有交互终端，已跳过自动启动。请稍后手动运行: codex"
  fi
fi
