# AI Roundtable 会议纪要

## 会议议题

AI Roundtable 应该如何体现不同大模型之间的真实讨论差异？

## 参会模型

- GPT Mock（OpenAI / gpt-mock）
- Claude Mock（Anthropic / claude-mock）
- Gemini Mock（Google / gemini-mock）
- DeepSeek Mock（DeepSeek / deepseek-mock）

## 第一阶段：独立观点

### GPT Mock

模型：OpenAI / gpt-mock

GPT Mock：我会先把“AI Roundtable 应该如何体现不同大模型之间的真实讨论差异？”拆成三个层面：会议流程、观点记录、最终纪要。比较稳的做法是先保证每个模型都有独立发言，再允许它们互相回应，最后把共识和分歧分开整理。这样既有结构，也不会把模型硬塞进固定角色。

### Claude Mock

模型：Anthropic / claude-mock

Claude Mock：我会先提醒一个边界问题：AI Roundtable 的价值不只是“多几个回答”，而是让不同模型之间的推理倾向被看见。需要避免把表达倾向误写成职责分工，否则产品又会滑回传统 multi-agent。

### Gemini Mock

模型：Google / gemini-mock

Gemini Mock：我更想从场景看这个产品。用户可能不是只想看最终答案，而是想观察不同模型如何互相启发。界面可以突出会议感，比如席位、阶段、发言流和小结，让讨论过程本身变得可读。

### DeepSeek Mock

模型：DeepSeek / deepseek-mock

DeepSeek Mock：我会先看落地路径。第一版应该保持简单：MockProvider 先写死差异化文本，会议引擎只处理阶段顺序，UI 只展示结果。等流程稳定后，再接真实 Provider、错误状态和调用耗时。

## 第二阶段：自由回应

### GPT Mock

模型：OpenAI / gpt-mock

GPT Mock：我部分同意 Claude Mock、Gemini Mock、DeepSeek Mock 的观点。可以把“AI Roundtable 应该如何体现不同大模型之间的真实讨论差异？”继续整理成一个折中方案：既保留自由讨论的开放性，也用固定阶段保证结果可读。我的补充是，小结最好明确区分共识、分歧和下一步。

### Claude Mock

模型：Anthropic / claude-mock

Claude Mock：我同意要有阶段，但也想补充一个潜在问题：如果 Mock 文案过度模板化，用户会误以为模型差异只是 UI 装饰。关于“AI Roundtable 应该如何体现不同大模型之间的真实讨论差异？”，更重要的是让差异来自表达方式和推理侧重点，而不是来自人为指定的任务。

### Gemini Mock

模型：Google / gemini-mock

Gemini Mock：我赞成前面的结构化处理，也想延展到使用体验。用户阅读 GPT Mock、Claude Mock、DeepSeek Mock 的发言时，应该能快速看出谁在补充、谁在保留意见、谁提出新的场景。这样圆桌会议才不只是答案列表。

### DeepSeek Mock

模型：DeepSeek / deepseek-mock

DeepSeek Mock：我基本同意这个方向，但会提醒实现复杂度。自由回应阶段先用上一阶段发言作为输入就够了，不需要马上做复杂记忆或状态管理。围绕“AI Roundtable 应该如何体现不同大模型之间的真实讨论差异？”，先把数据结构和测试稳定下来更重要。

## 第三阶段：共识整理

### 共识

- AI Roundtable 讨论“AI Roundtable 应该如何体现不同大模型之间的真实讨论差异？”时，应让不同模型作为平等参会者发言，而不是让它们扮演固定角色。
- 会议流程需要保留独立观点、自由回应和共识整理三个阶段，方便用户看到观点如何形成。

### 主要分歧

- 模型差异应该更多来自表达倾向和推理侧重点，而不是来自人为分配的职责。
- 产品可以强调会议感，但需要控制第一版复杂度，避免过早引入真实 API、数据库或复杂状态管理。

### 有价值的少数派观点

- 少数派观点认为，Mock 阶段也要谨慎设计文本，否则用户可能误判真实模型差异。
- 另一个有价值的提醒是：自由回应不必总是反驳，同意、部分同意和补充同样能体现圆桌讨论。

### 风险点

- 当前发言由 MockProvider 生成，仍然只是模拟差异，不能代表真实模型能力。
- 如果后续接入真实模型时没有记录 provider、model、状态和错误信息，排查会变困难。
- 8 条 Mock 发言可以验证展示结构，但还不能验证真实模型之间的互动质量。

### 下一步建议

- 继续保留 MockProvider，先完善页面交互和会议数据结构。
- 增加用户输入议题的表单，让会议主题不再写死。
- 接入真实 Provider 时，从一个模型开始，小步验证调用、错误处理和展示效果。
