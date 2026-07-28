# AGENTS.md

本文件记录本项目内 Codex 协作时需要遵守的约定。

## 项目说明

- 这是 `Token向云` 的指南站和官网首页维护仓库。
- 仓库现在按应用拆分，静态站和指南站 API 服务分开维护。
- VitePress 指南站线上路径：`https://kkflow.org/guide/`
- 根域名官网首页：`https://kkflow.org/`
- 指南站构建产物输出到项目根目录 `dist/guide/`。
- 指南站动态 API 默认路径前缀：`/guide-api/`，服务部署在主服务器，小鸡节点只做反代。

## 关键目录

- `apps/guide-site/docs/`: VitePress 文档源码。
- `apps/homepage/index.html`: 独立官网首页，上传到 `/www/wwwroot/kkflow.org/index.html`。
- `apps/homepage/`: 官网首页资源。如需 sub2api 后台“首页内容”片段，应从完整首页提取生成。
- `apps/guide-api/`: 指南站 API 服务，当前包含反馈模块和模型价格聚合模块。
- `config/`: Nginx / systemd 示例配置。
- `scripts/`: 辅助脚本。

## 常用命令

```powershell
npm run docs:dev
npm run docs:build
npm run docs:preview
npm run api:dev
npm run api:start
npm run api:test
npm run deploy
```

首次配置免密 SSH：

```powershell
npm run deploy -- -Key
```

## 首页维护约定

- 修改官网首页时，优先维护 `apps/homepage/index.html`。
- 如果需要同步 sub2api 后台“首页内容”，从 `index.html` 提取 `<style>` 和 `<body>` 内部内容生成片段。
- `apps/homepage/index.html` 是完整 HTML，适合独立部署；不要直接粘到 sub2api 后台输入框。
- 根首页部署依赖 Nginx 精确匹配：

```nginx
location = / {
    root /www/wwwroot/kkflow.org;
    default_type text/html;
    try_files /index.html =404;
}
```

该配置应放在通配反代 `location ^~ /` 前面，确保 `/login`、`/register`、`/key-usage` 等路径仍由 sub2api 处理。

## 构建与发布边界

- 只有 `apps/guide-api/` 需要构建并推送 Docker Hub 镜像。
- VitePress 指南站和官网首页不进入 Docker 镜像，由用户手动部署。
- 前端默认只生成目录构建产物，不创建 zip、tar 或其他压缩包。
- 不修改或打包 sub2api 源码；guide-api 通过 HTTP 接口与 sub2api 通信。

## 前端构建与手动部署

发布前先执行：

```powershell
npm run docs:build
```

构建成功后：

- 指南站产物位于 `dist/guide/`，将该目录内的全部内容上传到服务器 `/www/wwwroot/kkflow.org/guide/`。
- 官网首页是 `apps/homepage/index.html`，单独上传到 `/www/wwwroot/kkflow.org/index.html`。
- `dist/` 是构建产物，不提交 Git。
- 只更新指南站时不必上传首页；修改过 `apps/homepage/index.html` 时才同步首页文件。

## guide-api Docker 发布

镜像仓库：`614626370/kkflow-guide-api`。发布脚本只处理 guide-api 镜像，并同时维护版本标签、`latest` 和 GitHub Release。

正常发布顺序：

1. 执行 `npm run api:test` 和 `npm run docs:build`。
2. 检查 `git status --short`、敏感信息和未跟踪文件。
3. 提交代码并先推送 `main` 到 GitHub。
4. 使用新的语义化版本执行发布命令，例如：

```powershell
npm run release:guide-api -- -Version v1.1.0
```

发布脚本会构建 `linux/amd64` 镜像，推送 `vX.Y.Z` 与 `latest`，然后创建对应 GitHub Release。若镜像已经在本地构建并完成健康检查，避免重复构建：

```powershell
npm run release:guide-api -- -Version v1.1.0 -SkipBuild
```

### Docker 构建约定

- 根目录 `.dockerignore` 使用白名单，只允许发送根 `package.json`、`package-lock.json` 和 `apps/guide-api/src/` 等 guide-api 构建必需文件。
- `apps/guide-api/Dockerfile` 是增量运行镜像：最终层使用干净的 `node:22-bookworm-slim`，从 `DEPENDENCY_IMAGE` 复制已安装的生产依赖，再只复制 guide-api 源码。
- 当前依赖基线是 `614626370/kkflow-guide-api:v1.0.2`，其中包含可用的 `better-sqlite3` Linux 原生驱动。API 源码变化时可以直接复用，不能重复安装 Python、make、g++。
- 如果 `dependencies` 或 `package-lock.json` 中的运行依赖发生变化，必须先停止常规增量发布；重新构建包含匹配生产依赖的基线镜像，更新 Dockerfile 的 `DEPENDENCY_IMAGE`，再验证 `better-sqlite3` 后发布。不能继续复用旧依赖基线。
- 本地 Docker 环境在 WSL。构建后至少验证镜像架构为 `linux/amd64`、`better-sqlite3` 可加载，并请求 `/guide-api/health`。
- 指南站、首页、文档图片和测试文件不应出现在 guide-api 镜像中。

### 主服务器升级

guide-api 默认安装目录为执行脚本时的当前目录。服务器已有部署时，先进入现有目录再执行：

```bash
cd /www/guide-api
curl -fsSL https://raw.githubusercontent.com/h614626370-del/token_guide/main/scripts/install-guide-api.sh \
  | bash -s -- --version v1.1.0
```

安装脚本的行为：

- 已存在的 `.env` 不会覆盖。
- `./data/` 会继续映射到容器 `/data`，SQLite 数据不会写入镜像，也不会因重建容器丢失。
- `docker-compose.yml` 会按指定镜像版本重新生成，默认映射 `8787:8787`。
- 脚本会拉取镜像、重建 guide-api 容器并执行健康检查，不会操作 sub2api、Redis 或 PostgreSQL 容器。

升级后检查：

```bash
docker ps
curl http://127.0.0.1:8787/guide-api/health
```

当前 `v1.1.0` 价格批量保存优化没有修改 SQLite 表结构或迁移，现有 `data/guide-api.sqlite` 可直接继续使用。

## 发布网络问题

- GitHub 推送优先直连；若连接被重置且本机 Clash 代理端口确认在监听，可以只为当次命令临时指定代理，不写入 Git 全局配置。
- Docker Hub 构建或推送失败时，先检查 WSL 中 `docker info` 的代理配置，以及 `registry-1.docker.io`、`auth.docker.io` 的连通性；不要因一次超时重复修改 Dockerfile。
- 不要在命令、脚本、日志或文档中记录代理密钥、GitHub Token 或 Docker Hub 密码。

## Git 与敏感信息

- 提交前检查 `git status --short`。
- 不提交 `node_modules/`、`dist/`、SQLite 数据库文件、日志文件或任何密钥。
- 如果新增脚本需要密钥，只能读取环境变量或本机配置，不能硬编码。
- 不要把真实密钥写入仓库、脚本、日志或最终回复。
