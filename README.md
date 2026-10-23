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
| `/admin/upstreams` | 上游账号余额监控与邮件告警 |
| `/admin/email` | SMTP、反馈通知与多个上游告警收件邮箱 |
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
`IMAGE_TAG=v2.0.10 docker compose up -d`。实际 Nginx 配置保存在
`homeApps/自由home/guide.aiziyou.org.conf` 和 `homeApps/向云home/guide.kkflow.org.conf`，
其中 `/auth/embed` 必须关闭 access log；主站转发 sub2api 的 location 必须使用
`proxy_set_header Host $host`，不要使用 `$http_host`，以兼容只发送 HTTP/2 `:authority`
的浏览器请求。

## 上游余额监控

在后台「上游管理」添加上游名称、地址和 API Key，或从主站选择三方 API 类型账号。
主站账号使用「价格配置」中的主站管理接口；账号密钥被主站隐藏时，服务端通过已有的选定账号导出接口读取。
若主站启用了敏感操作二次验证、禁止机器凭据导出，可在上游配置中补充 API Key。
密钥仅保存在服务端，不会通过账号列表、余额接口或编辑表单返回浏览器。

余额默认通过上游 `GET /v1/usage` 查询，地址支持根地址或 `/v1` 地址。
可配置 1–1440 分钟检查间隔、余额不足阈值和余额用完告警；服务运行期间自动检查，无需保持后台页面打开。
告警复用「邮件通知」中的 SMTP 设置，可配置最多 30 个告警收件邮箱，以换行、逗号或分号分隔；留空时使用管理员收件邮箱。
余额不足和余额用完分别提醒，同一状态发送成功后不重复提醒；余额恢复后重新触发，发送失败时下次检查重试。
查询失败保留上次余额并标记失败，不将网络故障当作余额为零。暂停监控后不再自动查询或发送告警。

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
```

主站地址、品牌信息和登录路由不再从环境变量读取，请登录管理员后台的「站点配置」维护。Guide 的公开地址按当前访问域名生成。

图片管理分为两类：可替换图片（例如微信群二维码）使用 10 分钟缓存，长期图片（例如 Markdown、Scale 使用说明配图）使用 1 年缓存。反向代理需要为 `/uploads/` 保留独立的前缀 location，并将请求转发到 Nuxt，不能用全局静态文件规则覆盖应用返回的 `Cache-Control`。

## 云端构建与发布

推送到 `main` 后，GitHub Actions 会自动执行：

- `CI`：类型检查、单元测试、Nuxt 生产构建和桌面/移动端 UI 回归
- `Docker Build`：在 Linux Runner 中验证 `linux/amd64` 镜像，并复用构建缓存

以上流程不会推送镜像。正式发布前，在 GitHub 仓库或 `production` Environment
中配置以下 Actions secrets：

```text
DOCKERHUB_USERNAME
DOCKERHUB_TOKEN
```

镜像仓库默认是 `614626370/sub2api-guide`。如需覆盖，在 Actions variable 中设置：

```text
DOCKERHUB_REPOSITORY
```

发布时先把 `package.json` 中的版本改为目标版本并提交，然后推送同版本标签：

```powershell
git tag v2.2.37
git push origin main v2.2.37
```

也可以在 Windows 中手动触发云端发布：

```powershell
gh workflow run release.yml -f version=v2.2.37 -f publish_latest=true
```

正式发布会等待并复用同一提交已经运行的 `CI` 结果，不会重复执行测试。稳定版会
推送 `v2.2.37` 和 `latest`；预发布版本不会覆盖 `latest`。工作流完成后会创建或
更新对应的 GitHub Release。

仍可使用原有本机发布流程：

```powershell
npm run release -- -Version v2.2.37
```

## 注意

- 持久化 `./data`，勿把 SQLite 打进镜像
- 勿提交 `.env`、数据库、密钥
- `homeApps/` 中的三个首页作为内置默认模板进入指南镜像；线上自定义首页持久化在 `/data/homepages/`
