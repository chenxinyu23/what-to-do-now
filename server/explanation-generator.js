const { getHardConstraintReason, isOutOfToday } = require("./reorder-engine");

function getArrangementGroup(task) {
  if (isOutOfToday(task)) return "不放进今天";
  if (task.recommendation === "do_now") return "现在做";
  return "今天晚点做";
}

function getHardConstraintText(reason) {
  const labels = {
    deadline: "临近截止",
    blocking: "阻塞风险",
    explicit_today: "必须今天完成的明确要求"
  };
  return labels[reason] || "硬约束";
}

function generateTaskReason(task, preservedIds, brokenAfterIds) {
  if (task.manualStatus === "manual_out") {
    const hardReason = getHardConstraintReason(task);
    return hardReason
      ? `你曾手动移出今天；但它出现${getHardConstraintText(hardReason)}，建议你确认是否放回今天。`
      : "你手动把它移出了今天，系统默认不再放回今日队列。";
  }

  if (task.manualStatus === "manual_order") {
    return "你手动调整了它的位置，系统会在后续重排中优先保留这个相对顺序。";
  }

  if (brokenAfterIds.has(task.id)) {
    return `因${getHardConstraintText(brokenAfterIds.get(task.id))}，临时优先于你的手动排序。`;
  }

  if (preservedIds.has(task.id) && task.change !== "new") {
    return "保留你的手动调整，同时结合当前分数维持在这个位置。";
  }

  if (task.reason) return task.reason;

  const reasons = [];
  if (task.urgency >= 4) reasons.push("截止时间较近");
  if (task.goalImpact >= 4) reasons.push("目标影响较大");
  if (task.blockingRisk >= 4) reasons.push("阻塞风险较高");
  if (task.taskValue >= 4) reasons.push("任务价值较高");
  if (task.energyFit >= 4) reasons.push("精力匹配度好");
  if (task.effort <= 2) reasons.push("耗时较短");

  if (reasons.length === 0) return "根据综合评分排序。";
  return `${reasons.join("，")}，因此${getReasonSuffix(task)}。`;
}

function getReasonSuffix(task) {
  if (task.change === "new") return "新增到队列";
  if (task.change === "up") return "排名上升";
  if (task.change === "down") return "排名下降";
  if (task.recommendation === "do_now") return "建议立即处理";
  if (task.recommendation === "do_today") return "建议今天完成";
  if (task.recommendation === "schedule_later") return "建议今天晚点处理";
  if (task.recommendation === "remove_today") return "建议移出今天";
  return "保持当前位置";
}

function generateSummary(tasks, source, preservedManualConstraints, brokenManualConstraints) {
  const highPriority = tasks.filter((task) => task.score >= 4.0 && !isOutOfToday(task)).length;
  const removed = tasks.filter((task) => isOutOfToday(task)).length;
  const changed = tasks.filter((task) => task.change === "up" || task.change === "down").length;

  let summary = source === "fallback" ? "本次使用本地兜底规则完成重排。" : "本次重排完成。";
  if (highPriority > 0) summary += ` 发现 ${highPriority} 个高优先级任务。`;
  if (changed > 0) summary += ` ${changed} 个任务排名发生变化。`;
  if (removed > 0) summary += ` ${removed} 个任务不放进今天。`;
  if (preservedManualConstraints.length > 0) summary += " 已将你的手动排序作为今日偏好保留。";
  if (brokenManualConstraints.length > 0) summary += " 有硬约束任务临时优先于手动排序，并已说明原因。";
  return summary;
}

function generateChangeEvents(previousTasks, reorderedTasks) {
  const previousById = new Map(previousTasks.map((task) => [task.id, task]));

  return reorderedTasks
    .map((task) => {
      const previousTask = previousById.get(task.id);
      const previousGroup = previousTask ? getArrangementGroup(previousTask) : "新想法";
      const currentGroup = getArrangementGroup(task);
      const eventType = getEventType(task, previousTask, previousGroup, currentGroup);
      if (eventType === "same") return null;
      return {
        id: `event_${task.id}`,
        type: eventType,
        label: getEventLabel(eventType),
        className: getEventClass(eventType),
        title: task.title,
        from: previousGroup,
        to: currentGroup,
        reason: task.reason,
        score: task.score || 0
      };
    })
    .filter(Boolean);
}

function getEventType(task, previousTask, previousGroup, currentGroup) {
  if (task.manualStatus === "manual_order") return "manual_order";
  if (task.manualStatus === "manual_out") return "manual_out";
  if (!previousTask || task.change === "new") {
    if (currentGroup === "不放进今天") return "new_out";
    return currentGroup === "现在做" ? "new_now" : "new_later";
  }
  if (currentGroup === "不放进今天" && previousGroup !== "不放进今天") return "removed";
  if (currentGroup === "现在做" && previousGroup !== "现在做") return "promoted";
  if (currentGroup === "今天晚点做" && previousGroup === "现在做") return "delayed";
  if (task.change === "up") return "promoted";
  if (task.change === "down") return "delayed";
  return "same";
}

function getEventLabel(eventType) {
  const labels = {
    new_now: "新增到现在做",
    new_later: "新增到今天晚点做",
    new_out: "新增但不放进今天",
    promoted: "提前处理",
    delayed: "被挤到稍后",
    removed: "移出今天",
    manual_order: "用户调整",
    manual_out: "用户移出"
  };
  return labels[eventType] || "保持不变";
}

function getEventClass(eventType) {
  if (eventType === "new_now" || eventType === "new_later" || eventType === "new_out") return "event-new";
  if (eventType === "promoted" || eventType === "manual_order") return "event-promoted";
  if (eventType === "delayed") return "event-delayed";
  if (eventType === "removed" || eventType === "manual_out") return "event-removed";
  return "event-same";
}

function explainTasks(tasks, preservedManualConstraints, brokenManualConstraints) {
  const preservedIds = new Set(preservedManualConstraints.flatMap((item) => [item.beforeTaskId, item.afterTaskId]));
  const brokenAfterIds = new Map(brokenManualConstraints.map((item) => [item.afterTaskId, item.reason]));
  return tasks.map((task) => ({
    ...task,
    manualStatus: preservedIds.has(task.id) && !task.manualStatus && task.change !== "new" ? "manual_preserved" : task.manualStatus,
    reason: generateTaskReason(task, preservedIds, brokenAfterIds)
  }));
}

module.exports = {
  explainTasks,
  generateChangeEvents,
  generateSummary,
  getArrangementGroup
};
