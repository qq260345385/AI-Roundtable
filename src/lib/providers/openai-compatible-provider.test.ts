import { describe, expect, test } from "vitest";
import { OpenAICompatibleProvider, parseSummary } from "./openai-compatible-provider";
import { exportMeetingToMarkdown } from "../meeting/export-markdown";

describe("OpenAICompatibleProvider", () => {
  test("throws a clear error when api key is missing", () => {
    expect(() => {
      new OpenAICompatibleProvider({
        providerName: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        modelName: "gpt-test",
      });
    }).toThrow("OpenAI API key is missing");
  });

  test("sanitizes failed chat completion responses but keeps provider and status", async () => {
    const provider = new OpenAICompatibleProvider({
      providerName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret-openai-key",
      modelName: "gpt-test",
      fetcher: async () =>
        new Response("Authorization Bearer secret-openai-key rejected", {
          status: 401,
        }),
    });

    let error: unknown;

    try {
      await provider.generateIndependentView(
        {
          id: "openai-gpt-test",
          name: "OpenAI gpt-test",
          provider: "OpenAI",
          model: "gpt-test",
          status: "available",
          statusLabel: "已连接",
        },
        "测试议题",
      );
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : "";
    expect(message).toBe("OpenAI API request failed: 401");
    expect(message).toContain("OpenAI");
    expect(message).toContain("401");
    expect(message).not.toContain("secret-openai-key");
    expect(message).not.toContain("Authorization");
    expect(message).not.toContain("Bearer");
  });

  test("passes abort signal to chat completion fetch", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | null | undefined;
    const provider = new OpenAICompatibleProvider({
      providerName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret-openai-key",
      modelName: "gpt-test",
      fetcher: async (_url, init) => {
        receivedSignal = init?.signal;

        return Response.json({
          choices: [
            {
              message: {
                content: "Signal-aware response",
              },
            },
          ],
        });
      },
    });

    await provider.generateIndependentView(
      {
        id: "openai-gpt-test",
        name: "OpenAI gpt-test",
        provider: "OpenAI",
        model: "gpt-test",
        status: "available",
        statusLabel: "Connected",
      },
      "test topic",
      undefined,
      { signal: controller.signal },
    );

    expect(receivedSignal).toBe(controller.signal);
  });

  test("asks response phase participants to address others by seat number", async () => {
    let requestBody = "";
    const provider = new OpenAICompatibleProvider({
      providerName: "DeepSeek Pro",
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-openai-key",
      modelName: "deepseek-v4-pro",
      fetcher: async (_url, init) => {
        requestBody = String(init?.body);

        return Response.json({
          choices: [
            {
              message: {
                content: "2号回应 1号观点",
              },
            },
          ],
        });
      },
    });

    await provider.generateResponse(
      {
        id: "deepseek-pro",
        name: "DeepSeek Pro deepseek-v4-pro",
        provider: "DeepSeek Pro",
        model: "deepseek-v4-pro",
        status: "available",
        statusLabel: "已连接",
      },
      "测试议题",
      [
        {
          id: "independent-deepseek-flash",
          phaseId: "independent",
          speakerName: "DeepSeek Flash deepseek-v4-flash",
          provider: "DeepSeek Flash",
          model: "deepseek-v4-flash",
          content: "Flash 的独立观点",
        },
        {
          id: "independent-deepseek-pro",
          phaseId: "independent",
          speakerName: "DeepSeek Pro deepseek-v4-pro",
          provider: "DeepSeek Pro",
          model: "deepseek-v4-pro",
          content: "Pro 的独立观点",
        },
      ],
    );

    const body = JSON.parse(requestBody) as {
      messages: { role: string; content: string }[];
    };
    const responsePrompt = body.messages.at(-1)?.content ?? "";

    expect(responsePrompt).toContain("你当前是 2号。");
    expect(responsePrompt).toContain("你在第一阶段的观点是：");
    expect(responsePrompt).toContain("Pro 的独立观点");
    expect(responsePrompt).toContain(
      "1号（DeepSeek Flash/deepseek-v4-flash）：Flash 的独立观点",
    );
    expect(responsePrompt).not.toContain(
      "2号（DeepSeek Pro/deepseek-v4-pro）：Pro 的独立观点",
    );
    expect(responsePrompt).toContain("请使用席位编号称呼对方");
    expect(responsePrompt).toContain("不要直接称呼对方的模型名或显示名");
  });

  test("uses dynamic length prompts without brief and normal mode conflicts", async () => {
    const requestBodies: string[] = [];
    const provider = new OpenAICompatibleProvider({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-openai-key",
      modelName: "deepseek-v4-flash",
      fetcher: async (_url, init) => {
        requestBodies.push(String(init?.body));

        return Response.json({
          choices: [{ message: { content: "ok" } }],
        });
      },
    });
    const participant = {
      id: "flash",
      name: "DeepSeek Flash",
      provider: "DeepSeek",
      model: "deepseek-v4-flash",
      status: "available" as const,
      statusLabel: "已连接",
    };

    await provider.generateIndependentView(participant, "如何优化会议体验？");
    await provider.generateResponse(
      participant,
      "如何优化会议体验？",
      [
        {
          id: "independent-flash",
          phaseId: "independent",
          speakerName: "DeepSeek Flash",
          provider: "DeepSeek",
          model: "deepseek-v4-flash",
          content: "我的第一阶段观点",
        },
      ],
    );
    await provider.generateIndependentView(
      participant,
      "如何优化会议体验？",
      undefined,
      { isBriefMode: true },
    );
    await provider.generateResponse(
      participant,
      "如何优化会议体验？",
      [
        {
          id: "independent-flash",
          phaseId: "independent",
          speakerName: "DeepSeek Flash",
          provider: "DeepSeek",
          model: "deepseek-v4-flash",
          content: "我的第一阶段观点",
        },
      ],
      undefined,
      { isBriefMode: true },
    );

    const prompts = requestBodies.map((bodyText) => {
      const body = JSON.parse(bodyText) as {
        messages: { content: string }[];
      };

      return body.messages.map((message) => message.content).join("\n");
    });

    expect(prompts[0]).toContain("500～800 字");
    expect(prompts[0]).not.toContain("200 字左右");
    expect(prompts[1]).toContain("400～700 字");
    expect(prompts[1]).not.toContain("200 字左右");
    expect(prompts[2]).toContain("200 字左右");
    expect(prompts[2]).not.toContain("500～800 字");
    expect(prompts[3]).toContain("200 字左右");
    expect(prompts[3]).not.toContain("400～700 字");
  });

  test("adds fact hygiene rules for time-sensitive topics", async () => {
    let requestBody = "";
    const provider = new OpenAICompatibleProvider({
      providerName: "DeepSeek Flash",
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-openai-key",
      modelName: "deepseek-v4-flash",
      fetcher: async (_url, init) => {
        requestBody = String(init?.body);

        return Response.json({
          choices: [
            {
              message: {
                content: "无法验证最新排名，需要人工核验。",
              },
            },
          ],
        });
      },
    });

    await provider.generateIndependentView(
      {
        id: "deepseek-flash",
        name: "DeepSeek Flash deepseek-v4-flash",
        provider: "DeepSeek Flash",
        model: "deepseek-v4-flash",
        status: "available",
        statusLabel: "已连接",
      },
      "最新 AI 模型发布影响分析",
    );

    const body = JSON.parse(requestBody) as {
      messages: { role: string; content: string }[];
    };
    const promptText = body.messages.map((message) => message.content).join("\n");

    expect(promptText).toContain("实时信息");
    expect(promptText).toContain("无法联网");
    expect(promptText).toContain("不能编造版本、排名、价格、发布时间");
    expect(promptText).toContain("不能把未经验证的信息升级成事实");
  });

  test("injects the same evidence pack rules into participant prompts", async () => {
    const requestBodies: string[] = [];
    const provider = new OpenAICompatibleProvider({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-openai-key",
      modelName: "deepseek-v4-flash",
      fetcher: async (_url, init) => {
        requestBodies.push(String(init?.body));

        return Response.json({
          choices: [
            {
              message: {
                content: "根据 [S1] 回应。",
              },
            },
          ],
        });
      },
    });
    const participants = [
      {
        id: "flash",
        name: "DeepSeek Flash",
        provider: "DeepSeek",
        model: "deepseek-v4-flash",
        status: "available" as const,
        statusLabel: "已连接",
      },
      {
        id: "pro",
        name: "DeepSeek Pro",
        provider: "DeepSeek",
        model: "deepseek-v4-pro",
        status: "available" as const,
        statusLabel: "已连接",
      },
    ];
    const evidencePack = {
      enabled: true,
      items: [
        {
          id: "S1",
          title: "模型发布记录",
          source: "Example",
          url: "https://example.com/models",
          snippet: "资料包中的事实摘要",
        },
      ],
    };

    await provider.generateIndependentView(
      participants[0],
      "最新模型是什么？",
      evidencePack,
    );
    await provider.generateIndependentView(
      participants[1],
      "最新模型是什么？",
      evidencePack,
    );

    const prompts = requestBodies.map((bodyText) => {
      const body = JSON.parse(bodyText) as {
        messages: { content: string }[];
      };

      return body.messages.map((message) => message.content).join("\n");
    });

    for (const prompt of prompts) {
      expect(prompt).toContain("## 外部资料包");
      expect(prompt).toContain("[S1]");
      expect(prompt).toContain("模型发布记录");
      expect(prompt).toContain("资料包中的事实摘要");
      expect(prompt).toContain("必须使用资料编号");
      expect(prompt).toContain("不要引用不存在的资料");
    }
  });

  test("uses stance-driven prompts without fixed perspective assignment", async () => {
    const requestBodies: string[] = [];
    const provider = new OpenAICompatibleProvider({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-openai-key",
      modelName: "deepseek-v4-flash",
      fetcher: async (_url, init) => {
        requestBodies.push(String(init?.body));

        return Response.json({
          choices: [{ message: { content: "ok" } }],
        });
      },
    });
    const participants = ["a", "e", "i", "m"].map((id) => ({
      id,
      name: `Participant ${id}`,
      provider: "SameProvider",
      model: "same-model",
      status: "available" as const,
      statusLabel: "Connected",
    }));

    for (const participant of participants) {
      await provider.generateIndependentView(
        participant,
        "OpenAI 和 Anthropic 哪个公司会笑到最后",
      );
    }

    const prompts = requestBodies.map((bodyText) => {
      const body = JSON.parse(bodyText) as {
        messages: { content: string }[];
      };

      return body.messages.map((message) => message.content).join("\n");
    });

    const allPrompts = prompts.join("\n");

    expect(allPrompts).toContain("明确立场");
    expect(allPrompts).toContain("说服其他参会模型");
    expect(allPrompts).toContain("不要自称固定角色");
    expect(allPrompts).not.toContain("风险与不确定性");
    expect(allPrompts).not.toContain("商业与资本效率");
    expect(allPrompts).not.toContain("技术与产品能力");
    expect(allPrompts).not.toContain("生态与用户采用");
    expect(allPrompts).not.toContain("讨论关注点");
    expect(allPrompts).not.toMatch(/你是.+分析师/);
    expect(allPrompts).not.toMatch(/作为.+分析师/);
  });

  test("uses debate-focused prompts in response phase", async () => {
    let requestBody = "";
    const provider = new OpenAICompatibleProvider({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-openai-key",
      modelName: "deepseek-v4-flash",
      fetcher: async (_url, init) => {
        requestBody = String(init?.body);

        return Response.json({
          choices: [{ message: { content: "ok" } }],
        });
      },
    });

    await provider.generateResponse(
      {
        id: "test",
        name: "Test Model",
        provider: "DeepSeek",
        model: "deepseek-v4-flash",
        status: "available",
        statusLabel: "Connected",
      },
      "测试议题",
      [
        {
          id: "independent-other",
          phaseId: "independent",
          speakerName: "Other Model",
          provider: "Other",
          model: "other-model",
          content: "其他模型的观点",
        },
      ],
    );

    const body = JSON.parse(requestBody) as {
      messages: { content: string }[];
    };
    const promptText = body.messages.map((message) => message.content).join("\n");

    expect(promptText).toContain("回应");
    expect(promptText).toContain("推进争论");
    expect(promptText).toContain("说服其他模型");
    expect(promptText).toContain("优先回应你认为最值得争论");
    expect(promptText).toContain("不要只选择最容易赞同的观点");
    expect(promptText).toContain("边界、代价或遗漏前提");
    expect(promptText).not.toContain("讨论关注点");
    expect(promptText).not.toContain("风险与不确定性");
    expect(promptText).not.toContain("商业与资本效率");
  });

  test("does not push no-evidence fact-check wording into opinion prompts", async () => {
    let requestBody = "";
    const provider = new OpenAICompatibleProvider({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-openai-key",
      modelName: "deepseek-v4-flash",
      fetcher: async (_url, init) => {
        requestBody = String(init?.body);

        return Response.json({
          choices: [{ message: { content: "观点回应" } }],
        });
      },
    });

    await provider.generateIndependentView(
      {
        id: "flash",
        name: "DeepSeek Flash",
        provider: "DeepSeek",
        model: "deepseek-v4-flash",
        status: "available",
        statusLabel: "已连接",
      },
      "你们认为什么水果更好吃",
    );

    const body = JSON.parse(requestBody) as {
      messages: { content: string }[];
    };
    const promptText = body.messages.map((message) => message.content).join("\n");

    expect(promptText).not.toContain("资料不足以确认关键事实");
    expect(promptText).not.toContain("参会模型无法联网检索");
    expect(promptText).not.toContain("不能确认当前最新事实");
  });

  test("tells participants not to repeat generated metadata", async () => {
    let requestBody = "";
    const provider = new OpenAICompatibleProvider({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-openai-key",
      modelName: "deepseek-v4-flash",
      fetcher: async (_url, init) => {
        requestBody = String(init?.body);

        return Response.json({
          choices: [{ message: { content: "ok" } }],
        });
      },
    });

    await provider.generateIndependentView(
      {
        id: "flash",
        name: "DeepSeek Flash",
        provider: "DeepSeek",
        model: "deepseek-v4-flash",
        status: "available",
        statusLabel: "已连接",
      },
      "测试议题",
    );

    const body = JSON.parse(requestBody) as {
      messages: { content: string }[];
    };
    const promptText = body.messages.map((message) => message.content).join("\n");

    expect(promptText).toContain(
      "不要重复输出模型名、provider、model、阶段标题或席位信息，系统会统一添加。",
    );
  });

  test("adds evidence quality guardrails to summary prompts", async () => {
    let requestBody = "";
    const provider = new OpenAICompatibleProvider({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-openai-key",
      modelName: "deepseek-v4-flash",
      fetcher: async (_url, init) => {
        requestBody = String(init?.body);

        return Response.json({
          choices: [
            {
              message: {
                content:
                  '{"confirmableFacts":[],"initialHypotheses":[],"communityViews":["社区讨论声称某模型领先，但尚未核验。"],"insufficientlyConfirmed":["仅由低可信资料支持，不能确认。"],"consensus":[],"differences":[],"minorityViews":[],"risks":[],"nextSteps":[]}',
              },
            },
          ],
        });
      },
    });

    await provider.generateSummary(
      "GPT-4o 和 Claude 3.5 评测对比",
      [],
      {
        enabled: true,
        items: [
          {
            id: "S1",
            title: "Reddit rumor",
            url: "https://reddit.com/r/test",
            snippet: "短消息",
            quality: {
              textLength: 3,
              wasTruncated: false,
              warnings: ["仅有标题或极短摘要，不能作为事实依据"],
              sourceType: "social_forum",
              reliability: "very_low",
              score: 0,
            },
          },
        ],
      },
    );

    const body = JSON.parse(requestBody) as {
      messages: { content: string }[];
    };
    const promptText = body.messages.map((message) => message.content).join("\n");

    expect(promptText).toContain("low / very_low 可信度资料只能作为社区观点");
    expect(promptText).toContain("禁止基于 low / very_low 资料使用");
    expect(promptText).toContain("低可信资料声称");
    expect(promptText).toContain("融资额");
    expect(promptText).toContain("不能作为结论依据");
    expect(promptText).toContain("共识");
    expect(promptText).toContain("分歧");
    expect(promptText).toContain("下一步");
    expect(promptText).toContain("不足以确认");
  });

  test("uses stricter stance-oriented synthesis rules without legacy field compatibility in prompt", async () => {
    let requestBody = "";
    const provider = new OpenAICompatibleProvider({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-openai-key",
      modelName: "deepseek-v4-flash",
      fetcher: async (_url, init) => {
        requestBody = String(init?.body);

        return Response.json({
          choices: [
            {
              message: {
                content:
                  '{"consensus":["口味标准需要先明确。"],"differences":["价值取向分歧：有人重视风味上限，有人重视稳定耐吃。"],"nextSteps":["用户应该先决定更重视风味上限还是日常耐吃。"]}',
              },
            },
          ],
        });
      },
    });

    await provider.generateSummary("你们认为什么水果更好吃", []);

    const body = JSON.parse(requestBody) as {
      messages: { content: string }[];
    };
    const promptText = body.messages.map((message) => message.content).join("\n");

    expect(promptText).toContain("只列入\"被质疑或反驳后仍然成立\"的判断");
    expect(promptText).toContain("价值取向分歧");
    expect(promptText).toContain("经验判断分歧");
    expect(promptText).toContain("框架/定义分歧");
    expect(promptText).toContain("用户应该先决定什么、验证什么、暂缓什么");
    expect(promptText).toContain("【新问题】");
    expect(promptText).not.toContain("为了兼容旧数据");
    expect(promptText).not.toContain(
      "也可以同时提供 confirmableFacts、initialHypotheses、insufficientlyConfirmed、risks、communityViews",
    );
  });

  test("adds brief meeting rules to participant and summary prompts", async () => {
    const requestBodies: string[] = [];
    const provider = new OpenAICompatibleProvider({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-openai-key",
      modelName: "deepseek-v4-flash",
      fetcher: async (_url, init) => {
        requestBodies.push(String(init?.body));

        return Response.json({
          choices: [
            {
              message: {
                content:
                  requestBodies.length === 3
                    ? '{"consensus":["简要共识"],"differences":[],"minorityViews":[],"risks":[],"nextSteps":[]}'
                    : "简短发言",
              },
            },
          ],
        });
      },
    });
    const participant = {
      id: "flash",
      name: "DeepSeek Flash",
      provider: "DeepSeek",
      model: "deepseek-v4-flash",
      status: "available" as const,
      statusLabel: "已连接",
    };

    await provider.generateIndependentView(
      participant,
      "如何优化会议体验？",
      undefined,
      { isBriefMode: true },
    );
    await provider.generateResponse(
      participant,
      "如何优化会议体验？",
      [],
      undefined,
      { isBriefMode: true },
    );
    await provider.generateSummary(
      "如何优化会议体验？",
      [],
      undefined,
      { isBriefMode: true },
    );

    const prompts = requestBodies.map((bodyText) => {
      const body = JSON.parse(bodyText) as {
        messages: { content: string }[];
      };

      return body.messages.map((message) => message.content).join("\n");
    });

    expect(prompts[0]).toContain("简要会议模式");
    expect(prompts[0]).toContain("200 字左右");
    expect(prompts[0]).not.toContain("500～800 字");
    expect(prompts[1]).toContain("简要会议模式");
    expect(prompts[1]).toContain("避免长篇列表");
    expect(prompts[1]).not.toContain("400～700 字");
    expect(prompts[2]).toContain("简要会议模式");
    expect(prompts[2]).toContain("每个字段最多 3 条");
  });
  describe("parseSummary", () => {
    test("parses pure JSON summary", () => {
      const input = JSON.stringify({
        confirmableFacts: ["GPT-4o 已发布。"],
        initialHypotheses: ["可能有新版本。"],
        insufficientlyConfirmed: [],
        risks: ["信息可能过时。"],
        nextSteps: ["核验发布时间。"],
        consensus: ["共识。"],
        differences: [],
        minorityViews: [],
      });

      const result = parseSummary(input);

      expect(result.confirmableFacts).toEqual(["GPT-4o 已发布。"]);
      expect(result.initialHypotheses).toEqual(["可能有新版本。"]);
      expect(result.insufficientlyConfirmed).toEqual([]);
      expect(result.risks).toEqual(["信息可能过时。"]);
      expect(result.nextSteps).toEqual(["核验发布时间。"]);
      expect(result.consensus).toEqual(["共识。"]);
    });

    test("parses JSON wrapped in ```json code fence", () => {
      const input = '```json\n{"confirmableFacts":["事实A"],"initialHypotheses":[],"insufficientlyConfirmed":[],"risks":[],"nextSteps":[],"consensus":[],"differences":[],"minorityViews":[]}\n```';

      const result = parseSummary(input);

      expect(result.confirmableFacts).toEqual(["事实A"]);
      expect(result.consensus).toEqual([]);
    });

    test("parses JSON wrapped in plain ``` code fence", () => {
      const input = '```\n{"confirmableFacts":[],"initialHypotheses":["推测B"],"insufficientlyConfirmed":[],"risks":[],"nextSteps":[],"consensus":[],"differences":[],"minorityViews":[]}\n```';

      const result = parseSummary(input);

      expect(result.initialHypotheses).toEqual(["推测B"]);
    });

    test("extracts JSON object from surrounding explanation text", () => {
      const input = '以下是会议小结：\n{"confirmableFacts":["事实C"],"initialHypotheses":[],"insufficientlyConfirmed":[],"risks":["风险D"],"nextSteps":[],"consensus":[],"differences":[],"minorityViews":[]}\n以上是会议小结。';

      const result = parseSummary(input);

      expect(result.confirmableFacts).toEqual(["事实C"]);
      expect(result.risks).toEqual(["风险D"]);
    });

    test("does not leak raw JSON into consensus on parse failure", () => {
      const input = "这不是 JSON，也不是代码块，就是一段普通文字。";

      const result = parseSummary(input);

      expect(result.consensus).toEqual([]);
      expect(result.confirmableFacts).toEqual([]);
      expect(result.insufficientlyConfirmed).toContain(
        "第三阶段共识整理输出格式异常，无法可靠解析。",
      );
      expect(result.risks).toContain(
        "会议小结不是标准 JSON，后续需要加强提示词或解析逻辑。",
      );
    });

    test("does not leak raw ```json fence into consensus on parse failure", () => {
      const input = '```json\n{broken json}\n```';

      const result = parseSummary(input);

      expect(result.consensus).toEqual([]);
      expect(result.confirmableFacts).toEqual([]);
      expect(result.insufficientlyConfirmed).toContain(
        "第三阶段共识整理输出格式异常，无法可靠解析。",
      );
    });

    test("exported markdown does not contain raw JSON or code fences from failed parse", () => {
      const rawContent = '```json\n{broken json}\n```';
      const summary = parseSummary(rawContent);
      const meeting = {
        topic: "Test Topic",
        isTimeSensitive: false,
        phases: [],
        summary,
      };
      const participants = [
        {
          id: "test",
          name: "Test Model",
          provider: "TestProvider",
          model: "test-model",
          status: "available" as const,
          statusLabel: "available",
        },
      ];

      const markdown = exportMeetingToMarkdown(
        meeting as Parameters<typeof exportMeetingToMarkdown>[0],
        participants,
      );

      expect(markdown).not.toContain("```json");
      expect(markdown).not.toContain("broken json");
      expect(markdown).toContain("第三阶段共识整理输出格式异常");
    });

    test("exported markdown contains valid facts from successful parse", () => {
      const input = JSON.stringify({
        confirmableFacts: ["GPT-4o 已发布。"],
        initialHypotheses: [],
        insufficientlyConfirmed: [],
        risks: [],
        nextSteps: ["核验发布时间。"],
        consensus: [],
        differences: [],
        minorityViews: [],
      });
      const summary = parseSummary(input);
      const meeting = {
        topic: "Test Topic",
        isTimeSensitive: false,
        phases: [],
        summary,
      };
      const participants = [
        {
          id: "test",
          name: "Test Model",
          provider: "TestProvider",
          model: "test-model",
          status: "available" as const,
          statusLabel: "available",
        },
      ];

      const markdown = exportMeetingToMarkdown(
        meeting as Parameters<typeof exportMeetingToMarkdown>[0],
        participants,
      );

      expect(markdown).toContain("GPT-4o 已发布。");
      expect(markdown).toContain("核验发布时间。");
    });

    test("maps field aliases to canonical names", () => {
      const input = JSON.stringify({
        facts: ["事实A"],
        hypotheses: ["推测B"],
        unknowns: ["未知C"],
        riskPoints: ["风险D"],
        actionItems: ["行动E"],
        consensus: [],
        differences: [],
        minorityViews: [],
      });

      const result = parseSummary(input);

      expect(result.confirmableFacts).toEqual(["事实A"]);
      expect(result.initialHypotheses).toEqual(["推测B"]);
      expect(result.insufficientlyConfirmed).toEqual(["未知C"]);
      expect(result.risks).toEqual(["风险D"]);
      expect(result.nextSteps).toEqual(["行动E"]);
    });

    test("converts string fields to arrays", () => {
      const input = JSON.stringify({
        confirmableFacts: "single fact string",
        initialHypotheses: "single hypothesis",
        insufficientlyConfirmed: [],
        risks: "single risk",
        nextSteps: "single step",
        consensus: [],
        differences: [],
        minorityViews: [],
      });

      const result = parseSummary(input);

      expect(result.confirmableFacts).toEqual(["single fact string"]);
      expect(result.initialHypotheses).toEqual(["single hypothesis"]);
      expect(result.risks).toEqual(["single risk"]);
      expect(result.nextSteps).toEqual(["single step"]);
    });

    test("removes empty strings and duplicates from arrays", () => {
      const input = JSON.stringify({
        confirmableFacts: ["事实A", "", "事实A", "  ", "事实B"],
        initialHypotheses: [],
        insufficientlyConfirmed: [],
        risks: [],
        nextSteps: [],
        consensus: [],
        differences: [],
        minorityViews: [],
      });

      const result = parseSummary(input);

      expect(result.confirmableFacts).toEqual(["事实A", "事实B"]);
    });

    test("sets fallbackUsed=true on parse failure and populates all sections", () => {
      const input = "This is not JSON at all, just plain text.";

      const result = parseSummary(input);

      expect(result.summaryDebug?.fallbackUsed).toBe(true);
      expect(result.summaryDebug?.parseSucceeded).toBe(false);
      expect(result.risks.length).toBeGreaterThan(0);
      expect(result.nextSteps.length).toBeGreaterThan(0);
    });

    test("exported markdown does not contain undefined or [object Object]", () => {
      const input = JSON.stringify({
        confirmableFacts: ["事实A"],
        initialHypotheses: [undefined, null, "推测B"],
        insufficientlyConfirmed: [],
        risks: [],
        nextSteps: [],
        consensus: [],
        differences: [],
        minorityViews: [],
      });
      const summary = parseSummary(input);
      const meeting = {
        topic: "Test Topic",
        isTimeSensitive: false,
        phases: [],
        summary,
      };
      const participants = [
        {
          id: "test",
          name: "Test Model",
          provider: "TestProvider",
          model: "test-model",
          status: "available" as const,
          statusLabel: "available",
        },
      ];

      const markdown = exportMeetingToMarkdown(
        meeting as Parameters<typeof exportMeetingToMarkdown>[0],
        participants,
      );

      expect(markdown).not.toContain("undefined");
      expect(markdown).not.toContain("[object Object]");
    });

    test("exported markdown does not show summaryDebug by default", () => {
      const input = JSON.stringify({
        confirmableFacts: ["事实"],
        initialHypotheses: [],
        insufficientlyConfirmed: [],
        risks: [],
        nextSteps: [],
        consensus: [],
        differences: [],
        minorityViews: [],
      });
      const summary = parseSummary(input);
      const meeting = {
        topic: "Test Topic",
        isTimeSensitive: false,
        phases: [],
        summary,
      };
      const participants = [
        {
          id: "test",
          name: "Test Model",
          provider: "TestProvider",
          model: "test-model",
          status: "available" as const,
          statusLabel: "available",
        },
      ];

      const markdown = exportMeetingToMarkdown(
        meeting as Parameters<typeof exportMeetingToMarkdown>[0],
        participants,
      );

      expect(markdown).not.toContain("rawFormatDetected");
      expect(markdown).not.toContain("parseSucceeded");
    });
  });

  test("asks the model to plan web search queries", async () => {
    let requestBody = "";
    const provider = new OpenAICompatibleProvider({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-openai-key",
      modelName: "deepseek-v4-flash",
      fetcher: async (_url, init) => {
        requestBody = String(init?.body);

        return Response.json({
          choices: [
            {
              message: {
                content:
                  '["DeepSeek V3 benchmark Artificial Analysis","DeepSeek official technical report","DeepSeek 全球大模型排名"]',
              },
            },
          ],
        });
      },
    });

    const queries = await provider.generateSearchQueries?.(
      {
        id: "deepseek-flash",
        name: "DeepSeek Flash",
        provider: "DeepSeek",
        model: "deepseek-v4-flash",
        status: "available",
        statusLabel: "available",
      },
      "目前 DeepSeek 在全球 AI 大模型里面是什么实力",
    );

    const body = JSON.parse(requestBody) as {
      messages: { content: string }[];
    };
    const promptText = body.messages.map((message) => message.content).join("\n");

    expect(queries).toEqual([
      "DeepSeek V3 benchmark Artificial Analysis",
      "DeepSeek official technical report",
      "DeepSeek 全球大模型排名",
    ]);
    expect(promptText).toContain("Return JSON only");
    expect(promptText).toContain("search queries");
    expect(promptText).toContain("目前 DeepSeek 在全球 AI 大模型里面是什么实力");
  });
});
