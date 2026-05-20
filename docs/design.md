# AI Roundtable 设计说明

## 产品定位

AI Roundtable 是一个多大模型圆桌会议系统。它的重点不是让一个模型扮演多个角色，也不是把多个模型改造成传统 multi-agent 里的任务代理。

它的核心假设是：不同大模型本身就有不同能力、风格、训练背景和推理倾向。因此，系统应该让它们作为平等参会者，在同一个会议流程里自由讨论、互相质疑、互相补充，并最终形成会议纪要。

## 当前版本边界

当前版本只做第一版产品骨架：

- 使用 Next.js App Router
- 使用 TypeScript
- 使用 Tailwind CSS
- 使用 MockProvider
- 不接真实 AI API
- 不使用数据库
- 不引入复杂状态管理库

## 参会模型

参会模型是模型席位，不是固定角色。当前字段集中定义在 `src/lib/types.ts`：

- `id`
- `name`
- `provider`
- `model`
- `status`

这些字段描述“哪个模型在参会”，不描述“它被分配了什么职责”。

## 会议流程

会议流程放在 `src/lib/meeting/engine.ts`。

第一阶段：独立观点

每个模型先独立发表对议题的看法。

第二阶段：自由回应

每个模型阅读其他模型观点后，自由补充、质疑、反驳或延展。

第三阶段：共识整理

主持人整理共识、主要分歧、有价值的少数派观点、风险点和下一步建议。

## MockProvider

`src/lib/providers/mock-provider.ts` 只用于模拟流程。它不会假装真实模型之间已经有真实能力差异，也不会给模型添加固定职责。

保留 MockProvider 的原因是：在接入真实 AI API 前，先把页面、类型、会议阶段和数据流打通。

MockProvider 可以模拟模型个体表达倾向，例如 GPT Mock 更结构化，Claude Mock 更关注边界，Gemini Mock 更连接场景，DeepSeek Mock 更关注工程落地。这些倾向只用于让演示内容更接近真实圆桌讨论，不代表任务分工。

## UI 原则

左侧参会模型卡片只展示：

- 模型名称
- provider
- model
- 当前状态

页面组件只负责展示，不把会议流程逻辑塞进 `page.tsx`。核心逻辑仍然放在 `src/lib/meeting/engine.ts`。
