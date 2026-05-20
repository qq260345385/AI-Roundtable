# Security

AI Roundtable 支持 OpenAI-compatible API，因此安全处理 API key 很重要。

## API key 安全

- 不要提交 `.env.local`。
- 不要提交任何 API key。
- 不要在 issue、PR、截图、日志或示例文件里贴真实 key。
- 不要把 API key 写进前端代码。
- 不要把包含 API key 的终端输出复制到公开讨论中。

## 会议示例脱敏

真实模型会议示例需要脱敏后再保存到 `examples`：

- 移除 API key。
- 移除账号信息。
- 移除内部地址。
- 移除私密问题。
- 移除敏感输出。

## 如果 API key 泄露

如果发现 API key 已经泄露：

1. 立即到对应 provider 后台撤销这个 key。
2. 重新生成新的 key。
3. 检查提交历史、issue、PR、截图和日志。
4. 如果 key 进入 Git 历史，按平台建议清理历史并轮换所有相关凭证。

## 报告安全问题

如果发现安全问题，请不要在公开 issue 中粘贴敏感信息。请先用脱敏描述说明影响范围和复现步骤。
