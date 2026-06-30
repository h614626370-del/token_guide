# Token向云指南站

这是 `Token向云` 的 VitePress 指南站和官网首页维护仓库。

## 目录

- `docs/`: VitePress 指南站源码，线上路径为 `https://kkflow.org/guide/`
- `homepage/index.html`: 根域名官网首页，部署到 `https://kkflow.org/`
- `homepage/home-content-fragment.html`: sub2api 后台“首页内容”粘贴片段
- `scripts/`: 辅助脚本
- `dist/`: VitePress 构建产物，不提交

## 常用命令

```powershell
npm install
npm run docs:dev
npm run docs:build
npm run docs:preview
```

## 部署指南站

```powershell
npm run deploy
```

首次配置免密 SSH：

```powershell
npm run deploy -- -Key
```

构建产物输出到项目根目录 `dist/`，部署脚本会上传到服务器的 `/www/wwwroot/guide`。

## 部署根首页

上传：

```text
homepage/index.html -> /www/wwwroot/kkflow.org/index.html
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

- `homepage/index.html` 是完整独立页面，适合部署到根域名。
- `homepage/home-content-fragment.html` 只用于粘贴到 sub2api 后台“首页内容”，不包含完整 HTML 外壳。
- 不提交 `node_modules/`、`dist/`、日志文件或任何密钥。
