# AI Roundtable

> 多模型圆桌会议系统。输入一个议题，让多个 AI 模型按阶段独立发言、互相回应，并整理出可复盘的共识、分歧、证据限制与下一步。

当前版本：`v0.6.8`

AI Roundtable 的目标不是把模型伪装成固定专家或部门，而是让它们以平等参会者的方式讨论同一个问题。系统提供三阶段会议、联网 Evidence、本地资料、引用检查、Markdown 导出、历史会议和会后复盘，帮助用户看见不同模型的判断路径。

## 适合做什么

- 快速获得复杂问题的多角度判断。
- 比较不同模型在同一议题下的推理方式和表达重点。
- 围绕网页资料、本地文档或联网搜索结果组织讨论。
- 生成可复制、可归档、可继续加工的会议纪要。
- 在产品、研究、学习、写作或决策前做一次结构化头脑风暴。

## 核心体验

### 三阶段圆桌会议

1. **独立观点**：每个模型先不受其他发言影响，独立表达看法。
2. **自由回应**：模型阅读前一阶段发言后，补充、质疑或修正观点。
3. **共识整理**：系统汇总讨论共识、真实分歧、风险点、证据限制与下一步。

### 联网 Evidence 链路

启用联网搜索后，系统会先广搜候选资料，再精选 Evidence Pack：

- Candidate Retrieval：广泛召回候选资料，深度搜索目标约 60 条候选。
- Evidence Selection：从候选中筛选 8-12 条更适合会议引用的资料。
- Evidence Judge：按直接证据、辅助证据、背景资料和被降级资料分区。
- Low-Evidence Mode：资料不足以支撑强结论时，会明确提示证据限制。
- Citation Check：会议结束后检查正文引用是否有效，区分可引用资料、降级资料和无效引用。

### 资料与本地文件

你可以手动导入本地资料，也可以让系统联网搜索资料。资料会统一编号为 `S1`、`S2`、`S3` 等，供模型在讨论中引用。

文件只发送到本地解析接口提取文本，不保存原文件。

### 会后复盘

会议完成后，结果页会按“复盘总览 → 模型对照 → 第三阶段总结 → 证据/引用状态 → 原始发言记录”的顺序展示，方便先看结论，再追溯每个模型的观点变化。

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

### 3. 配置真实模型

复制环境变量示例：

```bash
copy .env.example .env.local
```

在 `.env.local` 中开启真实模式，并配置 OpenAI-compatible 服务：

```env
AI_ROUNDTABLE_MODE=real
AI_ROUNDTABLE_PROVIDERS_JSON='[
  {
    "id": "deepseek",
    "name": "DeepSeek V4 Pro",
    "baseUrl": "https://api.deepseek.com",
    "apiKey": "你的 API key",
    "model": "deepseek-v4-pro"
  }
]'
```

AI Roundtable 使用 OpenAI-compatible Chat Completions 接口，因此可以接入 OpenAI、DeepSeek、Qwen、SiliconFlow、Kimi 或其他兼容服务。

真实 API key 只应写在 `.env.local`，不要提交到 GitHub。

## 启用联网搜索

联网搜索使用 Tavily。配置：

```env
TAVILY_API_KEY=你的 Tavily key
```

界面中可以调整搜索地区、搜索强度，并选择一个已接入模型作为搜索驱动模型。若 Tavily 官网搜索正常，但应用内搜索质量异常，优先检查：

- `.env.local` 是否被当前 Next.js 进程正确加载。
- Evidence Debug 中的实际 query、pass stats、Tavily 参数和候选数。
- 是否命中了 Low-Evidence Mode，即“已广搜候选但直接证据不足”。
- `npm run test:live-search` 的真实 Tavily smoke test 输出。

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

该命令会消耗 Tavily 额度，因此不放入默认 `verify`。

## v0.6.8 架构治理

本版重点是拆分首页主入口，保持用户可见行为不变：

- `src/app/page.tsx` 保留页面状态、会议启动/停止、实时事件和历史记录编排。
- `src/components/roundtable/MeetingSetupView.tsx` 承担会议创建页布局。
- `src/components/roundtable/MeetingSetupPanels.tsx` 承担资料、模型选择、历史会议等展示面板，以及从原页面抽出的纯 helper。
- `src/app/home-types.ts` 集中首页局部类型和 localStorage key。
- `src/app/home-helpers.test.ts` 与 `src/app/page-architecture.test.ts` 保护拆分后的 payload、校验逻辑和入口体积。

本轮不改变会议三阶段流程、联网搜索核心逻辑、provider 失败处理或公开 API wire shape。

## 项目原则

AI Roundtable 是面向普通用户的圆桌会议产品，不是开发者调试工具。复杂搜索和证据信息可以保留在调试结构、日志或可展开区域中，但默认体验应服务于：快速输入议题、选择模型、开会、得到清晰结论。
