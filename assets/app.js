class AttentionReorderApp {
  constructor() {
    this.storageKey = "attention_queue_demo_state";
    this.dragState = null;
    this.longPressTimer = null;
    this.pressStartPos = null;
    this.state = {
      rawInput: "",
      todayGoal: "完成 AI 创意大赛 Demo 初赛提交",
      currentQueue: [],
      lastQueue: [],
      extractedTasks: [],
      reorderResult: null,
      manualOrderConstraints: [],
      manualOutIds: [],
      lastManualMessage: "",
      isProcessing: false,
      speechSupported: false,
      isIdeaSheetOpen: false,
      isEditingGoal: false,
      goalDraft: "",
      isGoalDirty: false
    };
    this.init();
  }

  init() {
    this.checkSpeechSupport();
    this.loadInitialState();
    this.render();
  }

  checkSpeechSupport() {
    this.state.speechSupported = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
  }

  loadInitialState() {
    const savedState = this.loadSavedState();
    if (savedState) {
      this.state = {
        ...this.state,
        ...savedState,
        isProcessing: false,
        speechSupported: this.state.speechSupported
      };
      return;
    }

    this.state.currentQueue = this.normalizeInitialQueue(DEMO_DATA.initialQueue);
    this.state.lastQueue = [];
  }

  normalizeInitialQueue(tasks) {
    return tasks.map((task, index) => ({
      ...task,
      previousRank: task.previousRank || index + 1,
      currentRank: task.currentRank || index + 1,
      manualStatus: task.manualStatus || null
    }));
  }

  loadSavedState() {
    try {
      const rawState = localStorage.getItem(this.storageKey);
      if (!rawState) return null;

      const parsed = JSON.parse(rawState);
      if (!Array.isArray(parsed.currentQueue)) return null;

      return {
        rawInput: parsed.rawInput || "",
        todayGoal: parsed.todayGoal || "完成 AI 创意大赛 Demo 初赛提交",
        currentQueue: parsed.currentQueue,
        lastQueue: parsed.lastQueue || [],
        extractedTasks: parsed.extractedTasks || [],
        reorderResult: parsed.reorderResult || null,
        manualOrderConstraints: parsed.manualOrderConstraints || [],
        manualOutIds: parsed.manualOutIds || [],
        lastManualMessage: parsed.lastManualMessage || "",
        goalDraft: parsed.todayGoal || "完成 AI 创意大赛 Demo 初赛提交",
        isGoalDirty: Boolean(parsed.isGoalDirty)
      };
    } catch (error) {
      localStorage.removeItem(this.storageKey);
      return null;
    }
  }

  persistState() {
    try {
      const persisted = {
        rawInput: this.state.rawInput,
        todayGoal: this.state.todayGoal,
        currentQueue: this.state.currentQueue,
        lastQueue: this.state.lastQueue,
        extractedTasks: this.state.extractedTasks,
        reorderResult: this.state.reorderResult,
        manualOrderConstraints: this.state.manualOrderConstraints,
        manualOutIds: this.state.manualOutIds,
        lastManualMessage: this.state.lastManualMessage,
        isGoalDirty: this.state.isGoalDirty
      };
      localStorage.setItem(this.storageKey, JSON.stringify(persisted));
    } catch (error) {
      this.showToast("本地保存失败，本次仍可继续体验");
    }
  }

  resetDemo() {
    localStorage.removeItem(this.storageKey);
    this.state.rawInput = "";
    this.state.todayGoal = "完成 AI 创意大赛 Demo 初赛提交";
    this.state.currentQueue = this.normalizeInitialQueue(DEMO_DATA.initialQueue);
    this.state.lastQueue = [];
    this.state.extractedTasks = [];
    this.state.reorderResult = null;
    this.state.manualOrderConstraints = [];
    this.state.manualOutIds = [];
    this.state.lastManualMessage = "";
    this.state.isIdeaSheetOpen = false;
    this.state.isEditingGoal = false;
    this.state.goalDraft = this.state.todayGoal;
    this.state.isGoalDirty = false;
    this.showToast("已恢复默认队列");
    this.render();
  }

  bindEvents() {
    const openIdeaBtn = document.getElementById("open-idea-btn");
    const reorderBtn = document.getElementById("reorder-btn");
    const inputText = document.getElementById("input-text");
    const voiceBtn = document.getElementById("voice-btn");
    const resetBtn = document.getElementById("reset-btn");
    const closeSheetBtn = document.getElementById("close-idea-sheet");
    const sheetBackdrop = document.getElementById("idea-sheet-backdrop");
    const editGoalBtn = document.getElementById("edit-goal-btn");
    const cancelGoalBtn = document.getElementById("cancel-goal-btn");
    const saveGoalBtn = document.getElementById("save-goal-btn");
    const rerankGoalBtn = document.getElementById("rerank-goal-btn");
    const goalDraft = document.getElementById("goal-draft");

    if (openIdeaBtn) openIdeaBtn.onclick = () => this.openIdeaSheet();
    if (closeSheetBtn) closeSheetBtn.onclick = () => this.closeIdeaSheet();
    if (sheetBackdrop) sheetBackdrop.onclick = () => this.closeIdeaSheet();
    if (reorderBtn) reorderBtn.onclick = () => this.handleReorder();
    if (voiceBtn) voiceBtn.onclick = () => this.handleVoiceInput();
    if (resetBtn) resetBtn.onclick = () => this.resetDemo();
    if (editGoalBtn) editGoalBtn.onclick = () => this.startGoalEdit();
    if (cancelGoalBtn) cancelGoalBtn.onclick = () => this.cancelGoalEdit();
    if (saveGoalBtn) saveGoalBtn.onclick = () => this.saveGoalEdit();
    if (rerankGoalBtn) rerankGoalBtn.onclick = () => this.handleRerankOnly();

    if (goalDraft) {
      goalDraft.oninput = (event) => {
        this.state.goalDraft = event.target.value;
      };
    }

    if (inputText) {
      inputText.oninput = (event) => {
        this.state.rawInput = event.target.value;
        this.persistState();
      };
      inputText.onkeypress = (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          this.handleReorder();
        }
      };
    }

    document.querySelectorAll(".example-btn").forEach((btn) => {
      btn.onclick = (event) => {
        const exampleId = event.currentTarget.dataset.exampleId;
        this.loadExample(exampleId);
      };
    });
  }

  bindDragEvents() {
    document.querySelectorAll(".task-card[data-draggable='true']").forEach((card) => {
      card.onpointerdown = null;
    });
    document.querySelectorAll(".drag-handle").forEach((handle) => {
      handle.onpointerdown = (event) => this.handleDragStart(event, handle.closest(".task-card[data-draggable='true']"));
    });
  }

  loadExample(exampleId) {
    const example = DEMO_DATA.examples.find((item) => item.id === exampleId);
    if (!example) return;

    const input = document.getElementById("input-text");
    if (input) input.value = example.input;
    this.state.rawInput = example.input;
    this.persistState();
  }

  async handleReorder() {
    const inputText = this.state.rawInput.trim();
    if (!inputText) {
      this.showToast("请输入一个想法或任务");
      return;
    }

    this.state.rawInput = inputText;
    this.state.isProcessing = true;
    this.render();

    try {
      const previousQueue = this.cloneTasks(this.state.currentQueue);
      const result = await this.requestReorder(inputText, previousQueue);

      this.state.lastQueue = previousQueue;
      this.state.extractedTasks = result.extractedTasks;
      this.state.currentQueue = result.allTasks;
      this.state.reorderResult = result;
      this.state.isProcessing = false;
      this.state.rawInput = "";
      this.state.isIdeaSheetOpen = false;
      this.persistState();
      this.render();
    } catch (error) {
      this.state.isProcessing = false;
      this.showToast("重排失败，请重试");
      this.render();
    }
  }

  async handleRerankOnly() {
    if (this.state.isProcessing) return;

    this.state.isProcessing = true;
    this.render();

    try {
      const previousQueue = this.cloneTasks(this.state.currentQueue);
      const result = await this.requestReorder("", previousQueue);

      this.state.lastQueue = previousQueue;
      this.state.extractedTasks = [];
      this.state.currentQueue = result.allTasks;
      this.state.reorderResult = result;
      this.state.isProcessing = false;
      this.state.isGoalDirty = false;
      this.persistState();
      this.render();
      this.showToast("已按新的今日目标重新安排");
    } catch (error) {
      this.state.isProcessing = false;
      this.showToast("重新安排失败，请重试");
      this.render();
    }
  }

  openIdeaSheet() {
    this.state.isIdeaSheetOpen = true;
    this.render();
  }

  closeIdeaSheet() {
    if (this.state.isProcessing) return;
    this.state.isIdeaSheetOpen = false;
    this.render();
  }

  startGoalEdit() {
    this.state.goalDraft = this.state.todayGoal;
    this.state.isEditingGoal = true;
    this.render();
  }

  cancelGoalEdit() {
    this.state.goalDraft = this.state.todayGoal;
    this.state.isEditingGoal = false;
    this.render();
  }

  saveGoalEdit() {
    const nextGoal = this.state.goalDraft.trim() || "完成 AI 创意大赛 Demo 初赛提交";
    this.state.todayGoal = nextGoal;
    this.state.goalDraft = nextGoal;
    this.state.isEditingGoal = false;
    this.state.isGoalDirty = true;
    this.persistState();
    this.render();
  }

  async requestReorder(inputText, previousQueue) {
    const requestBody = this.buildReorderRequest(inputText);

    try {
      const response = await fetch("/api/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const result = await response.json();
      if (!Array.isArray(result.allTasks)) throw new Error("API result missing allTasks");
      if (result.source === "fallback") {
        this.showToast("本次使用本地兜底规则完成重排");
      }
      return result;
    } catch (error) {
      const fallbackResult = this.processReorder(inputText, previousQueue);
      return {
        ...fallbackResult,
        source: "fallback",
        summary: `本次使用本地兜底规则完成重排。${fallbackResult.summary}`,
        warnings: ["后端 API 不可用，已使用本地兜底规则完成重排"]
      };
    }
  }

  buildReorderRequest(inputText) {
    return {
      rawInput: inputText,
      todayGoal: this.state.todayGoal || "完成 AI 创意大赛 Demo 初赛提交",
      currentQueue: this.getTodayTasks(this.state.currentQueue),
      outOfToday: this.getOutOfTodayTasks(this.state.currentQueue),
      manualOrderConstraints: this.state.manualOrderConstraints,
      manualOutIds: this.state.manualOutIds,
      userContext: {
        currentTimeLabel: this.getCurrentTimeLabel(),
        energyLevel: "medium"
      }
    };
  }

  getCurrentTimeLabel() {
    const hour = new Date().getHours();
    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    if (hour < 22) return "evening";
    return "night";
  }

  handleVoiceInput() {
    if (!this.state.speechSupported) {
      this.showToast("当前浏览器不支持语音识别，请使用文字输入");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    this.showToast("正在听...");

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      document.getElementById("input-text").value = transcript;
      this.state.rawInput = transcript;
      this.showToast("语音输入完成");
    };

    recognition.onerror = () => {
      this.showToast("语音识别失败，请重试");
    };

    recognition.start();
  }

  processReorder(inputText, previousQueue) {
    const extractedTasks = this.taskExtractor(inputText);
    const normalizedTasks = this.normalizeTaskDrafts(extractedTasks, inputText);
    const mergedTasks = this.mergeWithCurrentQueue(previousQueue, normalizedTasks);
    const scoredTasks = this.scoringEngine(mergedTasks);
    const manuallyFilteredTasks = this.applyManualOutRules(scoredTasks);
    const reorderPayload = this.reorderEngine(manuallyFilteredTasks);
    const explainedTasks = this.explanationGenerator(
      reorderPayload.tasks,
      reorderPayload.preservedManualConstraints,
      reorderPayload.brokenManualConstraints
    );

    const queue = this.getTodayTasks(explainedTasks);
    const outOfToday = this.getOutOfTodayTasks(explainedTasks);
    const changeEvents = this.generateChangeEvents(previousQueue, explainedTasks);

    return {
      source: "fallback",
      summary: this.generateSummary(
        explainedTasks,
        reorderPayload.preservedManualConstraints,
        reorderPayload.brokenManualConstraints
      ),
      inputText,
      extractedTasks: normalizedTasks,
      queue,
      outOfToday,
      tradeoffSuggestions: this.generateTradeoffSuggestions(explainedTasks),
      changeEvents,
      preservedManualConstraints: reorderPayload.preservedManualConstraints,
      brokenManualConstraints: reorderPayload.brokenManualConstraints,
      allTasks: explainedTasks,
      warnings: []
    };
  }

  taskExtractor(inputText) {
    if (!inputText.trim()) return [];

    for (const example of DEMO_DATA.examples) {
      if (inputText.includes(example.input) || example.input.includes(inputText)) {
        return example.extractedTasks.map((task) => ({ ...task }));
      }
    }

    const deadline = this.extractDeadlineText(inputText);
    const tasks = this.splitTaskText(inputText).map((taskText) => this.createDefaultTask(taskText, inputText, deadline));

    if (tasks.length === 0) {
      tasks.push(this.createDefaultTask(inputText, inputText, deadline));
    }

    return tasks;
  }

  createDefaultTask(title, inputText = "", deadline = "") {
    const explicitToday = this.hasExplicitTodaySignal(inputText);
    const hasDeadline = Boolean(deadline);
    return {
      title,
      deadline: deadline || (explicitToday ? "今天" : ""),
      category: "other",
      source: "text_input",
      urgency: explicitToday ? 5 : hasDeadline ? 4 : 3,
      goalImpact: explicitToday ? 4 : 3,
      blockingRisk: 2,
      effort: 3,
      energyFit: 3,
      taskValue: 3,
      recommendation: explicitToday ? "do_now" : "do_today",
      reason: explicitToday
        ? "输入中包含明确的今天优先信号。"
        : hasDeadline
          ? `输入中包含截止时间：${deadline}。`
          : "根据输入自动识别的任务。",
      explicitToday
    };
  }

  splitTaskText(inputText) {
    const boundaryKeywords = ["还要", "顺便", "然后", "另外", "以及", "还有"];
    const normalizedInput = boundaryKeywords.reduce(
      (text, keyword) => text.replaceAll(keyword, "，"),
      inputText
    );
    const seen = new Set();

    return normalizedInput
      .split(/[、，,；;\n]+/g)
      .map((taskText) => this.cleanTaskTitle(taskText))
      .filter((title) => title.length >= 2)
      .filter((title) => {
        if (seen.has(title)) return false;
        seen.add(title);
        return true;
      });
  }

  cleanTaskTitle(taskText) {
    return String(taskText || "")
      .trim()
      .replace(/[。.!！?？]+$/g, "")
      .replace(/^(今天下午|今天晚上|今天上午|明天中午前|明天上午|明天下午|明天晚上|本周内|这周内|今天|今晚|明天|上午|下午|晚上|早上|中午|本周|这周)\s*/, "")
      .replace(/^(?:(先|再|想要|需要|一定要|必须|记得|可以|要|得|想|把)\s*)+/, "")
      .trim();
  }

  extractDeadlineText(inputText) {
    const patterns = [
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
    return patterns.find((pattern) => inputText.includes(pattern)) || "";
  }

  normalizeTaskDrafts(taskDrafts, inputText) {
    return taskDrafts.map((draft, index) => ({
      id: `task_${Date.now()}_${index}`,
      ...draft,
      urgency: draft.urgency || 3,
      goalImpact: draft.goalImpact || 3,
      blockingRisk: draft.blockingRisk || 2,
      effort: draft.effort || 3,
      energyFit: draft.energyFit || 3,
      taskValue: draft.taskValue || 3,
      explicitToday: draft.explicitToday || this.hasExplicitTodaySignal(inputText),
      score: 0,
      previousRank: null,
      currentRank: null,
      change: "new",
      manualStatus: null
    }));
  }

  mergeWithCurrentQueue(currentQueue, newTasks) {
    const existingIds = new Set(currentQueue.map((task) => task.id));
    const merged = currentQueue.map((task) => ({
      ...task,
      previousRank: task.currentRank,
      manualStatus: task.manualStatus || null
    }));

    newTasks.forEach((task) => {
      if (!existingIds.has(task.id)) merged.push(task);
    });

    return merged;
  }

  scoringEngine(tasks) {
    return tasks.map((task) => {
      const score =
        task.urgency * 0.30 +
        task.goalImpact * 0.25 +
        task.blockingRisk * 0.20 +
        task.taskValue * 0.15 +
        task.energyFit * 0.10;
      const effortPenalty = task.effort >= 5 ? 0.35 : task.effort === 4 ? 0.20 : task.effort <= 2 ? -0.10 : 0;

      return {
        ...task,
        score: Math.round((score - effortPenalty) * 100) / 100
      };
    });
  }

  applyManualOutRules(tasks) {
    const manualOutIds = new Set(this.state.manualOutIds);
    return tasks.map((task) => {
      if (!manualOutIds.has(task.id)) return task;

      const hardReason = this.getHardConstraintReason(task);
      return {
        ...task,
        recommendation: "remove_today",
        change: task.change === "new" ? "new" : "out",
        manualStatus: "manual_out",
        reason: hardReason
          ? `你曾手动移出今天；但它出现${this.getHardConstraintText(hardReason)}，建议你确认是否放回今天。`
          : "你手动把它移出了今天，系统默认不再放回今日队列。"
      };
    });
  }

  reorderEngine(scoredTasks) {
    const sorted = [...scoredTasks].sort((a, b) => b.score - a.score);
    const activeTasks = sorted.filter((task) => !this.isOutOfToday(task));
    const outTasks = sorted.filter((task) => this.isOutOfToday(task));
    const preservedManualConstraints = [];
    const brokenManualConstraints = [];

    this.state.manualOrderConstraints.forEach((constraint) => {
      const beforeIndex = activeTasks.findIndex((task) => task.id === constraint.beforeTaskId);
      const afterIndex = activeTasks.findIndex((task) => task.id === constraint.afterTaskId);
      if (beforeIndex === -1 || afterIndex === -1) return;
      if (beforeIndex < afterIndex) {
        preservedManualConstraints.push(constraint);
        return;
      }

      const beforeTask = activeTasks[beforeIndex];
      const afterTask = activeTasks[afterIndex];
      const hardReason = this.getHardConstraintReason(afterTask);

      if (hardReason && !this.getHardConstraintReason(beforeTask)) {
        brokenManualConstraints.push({
          ...constraint,
          reason: hardReason
        });
        return;
      }

      activeTasks.splice(beforeIndex, 1);
      const newAfterIndex = activeTasks.findIndex((task) => task.id === constraint.afterTaskId);
      activeTasks.splice(newAfterIndex, 0, beforeTask);
      preservedManualConstraints.push(constraint);
    });

    const rerankedActiveTasks = activeTasks.map((task, index) => {
      const currentRank = index + 1;
      const recommendation = task.manualStatus === "manual_order"
        ? this.getManualRecommendation(task, index)
        : this.getRecommendation(task.score, task);
      return {
        ...task,
        currentRank,
        recommendation,
        change: this.getChangeState(task, currentRank)
      };
    });

    const rerankedOutTasks = outTasks.map((task) => ({
      ...task,
      currentRank: null,
      recommendation: "remove_today",
      change: task.manualStatus === "manual_out" ? "out" : this.getChangeState(task, null)
    }));

    return {
      tasks: [...rerankedActiveTasks, ...rerankedOutTasks],
      preservedManualConstraints,
      brokenManualConstraints
    };
  }

  getManualRecommendation(task, index) {
    if (index === 0) return "do_now";
    if (task.score >= 3.5) return "do_today";
    return "schedule_later";
  }

  getRecommendation(score, task) {
    if (task.manualStatus === "manual_out") return "remove_today";
    if (score >= 4.0 && (task.urgency >= 4 || task.blockingRisk >= 4 || task.explicitToday)) return "do_now";
    if (score >= 3.5) return "do_today";
    if (score >= 2.5) return "schedule_later";
    return "remove_today";
  }

  getChangeState(task, currentRank) {
    if (task.manualStatus === "manual_order") return "manual_order";
    if (task.manualStatus === "manual_out") return "out";
    if (task.change === "new") return "new";
    if (currentRank === null) return "out";
    if (task.previousRank !== null && currentRank < task.previousRank) return "up";
    if (task.previousRank !== null && currentRank > task.previousRank) return "down";
    return "same";
  }

  explanationGenerator(tasks, preservedConstraints, brokenConstraints) {
    const preservedIds = new Set(preservedConstraints.flatMap((item) => [item.beforeTaskId, item.afterTaskId]));
    const brokenAfterIds = new Map(brokenConstraints.map((item) => [item.afterTaskId, item.reason]));

    return tasks.map((task) => {
      if (task.manualStatus === "manual_out") return task;

      if (task.manualStatus === "manual_order") {
        return {
          ...task,
          reason: "你手动调整了它的位置，系统会在后续重排中优先保留这个相对顺序。"
        };
      }

      if (brokenAfterIds.has(task.id)) {
        const reason = brokenAfterIds.get(task.id);
        return {
          ...task,
          reason: `因${this.getHardConstraintText(reason)}，临时优先于你的手动排序。`
        };
      }

      if (preservedIds.has(task.id) && task.change !== "new") {
        return {
          ...task,
          manualStatus: task.manualStatus || "manual_preserved",
          reason: "保留你的手动调整，同时结合当前分数维持在这个位置。"
        };
      }

      if (task.reason) return task;

      const reasons = [];
      if (task.urgency >= 4) reasons.push("截止时间较近");
      if (task.goalImpact >= 4) reasons.push("目标影响较大");
      if (task.blockingRisk >= 4) reasons.push("阻塞风险较高");
      if (task.taskValue >= 4) reasons.push("任务价值较高");
      if (task.energyFit >= 4) reasons.push("精力匹配度好");
      if (task.effort <= 2) reasons.push("耗时较短");

      return {
        ...task,
        reason: reasons.length > 0 ? `${reasons.join("，")}，因此${this.getReasonSuffix(task)}。` : "根据综合评分排序。"
      };
    });
  }

  getReasonSuffix(task) {
    if (task.change === "new") return "新增到队列";
    if (task.change === "up") return "排名上升";
    if (task.change === "down") return "排名下降";
    if (task.recommendation === "do_now") return "建议立即处理";
    if (task.recommendation === "do_today") return "建议今天完成";
    if (task.recommendation === "schedule_later") return "建议今天晚点处理";
    if (task.recommendation === "merge") return "建议合并处理";
    if (task.recommendation === "remove_today") return "建议移出今天";
    return "保持当前位置";
  }

  generateSummary(tasks, preservedConstraints = [], brokenConstraints = []) {
    const highPriority = tasks.filter((task) => task.score >= 4.0 && !this.isOutOfToday(task)).length;
    const removed = tasks.filter((task) => this.isOutOfToday(task)).length;
    const changed = tasks.filter((task) => task.change === "up" || task.change === "down").length;

    let summary = "本次重排完成。";
    if (highPriority > 0) summary += ` 发现 ${highPriority} 个高优先级任务。`;
    if (changed > 0) summary += ` ${changed} 个任务排名发生变化。`;
    if (removed > 0) summary += ` ${removed} 个任务不放进今天。`;
    if (preservedConstraints.length > 0) summary += " 已将你的手动排序作为今日偏好保留。";
    if (brokenConstraints.length > 0) summary += " 有硬约束任务临时优先于手动排序，并已说明原因。";

    return summary;
  }

  generateTradeoffSuggestions(tasks) {
    return tasks
      .filter((task) => task.recommendation !== "do_now" && task.recommendation !== "do_today")
      .map((task) => ({
        taskId: task.id,
        action: task.recommendation,
        reason: task.reason
      }));
  }

  handleDragStart(event, card) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (!card) return;

    const taskId = card.dataset.taskId;
    if (!taskId) return;

    this.pressStartPos = { x: event.clientX, y: event.clientY };
    
    const startDrag = () => {
      this.longPressTimer = null;
      this.dragState = {
        taskId,
        card,
        pointerId: event.pointerId
      };

      card.setPointerCapture(event.pointerId);
      card.classList.add("dragging");
      document.body.classList.add("is-dragging-task");
      this.showToast("开始拖拽");
    };

    const LONG_PRESS_DURATION = event.pointerType === "touch" ? 300 : 150;
    
    this.longPressTimer = setTimeout(() => {
      startDrag();
    }, LONG_PRESS_DURATION);

    const cancelLongPress = () => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      card.removeEventListener("pointermove", checkMove);
      card.removeEventListener("pointerup", cancelLongPress);
      card.removeEventListener("pointercancel", cancelLongPress);
    };

    const checkMove = (moveEvent) => {
      const deltaX = Math.abs(moveEvent.clientX - this.pressStartPos.x);
      const deltaY = Math.abs(moveEvent.clientY - this.pressStartPos.y);
      if (deltaX > 10 || deltaY > 10) {
        cancelLongPress();
      }
    };

    card.addEventListener("pointermove", checkMove);
    card.addEventListener("pointerup", cancelLongPress);
    card.addEventListener("pointercancel", cancelLongPress);
  }

  handleDragMove(event) {
    if (!this.dragState) return;
    event.preventDefault();

    this.clearDragTargets();
    const target = this.getDropTargetAt(event.clientX, event.clientY);

    if (target.zone) {
      target.zone.classList.add("drag-over-zone");
    } else if (target.card && target.card.dataset.taskId !== this.dragState.taskId) {
      target.card.classList.add("drag-over");
    }
  }

  handleDragEnd(event) {
    if (!this.dragState) return;

    const target = this.getDropTargetAt(event.clientX, event.clientY);
    const draggedId = this.dragState.taskId;
    const draggedCard = this.dragState.card;

    this.clearDragTargets();
    draggedCard.classList.remove("dragging");
    document.body.classList.remove("is-dragging-task");

    try {
      draggedCard.releasePointerCapture(this.dragState.pointerId);
    } catch (error) {
      // Pointer capture may already be released by the browser.
    }

    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    this.dragState = null;

    if (target.zone) {
      this.moveTaskOutOfToday(draggedId);
      return;
    }

    if (target.card && target.card.dataset.taskId !== draggedId) {
      const rect = target.card.getBoundingClientRect();
      const placeAfter = event.clientY > rect.top + rect.height / 2;
      this.reorderTaskByDrag(draggedId, target.card.dataset.taskId, placeAfter);
    }
  }

  getDropTargetAt(x, y) {
    if (!this.dragState) return {};

    this.dragState.card.style.pointerEvents = "none";
    const element = document.elementFromPoint(x, y);
    this.dragState.card.style.pointerEvents = "";

    return {
      card: element ? element.closest(".task-card[data-draggable='true']") : null,
      zone: element ? element.closest(".manual-drop-zone") : null
    };
  }

  clearDragTargets() {
    document.querySelectorAll(".drag-over").forEach((item) => item.classList.remove("drag-over"));
    document.querySelectorAll(".drag-over-zone").forEach((item) => item.classList.remove("drag-over-zone"));
  }

  reorderTaskByDrag(draggedId, targetId, placeAfter) {
    const allTasks = this.cloneTasks(this.state.currentQueue);
    const activeTasks = this.getTodayTasks(allTasks);
    const outTasks = this.getOutOfTodayTasks(allTasks);

    const draggedIndex = activeTasks.findIndex((task) => task.id === draggedId);
    const targetIndex = activeTasks.findIndex((task) => task.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const [draggedTask] = activeTasks.splice(draggedIndex, 1);
    let insertIndex = activeTasks.findIndex((task) => task.id === targetId);
    if (placeAfter) insertIndex += 1;
    activeTasks.splice(insertIndex, 0, {
      ...draggedTask,
      manualStatus: "manual_order",
      change: "manual_order",
      reason: "你手动调整了它的位置，系统会在后续重排中优先保留这个相对顺序。"
    });

    const rerankedActive = activeTasks.map((task, index) => ({
      ...task,
      previousRank: task.currentRank,
      currentRank: index + 1,
      recommendation: this.getManualRecommendation(task, index),
      change: task.id === draggedId ? "manual_order" : task.change
    }));

    this.state.lastQueue = this.cloneTasks(this.state.currentQueue);
    this.state.currentQueue = [...rerankedActive, ...outTasks];
    this.state.manualOrderConstraints = this.deriveManualOrderConstraints(rerankedActive);
    this.state.reorderResult = this.createResultFromCurrentQueue("已将你的手动排序作为今日偏好保留。");
    this.state.lastManualMessage = "已按你的调整保留顺序";
    this.persistState();
    this.showToast("已按你的调整保留顺序");
    this.render();
  }

  moveTaskOutOfToday(taskId) {
    const allTasks = this.cloneTasks(this.state.currentQueue);
    const targetTask = allTasks.find((task) => task.id === taskId);
    if (!targetTask || this.isOutOfToday(targetTask)) return;

    const activeTasks = allTasks
      .filter((task) => task.id !== taskId && !this.isOutOfToday(task))
      .map((task, index) => ({
        ...task,
        previousRank: task.currentRank,
        currentRank: index + 1,
        recommendation: this.getManualRecommendation(task, index)
      }));

    const outTasks = allTasks.filter((task) => task.id !== taskId && this.isOutOfToday(task));
    const manualOutTask = {
      ...targetTask,
      previousRank: targetTask.currentRank,
      currentRank: null,
      recommendation: "remove_today",
      change: "out",
      manualStatus: "manual_out",
      reason: "你手动把它移出了今天，系统默认不再放回今日队列。"
    };

    this.state.lastQueue = this.cloneTasks(this.state.currentQueue);
    this.state.currentQueue = [...activeTasks, ...outTasks, manualOutTask];
    this.state.manualOutIds = Array.from(new Set([...this.state.manualOutIds, taskId]));
    this.state.manualOrderConstraints = this.deriveManualOrderConstraints(activeTasks);
    this.state.reorderResult = this.createResultFromCurrentQueue("已将该任务移出今天，后续普通重排不会自动放回。");
    this.state.lastManualMessage = "已移出今天";
    this.persistState();
    this.showToast("已移出今天");
    this.render();
  }

  deriveManualOrderConstraints(activeTasks) {
    return activeTasks.slice(0, -1).map((task, index) => ({
      beforeTaskId: task.id,
      afterTaskId: activeTasks[index + 1].id,
      createdAt: Date.now()
    }));
  }

  createResultFromCurrentQueue(summary) {
    const tasks = this.cloneTasks(this.state.currentQueue);
    return {
      source: "fallback",
      summary,
      inputText: this.state.rawInput,
      extractedTasks: this.state.extractedTasks,
      queue: this.getTodayTasks(tasks),
      outOfToday: this.getOutOfTodayTasks(tasks),
      tradeoffSuggestions: this.generateTradeoffSuggestions(tasks),
      changeEvents: this.generateChangeEvents(this.state.lastQueue, tasks),
      preservedManualConstraints: this.state.manualOrderConstraints,
      brokenManualConstraints: [],
      allTasks: tasks,
      warnings: []
    };
  }

  getTodayTasks(tasks) {
    return tasks
      .filter((task) => !this.isOutOfToday(task))
      .sort((a, b) => (a.currentRank || 999) - (b.currentRank || 999));
  }

  getOutOfTodayTasks(tasks) {
    return tasks
      .filter((task) => this.isOutOfToday(task))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  isOutOfToday(task) {
    return task.recommendation === "remove_today" || task.recommendation === "merge" || task.manualStatus === "manual_out";
  }

  getArrangementGroup(task) {
    if (this.isOutOfToday(task)) return "不放进今天";
    if (task.recommendation === "do_now") return "现在做";
    return "今天晚点做";
  }

  getEventType(task, previousTask, previousGroup, currentGroup) {
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

  getEventLabel(eventType) {
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

  getEventClass(eventType) {
    if (eventType === "new_now" || eventType === "new_later" || eventType === "new_out") return "event-new";
    if (eventType === "promoted" || eventType === "manual_order") return "event-promoted";
    if (eventType === "delayed") return "event-delayed";
    if (eventType === "removed" || eventType === "manual_out") return "event-removed";
    return "event-same";
  }

  generateChangeEvents(previousQueue, reorderedTasks) {
    const previousById = new Map(previousQueue.map((task) => [task.id, task]));

    return reorderedTasks
      .map((task) => {
        const previousTask = previousById.get(task.id);
        const previousGroup = previousTask ? this.getArrangementGroup(previousTask) : "新想法";
        const currentGroup = this.getArrangementGroup(task);
        const eventType = this.getEventType(task, previousTask, previousGroup, currentGroup);

        if (eventType === "same") return null;

        return {
          id: `event_${task.id}`,
          type: eventType,
          label: this.getEventLabel(eventType),
          className: this.getEventClass(eventType),
          title: task.title,
          from: previousGroup,
          to: currentGroup,
          reason: task.reason,
          score: task.score || 0
        };
      })
      .filter(Boolean);
  }

  getHardConstraintReason(task) {
    if (task.urgency >= 5) return "deadline";
    if (task.blockingRisk >= 5) return "blocking";
    if (task.explicitToday || (task.urgency >= 5 && task.goalImpact >= 4)) return "explicit_today";
    return null;
  }

  getHardConstraintText(reason) {
    const labels = {
      deadline: "临近截止",
      blocking: "阻塞风险",
      explicit_today: "必须今天完成的明确要求"
    };
    return labels[reason] || "硬约束";
  }

  hasExplicitTodaySignal(inputText) {
    return ["必须", "一定要", "马上", "先做", "今天一定", "今天必须"].some((word) => inputText.includes(word));
  }

  cloneTasks(tasks) {
    return tasks.map((task) => ({ ...task }));
  }

  escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 2000);
  }

  render() {
    document.body.classList.toggle("modal-open", this.state.isIdeaSheetOpen);
    this.renderHeader();
    this.renderTodayQueue();
    this.renderCapturePanel();
    this.renderReasonPanel();
    this.bindEvents();
  }

  renderHeader() {
    const header = document.getElementById("header");
    header.innerHTML = `
      <h1>AI 注意力重排助手</h1>
      <p>新想法插入时，帮你重新分配今天的注意力</p>
    `;
  }

  renderTodayQueue() {
    const tasks = this.state.currentQueue;
    const queue = this.getTodayTasks(tasks);
    const outOfToday = this.getOutOfTodayTasks(tasks);
    const container = document.getElementById("today-queue");

    const nowTasks = queue.filter((task) => task.recommendation === "do_now");
    const laterTasks = queue.filter((task) => task.recommendation !== "do_now");
    const total = queue.length + outOfToday.length;

    container.innerHTML = `
      <div class="queue-header">
        <h2>怎么安排今天</h2>
        <span class="queue-count">共 ${total} 项</span>
      </div>
      ${this.state.lastManualMessage ? `<div class="manual-status">${this.escapeHtml(this.state.lastManualMessage)}</div>` : ""}
      ${this.renderTaskGroup("现在做", nowTasks, "group-now", true)}
      ${laterTasks.length > 0 ? this.renderTaskGroup("今天晚点做", laterTasks, "group-later", true) : ""}
      ${this.renderTaskGroup("不放进今天", outOfToday, "group-out", false, true)}
    `;

    this.bindDragEvents();
    document.onpointermove = (event) => this.handleDragMove(event);
    document.onpointerup = (event) => this.handleDragEnd(event);
    document.onpointercancel = (event) => this.handleDragEnd(event);
  }

  renderTaskGroup(title, tasks, className, draggable = false, dropZone = false) {
    return `
      <div class="task-group ${className} ${dropZone ? "manual-drop-zone" : ""}">
        <div class="task-group-header">
          <h3>${title}</h3>
          <span>${tasks.length} 项</span>
        </div>
        <div class="task-list">
          ${tasks.length > 0 ? tasks.map((task) => this.renderTaskCard(task, className === "group-later", draggable)).join("") : `<div class="empty-group">暂无任务</div>`}
        </div>
      </div>
    `;
  }

  renderTaskCard(task, isLater = false, draggable = false) {
    const changeLabels = {
      new: { text: "新增", class: "label-new" },
      up: { text: "上升", class: "label-up" },
      down: { text: "下降", class: "label-down" },
      same: { text: "保持", class: "label-same" },
      out: { text: "移出", class: "label-out" },
      manual_order: { text: "用户调整", class: "label-manual" }
    };

    const manualLabels = {
      manual_order: { text: "用户调整", class: "label-manual" },
      manual_out: { text: "用户移出", class: "label-out" },
      manual_preserved: { text: "保留调整", class: "label-manual" }
    };

    const recLabels = {
      do_now: { text: "立即做", class: "rec-now" },
      do_today: { text: "今天做", class: "rec-today" },
      schedule_later: { text: "稍后处理", class: "rec-later" },
      merge: { text: "合并处理", class: "rec-merge" },
      remove_today: { text: "不放进今天", class: "rec-remove" }
    };

    const change = manualLabels[task.manualStatus] || changeLabels[task.change] || changeLabels.same;
    const rec = recLabels[task.recommendation] || recLabels.do_today;
    const rank = task.currentRank || "-";
    const scoreWidth = Math.max(8, Math.min(100, ((task.score || 0) / 5) * 100));

    return `
      <div
        class="task-card ${this.isOutOfToday(task) ? "task-out" : ""} ${isLater ? "task-later" : ""} ${task.manualStatus ? "task-manual" : ""}"
        data-task-id="${this.escapeHtml(task.id)}"
        data-draggable="${draggable ? "true" : "false"}"
      >
        <div class="task-rank">${rank}</div>
        <div class="task-content">
          <div class="task-header">
            <h3>${this.escapeHtml(task.title)}</h3>
            <span class="label ${change.class}">${change.text}</span>
          </div>
          <div class="task-meta">
            ${task.deadline ? `<span class="deadline">截止 ${this.escapeHtml(task.deadline)}</span>` : ""}
            <span class="recommendation ${rec.class}">${rec.text}</span>
            ${draggable ? `<span class="drag-handle">拖动</span>` : ""}
          </div>
          <p class="task-reason">${this.escapeHtml(task.reason)}</p>
          <div class="score-detail">
            <div class="score-bar" style="width: ${scoreWidth}%">
              <span>${(task.score || 0).toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderCapturePanel() {
    const panel = document.getElementById("capture-panel");
    const goalText = this.state.todayGoal || "完成 AI 创意大赛 Demo 初赛提交";

    panel.innerHTML = `
      <div class="goal-bar">
        ${this.state.isEditingGoal ? `
          <div class="goal-edit">
            <label class="field-label" for="goal-draft">今日目标</label>
            <input
              id="goal-draft"
              class="goal-input"
              value="${this.escapeHtml(this.state.goalDraft || goalText)}"
              placeholder="例如：完成 AI 创意大赛 Demo 初赛提交"
            >
            <div class="goal-edit-actions">
              <button id="cancel-goal-btn" class="btn-secondary compact">取消</button>
              <button id="save-goal-btn" class="btn-primary compact">保存目标</button>
            </div>
          </div>
        ` : `
          <div class="goal-display">
            <div>
              <span class="field-label">今日目标</span>
              <p>${this.escapeHtml(goalText)}</p>
              ${this.state.isGoalDirty ? `<span class="goal-dirty">目标已修改</span>` : ""}
            </div>
            <div class="goal-actions">
              ${this.state.isGoalDirty ? `<button id="rerank-goal-btn" class="btn-primary compact" ${this.state.isProcessing ? "disabled" : ""}>重新安排</button>` : ""}
              <button id="edit-goal-btn" class="btn-secondary compact">编辑</button>
            </div>
          </div>
        `}
      </div>

      <div class="bottom-action-bar ${this.state.isIdeaSheetOpen ? "hidden" : ""}">
        <button id="open-idea-btn" class="btn-primary add-idea-btn">+ 新增想法</button>
      </div>

      ${this.renderIdeaSheet()}
    `;
  }

  renderIdeaSheet() {
    if (!this.state.isIdeaSheetOpen) return "";

    return `
      <div id="idea-sheet-backdrop" class="sheet-backdrop"></div>
      <div class="idea-sheet" role="dialog" aria-modal="true" aria-labelledby="idea-sheet-title">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <h2 id="idea-sheet-title">新增想法</h2>
          <button id="close-idea-sheet" class="btn-icon" aria-label="关闭">×</button>
        </div>

        <label class="field-label" for="input-text">想法内容</label>
        <textarea
          id="input-text"
          placeholder="输入你的想法，例如：今晚要运动、洗地、洗澡"
          rows="4"
        >${this.escapeHtml(this.state.rawInput)}</textarea>

        <div class="examples-section">
          <p>快速体验示例</p>
          <div class="examples-list">
            ${DEMO_DATA.examples.map((example) => `
              <button class="example-btn" data-example-id="${example.id}">${this.escapeHtml(example.name)}</button>
            `).join("")}
          </div>
        </div>

        <div class="sheet-actions">
          <button id="voice-btn" class="btn-voice" ${!this.state.speechSupported || this.state.isProcessing ? "disabled" : ""}>语音输入</button>
          <button id="reorder-btn" class="btn-primary ${this.state.isProcessing ? "processing" : ""}" ${this.state.isProcessing ? "disabled" : ""}>
            ${this.state.isProcessing ? "处理中..." : "新增并重排"}
          </button>
        </div>
      </div>
    `;
  }

  renderReasonPanel() {
    const panel = document.getElementById("reason-panel");

    if (!this.state.reorderResult) {
      panel.innerHTML = `
        <div class="reason-empty">
          <h3>AI 取舍解释</h3>
          <p>点击底部“新增想法”，查看 AI 如何把任务分到“现在做 / 今天晚点做 / 不放进今天”。</p>
        </div>
        ${this.renderResetFooter()}
      `;
      return;
    }

    const result = this.state.reorderResult;
    const changeEvents = result.changeEvents || [];
    const warnings = result.warnings || [];
    const sourceLabels = {
      model: { text: "模型分析", class: "source-model" },
      fallback: { text: "本地兜底", class: "source-fallback" },
      none: { text: "重新安排", class: "source-none" }
    };
    const source = sourceLabels[result.source];

    panel.innerHTML = `
      <h3>本次重排摘要</h3>
      <div class="summary-card">
        <p>${this.escapeHtml(result.summary)}</p>
        ${source ? `<span class="source-badge ${source.class}">${source.text}</span>` : ""}
      </div>
      ${warnings.length > 0 ? `
        <div class="warning-list">
          ${warnings.map((warning) => `<p>${this.escapeHtml(warning)}</p>`).join("")}
        </div>
      ` : ""}

      <h3>调整详情</h3>
      <div class="change-events-list">
        ${changeEvents.length > 0 ? changeEvents.map((event) => `
          <div class="change-event-card">
            <div class="change-event-header">
              <span class="change-event-label ${event.className}">${this.escapeHtml(event.label)}</span>
              <span class="change-event-score">${event.score.toFixed(1)}分</span>
            </div>
            <h4>${this.escapeHtml(event.title)}</h4>
            <div class="change-path">
              <span>${this.escapeHtml(event.from)}</span>
              <span class="path-arrow">-&gt;</span>
              <span>${this.escapeHtml(event.to)}</span>
            </div>
            <p>${this.escapeHtml(event.reason)}</p>
          </div>
        `).join("") : `
          <div class="change-empty">本次没有明显调整，当前安排保持稳定。</div>
        `}
      </div>
      ${this.renderResetFooter()}
    `;
  }

  renderResetFooter() {
    return `
      <div class="reset-footer">
        <button id="reset-btn" class="btn-link">重置 Demo</button>
      </div>
    `;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new AttentionReorderApp();
});
