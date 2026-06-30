# AGENTS.md

本文件记录本项目内 Codex 协作时需要遵守的约定。

## 项目说明

- 这是 `Token向云` 的指南站和官网首页维护仓库。
- VitePress 指南站线上路径：`https://kkflow.org/guide/`
- 根域名官网首页：`https://kkflow.org/`
- 指南站构建产物输出到项目根目录 `dist/`。

## 关键目录

- `docs/`: VitePress 文档源码。
- `homepage/index.html`: 独立官网首页，上传到 `/www/wwwroot/kkflow.org/index.html`。
- `homepage/home-content-fragment.html`: sub2api 后台“首页内容”专用片段。
- `scripts/`: 辅助脚本。

## 常用命令

```powershell
npm run docs:dev
npm run docs:build
npm run docs:preview
npm run deploy
```

首次配置免密 SSH：

```powershell
npm run deploy -- -Key
```

## 首页维护约定

- 修改官网首页时，优先维护 `homepage/index.html`。
- 如果需要同步 sub2api 后台“首页内容”，从 `index.html` 提取 `<style>` 和 `<body>` 内部内容生成 `homepage/home-content-fragment.html`。
- `homepage/index.html` 是完整 HTML，适合独立部署；不要直接粘到 sub2api 后台输入框。
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
- 不提交 `node_modules/`、`dist/`、日志文件或任何密钥。
- 如果新增脚本需要密钥，只能读取环境变量或本机配置，不能硬编码。
- 不要把真实密钥写入仓库、脚本、日志或最终回复。
