function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 3;
  return Math.min(5, Math.max(1, numeric));
}

function calculateScore(task) {
  const urgency = clampScore(task.urgency);
  const goalImpact = clampScore(task.goalImpact);
  const blockingRisk = clampScore(task.blockingRisk);
  const taskValue = clampScore(task.taskValue);
  const energyFit = clampScore(task.energyFit);
  const effort = clampScore(task.effort);

  const baseScore =
    urgency * 0.30 +
    goalImpact * 0.25 +
    blockingRisk * 0.20 +
    taskValue * 0.15 +
    energyFit * 0.10;

  const effortPenalty = effort >= 5 ? 0.35 : effort === 4 ? 0.20 : effort <= 2 ? -0.10 : 0;
  return Math.round((baseScore - effortPenalty) * 100) / 100;
}

function scoreTasks(tasks) {
  return tasks.map((task) => ({
    ...task,
    urgency: clampScore(task.urgency),
    goalImpact: clampScore(task.goalImpact),
    blockingRisk: clampScore(task.blockingRisk),
    effort: clampScore(task.effort),
    energyFit: clampScore(task.energyFit),
    taskValue: clampScore(task.taskValue),
    score: calculateScore(task)
  }));
}

module.exports = {
  calculateScore,
  clampScore,
  scoreTasks
};
