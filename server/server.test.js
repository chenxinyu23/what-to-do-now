const test = require("node:test");
const assert = require("node:assert/strict");

process.env.MODEL_API_KEY = "";

const { app } = require("./server");

async function startTestServer(testContext) {
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => resolve(listeningServer));
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
  assert.match(html, /今日锚 - AI 注意力重排助手/);
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
