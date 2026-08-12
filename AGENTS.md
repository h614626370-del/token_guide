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
npm run release -- -Version v2.2.11
```

本机部署准备：

```bash
curl -sSL https://raw.githubusercontent.com/h614626370-del/token_guide/main/deploy/docker-deploy.sh | bash
docker compose up -d
```

## Docker 构建与发布

- Windows 侧只负责准备源码和启动发布脚本，最终 Linux 镜像由 WSL 中的 Docker 构建。
- `npm ci` 和 `npm run build` 必须保留在 Docker 的 Linux 构建阶段，不要复制 Windows 生成的 `node_modules` 或 `.output` 制作生产镜像。
- Dockerfile 必须保留 BuildKit npm 缓存挂载；依赖文件未变化时应复用安装层，依赖变化时优先复用 npm 下载缓存。
- `package.json` 和 `package-lock.json` 必须先于业务源码复制，以免普通源码改动导致依赖层失效。
- 构建代理通过发布脚本的 `--build-arg HTTP_PROXY/HTTPS_PROXY` 传入，不要在 Dockerfile 中再次声明代理 `ARG` 或写入 `ENV`，避免代理值破坏依赖缓存。
- 本机需要代理时默认使用 `http://127.0.0.1:7897`；构建前确认代理已启动。
- 除非明确需要清理或排查缓存问题，不要使用 `--no-cache`、`docker builder prune` 或 `docker system prune -a`。
- 新环境第一次构建仍需下载依赖；同一 Docker builder 后续构建才会复用本地缓存。

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
