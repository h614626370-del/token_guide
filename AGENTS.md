# AGENTS.md

本文件记录本项目内 Codex 协作约定。

## 项目说明

- 这是可配置品牌和主站地址的统一全栈指南应用，`Token向云` 只是默认配置。
- Nuxt 页面和 Nitro API 在同一个 Node 服务、同一个 Docker 镜像中运行。
- 线上根地址为 `https://guide.aiziyou.org`。
- 不使用 `/guide` 或 `/guide-api` 前缀。
- 不修改 `sub2api` 源码；通过已有嵌入 JWT 协议和服务端 HTTP 接口集成。

## 关键目录

- `app/`：页面、布局、组件和样式。
- `content/`：Markdown 指南内容。
- `server/api/`：Nitro API 路由。
- `server/domain/`：反馈、价格与站点配置业务逻辑。
- `server/db/`：SQLite 初始化与迁移。
- `server/utils/`：会话、代理、配置和安全辅助函数。
- `public/`：静态资源。
- `config/`：Nginx 与 systemd 示例。
- `deploy/`：本机 Docker 部署准备脚本与 compose 模板。
- `scripts/`：镜像发布与可选一键安装脚本。

`homeApps/` 下的三个静态首页作为后台首页管理的内置默认模板进入统一指南镜像。除非任务明确要求，不要改动或删除这些模板。

## 常用命令

```powershell
npm run dev
npm run typecheck
npm test
npm run test:ui
npm run build
npm run preview
npm run release -- -Version v2.1.2
```

本机部署准备：

```bash
curl -sSL https://raw.githubusercontent.com/h614626370-del/token_guide/main/deploy/docker-deploy.sh | bash
docker compose up -d
```

## 认证与代理约定

- sub2api 自定义菜单进入 `/auth/embed?token=<jwt>`。
- `/auth/embed` 必须立即校验 JWT、建立 HttpOnly 会话并跳转到无 token URL。
- 不把 JWT 或已保存的完整 API Key返回浏览器。
- 浏览器只请求同源 `/api/*`；sub2api 请求必须在服务端完成。
- 模型代理的上游地址固定来自服务端配置，不能接受任意客户端 Base URL。
- `/auth/embed` 的 Nginx access log 必须关闭。
- iframe `frame-ancestors` 必须跟随后台配置的主站 Origin，不要重新写死，也不要添加 `X-Frame-Options: DENY`。
- 只有 `NUXT_TRUSTED_PROXY_IPS` 中的代理可以提供可信 `X-Forwarded-For`。

## SQLite 与部署

- 本地默认数据库为 `data/guide.sqlite`，容器内为 `/data/guide.sqlite`。
- 保留已有迁移和数据结构；新增结构必须追加迁移，不能重建或清空旧库。
- 旧 `data/guide-api.sqlite` 升级时复制为 `data/guide.sqlite`，原文件保留。
- 站点品牌与主站路由保存在 `site_settings`，修改结构时必须继续使用追加迁移。
- 生产部署只有一个 Nuxt 服务和一个 SQLite 卷。
- Docker 构建上下文包含 `homeApps/` 默认模板，但不包含数据、日志或环境文件。

## Git 与敏感信息

- 提交前检查 `git status --short`。
- 不提交 `node_modules/`、`.nuxt/`、`.output/`、`.data/`、SQLite、日志或密钥。
- 脚本中的密钥只能来自环境变量、本机配置或部署时随机生成。
- 不在命令输出、测试快照、日志、文档或最终回复中暴露真实密钥。
