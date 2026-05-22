# AI Roundtable

AI Roundtable 是一个“多大模型圆桌会议系统”的第一版原型。

它不是普通聊天机器人，也不是传统 multi-agent 框架。项目不会让一个模型扮演多个角色，也不会给多个模型强行分配任务。它的核心是让不同大模型作为平等参会者，在同一个会议流程里自由讨论、互相质疑、互相补充，并最终形成会议纪要。

当前版本优先打通结构和流程。v0.2 开始保留 `MockProvider`，同时新增服务端 OpenAI-compatible API 接入层。项目仍然不使用数据库、登录、用户系统、复杂状态管理或流式输出。

## Preview

预览图和演示素材目录：[docs/assets](docs/assets)。

当前仓库暂未提交正式预览图。添加 `docs/assets/preview.png` 前请确认图片不包含 API key、账号信息或私密问题。

## Project Status

当前版本：`v0.5.1 internal alpha`

项目处于 internal alpha / pre-release 阶段，暂不建议打 tag 或写 GitHub Release。当前重点是验证“平等多模型圆桌会议”的前后端核心体验和真实模型讨论质量。

版本记录请看 [CHANGELOG.md](CHANGELOG.md)。

## Features

- 平等模型席位，不使用固定角色分工。
- Mock 模式默认可用，便于开发和回归测试。
- OpenAI-compatible provider 接入层。
- `/api/models` provider 可用性检查。
- `/api/meeting` 服务端会议创建。
- 三阶段会议流程：独立观点、自由回应、共识整理。
- 会议结果 Markdown 导出。
- 时效性议题事实核验提示，避免模型把过期知识包装成最新事实。
- 多格式本地文档 Evidence Pack / 资料包导入与资料预览，所有参会模型基于同一份资料讨论并按 `[S1]` 引用；当前支持“原生附件优先”的输入意图，并会根据 provider 能力显示实际投递方式，必要时回退为长文本资料包。
- ????????????????????????????? Tavily ?????????????? Evidence Pack ???????????????????????????????
- 参会模型列表会提示 provider 声明的文档/图片能力；未知能力不会被误显示为“不支持”。
- provider 文档/图片/原生附件能力支持通过 `.env.local` 显式声明，避免依赖特定模型白名单。
- Evidence Citation Guard 引用检查，识别模型是否编造了资料包之外的引用编号。
- 右上角支持中文 / English 界面语言直接切换，并保存在本地浏览器。
- 可手动启用简要会议模式，让各模型发言和自由回应尽量保持在 150 字左右。
- 点击开始后立即进入独立会议室界面，左侧显示参会议员和实时状态，中间按阶段陆续展示已完成的模型发言。
- 发言级实时会议流：每个模型完成一段发言后立即显示；当前版本不是 token 级逐字流式输出。
- Mock 和 real 会议示例保存约定。

## Safety Notes

- 不要提交 `.env.local`。
- 不要提交 API key。
- 不要在 issue、PR、截图或示例里贴真实 key。
- 真实模型会议示例需要先脱敏。
- 如果发现 key 泄露，应立即撤销并重新生成。

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- Vitest
- MockProvider
- OpenAI-compatible Chat Completions API

## Quick Start

安装依赖：

```bash
npm install
```

默认使用 Mock 模式，不需要配置 API key：

```bash
npm run dev
```

打开浏览器访问：

```text
http://localhost:3000
```

如需调用真实模型，先复制示例环境变量：

```bash
copy .env.example .env.local
```

然后只在 `.env.local` 中填写真实 API key 和模型名。不要把真实 API key 写入 `.env.example`。

运行测试：

```bash
npm test
```

检查代码：

```bash
npm run lint
```

生产构建：

```bash
npm run build
```

## Environment Variables

项目通过服务端环境变量切换 mock / real provider 模式。Mock 模式不需要 API key，也不代表真实 API 已配置。真实 API key 只应放在本地 `.env.local`，不应提交到仓库，也不应写入 `.env.example`。

`AI_ROUNDTABLE_MODE` 控制运行模式：

```env
AI_ROUNDTABLE_MODE=mock
```

- `mock`：默认模式，不调用外部模型，适合本地开发、测试和演示。
- `real`：启用真实 provider 配置，通过服务端 API route 调用 OpenAI-compatible Chat Completions API。
- 其他值会按 mock 模式处理。

推荐使用通用 OpenAI-compatible provider 配置：

| 变量名 | 用途 |
| --- | --- |
| `AI_ROUNDTABLE_MODE` | `mock` 或 `real`。只有值为 `real` 时才启用真实 provider。 |
| `AI_ROUNDTABLE_PROVIDER_IDS` | real 模式下要读取的 provider id 列表，例如 `openai,deepseek,qwen,siliconflow`。 |
| `AI_ROUNDTABLE_PROVIDER_<ID>_NAME` | provider 显示名称，例如 `OpenAI` 或 `SiliconFlow`。 |
| `AI_ROUNDTABLE_PROVIDER_<ID>_BASE_URL` | OpenAI-compatible base URL。 |
| `AI_ROUNDTABLE_PROVIDER_<ID>_API_KEY` | provider API key，只能写入 `.env.local`。 |
| `AI_ROUNDTABLE_PROVIDER_<ID>_MODEL` | 会议实际使用的模型名。 |
| `AI_ROUNDTABLE_PROVIDER_<ID>_CAPABILITIES` | 可选能力列表，例如 `documents,images,native_files`。只把列出的能力标记为支持，未列出的能力保持未知。 |
| `AI_ROUNDTABLE_PROVIDER_<ID>_SUPPORTS_DOCUMENTS` | 可选，显式声明是否支持文档识别：`true` 或 `false`。 |
| `AI_ROUNDTABLE_PROVIDER_<ID>_SUPPORTS_IMAGES` | 可选，显式声明是否支持图片识别：`true` 或 `false`。 |
| `AI_ROUNDTABLE_PROVIDER_<ID>_SUPPORTS_NATIVE_FILES` | 可选，显式声明当前项目 adapter 是否支持原生文件附件投递：`true` 或 `false`。 |

`<ID>` 来自 `AI_ROUNDTABLE_PROVIDER_IDS`，会转成大写后拼接环境变量前缀。例如 `siliconflow` 对应 `AI_ROUNDTABLE_PROVIDER_SILICONFLOW_API_KEY`。

每个真实 provider 至少需要配置 `BASE_URL`、`API_KEY` 和 `MODEL`。服务端会调用 `{BASE_URL}/models` 做可用性检测，不会把 API key 返回给前端。

能力声明只影响 UI 提示和资料投递计划，不会让系统自动获得某个 provider 私有的文件上传协议。尤其是 `SUPPORTS_NATIVE_FILES=true` 只应在当前项目的 adapter 确实能把原始文件作为附件发送给该 provider 时启用；否则应保持 `false` 或未知，让系统回退到长文本资料包。

旧版 `OPENAI_API_KEY`、`DEEPSEEK_API_KEY`、`QWEN_API_KEY` 等变量仍然兼容，但推荐新配置方式。OpenAI / DeepSeek / Qwen 只是示例，不是唯一支持的 provider。

可选联网资料包使用 Tavily Search API。Tavily key 只应写入 `.env.local`，不会返回给前端，也不会进入会议 prompt：

| 变量名 | 用途 |
| --- | --- |
| `TAVILY_API_KEY` | 可选。配置后启用服务端 Tavily 联网搜索，用于生成统一 Evidence Pack。 |
| `TAVILY_MAX_RESULTS` | 可选。Tavily 候选搜索结果数，默认最多抓取 20 条候选；系统会按资料质量筛选，最多保留 10 条进入会议。 |
| `TAVILY_SEARCH_DEPTH` | 可选。默认 `basic`。可按 Tavily 账户能力调整。 |
| `TAVILY_TOPIC` | 可选。默认 `general`，也可设为 `news` 或 `finance`。 |
| `SEARCH_PROVIDER` | 可选。默认 `tavily`。当前内置 Tavily provider，后续可扩展 Brave、SerpAPI、秘塔、Qwen Search 等 provider。普通用户无需理解或选择 provider。 |
| `SEARCH_DEBUG_ENABLED` | 仅限本地开发。设为 `true` 且 `NODE_ENV !== "production"` 时，会议 API 才会返回完整联网搜索调试信息。生产环境不要开启。 |

联网搜索会在服务端做本地内存缓存、URL 规范化、重复 URL 合并和同域名数量限制。这些都属于后台优化，默认 UI 只展示简洁联网状态，不展示缓存命中、去重原因或同域限制细节。完整统计仅在本地开发调试模式的 `debugSearchProcess` 和 `npm run test:live-search` 输出中可见。本地内存缓存会在服务重启后清空。

## Provider Configuration

### Mock 模式

Mock 模式是默认模式：

```env
AI_ROUNDTABLE_MODE=mock
```

Mock 模式会继续使用：

- GPT Mock
- Claude Mock
- Gemini Mock
- DeepSeek Mock

Mock 模型在页面中会显示为 `Mock / 无需 API`。这只表示模拟模型可用，不表示真实 API 已经配置。

### real 模式

先复制示例环境变量：

```bash
copy .env.example .env.local
```

然后在 `.env.local` 中配置需要启用的 provider：

```env
AI_ROUNDTABLE_MODE=real
AI_ROUNDTABLE_PROVIDER_IDS=openai,siliconflow

AI_ROUNDTABLE_PROVIDER_OPENAI_NAME=OpenAI
AI_ROUNDTABLE_PROVIDER_OPENAI_BASE_URL=https://api.openai.com/v1
AI_ROUNDTABLE_PROVIDER_OPENAI_API_KEY=你的 key
AI_ROUNDTABLE_PROVIDER_OPENAI_MODEL=你的模型名

AI_ROUNDTABLE_PROVIDER_SILICONFLOW_NAME=SiliconFlow
AI_ROUNDTABLE_PROVIDER_SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
AI_ROUNDTABLE_PROVIDER_SILICONFLOW_API_KEY=你的 key
AI_ROUNDTABLE_PROVIDER_SILICONFLOW_MODEL=你的模型名
```

OpenAI / DeepSeek / Qwen 示例也使用同样的 OpenAI-compatible Chat Completions 方式：

```env
AI_ROUNDTABLE_PROVIDER_IDS=openai,deepseek,qwen

AI_ROUNDTABLE_PROVIDER_DEEPSEEK_NAME=DeepSeek
AI_ROUNDTABLE_PROVIDER_DEEPSEEK_BASE_URL=https://api.deepseek.com
AI_ROUNDTABLE_PROVIDER_DEEPSEEK_API_KEY=
AI_ROUNDTABLE_PROVIDER_DEEPSEEK_MODEL=
AI_ROUNDTABLE_PROVIDER_DEEPSEEK_CAPABILITIES=documents
AI_ROUNDTABLE_PROVIDER_DEEPSEEK_SUPPORTS_IMAGES=false
AI_ROUNDTABLE_PROVIDER_DEEPSEEK_SUPPORTS_NATIVE_FILES=false

AI_ROUNDTABLE_PROVIDER_QWEN_NAME=Qwen
AI_ROUNDTABLE_PROVIDER_QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_ROUNDTABLE_PROVIDER_QWEN_API_KEY=
AI_ROUNDTABLE_PROVIDER_QWEN_MODEL=
```

如果某个 provider 没有 API key、base URL 或模型名，系统会把它显示为未配置。real 模式下如果没有任何可用 provider，页面会禁用开始会议按钮，并提示检查 `.env.local`。

真实模型调用只发生在服务端 API route 中，API key 不会传给前端。

### provider 可用性检查

`GET /api/models` 会返回当前可用模型，以及被跳过或未启用的 provider：

```json
{
  "mode": "real",
  "models": [],
  "unavailableProviders": [
    {
      "id": "openai",
      "name": "OpenAI",
      "provider": "OpenAI",
      "status": "unconfigured",
      "statusLabel": "未配置",
      "reason": "missing AI_ROUNDTABLE_PROVIDER_OPENAI_API_KEY"
    }
  ]
}
```

这些信息只包含安全字段，不会返回 API key。

real 模式下，如果没有任何可用 provider：

- `GET /api/models` 会返回空 `models`，并在 `unavailableProviders` 中说明跳过原因。
- `POST /api/meeting` 会返回清晰错误。
- 如果会议中只有部分 provider 调用失败，系统会尽量保留其他模型的成功发言，并在页面和 Markdown 中显示“模型调用失败记录”。

provider 状态包括：

- `available` / `已连接`：配置完整，且 `{BASE_URL}/models` 返回中包含配置的模型。
- `detected` / `已检测`：检测到模型列表，但还没有配置 `MODEL`，不能参与会议。
- `model_not_found` / `模型未找到`：配置的 `MODEL` 不在检测到的模型列表中。
- `configured_unverified` / `检测失败`：配置完整，但 `{BASE_URL}/models` 无法验证；当前策略可能仍会尝试调用该 provider，以兼容 `/models` 不标准的 OpenAI-compatible 服务。这个状态不代表连接已验证成功，UI 也不会显示为“已连接”或“可用”。
- `unconfigured` / `未配置`：缺少 API key、base URL 或 model。

手动验证真实模型配置请看 [docs/real-model-smoke-test.md](docs/real-model-smoke-test.md)。前端交互验收清单请看 [docs/frontend-manual-checklist.md](docs/frontend-manual-checklist.md)。

## 项目结构

```text
src/
  app/
    api/
      meeting/route.ts       服务端创建会议
      models/route.ts        返回安全的可用模型列表
    page.tsx                 首页，只负责组装数据和展示组件
    layout.tsx               全局页面外壳和 metadata
    globals.css              Tailwind 和全局样式

  components/
    roundtable/
      MeetingBoard.tsx       圆桌会议主展示区
      MeetingHeader.tsx      顶部标题和状态信息
      ParticipantList.tsx    参会模型列表
      RoundtableDiagram.tsx  简单圆桌席位视图
      TranscriptPanel.tsx    会议流程和发言记录
      SummaryPanel.tsx       共识整理

  lib/
    config/
      model-config.ts        从环境变量读取模型配置
    types.ts                 项目主要 TypeScript 类型
    mock-data.ts             第一版演示用会议数据
    meeting/
      engine.ts              会议流程引擎
      engine.test.ts         会议流程测试
    providers/
      mock-provider.ts       Mock 模型提供者
      openai-compatible-provider.ts  OpenAI-compatible provider
      provider-registry.ts   根据运行模式创建 provider
```

## 当前版本的数据流程

1. `src/app/page.tsx` 页面加载时调用 `GET /api/models` 获取当前模式和参会模型。
2. 用户输入问题后，页面调用 `POST /api/meeting/live` 进入实时会议室；旧版 `POST /api/meeting` 仍保留为一次性返回完整会议结果的兼容接口。
3. `src/app/api/meeting/route.ts` 在服务端创建 provider registry，并调用会议引擎。
4. `src/lib/meeting/engine.ts` 按三阶段会议流程组织发言。
5. `src/components/roundtable/*` 只负责展示，不处理 provider 调用逻辑。

## 会议质量验证

当前 internal alpha / pre-release 的目标是观察真实模型圆桌会议的质量，而不是增加复杂功能。页面在会议成功后会显示“复制 Markdown”按钮，可以把会议结果复制成适合保存到 `examples` 的 Markdown。

real 模式下，会议结果可能包含“模型调用失败记录”。这表示部分 provider 在独立观点、自由回应或共识整理阶段调用失败；系统会尽量保留其他模型的成功结果，并给出简短排查建议。

如果议题涉及“最新、当前、排名、价格、版本、政策、新闻”等实时信息，系统会显示事实核验提示。参会模型默认无法联网，相关输出只能作为模型已有知识或推测，不能直接作为最新事实依据。

如需让模型围绕外部资料讨论，可以在首页启用“资料文件”。当前版本支持两类资料来源：本地文档解析，以及可选 Tavily 联网搜索。联网搜索只发生在服务端，搜索 API key 只放在 `.env.local`，不会保存在前端，也不会发送给参会模型。系统会把搜索结果或本地文档统一整理为 Evidence Pack，服务端会重新编号为 `S1`、`S2` 等，会议 prompt 和 Markdown 会保留资料引用。页面会在开始会议前展示资料编号、来源、摘要预览、字符数和解析/截断提示。

会议结果页默认只展示简洁联网状态，例如参考资料数量、较可靠/一般/较弱资料数量，以及是否建议人工核验。`SearchIntent`、`queryPlans`、Tavily 查询词、评分拆解、过滤详情和原始 `searchProcess` 属于内部调试信息，默认不会返回给普通前端，也不会在页面展示。本地开发如需查看完整搜索调试信息，可以设置 `SEARCH_DEBUG_ENABLED=true` 后以非 production 模式启动；生产环境即使误设公开前端变量，也不会因此返回完整 `debugSearchProcess`。

资料文件支持三种输入策略：`优先原生附件`、`长文本资料包`、`自动选择`。由于不同 OpenAI-compatible provider 对“文件附件”的 API 协议并不统一，系统会根据参会 provider 的能力生成实际投递计划：如果 provider 没有声明支持原生文件附件，本次会议会明确显示并回退为长文本资料包，不会假装原文件已经直接发给模型。相比早期版本，文档正文预算已经放宽，不再默认只截取 800 字。扫描版 PDF、图片和旧版 Office 格式暂不解析。

会议结束后，服务端会检查模型输出中的资料编号是否存在于资料包中。例如模型写出 `[S9]` 但资料包只有 `S1`、`S2`，页面和 Markdown 会显示引用检查提醒，方便人工核验。

保存会议示例时请先脱敏，不要提交 API key、账号信息、内部地址、私密问题或敏感输出。

- Mock 示例：[examples/mock-meeting-example.md](examples/mock-meeting-example.md)
- Real 示例占位：[examples/real-meeting-example.md](examples/real-meeting-example.md)
- 质量评估笔记：[docs/evaluation-notes.md](docs/evaluation-notes.md)
- 前端手动验收清单：[docs/frontend-manual-checklist.md](docs/frontend-manual-checklist.md)

### API routes

获取当前可用模型：

```text
GET /api/models
```

创建一次会议：

```text
POST /api/meeting
```

实时创建一次会议并按行返回 NDJSON 事件：

```text
POST /api/meeting/live
```

`/api/meeting/live` 会依次返回 `meeting_started`、`phase_started`、`participant_started`、`turn`、`failure`、`summary`、`meeting_completed` 等事件。前端收到 `turn` 后会立即把该模型发言追加到会议室。

请求体：

```json
{
  "question": "AI Roundtable 应该如何组织多模型讨论？"
}
```

## 会议流程

第一阶段：独立观点

每个模型先独立发表对议题的看法，避免一开始就被其他模型影响。

第二阶段：自由回应

每个模型阅读其他模型观点后，自由补充、质疑、反驳或延展。

第三阶段：共识整理

主持人整理共识、主要分歧、有价值的少数派观点、风险点和下一步建议。

## Mock 模型表达倾向

MockProvider 会模拟不同模型的表达倾向，但这些倾向不是固定职责，也不是任务分工：

- GPT Mock：更结构化，喜欢给出框架和折中方案
- Claude Mock：更关注概念边界、潜在问题和长文本分析
- Gemini Mock：更发散，喜欢连接使用场景和交互体验
- DeepSeek Mock：更关注实现路径、工程复杂度和可落地性

## TypeScript 编写约定

为了方便初学者阅读，本项目会尽量遵守这些规则：

- 类型定义优先集中放在 `src/lib/types.ts`
- 不使用复杂泛型
- 不使用过度抽象的类型工具
- 组件 props 写得直观清楚
- 关键模块保留简短注释
- 优先写能看懂、能维护的代码

## Contributing

参与贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

核心原则：

- 不要把 provider 调用逻辑写到前端。
- 不要破坏 Mock 模式。
- 保持 AI Roundtable 的定位：平等多模型圆桌会议，而不是角色扮演 multi-agent。

## Security

安全说明请阅读 [SECURITY.md](SECURITY.md)。

## License

本项目使用 MIT License，详见 [LICENSE](LICENSE)。

## 下一步可以做什么

- 继续优化真实 AI Provider 调试体验，同时保留 MockProvider 方便回归测试
- 给不同 provider 增加调用状态、错误信息和耗时记录
- 保存会议纪要，方便后续回看和对比
