# AI Roundtable

> 多模型圆桌会议系统。输入一个议题，让多个 AI 模型独立发言、互相回应，并整理出可复盘的共识、分歧、证据限制与下一步。

当前版本：`v0.7.0`

AI Roundtable 的定位不是把模型伪装成固定专家或部门，而是让不同模型作为平等参会者讨论同一个问题。它适合在产品判断、研究学习、写作准备、方案评估和复杂决策前，快速组织一次结构化的多模型讨论。

## 快速体验路径

1. 输入一个你想讨论的议题。
2. 选择 2 个或更多参会模型。
3. 可选：导入本地资料，或开启 Tavily 联网搜索。
4. 开始会议，等待模型完成三阶段讨论。
5. 在会后复盘中查看阶段推进、模型对照、总结、证据状态和原始发言。

默认 `mock` 模式不需要 API key，适合本地体验流程。接入真实模型后，可以切换到 `real` 模式。

## 核心能力

### 三阶段圆桌会议

- **独立观点**：每个模型先独立表达，不受其他模型影响。
- **自由回应**：模型阅读前一阶段发言后补充、质疑或修正观点。
- **共识整理**：系统汇总讨论共识、真实分歧、风险点、证据限制与下一步。

### 联网 Evidence

启用联网搜索后，系统会先广搜候选资料，再精选 Evidence Pack：

- 深度搜索会尽量召回更多候选资料，而不是找到少量结果就停止。
- Evidence Pack 会区分直接证据、辅助证据、背景资料和被降级资料。
- 资料不足以支撑强结论时，会进入 Low-Evidence Mode 并明确提示证据限制。
- 会议结束后会检查正文引用，区分可引用资料、降级资料和无效引用。

### 本地资料

你可以导入本地资料作为会议上下文。资料会统一编号为 `S1`、`S2`、`S3` 等，供模型在讨论中引用。

本地文件只发送到本机解析接口提取文本，不保存原文件。

### 会后复盘

会议完成后，结果页按“复盘总览 -> 模型对照 -> 第三阶段总结 -> 证据/引用状态 -> 原始发言记录”的顺序展示。你可以先看结论，再追溯每个模型的观点变化和缺席/失败情况。

### 导出与历史

- 会议结果可复制为 Markdown，方便归档或继续加工。
- 历史会议保存在浏览器本地，便于回看和复用。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

### 3. 配置环境变量

复制环境变量示例：

```bat
copy .env.example .env.local
```

PowerShell 也可以使用：

```powershell
Copy-Item .env.example .env.local
```

`.env.local` 只保存在本地，不要提交真实 API key。

## 接入真实模型

默认配置为：

```env
AI_ROUNDTABLE_MODE=mock
```

要使用真实模型，请在 `.env.local` 中切换为 `real`，并配置 OpenAI-compatible provider：

```env
AI_ROUNDTABLE_MODE=real
AI_ROUNDTABLE_PROVIDERS_JSON='[
  {
    "id": "deepseek",
    "name": "DeepSeek Flash",
    "baseUrl": "https://api.deepseek.com",
    "apiKey": "your-api-key",
    "model": "deepseek-v4-flash",
    "capabilities": ["documents"]
  },
  {
    "id": "kimi",
    "name": "Kimi K2.6",
    "baseUrl": "https://api.moonshot.cn/v1",
    "apiKey": "your-api-key",
    "model": "kimi-k2.6"
  }
]'
```

AI Roundtable 使用 OpenAI-compatible Chat Completions 接口，因此可以接入 OpenAI、DeepSeek、Qwen、SiliconFlow、Kimi 或其他兼容服务。

如果某个 provider 的 `/models` 检测失败，但基础配置完整，系统可能仍会把它标记为 `configured_unverified` 并尝试按配置调用。这个状态表示“检测失败 / 未验证”，不等于“已连接成功”。

## 启用联网搜索

联网搜索使用 Tavily。在 `.env.local` 中配置：

```env
TAVILY_API_KEY=your-tavily-key
```

界面中可以调整搜索地区、搜索强度，并选择一个已接入模型作为搜索驱动模型。

如果 Tavily 官网搜索正常，但应用内搜索质量异常，优先检查：

- `.env.local` 是否被当前 Next.js 进程正确加载，修改后是否重启了开发服务。
- Evidence Debug 中的实际 query、pass stats、Tavily 参数、候选数和 `searchHealth` 诊断。
- 是否命中了 Low-Evidence Mode，也就是“已广搜候选但直接证据不足”。
- `npm run test:live-search` 的真实 Tavily smoke test 输出。

更多搜索链路和诊断设计见 `docs/design.md`。

## 常用命令

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run verify
```

`npm run verify` 会串联测试、类型检查、lint 和 build，是提交或发布前的推荐验收入口。

可选真实搜索 smoke test：

```bash
npm run test:live-search
```

该命令默认使用 deep 搜索模式，会消耗 Tavily 额度，因此不放入默认 `verify`。

## 项目结构

- `src/app`：Next.js App Router 页面与 API 路由。
- `src/components/roundtable`：会议创建、会议进行中和会后复盘相关组件。
- `src/lib/meeting`：三阶段会议流程与模型调用编排。
- `src/lib/search`：联网搜索、Evidence Pack、引用检查和搜索诊断。
- `docs/design.md`：产品定位、架构边界和搜索链路设计说明。

## 近期更新摘要

- `v0.6.8`：拆分首页主入口，让页面编排、设置面板和 helper 更容易维护。
- `v0.6.9`：拆分联网搜索编排，将 query planning、pass runner、fallback 和 debug summary 模块化。
- `v0.7.0`：统一会议搜索和独立资料搜索入口，补充 `searchHealth` 诊断与真实 Tavily smoke test 输出。

## 项目原则

AI Roundtable 是面向普通用户的圆桌会议产品，不是默认展示复杂调试信息的开发者工具。复杂搜索和证据信息可以保留在调试结构、日志或可展开区域中，但默认体验应服务于：快速输入议题、选择模型、开会、得到清晰结论。
