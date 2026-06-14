# AGENTS.md

本文件记录本项目内 Codex 协作时需要遵守的约定。

## 项目说明

- 这是 `Token向云` 的 VitePress 指南站点。
- 站点部署目标路径为 `https://kkflow.org/guide/`。
- 构建产物输出到项目根目录 `dist/`。
- 已生成的宣传图需要保留：
  - `marketing/xiangyun-douyin-poster-1440x2560.png`

## 常用命令

```powershell
npm run docs:dev
npm run docs:build
npm run docs:preview
```

部署脚本：

```powershell
npm run deploy
```

首次配置免密 SSH：

```powershell
npm run deploy -- -Key
```

## 图片生成方式

需要生成运营图、宣传图、视觉素材时，优先使用 Codex 配置中的 `baseurl` 和 `key`，直接请求图片模型 `gpt-image-2`。

注意：

- 不要把真实 `key` 写入仓库、脚本、日志或提交记录。
- 不要在最终回复中展示完整密钥。
- 可以临时从 Codex 配置读取 `baseurl` 和 `key`，或将它们放入当前终端环境变量后再调用。
- 生成结果应保存到项目内合适目录，例如 `marketing/`。

推荐环境变量命名：

```powershell
$env:OPENAI_BASE_URL = "<codex-config-baseurl>"
$env:OPENAI_API_KEY = "<codex-config-key>"
```

### CURL POST 示例

```powershell
$body = @{
  model = "gpt-image-2"
  prompt = "生成一张 9:16 高级品牌宣传图，主题为 Token向云 AI API 接入指南上线，风格克制、现代、适合抖音发布。"
  size = "1440x2560"
} | ConvertTo-Json -Depth 10

curl.exe -X POST "$env:OPENAI_BASE_URL/images/generations" `
  -H "Authorization: Bearer $env:OPENAI_API_KEY" `
  -H "Content-Type: application/json" `
  -d $body
```

接口返回后，根据返回结构取图片内容：

- 如果返回 `b64_json`，解码后写入 `.png`。
- 如果返回 `url`，下载到本地文件。

### Python 示例

```python
import base64
import os
import requests
from pathlib import Path

base_url = os.environ["OPENAI_BASE_URL"].rstrip("/")
api_key = os.environ["OPENAI_API_KEY"]

payload = {
    "model": "gpt-image-2",
    "prompt": "生成一张 9:16 高级品牌宣传图，主题为 Token向云 AI API 接入指南上线，风格克制、现代、适合抖音发布。",
    "size": "1440x2560",
}

response = requests.post(
    f"{base_url}/images/generations",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    },
    json=payload,
    timeout=120,
)
response.raise_for_status()
data = response.json()["data"][0]

out = Path("marketing/generated-image.png")
out.parent.mkdir(parents=True, exist_ok=True)

if "b64_json" in data:
    out.write_bytes(base64.b64decode(data["b64_json"]))
elif "url" in data:
    image = requests.get(data["url"], timeout=120)
    image.raise_for_status()
    out.write_bytes(image.content)
else:
    raise RuntimeError(f"Unsupported image response: {data.keys()}")

print(out.resolve())
```

## Git 与敏感信息

- 提交前检查 `git status --short`。
- 不提交 `node_modules/`、`dist/`、日志文件或任何密钥。
- 如果新增脚本需要密钥，只能读取环境变量或本机配置，不能硬编码。
