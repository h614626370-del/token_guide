---
title: Token向云指南
description: Token向云文档说明，覆盖会员充值、OpenAI API、Claude API、Codex CLI、Claude Code、OpenCode 与 gpt-image-2 图片接口接入配置。
titleTemplate: false
---

<section class="guide-hero">
  <div class="guide-hero__meta">
    <span>会员使用手册</span>
    <span>OpenAI / Claude 接入指南</span>
  </div>
  <h1>Token向云会员与 API 接入指南</h1>
  <p>指南按实际使用流程拆成两部分：先完成注册、登录与余额充值，再创建 API 密钥并接入支持 OpenAI 或 Claude 协议的客户端。</p>
  <div class="guide-actions">
    <a href="./member">会员充值流程</a>
    <a href="./api">API 接入配置</a>
    <a href="./playground">模型试用台</a>
  </div>
</section>

::: tip 免费远程协助
如果你看完文档后仍然无法完成配置，可以联系 Token向云客服获取免费远程协助。客服微信：`kkflow520`。也可以加入 Kkflow向云中转客户服务群：[金山文档 / WPS 云文档](https://www.kdocs.cn/l/csU8ZJybJe2V)。
:::

## Token向云是什么

Token向云提供面向开发者和 AI 工具用户的 API 接入网关，重点解决 OpenAI 兼容接口、Claude 协议客户端、模型试用、API 密钥管理和会员余额充值等使用流程。用户可以先在主站完成注册、登录和余额充值，再创建 API 密钥，用于 Codex CLI、Claude Code、OpenCode、OpenClaw 等客户端配置。

当前文档页不需要登录即可访问，适合在配置前快速确认接口地址、模型名称、客户端配置文件、常见错误和图片生成参数。主站登录入口为 [https://kkflow.org/](https://kkflow.org/)，文档说明入口为 [https://kkflow.org/guide/](https://kkflow.org/guide/)。

::: tip 当前平台能力
Token向云当前只接入 OpenAI 与 Claude 两类接口协议，暂未接入 Gemini。Gemini CLI、`/v1beta` 以及 Gemini 模型相关配置请先不要使用。
:::

## 支持的 API 与工具

| 类型 | 当前支持内容 | 说明 |
| --- | --- | --- |
| OpenAI API | `/v1/responses`、`/v1/chat/completions`、`/v1/models` | 适合 OpenAI 兼容客户端、Codex CLI、OpenCode 等工具 |
| Claude API | Claude Code 兼容配置 | 使用 `ANTHROPIC_BASE_URL=https://kkflow.org/v1` 与 API Key |
| 图片接口 | `gpt-image-2`、`/v1/images/generations`、`/v1/images/edits` | 支持文生图和参考图编辑 |
| 模型试用 | 文本模型与生图工作台 | 可选择自己的 Key 或临时输入自定义 Key |
| 会员功能 | 注册、登录、余额充值、订单状态 | 余额充值后再创建 API 密钥进行调用 |

## 指南结构

| 部分 | 适合场景 | 主要内容 |
| --- | --- | --- |
| [会员充值流程](./member) | 新用户或需要充值余额 | 注册登录、余额充值、订单状态、订阅与兑换说明 |
| [API 接入配置](./api) | 已有余额并准备调用接口 | 创建 API 密钥、OpenAI/Claude 地址、客户端配置、调用示例 |
| [模型试用台](./playground) | 想快速测试模型效果 | 选择已有 Key 或自定义 Key，调用 OpenAI Responses |

## 快速入口

| 场景 | 入口 |
| --- | --- |
| 注册账号 | [https://kkflow.org/register](https://kkflow.org/register) |
| 登录账号 | [https://kkflow.org/login](https://kkflow.org/login) |
| 余额充值 | 登录后从会员中心进入 |
| 接口网关 | [https://kkflow.org/](https://kkflow.org/) |
| OpenAI 兼容模型列表测试 | [https://kkflow.org/v1/models](https://kkflow.org/v1/models) |

## 常用接入地址

| 用途 | 地址 |
| --- | --- |
| 主站入口 | [https://kkflow.org/](https://kkflow.org/) |
| 文档入口 | [https://kkflow.org/guide/](https://kkflow.org/guide/) |
| OpenAI 兼容 Base URL | [https://kkflow.org/v1](https://kkflow.org/v1) |
| 文本模型 Responses | [https://kkflow.org/v1/responses](https://kkflow.org/v1/responses) |
| Chat Completions | [https://kkflow.org/v1/chat/completions](https://kkflow.org/v1/chat/completions) |
| 图片生成 | [https://kkflow.org/v1/images/generations](https://kkflow.org/v1/images/generations) |
| 图片编辑 | [https://kkflow.org/v1/images/edits](https://kkflow.org/v1/images/edits) |

## 接入边界

- OpenAI 兼容客户端一般使用 [https://kkflow.org/v1](https://kkflow.org/v1)。
- Claude Code 使用 [https://kkflow.org/v1](https://kkflow.org/v1) 作为 `ANTHROPIC_BASE_URL`。
- Gemini CLI 暂不在当前指南范围内，因为平台目前没有接入 Gemini。
- OpenCode 是开源工具，但能不能接入取决于它是否支持你要使用的 provider 或 OpenAI 兼容配置；不能理解为“所有开源工具都一定可以接入”。

## 典型使用流程

1. 从 [https://kkflow.org/register](https://kkflow.org/register) 注册账号，或从 [https://kkflow.org/login](https://kkflow.org/login) 登录已有账号。
2. 在会员中心完成余额充值，确认订单状态和余额到账。
3. 创建 API 密钥，并确认密钥状态、分组、额度、速率限制和有效期。
4. 在客户端中填写 Base URL：[https://kkflow.org/v1](https://kkflow.org/v1)。
5. 按工具类型选择配置方式：Codex CLI 使用 OpenAI Responses，Claude Code 使用 Claude 兼容环境变量，OpenCode 使用 OpenAI compatible provider。
6. 先请求 `/v1/models` 确认连通，再调用文本模型、图片生成或图片编辑接口。

## 常见问题

### Token向云支持 Gemini CLI 吗？

当前暂未接入 Gemini。请不要使用 Gemini CLI、`/v1beta` 或 Gemini 专用环境变量。当前推荐使用 OpenAI 兼容接口或 Claude Code 兼容配置。

### OpenAI 兼容客户端的 Base URL 应该填什么？

通常填写 [https://kkflow.org/v1](https://kkflow.org/v1)。不要只填写主站首页，也不要把路径写成 `/v1` 这种相对地址。

### Claude Code 怎么接入？

Claude Code 可以把 `ANTHROPIC_BASE_URL` 设置为 [https://kkflow.org/v1](https://kkflow.org/v1)，把 `ANTHROPIC_AUTH_TOKEN` 设置为自己的 API Key。完整示例见 [API 接入配置](./api)。

### 图片生成和图片编辑用哪个模型？

文生图和参考图编辑默认使用 `gpt-image-2`。文生图调用 `/v1/images/generations`，参考图编辑调用 `/v1/images/edits` 并使用 `multipart/form-data` 上传图片。

### 支付成功后余额没有立即到账怎么办？

余额通常会在 1-3 分钟内处理完成。若超过 5 分钟仍未到账，请在订单中心复制订单号后联系站点支持。
