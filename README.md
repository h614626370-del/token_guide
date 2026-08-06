# sub2api-guide

可配置品牌的统一指南应用：文档、模型试用、价格、反馈与管理后台，由一个 Nuxt 服务提供。

- 示例站点：`https://guide.aiziyou.org`
- 镜像：`614626370/sub2api-guide`
- 无路径前缀（不用 `/guide`、`/guide-api`）

## 功能

| 路径 | 说明 |
|---|---|
| `/` `/member` `/integration` | 指南与接入说明 |
| `/playground` | 文本 / 图片模型试用 |
| `/pricing` | 价格与套餐折算 |
| `/feedback` | 用户反馈 |
| `/admin` | 站点、文档、价格、反馈、系统更新 |
| `/auth/embed` | sub2api 嵌入登录入口 |

## 本机部署

```bash
mkdir -p sub2api-guide-deploy && cd sub2api-guide-deploy
curl -sSL https://raw.githubusercontent.com/h614626370-del/token_guide/main/deploy/docker-deploy.sh | bash
docker compose up -d
docker compose logs -f guide
```

准备脚本会生成 `docker-compose.yml`、`.env`（含管理员密钥）和 `data/` 目录，并打印 `NUXT_ADMIN_TOKEN`。

```text
127.0.0.1:3000  →  容器 3000
./data          →  /data/guide.sqlite
```

```bash
# 健康检查
curl -fsS http://127.0.0.1:3000/api/health

# 管理后台：使用脚本打印的 NUXT_ADMIN_TOKEN 登录
# http://127.0.0.1:3000/admin
```

默认始终拉取 `latest` 镜像，`.env` 不固化版本号；如需临时锁定版本，可执行
`IMAGE_TAG=v2.0.10 docker compose up -d`。Nginx 反代示例见
`config/guide.nginx.example.conf`（`/auth/embed` 须关闭 access log）。

## sub2api 嵌入

主站自定义菜单：

```text
https://你的指南域名/auth/embed?redirect=/playground
```

服务端校验 JWT 后写入 HttpOnly 会话，再跳转到无 token 地址。浏览器只访问本站 `/api/*`，不直连主站。

## 本地开发

```powershell
npm install
npm run dev          # http://127.0.0.1:3000
npm run typecheck
npm test
npm run build
```

复制 `.env.example` 为 `.env`，至少配置：

```text
NUXT_SESSION_PASSWORD   # ≥32 字符
NUXT_ADMIN_TOKEN
NUXT_IP_HASH_SALT
NUXT_PUBLIC_SITE_URL
NUXT_PUBLIC_SUB2API_ORIGIN
```

## 发布镜像

```powershell
npm run release -- -Version v2.1.2
```

## 注意

- 持久化 `./data`，勿把 SQLite 打进镜像
- 勿提交 `.env`、数据库、密钥
- `homeApps/` 中的三个首页作为内置默认模板进入指南镜像；线上自定义首页持久化在 `/data/homepages/`
