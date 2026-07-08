function getRecommendation(score, task) {
  if (task.manualStatus === "manual_out") return "remove_today";
  if (score >= 4.0 && (task.urgency >= 4 || task.blockingRisk >= 4 || task.explicitToday)) return "do_now";
  if (score >= 3.5) return "do_today";
  if (score >= 2.5) return "schedule_later";
  return "remove_today";
}

function isOutOfToday(task) {
  return task.recommendation === "remove_today" || task.recommendation === "merge" || task.manualStatus === "manual_out";
}

function getHardConstraintReason(task) {
  if (task.urgency >= 5) return "deadline";
  if (task.blockingRisk >= 5) return "blocking";
  if (task.explicitToday) return "explicit_today";
  return null;
}

function getChangeState(task, currentRank) {
  if (task.manualStatus === "manual_order") return "manual_order";
  if (task.manualStatus === "manual_out") return "out";
  if (task.change === "new") return "new";
  if (currentRank === null) return "out";
  if (task.previousRank !== null && currentRank < task.previousRank) return "up";
  if (task.previousRank !== null && currentRank > task.previousRank) return "down";
  return "same";
}

function applyManualOutRules(tasks, manualOutIds = []) {
  const manualOutSet = new Set(manualOutIds);
  return tasks.map((task) => {
    if (!manualOutSet.has(task.id)) return task;

    return {
      ...task,
      recommendation: "remove_today",
      currentRank: null,
      change: task.change === "new" ? "new" : "out",
      manualStatus: "manual_out"
    };
  });
}

function reorderTasks(scoredTasks, manualOrderConstraints = []) {
  const sorted = [...scoredTasks].sort((a, b) => b.score - a.score);
  const activeTasks = sorted.filter((task) => !isOutOfToday(task));
  const outTasks = sorted.filter((task) => isOutOfToday(task));
  const preservedManualConstraints = [];
  const brokenManualConstraints = [];

  manualOrderConstraints.forEach((constraint) => {
    const beforeIndex = activeTasks.findIndex((task) => task.id === constraint.beforeTaskId);
    const afterIndex = activeTasks.findIndex((task) => task.id === constraint.afterTaskId);
    if (beforeIndex === -1 || afterIndex === -1) return;
    if (beforeIndex < afterIndex) {
      preservedManualConstraints.push(constraint);
      return;
    }

    const beforeTask = activeTasks[beforeIndex];
    const afterTask = activeTasks[afterIndex];
    const hardReason = getHardConstraintReason(afterTask);

    if (hardReason && !getHardConstraintReason(beforeTask)) {
      brokenManualConstraints.push({ ...constraint, reason: hardReason });
      return;
    }

    activeTasks.splice(beforeIndex, 1);
    const newAfterIndex = activeTasks.findIndex((task) => task.id === constraint.afterTaskId);
    activeTasks.splice(newAfterIndex, 0, beforeTask);
    preservedManualConstraints.push(constraint);
  });

  const rankedActiveTasks = activeTasks.map((task, index) => {
    const currentRank = index + 1;
    return {
      ...task,
      currentRank,
      recommendation: getRecommendation(task.score, task),
      change: getChangeState(task, currentRank)
    };
  });

  const rankedOutTasks = outTasks.map((task) => ({
    ...task,
    currentRank: null,
    recommendation: "remove_today",
    change: getChangeState(task, null)
  }));

  return {
    tasks: [...rankedActiveTasks, ...rankedOutTasks],
    preservedManualConstraints,
    brokenManualConstraints
  };
}

module.exports = {
  applyManualOutRules,
  getHardConstraintReason,
  getRecommendation,
  isOutOfToday,
  reorderTasks
};
