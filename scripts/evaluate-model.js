const fs = require("fs");
const path = require("path");
require("dotenv").config();

const rootDir = path.resolve(__dirname, "..");
const casesPath = path.join(rootDir, "evals", "task-analysis-cases.json");
const resultsDir = path.join(rootDir, "evals", "results");
const resultsPath = path.join(resultsDir, "latest.json");
const baseUrl = process.env.EVAL_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const strictMode = process.argv.includes("--strict") || process.env.EVAL_STRICT === "1";

function getEvalModelConfig() {
  const modelConfig = {
    baseUrl: process.env.MODEL_BASE_URL || "",
    modelName: process.env.MODEL_NAME || "",
    apiKey: process.env.MODEL_API_KEY || "",
    timeoutMs: Number(process.env.MODEL_TIMEOUT_MS || 5000)
  };
  return modelConfig.baseUrl && modelConfig.modelName && modelConfig.apiKey ? modelConfig : null;
}

async function main() {
  const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));
  const results = [];

  console.log(`Running ${cases.length} model eval cases against ${baseUrl}`);

  for (const testCase of cases) {
    const startedAt = Date.now();
    const result = await runCaseSafely(testCase);
    const durationMs = Date.now() - startedAt;
    const summary = summarizeResult(testCase, result, durationMs);
    results.push(summary);
    printSummary(summary);
  }

  const runSummary = summarizeRun(results);
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(
    resultsPath,
    `${JSON.stringify({
      baseUrl,
      modelBaseUrl: process.env.MODEL_BASE_URL || null,
      modelName: process.env.MODEL_NAME || null,
      createdAt: new Date().toISOString(),
      summary: runSummary,
      results
    }, null, 2)}\n`
  );

  printRunSummary(runSummary);
  console.log(`\nSaved eval results to ${path.relative(rootDir, resultsPath)}`);

  if (strictMode && runSummary.failedCases > 0) {
    process.exitCode = 1;
  }
}

async function runCaseSafely(testCase) {
  try {
    return {
      ok: true,
      payload: await runCase(testCase)
    };
  } catch (error) {
    return {
      ok: false,
      error: formatError(error)
    };
  }
}

async function runCase(testCase) {
  const modelConfig = getEvalModelConfig();
  const response = await fetch(`${baseUrl}/api/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawInput: testCase.rawInput,
      todayGoal: testCase.todayGoal,
      currentQueue: [],
      outOfToday: [],
      manualOrderConstraints: [],
      manualOutIds: [],
      ...(modelConfig ? { modelConfig } : {}),
      userContext: {
        currentTimeLabel: "afternoon",
        energyLevel: "medium"
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Case ${testCase.id} failed with ${response.status}: ${body}`);
  }

  return response.json();
}

function summarizeResult(testCase, result, durationMs) {
  const payload = result.ok ? result.payload : {};
  const tasks = Array.isArray(payload.extractedTasks) ? payload.extractedTasks : [];
  const checks = evaluateChecks(testCase, payload, tasks, result.error);
  const passed = checks.every((check) => check.passed);

  return {
    id: testCase.id,
    name: testCase.name,
    durationMs,
    passed,
    status: passed ? "OK" : "CHECK",
    source: payload.source || "unknown",
    taskCount: tasks.length,
    expectedMinTaskCount: testCase.expectations?.minTaskCount ?? null,
    expectedTitles: testCase.expectations?.expectedTitles || [],
    matchedTitles: checks.find((check) => check.name === "expectedTitles")?.details?.matched || [],
    missingTitles: checks.find((check) => check.name === "expectedTitles")?.details?.missing || [],
    expectedHardSignals: testCase.expectations?.expectedHardSignals || [],
    detectedHardSignals: detectHardSignals(tasks),
    checks,
    error: result.error || null,
    titles: tasks.map((task) => task.title),
    tasks: tasks.map((task) => ({
      title: task.title,
      deadline: task.deadline || "",
      category: task.category || "",
      urgency: task.urgency,
      blockingRisk: task.blockingRisk,
      explicitToday: Boolean(task.explicitToday)
    })),
    warnings: payload.warnings || [],
    notes: testCase.notes
  };
}

function evaluateChecks(testCase, payload, tasks, error) {
  const expectations = testCase.expectations || {};
  const checks = [];

  checks.push({
    name: "request",
    passed: !error,
    details: error ? { error } : {}
  });

  const expectedMinTaskCount = expectations.minTaskCount ?? 0;
  checks.push({
    name: "minTaskCount",
    passed: tasks.length >= expectedMinTaskCount,
    details: {
      actual: tasks.length,
      expectedMin: expectedMinTaskCount
    }
  });

  const titleMatches = matchExpectedTitles(expectations.expectedTitles || [], tasks.map((task) => task.title));
  checks.push({
    name: "expectedTitles",
    passed: titleMatches.missing.length === 0,
    details: titleMatches
  });

  const detectedSignals = detectHardSignals(tasks);
  const missingSignals = (expectations.expectedHardSignals || []).filter((signal) => !detectedSignals.includes(signal));
  checks.push({
    name: "expectedHardSignals",
    passed: missingSignals.length === 0,
    details: {
      detected: detectedSignals,
      missing: missingSignals
    }
  });

  const fallbackAllowed = expectations.shouldFallbackAllowed !== false;
  checks.push({
    name: "source",
    passed: fallbackAllowed || payload.source !== "fallback",
    details: {
      actual: payload.source || "unknown",
      fallbackAllowed
    }
  });

  return checks;
}

function matchExpectedTitles(expectedTitles, actualTitles) {
  const matched = [];
  const missing = [];

  expectedTitles.forEach((expectedTitle) => {
    const actualTitle = actualTitles.find((title) => titlesAreClose(expectedTitle, title));
    if (actualTitle) {
      matched.push({ expected: expectedTitle, actual: actualTitle });
    } else {
      missing.push(expectedTitle);
    }
  });

  return {
    matched,
    missing
  };
}

function titlesAreClose(expectedTitle, actualTitle) {
  const expected = normalizeTitle(expectedTitle);
  const actual = normalizeTitle(actualTitle);
  if (!expected || !actual) return false;
  if (expected.includes(actual) || actual.includes(expected)) return true;
  return longestCommonSubsequenceLength(expected, actual) / expected.length >= 0.6;
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]/gu, "");
}

function longestCommonSubsequenceLength(left, right) {
  const previous = new Array(right.length + 1).fill(0);
  const current = new Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = left[i - 1] === right[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
      current[j] = 0;
    }
  }

  return previous[right.length];
}

function detectHardSignals(tasks) {
  const signals = new Set();
  tasks.forEach((task) => {
    if (String(task.deadline || "").trim()) signals.add("deadline");
    if (Number(task.blockingRisk) >= 4) signals.add("blocking");
    if (task.explicitToday) signals.add("explicitToday");
  });
  return Array.from(signals);
}

function printSummary(summary) {
  console.log(`\n[${summary.status}] ${summary.id} - ${summary.name}`);
  console.log(`source=${summary.source} duration=${summary.durationMs}ms tasks=${summary.taskCount}`);
  if (summary.error) {
    console.log(`error=${summary.error}`);
  }
  summary.checks
    .filter((check) => !check.passed)
    .forEach((check) => {
      console.log(`check:${check.name}=failed ${JSON.stringify(check.details)}`);
    });
  summary.tasks.forEach((task, index) => {
    console.log(
      `  ${index + 1}. ${task.title} | deadline=${task.deadline || "-"} | category=${task.category || "-"} | urgency=${task.urgency} | blocking=${task.blockingRisk} | explicitToday=${task.explicitToday}`
    );
  });
  if (summary.warnings.length > 0) {
    console.log(`warnings=${summary.warnings.join(" / ")}`);
  }
}

function summarizeRun(results) {
  const failedCases = results.filter((result) => !result.passed).length;
  const fallbackCases = results.filter((result) => result.source === "fallback").length;
  const modelCases = results.filter((result) => result.source === "model").length;
  const durations = results.map((result) => result.durationMs);
  const averageDurationMs =
    durations.length > 0 ? Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length) : 0;

  return {
    totalCases: results.length,
    passedCases: results.length - failedCases,
    failedCases,
    passRate: results.length > 0 ? Math.round(((results.length - failedCases) / results.length) * 10000) / 100 : 0,
    modelCases,
    fallbackCases,
    averageDurationMs
  };
}

function formatError(error) {
  const causeMessage = error.cause?.message;
  return causeMessage ? `${error.message}: ${causeMessage}` : error.message;
}

function printRunSummary(summary) {
  console.log("\nEval summary");
  console.log(
    `passed=${summary.passedCases}/${summary.totalCases} passRate=${summary.passRate}% model=${summary.modelCases} fallback=${summary.fallbackCases} avgDuration=${summary.averageDurationMs}ms`
  );
  if (!strictMode && summary.failedCases > 0) {
    console.log("Quality checks are advisory by default. Use npm run eval:model -- --strict to fail on CHECK cases.");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
