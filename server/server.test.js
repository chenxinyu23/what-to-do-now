const test = require("node:test");
const assert = require("node:assert/strict");

const { app, createApp } = require("./server");

async function startTestServer(testContext) {
  return startAppServer(testContext, app);
}

async function startAppServer(testContext, testApp) {
  const server = await new Promise((resolve) => {
    const listeningServer = testApp.listen(0, "127.0.0.1", () => resolve(listeningServer));
  });

  testContext.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test("GET / serves the application shell", async (testContext) => {
  const baseUrl = await startTestServer(testContext);
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(html, /现在做什么？ - AI 注意力重排助手/);
});

test("GET /assets/app.js serves the browser application", async (testContext) => {
  const baseUrl = await startTestServer(testContext);
  const response = await fetch(`${baseUrl}/assets/app.js`);
  const javascript = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /javascript/);
  assert.match(javascript, /class AttentionReorderApp/);
});

test("POST /api/reorder uses fallback when no model key is configured", async (testContext) => {
  const baseUrl = await startTestServer(testContext);
  const response = await fetch(`${baseUrl}/api/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawInput: "今天要检查线上链接、补项目说明",
      currentQueue: [],
      outOfToday: []
    })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.source, "fallback");
  assert.ok(body.extractedTasks.length >= 2);
  assert.ok(Array.isArray(body.queue));
});

test("POST /api/reorder rejects a non-object request", async (testContext) => {
  const baseUrl = await startTestServer(testContext);
  const response = await fetch(`${baseUrl}/api/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([])
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.source, "fallback");
  assert.deepEqual(body.queue, []);
  assert.match(body.warnings[0], /request body must be an object/);
});

test("POST /api/reorder can use model settings from the request", async (testContext) => {
  let receivedConfig = null;
  const testApp = createApp({
    providerFactory: (modelConfig) => {
      receivedConfig = modelConfig;
      return {
        isConfigured: () => true,
        analyze: async () => ({
          extractedTasks: [
            {
              title: "用自己的模型分析任务",
              deadlineText: "今天",
              urgency: 4,
              goalImpact: 5,
              blockingRisk: 3,
              effort: 2,
              energyFit: 4,
              taskValue: 5,
              explicitToday: true,
              confidence: 0.9
            }
          ],
          inputSummary: "已使用用户模型。",
          warnings: []
        })
      };
    }
  });
  const baseUrl = await startAppServer(testContext, testApp);
  const response = await fetch(`${baseUrl}/api/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawInput: "今天用自己的模型分析任务",
      currentQueue: [],
      outOfToday: [],
      modelConfig: {
        baseUrl: "https://api.openai.com/v1",
        modelName: "gpt-4o-mini",
        apiKey: "user-key"
      }
    })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.source, "model");
  assert.equal(body.queue[0].title, "用自己的模型分析任务");
  assert.equal(receivedConfig.modelBaseUrl, "https://api.openai.com/v1");
  assert.equal(receivedConfig.modelName, "gpt-4o-mini");
  assert.equal(receivedConfig.modelApiKey, "user-key");
});

test("POST /api/reorder rejects unsafe model base URLs", async (testContext) => {
  const baseUrl = await startTestServer(testContext);
  const response = await fetch(`${baseUrl}/api/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawInput: "今天检查模型配置",
      currentQueue: [],
      outOfToday: [],
      modelConfig: {
        baseUrl: "http://api.example.com/v1",
        modelName: "example-model",
        apiKey: "user-key"
      }
    })
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.warnings[0], /must use https/);
});

test("POST /api/model/test verifies model settings from the request", async (testContext) => {
  let receivedConfig = null;
  let testCallCount = 0;
  const testApp = createApp({
    providerFactory: (modelConfig) => {
      receivedConfig = modelConfig;
      return {
        isConfigured: () => true,
        testConnection: async () => {
          testCallCount += 1;
          return { ok: true };
        }
      };
    }
  });
  const baseUrl = await startAppServer(testContext, testApp);
  const response = await fetch(`${baseUrl}/api/model/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelConfig: {
        baseUrl: "https://api.deepseek.com/v1",
        modelName: "deepseek-chat",
        apiKey: "user-key",
        timeoutMs: 7000
      }
    })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.message, "模型 API 连接成功");
  assert.equal(testCallCount, 1);
  assert.equal(receivedConfig.modelBaseUrl, "https://api.deepseek.com/v1");
});

test("POST /api/model/test returns a readable error when the provider fails", async (testContext) => {
  const testApp = createApp({
    providerFactory: () => ({
      isConfigured: () => true,
      testConnection: async () => {
        throw new Error("model request failed: 401 invalid key");
      }
    })
  });
  const baseUrl = await startAppServer(testContext, testApp);
  const response = await fetch(`${baseUrl}/api/model/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelConfig: {
        baseUrl: "https://api.deepseek.com",
        modelName: "deepseek-chat",
        apiKey: "bad-key"
      }
    })
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.match(body.message, /401 invalid key/);
});

test("POST /api/model/test rejects incomplete model settings", async (testContext) => {
  const baseUrl = await startTestServer(testContext);
  const response = await fetch(`${baseUrl}/api/model/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelConfig: { baseUrl: "https://api.deepseek.com" } })
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.match(body.message, /requires baseUrl/);
});
