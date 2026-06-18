# AI Roundtable

> 多模型圆桌会议系统。输入一个议题，让多个 AI 模型按阶段独立发言、互相回应，并整理出清晰的共识、分歧与下一步。

当前版本：`v0.6.6`

AI Roundtable 的目标不是把模型伪装成固定专家或部门，而是让它们以平等参会者的方式讨论同一个问题。系统提供会议流程、资料包、联网搜索、引用检查和 Markdown 导出，让用户更容易看见不同模型的判断路径。

## 适合做什么

- 快速获得一个复杂问题的多角度判断。
- 比较不同模型在同一议题下的推理方式和表达重点。
- 围绕网页资料、本地文档或联网搜索结果组织讨论。
- 生成可复制、可归档、可继续加工的会议纪要。
- 在产品、研究、学习、写作或决策前做一次结构化头脑风暴。

## 核心体验

### 三阶段圆桌会议

1. **独立观点**：每个模型先不受其他发言影响，独立表达看法。
2. **自由回应**：模型阅读前一阶段发言后，补充、质疑或修正观点。
3. **共识整理**：系统汇总讨论共识、真实分歧、风险点与下一步。

### 联网 Evidence 链路

启用联网搜索后，系统会先广搜候选资料，再精选 Evidence Pack：

- Candidate Retrieval：广泛召回候选资料，深度搜索目标约 60 条候选。
- Evidence Selection：从候选中筛选 8-12 条更适合会议引用的资料。
- Evidence Judge：按直接证据、辅助证据、背景资料和被降级资料分区。
- Low-Evidence Mode：如果资料不足以支撑强结论，会明确提示证据限制。
- Citation Check：会议结束后检查正文引用是否有效，区分可引用资料和降级资料。

### 资料与本地文件

你可以手动导入本地资料，也可以让系统联网搜索资料。资料会统一编号为 `S1`、`S2`、`S3` 等，供模型在讨论中引用。

文件只发送到本地解析接口提取文本，不保存原文件。

### 界面与交互

- 中文优先的轻量圆桌会议界面。
- 支持中英文界面切换。
- 可选择参会模型、总结模型和联网搜索驱动模型。
- 支持简要会议模式。
- 支持圆桌席位拖拽调整。
- 支持历史会议本地保存与重新打开。
- 支持会议纪要 Markdown 一键复制。

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
  },
  {
    "id": "kimi",
    "name": "Kimi K2.6",
    "baseUrl": "https://api.moonshot.cn/v1",
    "apiKey": "你的 API key",
    "model": "kimi-k2.6"
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

搜索偏好可以在界面中调整：

- 搜索地区：自动、全球、中国、美国、欧洲、日本、韩国。
- 搜索强度：标准搜索或深度搜索。
- 搜索驱动模型：可选择一个已接入模型生成搜索方向。

如果 Tavily 官网搜索正常，但应用内搜索质量异常，优先检查：

- Evidence Debug 中实际发送的 query 是否过长、重复或含残片。
- 搜索 pass 是否被跳过。
- `rawCandidateCount` / `uniqueCandidateCount` 是否达到预期。
- Evidence Pack 中是否没有可引用的 direct/supporting 资料。
- Low-Evidence Mode 是否被触发。

## 常用命令

```bash
npm run dev
```

启动本地开发服务。

```bash
npm test
```

运行自动化测试。

```bash
npx tsc --noEmit
```

执行 TypeScript 类型检查。

```bash
npm run lint
```

检查代码风格。

```bash
npm run build
```

生成生产构建。

如果构建在 `next/font/google` 拉取 `Geist` 或 `Geist Mono` 时失败，通常是本地网络无法访问 Google Fonts。该问题与业务代码无关，可以在网络恢复后重试，或后续改为本地字体方案。

## 使用提醒

AI Roundtable 可以帮助整理思路，但它不是事实裁判。

以下内容务必人工核验：

- 最新新闻。
- 价格、估值、融资额、营收。
- 法律、政策、监管结论。
- 医疗、金融、投资建议。
- 公司内部信息或未经证实的传闻。

如果会议出现低证据提示，说明当前资料不足以支撑强结论。此时纪要应被看作讨论草稿，而不是最终事实报告。

## 隐私与安全

- 不要提交 `.env.local`。
- 不要把 API key 写进 README、Issue、PR、截图或示例文件。
- 真实会议记录公开分享前应先脱敏。
- 联网搜索和模型调用都发生在服务端，API key 不会返回给前端。
- 如果发现 key 泄露，请立即撤销并重新生成。

更多安全说明见 [SECURITY.md](SECURITY.md)。

## 项目状态

AI Roundtable 仍处于早期快速迭代阶段，核心会议流程已经可运行。

当前重点：

- 提升联网搜索候选召回与 Evidence Pack 精选质量。
- 改善中文议题、本地资料和中文办公场景的识别。
- 让低证据模式、引用纪律和资料质量提示更诚实。
- 优化普通用户可见界面，隐藏不必要的调试复杂度。
- 继续完善真实模型失败、超时、截断和空输出处理。

## 开发者参考

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CHANGELOG.md](CHANGELOG.md)
- [docs/design.md](docs/design.md)
- [docs/frontend-manual-checklist.md](docs/frontend-manual-checklist.md)
- [docs/real-model-smoke-test.md](docs/real-model-smoke-test.md)
- [docs/evaluation-notes.md](docs/evaluation-notes.md)

## License

本项目使用 [MIT License](LICENSE)。
