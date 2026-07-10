const { getRuleProfile } = require("./rule-profiles");

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 3;
  return Math.min(5, Math.max(1, numeric));
}

function calculateScore(task, rulePreset = "balanced") {
  const { ruleProfile } = getRuleProfile(rulePreset);
  const urgency = clampScore(task.urgency);
  const goalImpact = clampScore(task.goalImpact);
  const blockingRisk = clampScore(task.blockingRisk);
  const taskValue = clampScore(task.taskValue);
  const energyFit = clampScore(task.energyFit);
  const effort = clampScore(task.effort);

  const baseScore =
    urgency * ruleProfile.weights.urgency +
    goalImpact * ruleProfile.weights.goalImpact +
    blockingRisk * ruleProfile.weights.blockingRisk +
    taskValue * ruleProfile.weights.taskValue +
    energyFit * ruleProfile.weights.energyFit;

  const effortAdjustment =
    effort >= 5 ? ruleProfile.effortPolicy.high :
      effort === 4 ? ruleProfile.effortPolicy.mediumHigh :
        effort <= 2 ? ruleProfile.effortPolicy.low :
          0;
  return Math.round((baseScore + effortAdjustment) * 100) / 100;
}

function scoreTasks(tasks, rulePreset = "balanced") {
  return tasks.map((task) => ({
    ...task,
    urgency: clampScore(task.urgency),
    goalImpact: clampScore(task.goalImpact),
    blockingRisk: clampScore(task.blockingRisk),
    effort: clampScore(task.effort),
    energyFit: clampScore(task.energyFit),
    taskValue: clampScore(task.taskValue),
    score: calculateScore(task, rulePreset)
  }));
}

module.exports = {
  calculateScore,
  clampScore,
  scoreTasks
};
