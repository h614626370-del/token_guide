---
title: API 接入配置
description: Token向云 OpenAI 与 Claude 协议 API 密钥、客户端配置和调用示例
---

# API 接入配置

本部分面向已经完成充值、准备调用接口的用户。Token向云当前只接入 OpenAI 与 Claude 两类接口协议，暂未接入 Gemini。

::: tip 统一接口地址
OpenAI 兼容客户端、Codex CLI、Claude Code、OpenCode、OpenClaw 当前都优先使用 [https://kkflow.org/v1](https://kkflow.org/v1)。
:::

## 1. 创建 API 密钥

1. 登录主站后进入 API 密钥页面。
2. 点击“创建密钥”，填写名称。
3. 为密钥分配分组，未分组密钥无法调用。
4. 按需设置额度、速率、有效期、IP 白名单。
5. 保存后复制密钥，密钥通常只展示一次。

::: danger 安全提醒
不要公开你的密钥，不要发到群聊或截图外传。如果怀疑泄露，请立即停用旧密钥并重建。
:::

## 2. 接口地址与连通测试

会员侧统一网关地址：[https://kkflow.org/](https://kkflow.org/)

### 2.1 OpenAI 兼容模型列表测试

```bash
curl "https://kkflow.org/v1/models" \
  -H "Authorization: Bearer sk-xxxxxx"
```

返回模型列表说明地址和密钥都正确；若返回 `401` 或 `403`，优先检查密钥状态、分组和过期时间。

### 2.2 常见填错点

- 把地址填成主站首页，而不是 `/v1` 接口地址。
- Base URL 末尾多写 `/`，导致部分客户端拼接路径异常。
- 复制密钥时多带空格或换行。
- 密钥未分组、被停用或已过期。
- 使用 Gemini CLI 或 `/v1beta`，但平台当前暂未接入 Gemini。

## 3. 客户端安装

如果你还没安装客户端，先按下列命令安装并验证；已安装可直接跳到后续配置步骤。

| 客户端 | 安装 | 验证 |
| --- | --- | --- |
| Codex CLI | `npm install -g @openai/codex` 或 `brew install --cask codex` | `codex --version` |
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` 或 `irm https://claude.ai/install.ps1 \| iex` | `claude --version` |
| OpenCode | `curl -fsSL https://opencode.ai/install \| bash` | `opencode --version` |

::: warning 安装前建议
Codex CLI、OpenCode 建议先安装 Node.js LTS。Claude Code 在 Windows 下建议先安装 Git for Windows 或使用 WSL。
:::

## 4. Codex CLI（macOS / Linux）

将以下两个文件放到 `~/.codex`，并确保配置内容位于 `config.toml` 开头。

模型建议：日常对话优先 `gpt-5.4`；编程项目开发优先 `gpt-5.5`。

```toml
# ~/.codex/config.toml
model_provider = "OpenAI"
model = "gpt-5.4"
review_model = "gpt-5.4"
model_reasoning_effort = "xhigh"
disable_response_storage = true
network_access = "enabled"
windows_wsl_setup_acknowledged = true
model_context_window = 1000000
model_auto_compact_token_limit = 900000

[model_providers.OpenAI]
name = "OpenAI"
base_url = "https://kkflow.org/v1"
wire_api = "responses"
requires_openai_auth = true
```

如果改用 `gpt-5.5` 做编程，请把 `config.toml` 里的参数改为下面这组：

```toml
model = "gpt-5.5"
review_model = "gpt-5.5"
model_context_window = 272000
model_auto_compact_token_limit = 244800
```

```json
// ~/.codex/auth.json
{
  "OPENAI_API_KEY": "sk-xxxxxx"
}
```

## 5. Codex CLI（Windows）

Windows 用户建议按这个顺序走一遍：先安装 VS Code，再安装 Codex 插件，然后写入 CLI 配置。配置完成后重启编辑器，就可以直接使用。

1. 打开 [https://code.visualstudio.com/](https://code.visualstudio.com/) 下载并安装 VS Code。
2. 首次启动后在扩展市场安装简体中文语言包：`Chinese (Simplified) Language Pack for Visual Studio Code`。
3. 在扩展市场安装 `Codex - OpenAI's coding agent`，发布者 OpenAI，扩展 ID：`OpenAI.chatgpt`。
4. 按 `Win + R` 输入 `%userprofile%\.codex` 打开配置目录，不存在请手动创建。

```toml
# %userprofile%\.codex\config.toml
model_provider = "OpenAI"
model = "gpt-5.4"
review_model = "gpt-5.4"
model_reasoning_effort = "xhigh"
disable_response_storage = true
network_access = "enabled"
windows_wsl_setup_acknowledged = true
model_context_window = 1000000
model_auto_compact_token_limit = 900000

[model_providers.OpenAI]
name = "OpenAI"
base_url = "https://kkflow.org/v1"
wire_api = "responses"
requires_openai_auth = true
```

如果改用 `gpt-5.5` 做编程，请把 `config.toml` 里的参数改为下面这组：

```toml
model = "gpt-5.5"
review_model = "gpt-5.5"
model_context_window = 272000
model_auto_compact_token_limit = 244800
```

```json
// %userprofile%\.codex\auth.json
{
  "OPENAI_API_KEY": "sk-xxxxxx"
}
```

::: tip 完成配置后的使用建议
配置文件写好后，重新启动 VS Code 或你正在使用的编辑器。模型按任务切换：日常对话选 `gpt-5.4`，编程开发选 `gpt-5.5`。权限模式建议选择“完全访问权限”。
:::

## 6. Claude Code

可写入终端环境变量，也可放入 VS Code 的 Claude Code 设置文件。

```bash
# macOS / Linux
export ANTHROPIC_BASE_URL="https://kkflow.org/v1"
export ANTHROPIC_AUTH_TOKEN="sk-xxxxxx"
```

```bat
:: Windows CMD
set ANTHROPIC_BASE_URL=https://kkflow.org/v1
set ANTHROPIC_AUTH_TOKEN=sk-xxxxxx
```

```powershell
# PowerShell
$env:ANTHROPIC_BASE_URL="https://kkflow.org/v1"
$env:ANTHROPIC_AUTH_TOKEN="sk-xxxxxx"
```

```json
// ~/.claude/settings.json 或 %userprofile%\.claude\settings.json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://kkflow.org/v1",
    "ANTHROPIC_AUTH_TOKEN": "sk-xxxxxx",
    "CLAUDE_CODE_ATTRIBUTION_HEADER": "0"
  }
}
```

## 7. OpenCode

OpenCode 是开源的 AI 编程工具，但“开源”不等于“所有平台都能直接接入”。是否可接入主要看两点：客户端是否支持对应 provider，以及你的平台是否提供该 provider 兼容的 API。

Token向云当前提供 OpenAI 与 Claude 两类协议，因此 OpenCode 建议优先按 OpenAI 兼容方式配置：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "tokenxiangyun": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Token向云",
      "options": {
        "baseURL": "https://kkflow.org/v1",
        "apiKey": "sk-xxxxxx"
      },
      "models": {
        "gpt-5.4": {
          "name": "gpt-5.4"
        },
        "gpt-5.5": {
          "name": "gpt-5.5"
        }
      }
    }
  },
  "model": "tokenxiangyun/gpt-5.4"
}
```

::: warning OpenCode 接入边界
如果某个客户端只支持 Gemini、Vertex AI 或其他非 OpenAI/Claude 协议，而平台没有接入对应协议，就不能仅凭“OpenCode 开源”或“支持多个 provider”判断一定可用。先确认 provider 与 Base URL 协议是否匹配。
:::

## 8. OpenClaw（可选）

如果你使用 OpenClaw，可按下面最小步骤配置到本站网关。

1. 先安装 Node.js LTS 与 Git，Windows 建议 Git 2.40+。
2. 执行安装：`npm install -g openclaw@latest`。
3. 首次初始化：`openclaw onboard --install-daemon`，建议选择 `Manual`、`Local gateway`、`Skip for now`。
4. 编辑配置文件：Windows 为 `%userprofile%\.openclaw\openclaw.json`，macOS/Linux 为 `~/.openclaw/openclaw.json`。

```json
{
  "models": {
    "mode": "merge",
    "providers": {
      "openai": {
        "baseUrl": "https://kkflow.org/v1",
        "apiKey": "sk-xxxxxx",
        "api": "openai-responses"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "openai/gpt-5.4" }
    }
  },
  "gateway": {
    "mode": "local",
    "port": 18789
  }
}
```

::: warning OpenClaw 易错点
`baseUrl` 建议填写 [https://kkflow.org/v1](https://kkflow.org/v1)，不要末尾再加 `/`。`primary` 必须带 provider 前缀，例如 `openai/gpt-5.4`。若报 `Gateway start blocked`，确认 `gateway.mode` 已设置为 `local`。
:::

```bash
# OpenClaw 常用排查命令
openclaw status --all
openclaw doctor
openclaw models list
openclaw gateway status
openclaw logs --follow
```

## 9. GPT 文本模型调用参数（Responses）

推荐优先使用 `/v1/responses`。该接口统一支持新版 GPT 模型，参数也更简洁。

- `model`：模型名，例如 `gpt-5.4`、`gpt-5.5`。
- `input`：输入内容，可用字符串或消息数组。
- `temperature`：采样温度，范围建议 `0-2`。
- `top_p`：核采样，范围 `0-1`。
- `max_output_tokens`：最大输出 token 数。

```bash
curl "https://kkflow.org/v1/responses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-xxxxxx" \
  -d '{
    "model": "gpt-5.4",
    "input": [
      { "role": "system", "content": "你是一个简洁的中文助手" },
      { "role": "user", "content": "用三句话解释幂等性" }
    ],
    "temperature": 0.7,
    "top_p": 1,
    "max_output_tokens": 1200
  }'
```

如果你的客户端仍基于 Chat Completions，可改用 [https://kkflow.org/v1/chat/completions](https://kkflow.org/v1/chat/completions)，核心参数对应为 `messages`、`temperature`、`top_p`、`max_tokens`。

## 10. gpt-image-2 调用参数（Images）

文生图接口：[https://kkflow.org/v1/images/generations](https://kkflow.org/v1/images/generations)。常用参数如下：

- `model`：建议固定 `gpt-image-2`。
- `prompt`：图片提示词，必填。
- `size`：如 `1024x1024`、`1536x1024`、`1024x1536`、`auto`。
- `quality`：`auto`、`low`、`medium`、`high`。
- `background`：`auto`、`transparent`、`opaque`。
- `output_format`：`png`、`jpeg`、`webp`。
- `output_compression`：仅 `jpeg/webp` 生效，范围 `0-100`。
- `moderation`：`auto`、`low`。
- `n`：生成数量，建议 `1-10`。

```bash
curl "https://kkflow.org/v1/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-xxxxxx" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "一个极简风格的蓝白配色支付产品宣传海报，中文标题，留白充足",
    "size": "1024x1024",
    "quality": "high",
    "background": "opaque",
    "output_format": "png",
    "moderation": "auto",
    "n": 1
  }'
```

如果是基于参考图编辑，请使用 [https://kkflow.org/v1/images/edits](https://kkflow.org/v1/images/edits) 并改为 `multipart/form-data` 上传 `image`，可选 `mask`。

## 11. 参考图编辑（/images/edits）

适合做“保留主体 + 局部替换”或“基于现有图再创作”。相比文生图，它更稳定地继承原图构图和元素。

### 11.1 上传要求

- 请求类型：`multipart/form-data`。
- `image`：必传，支持 `png/jpeg/webp`。
- `mask`：可选，建议使用 PNG 且带透明通道。
- 若使用蒙版，建议与原图保持相同尺寸，避免编辑区域偏移。
- 当前单文件上传上限为 20MB，原图与蒙版分别校验。

### 11.2 关键参数

- `model`：建议固定 `gpt-image-2`。
- `prompt`：必填，写清“保留什么、替换什么、输出风格”。
- `size`、`quality`、`background`、`output_format`、`moderation` 与文生图一致。
- `output_compression`：仅 `jpeg/webp` 有效，范围 `0-100`。
- 当 `background=transparent` 时，输出格式请用 `png` 或 `webp`，不要用 `jpeg`。

### 11.3 不带蒙版：整图参考编辑

```bash
curl "https://kkflow.org/v1/images/edits" \
  -H "Authorization: Bearer sk-xxxxxx" \
  -F "model=gpt-image-2" \
  -F "prompt=保留人物姿态和构图，改成电商海报风格，背景换成浅色摄影棚，提升清晰度" \
  -F "image=@source.png" \
  -F "size=1024x1024" \
  -F "quality=high" \
  -F "background=auto" \
  -F "output_format=png" \
  -F "moderation=auto"
```

### 11.4 带蒙版：局部重绘

蒙版中“完全透明”的区域会被优先视为需要修改的区域；不透明区域更倾向于保留。

```bash
curl "https://kkflow.org/v1/images/edits" \
  -H "Authorization: Bearer sk-xxxxxx" \
  -F "model=gpt-image-2" \
  -F "prompt=仅替换透明区域为蓝白科技风 UI 面板，其他区域保持不变" \
  -F "image=@source.png" \
  -F "mask=@mask.png" \
  -F "size=1024x1024" \
  -F "quality=high" \
  -F "background=auto" \
  -F "output_format=png" \
  -F "moderation=auto"
```

::: warning 参考图编辑常见报错
`400` 通常是提示词为空或参数冲突。`400/422` 常见于蒙版尺寸与原图不一致，或蒙版无透明通道。`413` 表示文件过大。`401/403` 代表密钥无效、分组未授权或已过期。
:::

## 12. 模型选择建议

你在客户端可见的模型由密钥分组决定。建议先在“使用密钥”页面确认可用模型后再选择。

| 类型 | 模型 | 适用场景 |
| --- | --- | --- |
| 优先模型 | `gpt-5.4` | 综合能力强，适合作为默认 |
| 优先模型 | `gpt-5.5` | 代码任务稳定、适合编程项目开发 |
| 轻量/备用 | `gpt-5.4-mini` | 轻量问答与快任务 |
| 代码/评审 | `gpt-5.3-codex-spark` | Codex 相关轻量代码任务 |
| 代码/评审 | `codex-auto-review` | 自动代码评审 |
| 图片生成 | `gpt-image-2` | 文生图与参考图编辑 |

## 13. 常见错误排查

`401/403`：密钥无效、未分组、已过期，或复制时混入空格/换行。

`404`：接口路径错误。OpenAI 兼容客户端请优先使用 [https://kkflow.org/v1](https://kkflow.org/v1)。

模型不可用：当前密钥分组未开放该模型。

Gemini CLI 不可用：平台当前暂未接入 Gemini，不要使用 `/v1beta` 或 Gemini 专用环境变量。

OpenClaw 报 `Gateway start blocked`：检查 `openclaw.json` 中是否包含 `"gateway": { "mode": "local", "port": 18789 }`。

调用超时：先检查网关地址是否正确，再检查本机网络与代理设置。
