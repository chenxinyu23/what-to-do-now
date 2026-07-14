const { extractTasksFallback } = require("./fallback-extractor");
const { normalizeAnalysisResult, normalizeReorderRequest } = require("./schema");
const { scoreTasks } = require("./scoring-engine");
const { getRuleProfile, RULE_PROFILES } = require("./rule-profiles");
const { applyManualOutRules, isOutOfToday, reorderTasks } = require("./reorder-engine");
const { explainTasks, generateChangeEvents, generateSummary } = require("./explanation-generator");

const RULE_PRESETS = Object.keys(RULE_PROFILES);

function createReorderService({ provider } = {}) {
  return {
    async reorder(rawRequest) {
      const request = normalizeReorderRequest(rawRequest);
      const rulePayload = getRuleProfile(request.rulePreset);
      const previousTasks = normalizeExistingTasks([...request.currentQueue, ...request.outOfToday]);
      const analysisPayload = await analyzeWithFallback(provider, request);
      const newTasks = normalizeDrafts(analysisPayload.analysis.extractedTasks, request.rawInput);
      const mergedTasks = mergeWithExistingTasks(previousTasks, newTasks);
      const warnings = [...analysisPayload.analysis.warnings];
      if (analysisPayload.warning) warnings.push(analysisPayload.warning);
      const presetResults = Object.fromEntries(
        RULE_PRESETS.map((preset) => [
          preset,
          buildPresetResult({
            preset,
            source: analysisPayload.source,
            request,
            previousTasks,
            mergedTasks,
            newTasks,
            warnings
          })
        ])
      );
      const selectedResult = presetResults[rulePayload.rulePreset];

      return {
        ...selectedResult,
        source: analysisPayload.source,
        inputText: request.rawInput,
        extractedTasks: newTasks,
        presetResults,
        warnings
      };
    }
  };
}

function buildPresetResult({ preset, source, request, previousTasks, mergedTasks, newTasks, warnings }) {
  const rulePayload = getRuleProfile(preset);
  const scoredTasks = scoreTasks(mergedTasks, rulePayload.rulePreset);
  const manuallyFilteredTasks = applyManualOutRules(scoredTasks, request.manualOutIds);
  const reorderPayload = reorderTasks(manuallyFilteredTasks, request.manualOrderConstraints);
  const explainedTasks = explainTasks(
    reorderPayload.tasks,
    reorderPayload.preservedManualConstraints,
    reorderPayload.brokenManualConstraints
  );

  return {
    source,
    rulePreset: rulePayload.rulePreset,
    ruleProfile: rulePayload.ruleProfile,
    summary: generateSummary(
      explainedTasks,
      source,
      reorderPayload.preservedManualConstraints,
      reorderPayload.brokenManualConstraints
    ),
    inputText: request.rawInput,
    extractedTasks: newTasks,
    queue: getTodayTasks(explainedTasks),
    outOfToday: getOutOfTodayTasks(explainedTasks),
    tradeoffSuggestions: generateTradeoffSuggestions(explainedTasks),
    changeEvents: generateChangeEvents(previousTasks, explainedTasks),
    preservedManualConstraints: reorderPayload.preservedManualConstraints,
    brokenManualConstraints: reorderPayload.brokenManualConstraints,
    allTasks: explainedTasks,
    warnings
  };
}

async function analyzeWithFallback(provider, request) {
  if (!request.rawInput) {
    return {
      source: "none",
      analysis: {
        extractedTasks: [],
        inputSummary: "未输入新增事项，仅重新安排现有队列。",
        warnings: []
      },
      warning: null
    };
  }

  try {
    if (!provider || !provider.isConfigured()) {
      throw new Error("model provider is not configured");
    }
    const rawAnalysis = await provider.analyze(request);
    return {
      source: "model",
      analysis: normalizeAnalysisResult(rawAnalysis),
      warning: null
    };
  } catch (error) {
    return {
      source: "fallback",
      analysis: extractTasksFallback(request.rawInput),
      warning: "已按智能规则完成重排"
    };
  }
}

function normalizeExistingTasks(tasks) {
  const seen = new Set();
  return tasks
    .filter((task) => task && task.id && !seen.has(task.id) && seen.add(task.id))
    .map((task, index) => ({
      ...task,
      previousRank: task.currentRank ?? index + 1,
      currentRank: task.currentRank ?? index + 1,
      manualStatus: task.manualStatus || null,
      change: task.change || "same"
    }));
}

function normalizeDrafts(drafts, rawInput) {
  return drafts.map((draft, index) => ({
    id: createTaskId(draft, index),
    title: draft.title,
    source: "text_input",
    deadline: draft.deadlineText || "",
    category: draft.category || "other",
    urgency: draft.urgency,
    goalImpact: draft.goalImpact,
    blockingRisk: draft.blockingRisk,
    effort: draft.effort,
    energyFit: draft.energyFit,
    taskValue: draft.taskValue,
    explicitToday: draft.explicitToday || hasExplicitTodaySignal(rawInput),
    score: 0,
    recommendation: "do_today",
    reason: createReasonFromDraft(draft),
    previousRank: null,
    currentRank: null,
    change: "new",
    manualStatus: null
  }));
}

function mergeWithExistingTasks(existingTasks, newTasks) {
  const existingIds = new Set(existingTasks.map((task) => task.id));
  const merged = existingTasks.map((task) => ({
    ...task,
    previousRank: task.currentRank,
    manualStatus: task.manualStatus || null
  }));

  newTasks.forEach((task) => {
    if (!existingIds.has(task.id)) merged.push(task);
  });

  return merged;
}

function createTaskId(draft, index) {
  const basis = `${draft.title}_${draft.deadlineText || ""}_${index}`;
  let hash = 0;
  for (let i = 0; i < basis.length; i += 1) {
    hash = ((hash << 5) - hash + basis.charCodeAt(i)) | 0;
  }
  return `task_ai_${Math.abs(hash)}_${Date.now()}_${index}`;
}

function createReasonFromDraft(draft) {
  const reasons = Object.values(draft.scoreReasons || {}).filter(Boolean).slice(0, 2);
  return reasons.length > 0 ? reasons.join("；") : "模型识别出的新增任务。";
}

function hasExplicitTodaySignal(inputText) {
  return ["必须", "一定要", "马上", "先做", "今天一定", "今天必须"].some((word) => String(inputText).includes(word));
}

function getTodayTasks(tasks) {
  return tasks
    .filter((task) => !isOutOfToday(task))
    .sort((a, b) => (a.currentRank || 999) - (b.currentRank || 999));
}

function getOutOfTodayTasks(tasks) {
  return tasks
    .filter((task) => isOutOfToday(task))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

function generateTradeoffSuggestions(tasks) {
  return tasks
    .filter((task) => task.recommendation !== "do_now" && task.recommendation !== "do_today")
    .map((task) => ({
      taskId: task.id,
      action: task.recommendation,
      reason: task.reason
    }));
}

module.exports = {
  createReorderService,
  normalizeDrafts,
  normalizeExistingTasks
};
