# Real Model Smoke Test

这份文档用于手动验证 real 模式。真实 API smoke test 不放进默认自动测试，因为它会消耗 API 额度，并且依赖外部网络和第三方服务状态。

当前 real 模式面向 OpenAI-compatible provider：服务端会读取通用 provider 环境变量，调用 `{BASE_URL}/models` 做可用性检测，并在会议过程中尽量保留成功模型的结果。任何记录都不要粘贴 API key、Authorization、Bearer token 或第三方完整错误体。

## 1. 创建 `.env.local`

先复制示例文件：

```powershell
Copy-Item .env.example .env.local
```

然后打开 `.env.local`，按需填写真实配置。

## 2. 启用 real 模式

```env
AI_ROUNDTABLE_MODE=real
```

## 3. 配置 OpenAI-compatible provider

推荐使用通用 provider 配置方式。`AI_ROUNDTABLE_PROVIDER_IDS` 中的 id 会转成大写后拼接环境变量前缀：

OpenAI 示例：

```env
AI_ROUNDTABLE_PROVIDER_IDS=openai
AI_ROUNDTABLE_PROVIDER_OPENAI_NAME=OpenAI
AI_ROUNDTABLE_PROVIDER_OPENAI_BASE_URL=https://api.openai.com/v1
AI_ROUNDTABLE_PROVIDER_OPENAI_API_KEY=
AI_ROUNDTABLE_PROVIDER_OPENAI_MODEL=
```

任意 OpenAI-compatible provider 示例：

```env
AI_ROUNDTABLE_PROVIDER_IDS=siliconflow
AI_ROUNDTABLE_PROVIDER_SILICONFLOW_NAME=SiliconFlow
AI_ROUNDTABLE_PROVIDER_SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
AI_ROUNDTABLE_PROVIDER_SILICONFLOW_API_KEY=
AI_ROUNDTABLE_PROVIDER_SILICONFLOW_MODEL=
```

旧版 OpenAI / DeepSeek / Qwen 环境变量仍然兼容，例如：

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=
```

不要把 `.env.local` 或任何 API key 提交到仓库。

## 4. 启动开发服务

```powershell
npm run dev
```

## 5. 检查可用模型

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/models" -UseBasicParsing
```

返回结果会包含：

- `mode`
- `models`
- `unavailableProviders`

接口会在服务端调用 `{BASE_URL}/models` 检测可用模型，但不会返回 API key。如果某个 provider 没有配置 API key、base URL 或 model，它会出现在 `unavailableProviders` 中，例如：

```json
{
  "id": "openai",
  "name": "OpenAI",
  "provider": "OpenAI",
  "status": "unconfigured",
  "statusLabel": "未配置",
  "reason": "missing AI_ROUNDTABLE_PROVIDER_OPENAI_API_KEY"
}
```

如果 provider 配置完整，但 `{BASE_URL}/models` 不兼容、超时或检测失败，接口可能返回 `configured_unverified` / `检测失败`。当前策略可能仍会尝试调用这个 provider，但这不代表连接已验证成功。

## 6. 创建会议

```powershell
Invoke-WebRequest `
  -Uri "http://localhost:3000/api/meeting" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"question":"请讨论 AI Roundtable 的真实模型接入体验。"}' `
  -UseBasicParsing
```

如果 real 模式下没有任何可用 provider，接口会返回清晰错误：

```json
{
  "error": "real mode has no available provider"
}
```

如果只有部分 provider 调用失败，接口会尽量返回已成功模型的会议结果，并在结果中包含 `failures` / `hasPartialFailures`。页面和 Markdown 会显示“模型调用失败记录”，包括失败阶段、简短原因和建议操作。

## 7. 推荐验收场景

### Real 模式无 provider 配置

- 设置 `AI_ROUNDTABLE_MODE=real`，不配置完整 provider。
- `GET /api/models` 应返回空 `models`，并在 `unavailableProviders` 中说明缺失项。
- 首页开始按钮应禁用，并提示检查 `.env.local`。

### provider 配置完整且 `/models` 检测成功

- 配置 `AI_ROUNDTABLE_PROVIDER_IDS` 和对应的 `NAME`、`BASE_URL`、`API_KEY`、`MODEL`。
- `GET /api/models` 应返回可参与会议的模型，状态应为 `available` / `已连接`。
- 页面不应显示 API key。

### provider 配置完整但 `/models` 检测失败

- 使用配置完整但 `/models` 不兼容、超时或暂时不可达的 provider。
- 状态应显示为 `configured_unverified` / `检测失败` 或未验证语义。
- 如果系统仍尝试调用该 provider，UI 也不能把它显示为“已连接”。

### MODEL 不存在

- 配置一个不在 `/models` 返回列表中的 `MODEL`。
- 该 provider 应出现在 `unavailableProviders` 中，状态为 `model_not_found` / `模型未找到`。
- 如果检测到模型列表，页面只展示前几个作为配置参考。

### 单 provider 调用失败

- 准备多个可参与 provider，并让其中一个在会议调用阶段失败。
- `POST /api/meeting` 应尽量返回 200，保留其他 provider 的发言。
- 返回结果应包含 `hasPartialFailures: true` 和 `failures`。
- 页面和 Markdown 应显示“模型调用失败记录”，包含 provider、model、阶段、原因和建议。

### 所有 provider 调用失败

- 让所有可参与 provider 在会议调用阶段失败。
- `POST /api/meeting` 应返回清晰错误，不应返回看似成功的会议结果。
- 错误信息应脱敏，不包含 API key、Authorization、Bearer 或第三方完整错误体。

## 8. 记录模板

真实测试记录可以使用下面的模板。请只记录脱敏信息，不要记录 API key。

```markdown
## Real Mode Smoke Test Record

- 日期：
- provider name：
- base URL：仅记录公开 base URL 或脱敏后的域名，不记录私密网关地址
- configured model：
- detected status：
- meeting result：成功 / 部分失败 / 全部失败
- failures：无 / 有，简述 provider、model、阶段、原因和建议
- human notes：
```

## 9. 记录脱敏示例

如果需要保存真实模型会议示例，请先删除 API key、账户信息、内部地址和任何敏感内容，再放入 `examples/real-meeting-example.md`。
