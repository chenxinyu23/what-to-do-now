const { clampScore } = require("./scoring-engine");
const { getRuleProfile } = require("./rule-profiles");

const CATEGORIES = new Set(["submit", "communicate", "research", "develop", "life", "other"]);

function normalizeCategory(category) {
  return CATEGORIES.has(category) ? category : "other";
}

function ensureObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function normalizeModelBaseUrl(rawBaseUrl) {
  let url;
  try {
    url = new URL(rawBaseUrl);
  } catch (error) {
    throw new Error("modelConfig.baseUrl must be a valid URL");
  }

  const isLocalHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error("modelConfig.baseUrl must use https, except localhost development URLs");
  }

  if (url.pathname.endsWith("/chat/completions")) {
    url.pathname = url.pathname.slice(0, -"/chat/completions".length) || "/";
  }

  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeModelConfig(modelConfig) {
  if (modelConfig === undefined || modelConfig === null) return null;
  const config = ensureObject(modelConfig, "modelConfig");
  const baseUrl = String(config.baseUrl || "").trim();
  const modelName = String(config.modelName || "").trim();
  const apiKey = String(config.apiKey || "").trim();

  if (!baseUrl && !modelName && !apiKey) return null;
  if (!baseUrl || !modelName || !apiKey) {
    throw new Error("modelConfig requires baseUrl, modelName, and apiKey");
  }

  const timeoutMs = Number(config.timeoutMs || 5000);
  return {
    modelBaseUrl: normalizeModelBaseUrl(baseUrl),
    modelName,
    modelApiKey: apiKey,
    modelTimeoutMs: Number.isFinite(timeoutMs) ? Math.min(30000, Math.max(1000, timeoutMs)) : 5000
  };
}

function normalizeScoreReasons(scoreReasons = {}) {
  return {
    urgency: String(scoreReasons.urgency || "未提供紧急度依据"),
    goalImpact: String(scoreReasons.goalImpact || "未提供目标影响依据"),
    blockingRisk: String(scoreReasons.blockingRisk || "未提供阻塞风险依据"),
    effort: String(scoreReasons.effort || "未提供耗时成本依据"),
    energyFit: String(scoreReasons.energyFit || "未提供精力匹配依据"),
    taskValue: String(scoreReasons.taskValue || "未提供任务价值依据")
  };
}

function normalizeAnalysisResult(rawResult) {
  const result = typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
  ensureObject(result, "analysis result");

  const extractedTasks = Array.isArray(result.extractedTasks) ? result.extractedTasks : [];
  const normalizedTasks = extractedTasks
    .map((task, index) => {
      if (!task || typeof task !== "object") return null;
      const title = String(task.title || "").trim();
      const confidence = Number(task.confidence ?? 0.8);
      if (!title || confidence < 0.2) return null;

      return {
        tempId: String(task.tempId || `draft_${index + 1}`),
        title,
        deadlineText: String(task.deadlineText || task.deadline || ""),
        category: normalizeCategory(task.category),
        urgency: clampScore(task.urgency),
        goalImpact: clampScore(task.goalImpact),
        blockingRisk: clampScore(task.blockingRisk),
        effort: clampScore(task.effort),
        energyFit: clampScore(task.energyFit),
        taskValue: clampScore(task.taskValue),
        explicitToday: Boolean(task.explicitToday),
        confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.8,
        scoreReasons: normalizeScoreReasons(task.scoreReasons)
      };
    })
    .filter(Boolean);

  if (normalizedTasks.length === 0) {
    throw new Error("analysis result contains no valid tasks");
  }

  return {
    extractedTasks: normalizedTasks,
    inputSummary: String(result.inputSummary || "模型已完成任务分析。"),
    warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : []
  };
}

function normalizeReorderRequest(body = {}) {
  const request = ensureObject(body, "request body");
  const { rulePreset } = getRuleProfile(String(request.rulePreset || "balanced"));
  return {
    rawInput: String(request.rawInput || "").trim(),
    todayGoal: String(request.todayGoal || "完成项目 Demo 提交").trim(),
    rulePreset,
    currentQueue: Array.isArray(request.currentQueue) ? request.currentQueue : [],
    outOfToday: Array.isArray(request.outOfToday) ? request.outOfToday : [],
    manualOrderConstraints: Array.isArray(request.manualOrderConstraints) ? request.manualOrderConstraints : [],
    manualOutIds: Array.isArray(request.manualOutIds) ? request.manualOutIds.map(String) : [],
    modelConfig: normalizeModelConfig(request.modelConfig),
    userContext: {
      currentTimeLabel: String(request.userContext?.currentTimeLabel || "下午"),
      energyLevel: ["low", "medium", "high"].includes(request.userContext?.energyLevel)
        ? request.userContext.energyLevel
        : "medium"
    }
  };
}

module.exports = {
  normalizeAnalysisResult,
  normalizeCategory,
  normalizeModelConfig,
  normalizeReorderRequest
};
