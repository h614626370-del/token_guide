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

## Git 与敏感信息

- 提交前检查 `git status --short`。
- 不提交 `node_modules/`、`dist/`、SQLite 数据库文件、日志文件或任何密钥。
- 如果新增脚本需要密钥，只能读取环境变量或本机配置，不能硬编码。
- 不要把真实密钥写入仓库、脚本、日志或最终回复。
