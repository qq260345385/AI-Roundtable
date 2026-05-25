import { describe, expect, test } from "vitest";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";

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
    expect(responsePrompt).toContain(
      "1号（DeepSeek Flash/deepseek-v4-flash）：Flash 的独立观点",
    );
    expect(responsePrompt).not.toContain(
      "2号（DeepSeek Pro/deepseek-v4-pro）：Pro 的独立观点",
    );
    expect(responsePrompt).toContain("请使用席位编号称呼对方");
    expect(responsePrompt).toContain("不要直接称呼对方的模型名或显示名");
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
      "现在最强的 AI 模型排名是什么？",
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
      "最新模型对比",
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
    expect(promptText).toContain("可确认事实");
    expect(promptText).toContain("不足以确认");
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
    expect(prompts[0]).toContain("150 字左右");
    expect(prompts[1]).toContain("简要会议模式");
    expect(prompts[1]).toContain("避免长篇列表");
    expect(prompts[2]).toContain("简要会议模式");
    expect(prompts[2]).toContain("每个字段最多 3 条");
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
