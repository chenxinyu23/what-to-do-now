const DEFAULT_CATEGORY = "other";
const TASK_BOUNDARY_KEYWORDS = ["还要", "顺便", "然后", "另外", "以及", "还有"];
const LIST_SEPARATORS = /[、，,；;\n]+/g;
const DEADLINE_PATTERNS = [
  "今天下午",
  "今天晚上",
  "今天上午",
  "明天中午前",
  "明天上午",
  "明天下午",
  "明天晚上",
  "本周内",
  "这周内",
  "今天",
  "今晚",
  "明天",
  "上午",
  "下午",
  "晚上",
  "早上",
  "中午",
  "本周",
  "这周"
];

function hasExplicitTodaySignal(inputText) {
  return ["必须", "一定要", "马上", "先做", "今天一定", "今天必须"].some((word) => inputText.includes(word));
}

function createFallbackDraft(title, inputText = "", deadlineText = "") {
  const explicitToday = hasExplicitTodaySignal(inputText);
  const hasDeadline = Boolean(deadlineText);
  return {
    tempId: `fallback_${Math.random().toString(36).slice(2, 8)}`,
    title,
    deadlineText: deadlineText || (explicitToday ? "今天" : ""),
    category: DEFAULT_CATEGORY,
    urgency: explicitToday ? 5 : hasDeadline ? 4 : 3,
    goalImpact: explicitToday ? 4 : 3,
    blockingRisk: 2,
    effort: 3,
    energyFit: 3,
    taskValue: 3,
    explicitToday,
    confidence: 0.6,
    scoreReasons: {
      urgency: explicitToday
        ? "输入中包含今天优先信号"
        : hasDeadline
          ? `输入中包含截止时间：${deadlineText}`
          : "未识别到明确截止时间",
      goalImpact: "本地兜底规则使用默认目标影响",
      blockingRisk: "未识别到明显阻塞风险",
      effort: "本地兜底规则使用默认耗时成本",
      energyFit: "本地兜底规则使用默认精力匹配",
      taskValue: "本地兜底规则使用默认任务价值"
    }
  };
}

function extractTasksFallback(rawInput) {
  const inputText = String(rawInput || "").trim();
  if (!inputText) {
    return {
      extractedTasks: [],
      inputSummary: "未输入可识别任务。",
      warnings: ["未识别到可执行事项"]
    };
  }

  const deadlineText = extractDeadlineText(inputText);
  const tasks = splitTaskText(inputText).map((taskText) => createFallbackDraft(taskText, inputText, deadlineText));
  if (tasks.length === 0) tasks.push(createFallbackDraft(inputText, inputText));

  return {
    extractedTasks: tasks,
    inputSummary: "本次使用本地兜底规则抽取任务。",
    warnings: ["本次使用本地兜底规则完成重排"]
  };
}

function extractDeadlineText(inputText) {
  return DEADLINE_PATTERNS.find((pattern) => inputText.includes(pattern)) || "";
}

function splitTaskText(inputText) {
  const normalizedInput = TASK_BOUNDARY_KEYWORDS.reduce(
    (text, keyword) => text.replaceAll(keyword, "，"),
    inputText
  );
  const seen = new Set();

  return normalizedInput
    .split(LIST_SEPARATORS)
    .map(cleanTaskTitle)
    .filter((title) => title.length >= 2)
    .filter((title) => {
      if (seen.has(title)) return false;
      seen.add(title);
      return true;
    });
}

function cleanTaskTitle(taskText) {
  return String(taskText || "")
    .trim()
    .replace(/[。.!！?？]+$/g, "")
    .replace(/^(今天|今晚|明天|上午|下午|晚上|早上|中午|本周内|这周内|这周|本周)\s*/, "")
    .replace(/^(?:(先|再|想要|需要|一定要|必须|记得|可以|要|得|想|把)\s*)+/, "")
    .trim();
}

module.exports = {
  extractDeadlineText,
  extractTasksFallback,
  hasExplicitTodaySignal,
  splitTaskText
};
