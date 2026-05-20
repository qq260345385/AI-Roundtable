# Real Model Smoke Test Results

## 测试日期

2026-05-19

## 测试环境

- 环境：local development
- 阶段：internal alpha / pre-release
- 结论：real provider 配置已被读取，但当前 MiMo 鉴权未通过，会议不可用

## 前置检查

- `.env.local`：存在
- `AI_ROUNDTABLE_MODE=real`：已确认
- provider 配置方式：通用 `AI_ROUNDTABLE_PROVIDER_IDS`
- provider names：Xiaomi MiMo
- models：mimo-v2.5-pro

本记录只保留 provider name、model、状态和脱敏错误摘要，不记录 API key。

## 基础验证

- `npm test`：通过，9 files / 43 tests
- `npm run lint`：通过
- `npm run build`：通过

## `/api/models` 观察结果

- HTTP status：200
- mode：real
- models 数量：1
- 可参会模型：
  - provider name：Xiaomi MiMo
  - model：mimo-v2.5-pro
  - status：configured_unverified
  - statusLabel：检测失败
- unavailableProviders 数量：0
- detectedModels：0

补充直连探针：

- `GET {BASE_URL}/models`：401 Unauthorized
- `POST {BASE_URL}/chat/completions`：401 Unauthorized

## `/api/meeting` 观察结果

- HTTP status：502
- 是否成功返回 meeting result：否
- 错误摘要：All providers failed to generate meeting responses.
- 参会模型数量：1
- 是否生成 summary：否
- 是否可以导出 Markdown：否

## failures / hasPartialFailures 观察结果

- 未获得 meeting result
- 未验证到部分失败场景
- 当前是单 provider 鉴权失败，因此表现为整场会议失败

## Markdown 导出观察结果

- 未执行
- 原因：未获得真实会议结果

## 人工备注

- 当前 MiMo provider 配置已被 AI Roundtable 读取。
- `/api/models` 对鉴权失败 provider 返回 `configured_unverified`，随后会议调用尝试失败。
- 真实不可用原因是 provider 返回 401 Unauthorized，建议检查或轮换 API key，确认 key 是否属于当前 Token Plan 区域和 base URL。
- v0.3.6 可以考虑把 401 检测失败从普通 `configured_unverified` 中区分出来，避免明显鉴权失败的 provider 仍被尝试参与会议。

## 安全检查结果

- 未写入任何真实 API key。
- 未输出 Authorization header。
- 未输出 Bearer token。
- 未记录第三方完整错误体。
- 未提交 `.env.local`。
- 未写入真实用户隐私内容。
