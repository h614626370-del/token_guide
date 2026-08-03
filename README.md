# 通用全栈指南应用

这是一个可配置品牌的统一全栈指南应用。指南页面、模型试用、价格聚合、在线反馈和管理后台由一个 Nuxt 服务提供。仓库默认使用 `Token向云` 配置，示例部署地址为：

```text
https://guide.kkflow.org
```

项目不使用 `/guide` 或 `/guide-api` 路径前缀。

## 主要功能

- `/`：指南入口与接入流程
- `/member`：会员、充值和订阅说明
- `/integration`：API 与客户端接入文档
- `/playground`：Responses 文本测试和图片生成
- `/pricing`：模型官方价、分组倍率与套餐折算价格
- `/feedback`：登录用户提交反馈、查看进度和管理员回复
- `/admin`：管理员概览
- `/admin/settings`：项目名称、品牌、主站路由和支持信息
- `/admin/pricing`：价格来源与展示配置
- `/admin/feedback`：反馈处理
- `/admin/update`：检测更新、下载最新镜像并立即重启
- `/auth/embed`：接收 sub2api 嵌入 JWT，换取本域 HttpOnly 会话
- `/api/*`：统一同源 API

## 目录

```text
app/       Nuxt 页面、布局、组件和样式
content/   Markdown 指南内容
server/    Nitro API、认证、SQLite 和业务逻辑
public/    静态资源
config/    Nginx 与 systemd 示例
scripts/   安装、部署和发布脚本
```

`apps/guide-site` 和 `apps/guide-api` 已被统一应用取代。`homeApps/` 下其他静态首页目录不是统一指南镜像的一部分。

## 本地开发

```powershell
npm install
npm run dev
```

默认地址为 `http://127.0.0.1:3000`。常用验证命令：

```powershell
npm run typecheck
npm test
npm run build
npm run preview
```

浏览器布局巡检首次运行前安装 Chromium，之后执行：

```powershell
npx playwright install chromium
npm run test:ui
```

也可以通过 `PLAYWRIGHT_EXECUTABLE_PATH` 使用本机 Chrome 或 Edge。

本地业务数据库默认为 `data/guide.sqlite`，不会提交到 Git。

## 环境配置

复制 `.env.example` 为 `.env`，至少配置以下值：

```text
NUXT_SESSION_PASSWORD
NUXT_ADMIN_TOKEN
NUXT_IP_HASH_SALT
NUXT_PUBLIC_SITE_URL
NUXT_PUBLIC_SUB2API_ORIGIN
```

生产环境的 `NUXT_SESSION_PASSWORD` 必须不少于 32 个字符。sub2api 管理员 API Key 可通过 `NUXT_SUB2API_ADMIN_API_KEY` 设置，也可登录 `/admin/pricing` 后写入服务端 SQLite；密钥不会回显到浏览器，因此数据库文件本身也必须按敏感数据保护。

首次启动后可登录 `/admin/settings` 修改项目名称、站点标题、简介、Logo 完整地址、页脚文案、主站地址、登录/注册/支持/API 路由和客服信息。配置保存在 SQLite 的 `site_settings` 表中，优先级高于 `NUXT_PUBLIC_*` 初始值；修改主站地址后，前台链接、嵌入来源策略、账号校验和工作台上游会一起更新。

## sub2api 嵌入

在 sub2api 自定义菜单中配置：

```text
https://guide.kkflow.org/auth/embed?redirect=/playground
```

sub2api 会追加 `token`、`ui_mode` 等参数。统一服务会在服务端校验 JWT，写入加密的 Host-only HttpOnly Cookie，然后用 `303` 跳转到不含 token 的 URL。

浏览器只请求 `guide.kkflow.org/api/*`。统一服务再通过服务端请求 `https://kkflow.org`，因此不需要开放 sub2api CORS，也不共享 `.kkflow.org` Cookie。

Nginx 必须对 `/auth/embed` 关闭访问日志，避免 JWT 查询参数进入日志。示例见 `config/guide.nginx.example.conf`。

## Docker 部署（本机）

推荐与 sub2api 相同的本机安装方式：**准备脚本只写文件和密钥，不远程 SSH**；由你在当前机器执行 `docker compose up -d`。

### 使用自动化部署脚本快速搭建

```bash
# 创建部署目录
mkdir -p sub2api-guide-deploy && cd sub2api-guide-deploy

# 下载并运行部署准备脚本
curl -sSL https://raw.githubusercontent.com/h614626370-del/token_guide/main/deploy/docker-deploy.sh | bash

# 启动服务
docker compose up -d

# 查看日志
docker compose logs -f guide
```

### 脚本功能

- 下载 `docker-compose.yml` 和 `.env.example`
- 自动生成安全凭证（`NUXT_SESSION_PASSWORD`、`NUXT_ADMIN_TOKEN`、`NUXT_IP_HASH_SALT`）
- 创建 `.env` 并填入自动生成的密钥
- 创建 `data/` 数据目录（使用本地目录，便于备份和迁移）
- 探测 Docker Socket 组 ID，便于后台系统更新
- 显示生成的凭证供你记录

### 可选参数（准备脚本环境变量）

```bash
IMAGE_TAG=v2.0.0 \
HOST_PORT=3000 \
SITE_URL=https://guide.kkflow.org \
SUB2API_ORIGIN=https://kkflow.org \
curl -sSL https://raw.githubusercontent.com/h614626370-del/token_guide/main/deploy/docker-deploy.sh | bash
```

### 安装结果

```text
127.0.0.1:3000 -> sub2api-guide:3000
./data         -> /data
/data/guide.sqlite
```

健康检查：

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

管理后台：`/admin`，使用脚本打印的 `NUXT_ADMIN_TOKEN` 登录。

若主机存在 `/var/run/docker.sock`，compose 会挂载它以便后台「系统更新」。Socket 权限接近宿主机 Docker 管理能力，请仅在受信环境启用；不需要时可编辑 `docker-compose.yml` 去掉该 volume。

旧库兼容：若存在 `data/guide-api.sqlite` 且没有 `data/guide.sqlite`，准备脚本会复制为 `data/guide.sqlite` 并保留原文件。

### 本地构建镜像（开发用）

```powershell
docker build -t sub2api-guide .
```

### 发布镜像

```powershell
npm run release -- -Version v2.0.0
```

发布后在服务器重新执行准备脚本（或改 `.env` 的 `IMAGE_TAG`）再 `docker compose up -d` 即可升级。

## 数据与密钥

- SQLite 目录必须持久化，不要写入镜像。
- 不提交 `.env`、SQLite、日志、JWT、管理员 Token 或 sub2api 管理员 Key。
- `NUXT_TRUSTED_PROXY_IPS` 只填写可以覆盖 `X-Forwarded-For` 的反向代理精确 IP。
- 不要让浏览器直接请求主站 API；所有调用走本项目同源 API。
