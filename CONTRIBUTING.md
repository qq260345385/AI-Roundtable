# Contributing

感谢你关注 AI Roundtable。这个项目的核心定位是平等多模型圆桌会议，不是角色扮演 multi-agent，也不是让一个模型扮演多个固定职责。

## 安装依赖

```bash
npm install
```

## 运行开发服务器

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

## 运行检查

```bash
npm test
npm run lint
npm run build
```

提交前建议至少运行以上三条命令。

## 推荐开发流程

1. 先阅读相关代码和文档，理解当前结构。
2. 新功能尽量先补测试，再实现。
3. 保持 TypeScript 简单清晰，避免复杂泛型和过度抽象。
4. 小步提交，避免把无关重构混在同一个改动里。
5. 修改真实 provider 前，先确认 Mock 模式仍然可用。

## 开发约束

- 不要把 provider 调用逻辑写到前端。
- API key 只能在服务端使用。
- 不要破坏 Mock 模式，它是默认开发和回归测试路径。
- 不要把模型设计改回固定角色分工。
- 展示组件只负责渲染，核心会议流程放在 `src/lib/meeting`。
- 新功能需要尽量配测试，尤其是 provider、API route 和会议流程相关改动。

## 产品定位提醒

AI Roundtable 的目标是让不同大模型作为平等参会者围绕同一议题讨论、补充、质疑并形成会议纪要。它不是传统 multi-agent 任务分工系统。
