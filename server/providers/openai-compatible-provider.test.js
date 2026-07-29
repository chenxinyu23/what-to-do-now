const assert = require("node:assert/strict");
const test = require("node:test");

const { OpenAICompatibleProvider } = require("./openai-compatible-provider");

function createProvider() {
  return new OpenAICompatibleProvider({
    modelBaseUrl: "https://api.example.com/v1",
    modelName: "example-chat",
    modelApiKey: "user-key",
    modelTimeoutMs: 1000
  });
}

function createChatResponse(content) {
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: { content }
        }
      ]
    })
  };
}

test("testConnection does not require response_format support", async (testContext) => {
  const originalFetch = globalThis.fetch;
  const requestBodies = [];
  testContext.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    requestBodies.push(JSON.parse(options.body));
    return createChatResponse("OK");
  };

  const result = await createProvider().testConnection();

  assert.deepEqual(result, { ok: true });
  assert.equal(requestBodies.length, 1);
  assert.equal(requestBodies[0].response_format, undefined);
});

test("analyze retries without response_format when provider rejects it", async (testContext) => {
  const originalFetch = globalThis.fetch;
  const requestBodies = [];
  testContext.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    const requestBody = JSON.parse(options.body);
    requestBodies.push(requestBody);
    if (requestBody.response_format) {
      return {
        ok: false,
        status: 400,
        text: async () => "unsupported parameter: response_format"
      };
    }
    return createChatResponse(`\`\`\`json
{
  "extractedTasks": [
    {
      "title": "补项目说明",
      "confidence": 0.9,
      "urgency": 3,
      "goalImpact": 4,
      "blockingRisk": 2,
      "effort": 2,
      "energyFit": 3,
      "taskValue": 4
    }
  ],
  "inputSummary": "已识别 1 个任务",
  "warnings": []
}
\`\`\``);
  };

  const result = await createProvider().analyze({
    rawInput: "补项目说明",
    todayGoal: "完成 Demo",
    currentQueue: [],
    outOfToday: [],
    manualOutIds: [],
    userContext: { currentTimeLabel: "下午", energyLevel: "medium" }
  });

  assert.equal(requestBodies.length, 2);
  assert.deepEqual(requestBodies.map((body) => Boolean(body.response_format)), [true, false]);
  assert.equal(result.extractedTasks[0].title, "补项目说明");
});
