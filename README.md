# AI Roundtable

AI Roundtable 是一个让多个 AI 模型坐在同一张“圆桌”上讨论问题的网页应用。

你只需要输入一个议题，选择想邀请的模型，系统会让它们先独立表达观点，再互相补充、质疑和修正，最后整理成一份清晰的会议纪要。

当前版本：`v0.6.0 internal alpha`

## 它适合做什么

- 对一个复杂问题快速获得多角度判断
- 比较不同模型的思考方式，而不是只看单个回答
- 围绕资料、网页搜索结果或本地文档组织讨论
- 生成可复制、可归档的会议纪要
- 在做产品、研究、投资、学习、写作前先进行一次“多人脑暴”

AI Roundtable 不希望把模型伪装成固定部门或固定专家。模型会以平等参会者的方式讨论，系统只用轻量关注点减少重复，而不是要求模型扮演某个角色。

## 主要功能

- 多模型圆桌会议：同一议题下，多位模型依次发言。
- 三阶段讨论流程：独立观点、自由回应、共识整理。
- 实时会议过程：模型完成一段发言后，页面立即展示。
- 联网搜索资料包：可启用 Tavily 搜索，把网页资料整理成统一 Evidence Pack。
- 搜索驱动模型可选：开启联网搜索后，可以选择一个已接入模型主导搜索方向。
- 总结模型可选：第三阶段纪要可以指定一个模型负责汇总。
- 本地资料导入：支持把文档解析成资料包，让所有模型基于同一批材料讨论。
- 引用检查：会议结束后检查模型是否引用了不存在的资料编号。
- 中英文界面切换：适合中文用户，也保留英文界面。
- Markdown 导出：一键复制会议纪要，方便保存、分享或二次整理。

## 体验方式

### 1. 安装依赖

```bash
npm install
```

### 2. 本地启动

```bash
npm run dev
```

然后打开：

```text
http://localhost:3000
```

默认是 Mock 模式，不需要 API key，也不会调用外部模型。你可以先用它体验完整流程。

## 接入真实模型

如果你想让真实模型参加圆桌会议，先复制环境变量示例：

```bash
copy .env.example .env.local
```

然后在 `.env.local` 里开启 real 模式：

```env
AI_ROUNDTABLE_MODE=real
```

AI Roundtable 使用 OpenAI-compatible 接口，因此可以接入 OpenAI、DeepSeek、Qwen、SiliconFlow 或其他兼容 Chat Completions API 的服务。

通用配置方式如下：

```env
AI_ROUNDTABLE_PROVIDER_IDS=openai,deepseek,qwen

AI_ROUNDTABLE_PROVIDER_OPENAI_NAME=OpenAI
AI_ROUNDTABLE_PROVIDER_OPENAI_BASE_URL=https://api.openai.com/v1
AI_ROUNDTABLE_PROVIDER_OPENAI_API_KEY=你的 API key
AI_ROUNDTABLE_PROVIDER_OPENAI_MODEL=你的模型名

AI_ROUNDTABLE_PROVIDER_DEEPSEEK_NAME=DeepSeek
AI_ROUNDTABLE_PROVIDER_DEEPSEEK_BASE_URL=https://api.deepseek.com
AI_ROUNDTABLE_PROVIDER_DEEPSEEK_API_KEY=你的 API key
AI_ROUNDTABLE_PROVIDER_DEEPSEEK_MODEL=你的模型名

AI_ROUNDTABLE_PROVIDER_QWEN_NAME=Qwen
AI_ROUNDTABLE_PROVIDER_QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_ROUNDTABLE_PROVIDER_QWEN_API_KEY=你的 API key
AI_ROUNDTABLE_PROVIDER_QWEN_MODEL=你的模型名
```

真实 API key 只应该写在 `.env.local`，不要提交到 GitHub。

## 联网搜索

AI Roundtable 可以在会议前进行联网搜索，把搜索结果整理成 Evidence Pack，再交给所有模型共同引用。

启用联网搜索需要配置 Tavily：

```env
TAVILY_API_KEY=你的 Tavily key
```

当前搜索策略默认更偏向中文和国内用户：

- 默认搜索地区偏向中国
- 默认请求文本形式的原始内容
- 每轮搜索最多拉取 20 条候选
- 由模型规划 3 次关键词搜索
- 最终选出质量较高的 12 篇资料进入会议资料池

如果搜索成功但证据不足，系统会进入低证据模式，提醒用户不要把低质量资料里的数字、融资额、估值、时间表等内容当作已确认事实。

## 资料包与引用

你可以手动导入本地资料，也可以让系统联网搜索资料。系统会把资料统一编号为 `S1`、`S2`、`S3` 等。

模型在讨论中可以引用这些编号。会议结束后，系统会检查引用是否真实存在，避免出现“模型编造资料编号”的情况。

## 使用提醒

AI Roundtable 可以帮助你整理思路，但它不是事实裁判。

尤其是以下内容，请务必人工核验：

- 最新新闻
- 价格、估值、融资额、营收
- 法律、政策、监管结论
- 医疗、金融、投资建议
- 公司内部信息或未经证实的传闻

如果会议中出现“低证据模式”提示，说明本轮资料不足以支撑强结论，纪要应当被看作讨论草稿，而不是最终事实报告。

## 项目状态

AI Roundtable 目前仍是早期版本，核心体验已经可以运行，但还在快速迭代中。

当前重点：

- 提升联网搜索资料质量
- 改善中文议题和本地新闻资料的识别
- 让会议纪要更自然、更少重复
- 让普通用户不需要理解复杂调试信息也能放心使用

暂不建议把它用于高风险决策的唯一依据。

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
npm run lint
```

检查代码风格。

```bash
npm run build
```

生成生产构建。

## 隐私与安全

- 不要提交 `.env.local`
- 不要把 API key 写进 README、Issue、PR、截图或示例文件
- 真实会议记录在公开分享前应先脱敏
- 联网搜索和模型调用都发生在服务端，API key 不会返回给前端
- 如果发现 key 泄露，请立即撤销并重新生成

更多安全说明见 [SECURITY.md](SECURITY.md)。

## 开发者参考

如果你想了解内部实现，可以继续阅读：

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CHANGELOG.md](CHANGELOG.md)
- [docs/real-model-smoke-test.md](docs/real-model-smoke-test.md)
- [docs/frontend-manual-checklist.md](docs/frontend-manual-checklist.md)
- [docs/evaluation-notes.md](docs/evaluation-notes.md)

## License

本项目使用 [MIT License](LICENSE)。
