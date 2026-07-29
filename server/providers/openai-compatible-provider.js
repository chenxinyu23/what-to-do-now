const { TaskAnalysisProvider } = require("./task-analysis-provider");

class OpenAICompatibleProvider extends TaskAnalysisProvider {
  constructor(config) {
    super();
    this.config = config;
  }

  isConfigured() {
    return Boolean(this.config.modelApiKey && this.config.modelName && this.config.modelBaseUrl);
  }

  async analyze(request) {
    if (!this.isConfigured()) {
      throw new Error("model provider is not configured");
    }

    const payload = {
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: JSON.stringify(buildPromptPayload(request))
        }
      ]
    };
    const body = await this.requestChatCompletionWithJsonFallback(payload);
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("model response did not include message content");
    return parseJsonContent(content);
  }

  async testConnection() {
    if (!this.isConfigured()) {
      throw new Error("model provider is not configured");
    }

    const body = await this.requestChatCompletion({
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "你是一个 API 连通性测试助手。"
        },
        {
          role: "user",
          content: "请回复 OK，用于测试模型 API 是否可用。"
        }
      ],
      max_tokens: 8
    }, { responseFormat: false });
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("model response did not include message content");
    return { ok: true };
  }

  async requestChatCompletionWithJsonFallback(payload) {
    try {
      return await this.requestChatCompletion(payload, { responseFormat: true });
    } catch (error) {
      if (!isResponseFormatUnsupported(error)) throw error;
      return this.requestChatCompletion(payload, { responseFormat: false });
    }
  }

  async requestChatCompletion(payload, { responseFormat = true } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.modelTimeoutMs);

    try {
      const requestBody = {
        model: this.config.modelName,
        ...payload
      };
      if (responseFormat) {
        requestBody.response_format = { type: "json_object" };
      }

      const response = await fetch(`${this.config.modelBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.modelApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        const preview = await response.text();
        throw new Error(`model request failed: ${response.status} ${preview.slice(0, 200)}`);
      }

      const body = await response.json();
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isResponseFormatUnsupported(error) {
  return /response_format|json_object|unsupported|not support|unrecognized/i.test(error.message);
}

function parseJsonContent(content) {
  const trimmed = String(content).trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced) return JSON.parse(fenced[1]);

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw error;
  }
}

function buildSystemPrompt() {
  return [
    "你是一个任务分析器，只输出 JSON。",
    "你不直接决定最终排序，不输出推荐动作，不覆盖用户手动排序。",
    "你只从用户输入中抽取任务，并为每个任务补全评分维度。",
    "用户输入中的并列事项必须拆成独立任务，例如“今晚要运动、洗地、洗澡”应输出“运动”“洗地”“洗澡”三项。",
    "遇到顿号、逗号、换行、以及/还有/另外/顺便等连接词时，优先判断是否表示多个可执行事项。",
    "忽略“我突然想到”“刚想到”“想到”“想起来”“发现”等口头引导语，它们不是任务标题，不能单独输出为任务。",
    "评分维度 urgency、goalImpact、blockingRisk、effort、energyFit、taskValue 必须是 1 到 5 的数字。",
    "category 必须是 submit、communicate、research、develop、life、other 之一。",
    "输出 JSON 对象，格式为 { extractedTasks: [], inputSummary: string, warnings: [] }。"
  ].join("\n");
}

function buildPromptPayload(request) {
  return {
    rawInput: request.rawInput,
    todayGoal: request.todayGoal,
    currentQueue: request.currentQueue.map((task) => ({
      id: task.id,
      title: task.title,
      deadline: task.deadline,
      category: task.category,
      recommendation: task.recommendation,
      manualStatus: task.manualStatus
    })),
    outOfToday: request.outOfToday.map((task) => ({
      id: task.id,
      title: task.title,
      deadline: task.deadline,
      category: task.category,
      manualStatus: task.manualStatus
    })),
    manualOutIds: request.manualOutIds,
    userContext: request.userContext,
    requiredTaskShape: {
      tempId: "draft_1",
      title: "简短可执行任务",
      deadlineText: "今天/明天中午前/空字符串",
      category: "submit|communicate|research|develop|life|other",
      urgency: "1-5",
      goalImpact: "1-5",
      blockingRisk: "1-5",
      effort: "1-5",
      energyFit: "1-5",
      taskValue: "1-5",
      explicitToday: "boolean",
      confidence: "0-1",
      scoreReasons: {
        urgency: "简短依据",
        goalImpact: "简短依据",
        blockingRisk: "简短依据",
        effort: "简短依据",
        energyFit: "简短依据",
        taskValue: "简短依据"
      }
    }
  };
}

module.exports = {
  OpenAICompatibleProvider,
  buildPromptPayload,
  buildSystemPrompt
};
