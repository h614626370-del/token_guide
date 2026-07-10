# Token向云指南站

这是 `Token向云` 的指南站、官网首页和指南站配套 API 服务维护仓库。

## 目录

- `apps/guide-site/docs/`: VitePress 指南站源码，线上路径为 `https://kkflow.org/guide/`
- `apps/homepage/index.html`: 根域名官网首页，部署到 `https://kkflow.org/`
- `apps/guide-api/`: 指南站独立 API 服务，默认路径前缀为 `/guide-api/`，承载在线反馈和模型价格聚合
- `config/`: Nginx、systemd 等部署示例
- `scripts/`: 辅助脚本
- `dist/guide/`: VitePress 构建产物，不提交

## 常用命令

```powershell
npm install
npm run docs:dev
npm run docs:build
npm run docs:preview
npm run api:dev
```

## 部署指南站

```powershell
npm run deploy
```

首次配置免密 SSH：

```powershell
npm run deploy -- -Key
```

构建产物输出到项目根目录 `dist/guide/`，部署脚本会上传到服务器的 `/www/wwwroot/guide`。

## 运行 Guide API

本地开发：

```powershell
npm run api:dev
```

生产环境参考：

- `apps/guide-api/.env.example`
- `config/guide-api.nginx.example.conf`
- `config/guide-api.service.example`

建议将 API 服务部署在主服务器，小鸡节点只反代 `/guide-api/` 到主服务器，避免反馈数据分散到多个 SQLite。

模型价格参考由 `guide-api` 服务端读取 sub2api 管理接口并叠加本地展示配置。生产环境需要在 `apps/guide-api/.env` 中设置 `GUIDE_API_SUB2API_BASE_URL` 和 `GUIDE_API_SUB2API_ADMIN_API_KEY`，不要把 sub2api 管理员 key 写到前端页面或提交到仓库。

价格展示的可视化管理页为 `/guide/admin/pricing`，不挂在普通导航中，需要输入 `GUIDE_API_ADMIN_TOKEN`。页面可保存 sub2api 地址、sub2api 管理员 `admin-` key、同步平台和汇率到 guide-api SQLite。

## 部署根首页

上传：

```text
apps/homepage/index.html -> /www/wwwroot/kkflow.org/index.html
```

Nginx 需要让根路径精确匹配静态首页，并保留其他路径反代到 sub2api：

```nginx
location = / {
    root /www/wwwroot/kkflow.org;
    default_type text/html;
    try_files /index.html =404;
}
```

这段应放在 `location ^~ / { proxy_pass ... }` 前面。

## 注意

- `apps/homepage/index.html` 是完整独立页面，适合部署到根域名。
- 如需维护 sub2api 后台“首页内容”片段，应从完整首页提取 `<style>` 和 `<body>` 内部内容生成对应片段，不要直接粘贴完整 HTML。
- 不提交 `node_modules/`、`dist/`、SQLite 数据库文件、日志文件或任何密钥。
