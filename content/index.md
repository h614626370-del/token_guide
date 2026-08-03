---
title: Token向云会员与 API 接入指南
description: Token向云会员充值、API 密钥、Codex CLI、Claude Code、模型调用与常见问题说明
---

# Token向云会员与 API 接入指南

本指南按实际使用顺序说明如何完成账号准备、余额充值、API 密钥创建和客户端接入。第一次使用时，建议先完成会员流程，再根据使用的工具查看 API 接入配置。

> **需要协助？**
>
> 添加客服微信 `kkflow520` 获取远程协助，或加入[客户服务群](https://www.kdocs.cn/l/csU8ZJybJe2V)。

::support-group-qr
::

## 支持的 API 与工具

| 类型 | 当前支持内容 | 说明 |
| --- | --- | --- |
| OpenAI API | `/v1/responses`、`/v1/chat/completions`、`/v1/models` | 适合 Codex CLI、OpenCode 和 OpenAI 兼容客户端 |
| Claude API | Claude Code 兼容配置 | 使用 `ANTHROPIC_BASE_URL=https://kkflow.org/v1` 与自己的 API Key |
| 图片接口 | `gpt-image-2`、图片生成与图片编辑 | 支持文生图和参考图编辑 |
| 模型试用 | 文本模型与图片工作台 | 可使用账号内已有 Key 或临时输入自定义 Key |
| 会员功能 | 注册、登录、余额充值和订单状态 | 完成充值后再创建 API 密钥进行调用 |

详细操作分别见[会员充值流程](/member)和[API 接入配置](/integration)。

## 常用接入地址

| 用途 | 地址 |
| --- | --- |
| 主站入口 | [https://kkflow.org/](https://kkflow.org/) |
| 注册账号 | [https://kkflow.org/register](https://kkflow.org/register) |
| 登录账号 | [https://kkflow.org/login](https://kkflow.org/login) |
| OpenAI 兼容 Base URL | `https://kkflow.org/v1` |
| 文本模型 Responses | `https://kkflow.org/v1/responses` |
| Chat Completions | `https://kkflow.org/v1/chat/completions` |
| 图片生成 | `https://kkflow.org/v1/images/generations` |
| 图片编辑 | `https://kkflow.org/v1/images/edits` |

## 典型使用流程

1. 在主站注册或登录账号。
2. 在会员中心完成余额充值，确认订单状态和余额到账。
3. 创建 API 密钥，并确认密钥状态、分组、额度、速率限制和有效期。
4. 在客户端中填写 Base URL：`https://kkflow.org/v1`。
5. Codex CLI 使用 OpenAI Responses；Claude Code 使用 Claude 兼容环境变量；OpenCode 使用 OpenAI compatible provider。
6. 先请求 `/v1/models` 确认连通，再调用文本模型或图片接口。

## 接入边界

- OpenAI 兼容客户端一般使用 `https://kkflow.org/v1`。
- Claude Code 使用 `https://kkflow.org/v1` 作为 `ANTHROPIC_BASE_URL`。
- Gemini CLI 暂不在当前指南范围内，因为平台目前没有接入 Gemini。
- 客户端是否开源不等于一定兼容；接入前需要确认 provider 与接口协议匹配。
- API Key 不要发送到群聊、截图或提交到代码仓库，怀疑泄露时应立即停用并重建。

## 常见问题

### OpenAI 兼容客户端的 Base URL 填什么？

通常填写 `https://kkflow.org/v1`。不要只填写主站首页，也不要填写 `/v1` 这样的相对地址。

### Claude Code 怎么接入？

将 `ANTHROPIC_BASE_URL` 设置为 `https://kkflow.org/v1`，将 `ANTHROPIC_AUTH_TOKEN` 设置为自己的 API Key。完整示例见[API 接入配置](/integration#_6-claude-code)。

### 图片生成和图片编辑使用哪个模型？

文生图和参考图编辑默认使用 `gpt-image-2`。文生图调用 `/v1/images/generations`，参考图编辑调用 `/v1/images/edits`。

### 支付成功后余额没有立即到账怎么办？

余额通常会在 1-3 分钟内处理完成。若超过 5 分钟仍未到账，请在订单中心复制订单号后联系站点支持。
