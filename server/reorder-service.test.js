const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateScore } = require("./scoring-engine");
const { reorderTasks } = require("./reorder-engine");
const { createReorderService } = require("./reorder-service");
const { extractTasksFallback } = require("./fallback-extractor");

test("calculateScore applies effort as a cost dimension", () => {
  const baseTask = {
    urgency: 4,
    goalImpact: 4,
    blockingRisk: 3,
    effort: 3,
    energyFit: 3,
    taskValue: 4
  };

  const lowEffortScore = calculateScore({ ...baseTask, effort: 1 });
  const highEffortScore = calculateScore({ ...baseTask, effort: 5 });

  assert.equal(lowEffortScore, 3.8);
  assert.equal(highEffortScore, 3.35);
});

test("reorderTasks preserves manual order unless the later task has a hard constraint", () => {
  const tasks = [
    {
      id: "task_a",
      title: "A",
      score: 3,
      urgency: 3,
      blockingRisk: 2,
      previousRank: 1,
      change: "same"
    },
    {
      id: "task_b",
      title: "B",
      score: 4.8,
      urgency: 4,
      blockingRisk: 2,
      previousRank: 2,
      change: "same"
    }
  ];

  const preserved = reorderTasks(tasks, [{ beforeTaskId: "task_a", afterTaskId: "task_b", createdAt: 1 }]);
  assert.equal(preserved.tasks[0].id, "task_a");
  assert.equal(preserved.preservedManualConstraints.length, 1);

  const broken = reorderTasks(
    tasks.map((task) => task.id === "task_b" ? { ...task, urgency: 5 } : task),
    [{ beforeTaskId: "task_a", afterTaskId: "task_b", createdAt: 1 }]
  );
  assert.equal(broken.tasks[0].id, "task_b");
  assert.equal(broken.brokenManualConstraints[0].reason, "deadline");
});

test("reorder service falls back when provider is not configured", async () => {
  const service = createReorderService({ provider: { isConfigured: () => false } });
  const result = await service.reorder({
    rawInput: "今天必须提交报名材料",
    todayGoal: "完成 AI 创意大赛 Demo 初赛提交",
    currentQueue: [],
    outOfToday: [],
    manualOrderConstraints: [],
    manualOutIds: [],
    userContext: { currentTimeLabel: "下午", energyLevel: "medium" }
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.queue.length, 1);
  assert.match(result.summary, /本地兜底/);
});

test("fallback extractor splits Chinese list punctuation into separate tasks", () => {
  const result = extractTasksFallback("今晚要运动、洗地、洗澡");

  assert.deepEqual(result.extractedTasks.map((task) => task.title), ["运动", "洗地", "洗澡"]);
  assert.deepEqual(result.extractedTasks.map((task) => task.deadlineText), ["今晚", "今晚", "今晚"]);
  assert.match(result.extractedTasks[0].scoreReasons.urgency, /今晚/);
});

test("reorder service adds separate fallback tasks for Chinese list input", async () => {
  const service = createReorderService({ provider: { isConfigured: () => false } });
  const result = await service.reorder({
    rawInput: "今晚要运动、洗地、洗澡",
    todayGoal: "保持健康和生活秩序",
    currentQueue: [],
    outOfToday: [],
    manualOrderConstraints: [],
    manualOutIds: [],
    userContext: { currentTimeLabel: "晚上", energyLevel: "medium" }
  });

  assert.equal(result.source, "fallback");
  assert.deepEqual(result.extractedTasks.map((task) => task.title), ["运动", "洗地", "洗澡"]);
  assert.deepEqual(result.extractedTasks.map((task) => task.deadline), ["今晚", "今晚", "今晚"]);
  assert.deepEqual(result.queue.map((task) => task.deadline), ["今晚", "今晚", "今晚"]);
});

test("reorder service keeps the existing primary task in do_now after adding a low priority task", async () => {
  const service = createReorderService({ provider: { isConfigured: () => false } });
  const currentQueue = [
    {
      id: "task_demo_home",
      title: "搭建 Demo 首页",
      deadline: "今天下午",
      category: "develop",
      urgency: 4,
      goalImpact: 5,
      blockingRisk: 3,
      effort: 4,
      energyFit: 4,
      taskValue: 5,
      score: 4.1,
      recommendation: "do_now",
      previousRank: 1,
      currentRank: 1,
      change: "same"
    },
    {
      id: "task_code_review",
      title: "代码审查",
      deadline: "今天晚上",
      category: "develop",
      urgency: 3,
      goalImpact: 4,
      blockingRisk: 3,
      effort: 3,
      energyFit: 3,
      taskValue: 4,
      score: 3.45,
      recommendation: "do_today",
      previousRank: 2,
      currentRank: 2,
      change: "same"
    }
  ];

  const result = await service.reorder({
    rawInput: "晚点看grill me背后的设计思维",
    todayGoal: "完成 AI 创意大赛 Demo 初赛提交",
    currentQueue,
    outOfToday: [],
    manualOrderConstraints: [],
    manualOutIds: [],
    userContext: { currentTimeLabel: "晚上", energyLevel: "medium" }
  });

  const primaryTask = result.queue.find((task) => task.id === "task_demo_home");
  assert.equal(primaryTask.recommendation, "do_now");
  assert.equal(result.queue.filter((task) => task.recommendation === "do_now").length, 1);
});

test("reorder service can rerank existing tasks without adding a new task when input is empty", async () => {
  let analyzeCallCount = 0;
  const service = createReorderService({
    provider: {
      isConfigured: () => true,
      analyze: async () => {
        analyzeCallCount += 1;
        return { extractedTasks: [{ title: "不应该新增的任务" }], inputSummary: "", warnings: [] };
      }
    }
  });
  const result = await service.reorder({
    rawInput: "",
    todayGoal: "完成 AI 创意大赛 Demo 初赛提交",
    currentQueue: [
      {
        id: "task_demo_home",
        title: "搭建 Demo 首页",
        deadline: "今天下午",
        category: "develop",
        urgency: 4,
        goalImpact: 5,
        blockingRisk: 3,
        effort: 4,
        energyFit: 4,
        taskValue: 5,
        recommendation: "do_now",
        previousRank: 1,
        currentRank: 1,
        change: "same"
      }
    ],
    outOfToday: [],
    manualOrderConstraints: [],
    manualOutIds: [],
    userContext: { currentTimeLabel: "下午", energyLevel: "medium" }
  });

  assert.equal(result.extractedTasks.length, 0);
  assert.equal(result.queue.length, 1);
  assert.equal(result.queue[0].title, "搭建 Demo 首页");
  assert.equal(analyzeCallCount, 0);
});
