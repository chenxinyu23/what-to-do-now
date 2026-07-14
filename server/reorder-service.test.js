const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateScore, scoreTasks } = require("./scoring-engine");
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

test("scoreTasks applies rule preset weights", () => {
  const tasks = [
    {
      id: "deadline_task",
      urgency: 5,
      goalImpact: 2,
      blockingRisk: 2,
      effort: 3,
      energyFit: 3,
      taskValue: 2
    },
    {
      id: "goal_task",
      urgency: 2,
      goalImpact: 5,
      blockingRisk: 2,
      effort: 3,
      energyFit: 3,
      taskValue: 3
    }
  ];

  const deadlineFirst = scoreTasks(tasks, "deadline_first");
  const goalFirst = scoreTasks(tasks, "goal_first");

  assert.ok(deadlineFirst.find((task) => task.id === "deadline_task").score > deadlineFirst.find((task) => task.id === "goal_task").score);
  assert.ok(goalFirst.find((task) => task.id === "goal_task").score > goalFirst.find((task) => task.id === "deadline_task").score);
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
  assert.equal(result.rulePreset, "balanced");
  assert.equal(result.ruleProfile.label, "平衡");
  assert.equal(result.queue.length, 1);
  assert.match(result.summary, /智能规则/);
});

test("reorder service returns requested rule profile", async () => {
  const service = createReorderService({ provider: { isConfigured: () => false } });
  const result = await service.reorder({
    rawInput: "今晚必须提交材料",
    rulePreset: "goal_first",
    currentQueue: [],
    outOfToday: [],
    manualOrderConstraints: [],
    manualOutIds: []
  });

  assert.equal(result.rulePreset, "goal_first");
  assert.equal(result.ruleProfile.label, "目标优先");
  assert.equal(result.ruleProfile.weights.goalImpact, 0.38);
});

test("reorder service returns cached results for every rule preset", async () => {
  const service = createReorderService({ provider: { isConfigured: () => false } });
  const result = await service.reorder({
    rawInput: "今晚必须提交材料",
    rulePreset: "deadline_first",
    currentQueue: [],
    outOfToday: [],
    manualOrderConstraints: [],
    manualOutIds: []
  });

  assert.deepEqual(Object.keys(result.presetResults).sort(), [
    "balanced",
    "deadline_first",
    "goal_first",
    "low_effort_first"
  ]);
  assert.equal(result.rulePreset, "deadline_first");
  assert.equal(result.presetResults.deadline_first.rulePreset, "deadline_first");
  assert.equal(result.presetResults.goal_first.ruleProfile.label, "目标优先");
  assert.equal(result.presetResults.balanced.extractedTasks.length, 1);
});

test("reorder service analyzes input once before producing all rule preset results", async () => {
  let analyzeCallCount = 0;
  const service = createReorderService({
    provider: {
      isConfigured: () => true,
      analyze: async () => {
        analyzeCallCount += 1;
        return {
          extractedTasks: [
            {
              title: "提交初赛帖",
              deadlineText: "今晚",
              urgency: 5,
              goalImpact: 5,
              blockingRisk: 3,
              effort: 2,
              energyFit: 4,
              taskValue: 5,
              explicitToday: true,
              confidence: 0.9
            }
          ],
          inputSummary: "识别到初赛提交任务。",
          warnings: []
        };
      }
    }
  });

  const result = await service.reorder({
    rawInput: "今晚必须提交初赛帖",
    rulePreset: "balanced",
    currentQueue: [],
    outOfToday: [],
    manualOrderConstraints: [],
    manualOutIds: []
  });

  assert.equal(analyzeCallCount, 1);
  assert.equal(result.source, "model");
  assert.equal(result.presetResults.balanced.queue[0].title, "提交初赛帖");
  assert.equal(result.presetResults.low_effort_first.queue[0].title, "提交初赛帖");
});

test("reorder service falls back to balanced for unknown rule preset", async () => {
  const service = createReorderService({ provider: { isConfigured: () => false } });
  const result = await service.reorder({
    rawInput: "今晚必须提交材料",
    rulePreset: "custom_formula",
    currentQueue: [],
    outOfToday: [],
    manualOrderConstraints: [],
    manualOutIds: []
  });

  assert.equal(result.rulePreset, "balanced");
  assert.equal(result.ruleProfile.label, "平衡");
});

test("fallback extractor splits Chinese list punctuation into separate tasks", () => {
  const result = extractTasksFallback("今晚要运动、洗地、洗澡");

  assert.deepEqual(result.extractedTasks.map((task) => task.title), ["运动", "洗地", "洗澡"]);
  assert.deepEqual(result.extractedTasks.map((task) => task.deadlineText), ["今晚", "今晚", "今晚"]);
  assert.match(result.extractedTasks[0].scoreReasons.urgency, /今晚/);
});

test("fallback extractor ignores spoken filler before task boundaries", () => {
  const result = extractTasksFallback("刚想到还要录制 1 分钟演示视频、检查线上链接、补一版项目说明");

  assert.deepEqual(result.extractedTasks.map((task) => task.title), [
    "录制 1 分钟演示视频",
    "检查线上链接",
    "补一版项目说明"
  ]);
  assert.ok(!result.extractedTasks.some((task) => task.title.includes("想到")));
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
