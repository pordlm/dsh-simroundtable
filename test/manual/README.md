# 手动真实模型探针

这两个脚本**不属于** `npm test`：它们会向真实 OpenAI 兼容端点发请求、消耗 token，并且需要网络。只在发布前或怀疑引擎问题时手动运行。

| 脚本 | 覆盖范围 |
|---|---|
| `real-provider.e2e.mjs` | 整条圆桌流水线（提示词、JSON 提取、排名、降级、限制）——只替换子 Agent 传输层 |
| `api-live.e2e.mjs` | 页面 API 全链路：路由 → `MeetingManager` → `runDeliberation` → 真实模型 |

报告写到仓库根目录的 `.e2e/`（已在 `.gitignore` 中）。

## 环境变量

```powershell
# 端点：OpenAI 兼容的 /v1 根地址（不要带 /chat/completions）
$env:ROUNDTABLE_E2E_BASE_URL = "https://your-endpoint.example.com/v1"

# 阵容：JSON 数组，至少两个模型；name 字段可选
$env:ROUNDTABLE_E2E_ROSTER = '[{"provider":"p1","model":"model-a"},{"provider":"p2","model":"model-b"}]'

# 密钥二选一：
$env:ROUNDTABLE_E2E_KEY = "sk-..."             # 直接给
$env:ROUNDTABLE_E2E_SECRET = "API_KEY"         # 或从 credentials store 读取该名字
$env:DSH_CREDENTIALS = "C:\path\to\.credentials.yaml"   # 默认 ~/.dsh/.credentials.yaml

# 可选
$env:ROUNDTABLE_E2E_ANSWER_TOKENS = "3000"
$env:ROUNDTABLE_E2E_REVIEW_TOKENS = "4000"
$env:ROUNDTABLE_E2E_ARBITER_TOKENS = "4000"
$env:ROUNDTABLE_E2E_ORIGIN = "http://127.0.0.1:3000"   # api-live 构造请求 URL 用，无实际网络含义
```

## 运行

```powershell
node test/manual/real-provider.e2e.mjs
node test/manual/api-live.e2e.mjs
```

`api-live` 会逐条打印 16 项检查结果；`real-provider` 打印耗时、token 用量、各阶段与终稿片段。两者的失败信息里不会出现密钥。