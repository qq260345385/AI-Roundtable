# AI Roundtable 设计说明

## 产品定位

AI Roundtable 是一个多大模型圆桌会议系统。它不把模型伪装成固定专家，也不把多个模型改造成传统 multi-agent 里的任务代理。

产品核心假设是：不同大模型本身就有不同能力、风格、训练背景和推理倾向。系统应该让它们作为平等参会者，在同一个会议流程里独立表达、互相回应，并最终形成可复制的会议纪要。

## 当前版本边界

当前版本已经进入真实模型和联网资料链路阶段：

- 使用 Next.js App Router、TypeScript 和 Tailwind CSS。
- 使用本地系统字体栈，不依赖 Google Fonts 网络拉取，保证离线构建稳定性。
- 支持 MockProvider，也支持 OpenAI-compatible 真实 provider。
- 支持 Tavily 联网搜索、本地资料导入、Evidence Pack、引用检查和 Markdown 导出。
- 不使用数据库，会议历史默认保存在浏览器本地。
- 不引入复杂状态管理库。

## 参会模型

参会模型是模型席位，不是固定角色。字段集中定义在 `src/lib/types.ts`，包括：

- `id`
- `name`
- `provider`
- `model`
- `status`
- `capabilities`

这些字段描述“哪个模型在参会”和“它支持哪些输入能力”，不描述“它被分配了什么职责”。

## 会议流程

会议流程放在 `src/lib/meeting/engine.ts`。

1. **独立观点**：每个模型先独立发表对议题的看法。
2. **自由回应**：每个模型阅读其他模型观点后，自由补充、质疑、反驳或延展。
3. **共识整理**：总结模型整理讨论共识、真实分歧、资料可确认事实、证据不足判断、风险点和下一步建议。

模型调用失败、超时、空输出、截断输出和 provider 拒绝不会进入正常发言。第一阶段有效模型少于 2 个时，会跳过第二阶段和正常总结。

## 联网 Evidence 链路

联网搜索由 `src/lib/search/model-driven-web-search.ts` 编排，目标是先广搜候选资料，再精选 Evidence Pack。

1. **Topic Analyzer**：清洗讨论壳，提取目标实体、目标场景、evidenceNeeds、comparisonAxes 和短 query。
2. **Candidate Retrieval**：执行 general、official、localized media、reputable media、industry report、social clue、targeted retry 等 pass，深度搜索目标候选数为 60。
3. **Fallback**：候选不足、零结果或 direct/supporting 不足时继续扩展 query，不因已有少量结果提前停止。
4. **Evidence Selection**：Evidence Judge 只负责把候选分为 direct/core、supporting、background、discard，并精选 8-12 条资料进入 Evidence Pack。
5. **Low-Evidence Mode**：如果已广搜但直接证据不足，会议仍可继续，但总结必须区分模型推理共识和资料可确认事实。
6. **Citation Check**：会议结束后检查正文引用，区分存在资料、可引用资料、降级资料引用和无效引用。

搜索调试数据保存在 `SearchProcess` 中，包括 pass stats、Tavily 参数、候选数、去重数、fallback 原因、Top raw candidates 和资料质量概览。普通用户界面默认保持简洁，调试细节放在可展开区域。

## MockProvider

`src/lib/providers/mock-provider.ts` 仍用于无 API key 的本地演示和自动化测试。它不会假装真实模型之间已经有真实能力差异，也不会给模型添加固定职责。

MockProvider 可以模拟模型个体表达倾向，例如更结构化、更关注边界、更偏工程落地等。这些倾向只用于演示会议流程，不代表任务分工。

## UI 原则

AI Roundtable 是面向普通用户的圆桌会议产品，不是开发者调试工具。

- 首页优先服务“输入议题、选择模型、开始会议、得到结论”的核心流程。
- 复杂搜索数据放在内部结构、测试、日志或显式调试区域，不默认打断普通用户。
- 参会席位展示模型名称、provider、model、当前状态和必要能力提示。
- 页面组件只负责展示，会议流程逻辑保留在 `src/lib/meeting/engine.ts`，搜索流程逻辑保留在 `src/lib/search`。
