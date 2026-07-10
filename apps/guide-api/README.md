# Guide API

`guide-api` 是指南站的独立后端服务，用于承载不适合放进静态站的动态能力。当前包含在线反馈和模型价格参考两个模块，后续可以继续增加公告、站点统计、订阅提醒等能力。

默认前缀为 `/guide-api`，可以通过 `GUIDE_API_PREFIX` 修改。

## 路由

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/guide-api/health` | 健康检查 |
| `GET` | `/guide-api/meta` | 公开服务元信息 |
| `GET` | `/guide-api/feedback/quota` | 当前登录用户今日反馈额度 |
| `GET` | `/guide-api/feedback/me` | 当前登录用户反馈历史 |
| `POST` | `/guide-api/feedback` | 当前登录用户提交反馈 |
| `GET` | `/guide-api/pricing/reference` | 公开模型价格参考 |
| `GET` | `/guide-api/admin/feedback` | 管理员分页查看反馈 |
| `GET` | `/guide-api/admin/feedback/:id` | 管理员查看单条反馈 |
| `PATCH` | `/guide-api/admin/feedback/:id` | 管理员回复、更新反馈状态或备注 |
| `GET` | `/guide-api/admin/pricing/config` | 查看价格展示配置 |
| `GET` | `/guide-api/admin/pricing/source?refresh=true` | 查看从 sub2api 读取到的模型和分组 |
| `PUT` | `/guide-api/admin/pricing/settings` | 保存 sub2api 数据源、同步平台和汇率配置 |
| `POST` | `/guide-api/admin/pricing/refresh` | 管理员强制刷新价格参考缓存 |
| `PUT` | `/guide-api/admin/pricing/models` | 新增或更新模型展示配置 |
| `DELETE` | `/guide-api/admin/pricing/models/:id` | 删除模型展示配置 |
| `PUT` | `/guide-api/admin/pricing/groups` | 新增或更新分组展示配置 |
| `DELETE` | `/guide-api/admin/pricing/groups/:id` | 删除分组展示配置 |

管理员接口需要：

```http
Authorization: Bearer <GUIDE_API_ADMIN_TOKEN>
```

也兼容：

```http
X-Admin-Token: <GUIDE_API_ADMIN_TOKEN>
```

用户反馈接口需要主站登录后的 sub2api JWT：

```http
Authorization: Bearer <sub2api auth_token>
```

guide-api 会用该 token 请求 sub2api `/api/v1/auth/me` 校验用户身份，不信任前端传入的 `user_id`。同一用户按北京时间自然日每日最多提交 5 次，可通过 `GUIDE_API_FEEDBACK_DAILY_LIMIT` 调整；用户可在反馈页查看自己的历史反馈和管理员回复。

## 本地运行

```powershell
npm install
npm run api:dev
```

未设置 `.env` 时，本地开发会使用：

```text
GUIDE_API_ADMIN_TOKEN=dev-admin-token
GUIDE_API_DB_PATH=apps/guide-api/data/guide-api.sqlite
```

测试反馈提交：

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/guide-api/feedback `
  -Headers @{ Authorization = "Bearer <sub2api auth_token>" } `
  -ContentType application/json `
  -Body '{"category":"suggestion","title":"页面建议","content":"希望补充更清楚的价格说明。","source":"guide"}'
```

查看反馈：

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/guide-api/admin/feedback `
  -Headers @{ Authorization = "Bearer dev-admin-token" }
```

未配置 sub2api 数据源时，价格接口仍会返回结构化空数据，页面会显示待配置状态：

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/guide-api/pricing/reference
```

## 模型价格参考

价格页前端只请求 `guide-api`：

```text
GET /guide-api/pricing/reference
```

`guide-api` 服务端使用 sub2api 管理员 `x-api-key` 读取：

```text
GET /api/v1/admin/groups/all
GET /api/v1/admin/channels/pricing/sync-models?platform=openai
GET /api/v1/admin/channels/model-pricing?model=gpt-5.5
```

sub2api 管理员 key 只允许放在 `apps/guide-api/.env`，不能写进 VitePress 前端、部署脚本日志或仓库文件。

价格估算公式：

```text
等效参考价 = 官方美元价格 * 分组倍率 * 支付人民币 / 到账美元额度
```

说明：

- 官方价格来自 sub2api 默认模型价格，sub2api 返回 per-token USD，guide-api 会换算成每百万 token USD。
- 分组倍率来自 sub2api 分组。
- 支付/到账比例由 guide-api 管理员配置，例如付 50 元到账 210 美元额度，填写 `recharge_pay_cny: 50`、`recharge_credit_usd: 210`。
- 非专属分组默认展示；专属分组默认隐藏，除非管理员显式开启。
- 模型是否展示完全由 guide-api 的 `pricing_model_settings` 控制。

查看 sub2api 原始来源：

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:8787/guide-api/admin/pricing/source?refresh=true" `
  -Headers @{ Authorization = "Bearer dev-admin-token" }
```

开启或调整一个模型：

```powershell
Invoke-RestMethod `
  -Method Put `
  -Uri http://127.0.0.1:8787/guide-api/admin/pricing/models `
  -Headers @{ Authorization = "Bearer dev-admin-token" } `
  -ContentType application/json `
  -Body '{"provider":"openai","model_name":"gpt-5.5","display_name":"GPT-5.5","is_visible":true,"is_featured":true,"sort_order":10}'
```

开启或调整一个分组：

```powershell
Invoke-RestMethod `
  -Method Put `
  -Uri http://127.0.0.1:8787/guide-api/admin/pricing/groups `
  -Headers @{ Authorization = "Bearer dev-admin-token" } `
  -ContentType application/json `
  -Body '{"provider":"openai","source_id":"1","source_name":"默认分组","display_name":"默认分组","is_visible":true,"recharge_pay_cny":50,"recharge_credit_usd":210,"sort_order":10}'
```

查看当前展示配置：

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/guide-api/admin/pricing/config `
  -Headers @{ Authorization = "Bearer dev-admin-token" }
```

指南站提供了统一的管理员配置中心：

```text
https://kkflow.org/guide/admin/settings
```

该页面用于保存本机浏览器的 `GUIDE_API_ADMIN_TOKEN`，并配置 sub2api 地址、sub2api 管理员 `x-api-key`、同步平台和汇率。`GUIDE_API_ADMIN_TOKEN` 的服务端真实值仍必须通过 `.env` 配置；页面保存的是访问管理接口时使用的本机凭据。

模型价格展示配置页：

```text
https://kkflow.org/guide/admin/pricing
```

该页面不挂在普通导航中，需要先在 `/guide/admin/settings` 保存并验证管理员 Token 后才能读取和保存。

在线反馈也提供了管理员处理页：

```text
https://kkflow.org/guide/admin/feedback
```

管理员可以在该页查看反馈详情、回复用户、写内部备注，并标记为处理中或已处理。

## 生产配置

复制示例配置：

```bash
cp apps/guide-api/.env.example apps/guide-api/.env
```

生产环境必须设置：

```text
GUIDE_API_ADMIN_TOKEN
GUIDE_API_IP_HASH_SALT
GUIDE_API_DB_PATH
```

启用模型价格参考还需要 sub2api 数据源配置。可以在 `/guide/admin/pricing` 页面保存，也可以通过 `.env` 提供默认值：

```text
GUIDE_API_SUB2API_BASE_URL=https://kkflow.org
GUIDE_API_SUB2API_ADMIN_API_KEY=<sub2api admin api key>
GUIDE_API_PRICING_PLATFORMS=openai,anthropic,gemini,antigravity,grok
GUIDE_API_USD_TO_CNY=6.8102
```

页面保存的 SQLite 配置优先级高于 `.env` 默认值；未保存时使用 `.env`。

建议把 SQLite 放到主服务器持久目录，例如：

```text
/opt/kkflow-guide/data/guide-api.sqlite
```

不要把 SQLite 文件提交进仓库。

## 小鸡节点 Nginx

小鸡节点只需要把 `/guide-api/` 反代到主服务器的 guide-api：

```nginx
location ^~ /guide-api/ {
    proxy_pass http://主服务器内网或公网IP:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 10s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

主服务器的 8787 端口建议只允许小鸡节点 IP 访问。
