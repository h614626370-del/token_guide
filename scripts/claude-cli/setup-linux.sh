#!/usr/bin/env bash

set -Eeuo pipefail

NODE_VERSION="v22.16.0"
BASE_URL="{{BASE_URL}}"
MODEL="${ANTHROPIC_MODEL:-{{DEFAULT_MODEL}}}"
API_KEY="${CLAUDE_API_KEY:-}"
NO_LAUNCH=false

fail() { echo "错误: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-launch) NO_LAUNCH=true; shift ;;
    -h|--help) echo "用法: bash setup-linux.sh [--no-launch]"; exit 0 ;;
    *) fail "未知参数: $1" ;;
  esac
done

[[ "$(uname -s)" == "Linux" ]] || fail "此脚本仅支持 Linux"

ensure_path() {
  case ":$PATH:" in *":$1:"*) ;; *) export PATH="$1:$PATH" ;; esac
}

download_file() {
  local output="$1"; shift
  local url
  for url in "$@"; do
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
  local arch archive_name temp_dir archive dest
  arch="$(uname -m)"
  case "$arch" in x86_64|amd64) arch="x64" ;; arm64|aarch64) arch="arm64" ;; *) fail "不支持的 CPU 架构: $arch" ;; esac
  archive_name="node-${NODE_VERSION}-linux-${arch}.tar.gz"
  temp_dir="$(mktemp -d)"
  archive="$temp_dir/$archive_name"
  dest="$HOME/.local/lib/nodejs/node-${NODE_VERSION}-linux-${arch}"
  download_file "$archive" \
    "https://npmmirror.com/mirrors/node/${NODE_VERSION}/${archive_name}" \
    "https://cdn.npmmirror.com/binaries/node/${NODE_VERSION}/${archive_name}" || fail "Node.js 下载失败"
  mkdir -p "$dest"
  tar -xzf "$archive" -C "$dest" --strip-components=1
  rm -rf "$temp_dir"
  ensure_path "$dest/bin"
  NODE_BIN_DIR="$dest/bin"
}

echo "Claude Code 一键安装与中转站配置"
NODE_BIN_DIR=""
ensure_path "$HOME/.local/bin"
if ! command -v claude >/dev/null 2>&1; then
  node_ok=false
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    node_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
    [[ "$node_major" -ge 18 ]] && node_ok=true
  fi
  [[ "$node_ok" == true ]] || install_node
  npm install -g --prefix "$HOME/.local" '@anthropic-ai/claude-code' --registry 'https://registry.npmmirror.com'
  ensure_path "$HOME/.local/bin"
fi
command -v claude >/dev/null 2>&1 || fail "Claude Code 安装完成，但 PATH 中未找到 claude"

if [[ -z "$API_KEY" ]]; then
  [[ -r /dev/tty ]] || fail "无法读取终端，请在交互终端中运行脚本"
  read -r -s -p "请粘贴 API Key（输入不会显示）: " API_KEY </dev/tty
  echo
fi
[[ -n "$API_KEY" ]] || fail "API Key 不能为空"

case "${SHELL:-}" in
  */zsh) SHELL_RC="$HOME/.zshrc" ;;
  *) SHELL_RC="$HOME/.bashrc" ;;
esac
[[ -f "$SHELL_RC" ]] && cp -p "$SHELL_RC" "$SHELL_RC.bak.$(date +%Y%m%d%H%M%S)"
START='# >>> token-guide Claude relay >>>'
END='# <<< token-guide Claude relay <<<'
TMP_FILE="$(mktemp)"
awk -v start="$START" -v end="$END" '$0 == start {skip=1; next} $0 == end {skip=0; next} !skip {print}' "$SHELL_RC" 2>/dev/null >"$TMP_FILE" || true
{
  cat "$TMP_FILE"
  echo
  echo "$START"
  echo 'export PATH="$HOME/.local/bin:$PATH"'
  [[ -n "$NODE_BIN_DIR" ]] && printf 'export PATH="%s:$PATH"\n' "$NODE_BIN_DIR"
  printf 'export ANTHROPIC_BASE_URL=%q\n' "$BASE_URL"
  printf 'export ANTHROPIC_AUTH_TOKEN=%q\n' "$API_KEY"
  [[ -n "$MODEL" ]] && printf 'export ANTHROPIC_MODEL=%q\n' "$MODEL"
  echo "$END"
} >"$SHELL_RC"
rm -f "$TMP_FILE"
chmod 600 "$SHELL_RC" 2>/dev/null || true

export ANTHROPIC_BASE_URL="$BASE_URL" ANTHROPIC_AUTH_TOKEN="$API_KEY"
[[ -n "$MODEL" ]] && export ANTHROPIC_MODEL="$MODEL"
echo "安装与配置完成，Shell 环境已更新: $SHELL_RC"
[[ "$NO_LAUNCH" == true ]] || exec "$(command -v claude)"
