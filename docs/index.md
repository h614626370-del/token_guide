---
title: Token向云会员使用指南
titleTemplate: false
---

<section class="guide-hero">
  <div class="guide-hero__meta">
    <span>会员使用手册</span>
    <span>Sub2API 接口文档</span>
  </div>
  <h1>会员余额充值与 API 密钥完整指南</h1>
  <p>按照实际使用顺序整理：注册登录、余额充值、创建 API 密钥，并配置 Codex、Claude Code、Gemini CLI、OpenCode 等客户端。</p>
  <div class="guide-tags">
    <span>注册登录</span>
    <span>余额充值</span>
    <span>仅支持余额充值</span>
    <span>API 密钥</span>
  </div>
</section>

::: tip 统一 Sub2API 接口地址
[https://kkflow.org/](https://kkflow.org/)

多数 OpenAI 兼容客户端使用 [https://kkflow.org/v1](https://kkflow.org/v1)，Gemini CLI 使用 [https://kkflow.org/v1beta](https://kkflow.org/v1beta)。
:::

## 快速入口

| 场景 | 入口 |
| --- | --- |
| 注册账号 | [https://kkflow.org/register](https://kkflow.org/register) |
| 登录账号 | [https://kkflow.org/login](https://kkflow.org/login) |
| 余额充值 | 登录后从会员中心进入 |
| 订阅/兑换 | 暂未开放 |
| 接口网关 | [https://kkflow.org/](https://kkflow.org/) |
| 模型列表测试 | [https://kkflow.org/v1/models](https://kkflow.org/v1/models) |

## 1. 注册账号

1. 打开主站注册页。
2. 填写邮箱、用户名、密码，按提示完成验证。
3. 注册后自动登录，或跳转到登录页继续登录。

注册链接：[https://kkflow.org/register](https://kkflow.org/register)

## 2. 登录账号

1. 进入主站登录页，输入账号密码。
2. 登录后从主站会员中心点击“余额充值”进入支付页。
3. 不要直接收藏支付页裸链访问，避免丢失登录态。

登录地址：[https://kkflow.org/login](https://kkflow.org/login)

## 3. 余额充值

1. 进入“余额充值”页面，选择余额商品。
2. 确认价格与到账金额，选择支付方式并下单。
3. 支付成功后，订单状态会自动更新。
4. 处理成功后，余额直接到账到你的会员账户。

### 当前可用支付方式

| 支付方式 | 状态 |
| --- | --- |
| 站内余额支付 | 正在开通中 |
| 支付宝 | 已开启 |
| 微信支付 | 正在开通中 |
| USDT(TRC20) | 正在开通中 |

### 到账说明

- 余额商品为自动到账。
- 订单处理中时请先等待 1-3 分钟。
- 若长时间未到账，请在订单中心复制订单号后联系站点支持。

## 4. 订阅功能暂未开放

目前不支持购买订阅，也不会发放订阅兑换码。会员侧当前仅支持把支付金额充值到账号余额。

::: warning 重点
请不要按订阅流程操作；如需使用服务，请先完成余额充值，再使用 API 密钥调用。
:::

## 5. 兑换功能暂未开放

订阅兑换功能暂未开放，因此当前没有可用的兑换码流程。

如果页面或历史订单里出现订阅、兑换码等旧提示，请以本指南为准：当前仅支持充值到余额。

## 6. 创建 API 密钥

1. 登录主站后进入 API 密钥页面。
2. 点击“创建密钥”，填写名称。
3. 为密钥分配分组，未分组密钥无法调用。
4. 按需设置额度、速率、有效期、IP 白名单。
5. 保存后复制密钥，密钥通常只展示一次。

::: danger 安全提醒
不要公开你的密钥，不要发到群聊或截图外传。如果怀疑泄露，请立即停用旧密钥并重建。
:::

## 7. Sub2API 接口地址与连通测试

会员侧统一网关地址：[https://kkflow.org/](https://kkflow.org/)

### 7.1 快速测试

```bash
curl "https://kkflow.org/v1/models" \
  -H "Authorization: Bearer sk-xxxxxx"
```

返回模型列表说明地址和密钥都正确；若返回 `401` 或 `403`，优先检查密钥状态、分组和过期时间。

### 7.2 常见填错点

- 把地址填成主站首页，而不是 `/v1` 接口地址。
- Base URL 末尾多写 `/`，导致部分客户端拼接路径异常。
- 复制密钥时多带空格或换行。
- 密钥未分组、被停用或已过期。

## 8. 使用 API 密钥

以下模板可直接使用，把示例里的 `sk-xxxxxx` 换成你的真实密钥。请不要在群聊、截图或代码仓库中公开你的密钥。

### 配置前准备

- 统一网关地址：[https://kkflow.org/](https://kkflow.org/)
- OpenAI、Codex、Claude 相关客户端一般使用：[https://kkflow.org/v1](https://kkflow.org/v1)
- Gemini CLI 使用：[https://kkflow.org/v1beta](https://kkflow.org/v1beta)
- 如果首次配置，请确保目录存在：macOS/Linux 可执行 `mkdir -p ~/.codex`

## 8.0 客户端安装

如果你还没安装客户端，先按下列命令安装并验证；已安装可直接跳到后续配置步骤。

| 客户端 | 安装 | 验证 |
| --- | --- | --- |
| Codex CLI | `npm install -g @openai/codex` 或 `brew install --cask codex` | `codex --version` |
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` 或 `irm https://claude.ai/install.ps1 \| iex` | `claude --version` |
| Gemini CLI | `npx @google/gemini-cli` 或 `npm install -g @google/gemini-cli` | `gemini --version` |
| OpenCode | `curl -fsSL https://opencode.ai/install \| bash` | `opencode --version` |

::: warning 安装前建议
Codex CLI、Gemini CLI、OpenCode 建议先安装 Node.js LTS。Gemini CLI 官方要求 Node.js 20+。Claude Code 在 Windows 下建议先安装 Git for Windows 或使用 WSL。
:::

## 8.1 Codex CLI（macOS / Linux）

将以下两个文件放到 `~/.codex`，并确保配置内容位于 `config.toml` 开头。

模型建议：日常对话优先 `gpt-5.4`；编程项目开发优先 `gpt-5.3-codex`。

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

如果改用 `gpt-5.3-codex` 做编程，请把 `config.toml` 里的参数改为下面这组：

```toml
model = "gpt-5.3-codex"
review_model = "gpt-5.3-codex"
model_context_window = 272000
model_auto_compact_token_limit = 244800
```

```json
// ~/.codex/auth.json
{
  "OPENAI_API_KEY": "sk-xxxxxx"
}
```

## 8.2 Codex CLI（Windows）

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

如果改用 `gpt-5.3-codex` 做编程，请把 `config.toml` 里的参数改为下面这组：

```toml
model = "gpt-5.3-codex"
review_model = "gpt-5.3-codex"
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
配置文件写好后，重新启动 VS Code 或你正在使用的编辑器。模型按任务切换：日常对话选 `gpt-5.4`，编程开发选 `gpt-5.3-codex`。权限模式建议选择“完全访问权限”。
:::

## 8.3 Claude Code

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

## 8.4 Gemini CLI

```bash
# macOS / Linux
export GOOGLE_GEMINI_BASE_URL="https://kkflow.org/v1beta"
export GEMINI_API_KEY="sk-xxxxxx"
export GEMINI_MODEL="gemini-2.0-flash"
```

```bat
:: Windows CMD
set GOOGLE_GEMINI_BASE_URL=https://kkflow.org/v1beta
set GEMINI_API_KEY=sk-xxxxxx
set GEMINI_MODEL=gemini-2.0-flash
```

```powershell
# PowerShell
$env:GOOGLE_GEMINI_BASE_URL="https://kkflow.org/v1beta"
$env:GEMINI_API_KEY="sk-xxxxxx"
$env:GEMINI_MODEL="gemini-2.0-flash"
```

## 8.5 OpenCode

在项目目录创建 `opencode.json`，填入以下示例：

```json
{
  "provider": {
    "openai": {
      "options": {
        "baseURL": "https://kkflow.org/v1",
        "apiKey": "sk-xxxxxx"
      }
    }
  },
  "$schema": "https://opencode.ai/config.json"
}
```

## 8.6 OpenClaw（可选）

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

## 8.7 GPT 文本模型调用参数（Responses）

推荐优先使用 `/v1/responses`。该接口统一支持新版 GPT 模型，参数也更简洁。

- `model`：模型名，例如 `gpt-5.4`、`gpt-5.3-codex`。
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

## 8.8 gpt-image-2 调用参数（Images）

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

## 8.9 参考图编辑（/images/edits）详细说明

适合做“保留主体 + 局部替换”或“基于现有图再创作”。相比文生图，它更稳定地继承原图构图和元素。

### 8.9.1 上传要求

- 请求类型：`multipart/form-data`。
- `image`：必传，支持 `png/jpeg/webp`。
- `mask`：可选，建议使用 PNG 且带透明通道。
- 若使用蒙版，建议与原图保持相同尺寸，避免编辑区域偏移。
- 当前单文件上传上限为 20MB，原图与蒙版分别校验。

### 8.9.2 关键参数

- `model`：建议 `gpt-image-2`。
- `prompt`：必填，写清“保留什么、替换什么、输出风格”。
- `size`、`quality`、`background`、`output_format`、`moderation` 与文生图一致。
- `output_compression`：仅 `jpeg/webp` 有效，范围 `0-100`。
- 当 `background=transparent` 时，输出格式请用 `png` 或 `webp`，不要用 `jpeg`。

### 8.9.3 不带蒙版：整图参考编辑

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

### 8.9.4 带蒙版：局部重绘

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

## 9. 模型选择建议

你在客户端可见的模型由密钥分组决定。建议先在“使用密钥”页面确认可用模型后再选择。

| 类型 | 模型 | 适用场景 |
| --- | --- | --- |
| 优先模型 | `gpt-5.4` | 综合能力强，适合作为默认 |
| 优先模型 | `gpt-5.3-codex` | 代码任务稳定、成本更低 |
| 优先模型 | `gpt-5.2-codex` | 响应更快，适合高频任务 |
| 轻量/备用 | `gpt-5.3-codex-spark` | 轻量问答与快任务 |
| 轻量/备用 | `gpt-5.1-codex-mini` | 低成本短任务 |
| 轻量/备用 | `codex-mini-latest` | 兜底可选 |

## 10. 软件配置说明

如果你不确定该怎么填参数，可以按下面步骤配置。核心就是 3 项：Base URL、API Key、Model。

### 10.1 Codex CLI

1. 创建配置目录：macOS/Linux 为 `~/.codex`，Windows 为 `%userprofile%\.codex`。
2. 写入 `config.toml`，优先放在文件开头。
3. 对话场景建议 `gpt-5.4`；编程场景建议 `gpt-5.3-codex`，并设置自动压缩参数。
4. 写入 `auth.json` 并保存密钥。
5. 重新打开终端执行一次请求验证。

### 10.2 Claude Code

1. 设置 `ANTHROPIC_BASE_URL` 为 [https://kkflow.org/v1](https://kkflow.org/v1)。
2. 设置 `ANTHROPIC_AUTH_TOKEN` 为你的密钥。
3. 建议同时写入 `~/.claude/settings.json` 或 Windows 对应目录。

### 10.3 Gemini CLI

1. 设置 `GOOGLE_GEMINI_BASE_URL` 为 [https://kkflow.org/v1beta](https://kkflow.org/v1beta)。
2. 设置 `GEMINI_API_KEY`。
3. 设置模型，例如 `GEMINI_MODEL=gemini-2.0-flash`。

### 10.4 Cursor / OpenAI Compatible

1. Provider 选择 OpenAI Compatible。
2. Base URL 填 [https://kkflow.org/v1](https://kkflow.org/v1)。
3. API Key 填你的密钥，Model 选分组可用模型。

::: warning 常见错误排查
`401/403`：密钥无效、未分组、已过期，或复制时混入空格/换行。

`404`：接口路径错误。OpenAI 兼容客户端请优先使用 [https://kkflow.org/v1](https://kkflow.org/v1)，Gemini CLI 用 [https://kkflow.org/v1beta](https://kkflow.org/v1beta)。

模型不可用：当前密钥分组未开放该模型。

OpenClaw 报 `Gateway start blocked`：检查 `openclaw.json` 中是否包含 `"gateway": { "mode": "local", "port": 18789 }`。

调用超时：先检查网关地址是否正确，再检查本机网络与代理设置。
:::

## 11. 订单状态说明

| 字段 | 说明 | 常见值 |
| --- | --- | --- |
| `status` | 支付状态 | `pending` / `paid` / `expired` |
| `recharge_status` | 余额到账处理状态 | `pending` / `success` / `failed` |
| `provider` | 支付渠道 | `site_balance` / `alipay` / `wechat_pay` / `trx_usdt` |

::: tip 支付成功但订单还在处理中？
表示支付已完成，但余额到账还在执行。通常 1-3 分钟内完成。若超过 5 分钟仍未完成，请携带订单号联系 [https://kkflow.org/support](https://kkflow.org/support)。
:::

## 12. 常见问题

### Q1：为什么我看不到“余额充值”入口？

请先确认已登录主站账号，并从会员中心页面进入。若主站菜单仍无该入口，请联系站点支持开通。

### Q2：支付页提示未登录怎么办？

先回主站重新登录，再从会员中心点击入口进入，不建议直接打开之前收藏的支付页链接。

### Q3：支付成功了，为什么订单还是处理中？

正常会在几分钟内更新；USDT 还需链上确认。若超过 5 分钟不变，请在订单中心复制订单号后联系支持。

### Q4：现在支持订阅或兑换码吗？

暂不支持。当前仅支持充值到余额，不提供订阅购买和兑换码兑换流程。

### Q5：API 调用返回 401/403 怎么办？

检查三项：

1. Base URL 是否为 [https://kkflow.org/v1](https://kkflow.org/v1)。
2. 密钥是否复制完整。
3. 密钥是否仍有效且已分组。

### Q6：OpenClaw 提示 Gateway start blocked 或 404 怎么办？

先检查 `openclaw.json`：`gateway.mode` 必须是 `local`；`baseUrl` 使用 [https://kkflow.org/v1](https://kkflow.org/v1) 且末尾不要加 `/`；模型名需带前缀，例如 `openai/gpt-5.4`。
