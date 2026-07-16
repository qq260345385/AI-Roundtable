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
3. **共识整理**：总结模型整理讨论共识、真实分歧、资料可确认事实、证据不足判断、风险点、下一步建议和结构化决策简报。

模型调用失败、超时、空输出、截断输出和 provider 拒绝不会进入正常发言。第一阶段有效模型少于 2 个时，会跳过第二阶段和正常总结。

## 规范化总结与决策简报

`src/lib/meeting/summary-finalization.ts` 是标准会议与实时会议共享的唯一最终总结路径。处理顺序固定为：Evidence 质量门控 → 决策简报兼容归一化 → 对发言及全部总结字段做引用检查 → 决策质量降级。

`MeetingSummary.decisionBrief` 在 API 和历史存储边界保持可选，以兼容旧记录；进入完成态展示、导出或历史回看时会归一化为完整九字段结构。质量门控只允许降低建议强度，不会把低证据或失败会议提升为确定结论。参会模型不足时使用 `unavailable / low`，而不是生成看似可执行的推荐。

完成页层级固定为：推荐结论 → 状态与置信度 → 理由/条件/风险/证据缺口/推翻条件 → 一个下一步行动。共识、分歧、阶段复盘、Evidence、引用检查、失败记录和搜索调试信息保留在“详细过程与依据”及三个会议阶段中。

## 联网 Evidence 链路

联网搜索由 `src/lib/search/model-driven-web-search.ts` 作为公开入口编排，目标是先广搜候选资料，再精选 Evidence Pack。v0.6.9 起，query planning、pass 执行、fallback / extract rescue 和 debug 汇总拆到独立内部模块，公开 API 和 SearchProcess wire shape 保持不变。v0.7.0 起，会议搜索和 `/api/evidence/search` 共享同一套搜索规划与 fallback 链路，避免不同入口产生不同 query 策略。

1. **Topic Analyzer**：清洗讨论壳，提取目标实体、目标场景、evidenceNeeds、comparisonAxes 和短 query。
2. **Candidate Retrieval**：执行 general、official、localized media、reputable media、industry report、social clue、targeted retry 等 pass，深度搜索目标候选数为 60。
3. **Fallback**：候选不足、零结果或 direct/supporting 不足时继续扩展 query，不因已有少量结果提前停止。
4. **Evidence Selection**：Evidence Judge 只负责把候选分为 direct/core、supporting、background、discard，并精选 8-12 条资料进入 Evidence Pack。
5. **Low-Evidence Mode**：如果已广搜但直接证据不足，会议仍可继续，但总结必须区分模型推理共识和资料可确认事实。
6. **Citation Check**：会议结束后检查正文引用，区分存在资料、可引用资料、降级资料引用和无效引用。

搜索调试数据保存在 `SearchProcess` 中，包括 pass stats、Tavily 参数、候选数、去重数、fallback 原因、Top raw candidates、资料质量概览和 `searchHealth` 诊断。`searchHealth` 只回答“是否有 API key、是否调用 Tavily、query 是否异常、候选是否不足、是否被 Evidence Judge 过滤过多”等排查问题。普通用户界面默认保持简洁，调试细节放在可展开区域。

## MockProvider

`src/lib/providers/mock-provider.ts` 仍用于无 API key 的本地演示和自动化测试。它不会假装真实模型之间已经有真实能力差异，也不会给模型添加固定职责。

MockProvider 可以模拟模型个体表达倾向，例如更结构化、更关注边界、更偏工程落地等。这些倾向只用于演示会议流程，不代表任务分工。

## UI 原则

AI Roundtable 是面向普通用户的圆桌会议产品，不是开发者调试工具。

- 首页优先服务“输入议题、选择模型、开始会议、得到结论”的核心流程。
- 桌面首页默认只突出议题输入、开始按钮和已选模型；搜索、资料、简要模式与总结模型收在“更多设置”中。
- 完成页默认先显示决策简报，过程追溯信息默认折叠，但不得丢失。
- 复杂搜索数据放在内部结构、测试、日志或显式调试区域，不默认打断普通用户。
- 参会席位展示模型名称、provider、model、当前状态和必要能力提示。
- 页面组件只负责展示，会议流程逻辑保留在 `src/lib/meeting/engine.ts`，搜索流程逻辑保留在 `src/lib/search`。
