import { getIcon } from './icons/icons.js';
import { DEMO_DATA } from './demo-data.js';

const RULE_PROFILES = {
  balanced: {
    label: "平衡",
    description: "综合考虑截止、目标、阻塞和任务价值。",
    weights: { urgency: 0.30, goalImpact: 0.25, blockingRisk: 0.20, taskValue: 0.15, energyFit: 0.10 },
    effortPolicy: { high: -0.35, mediumHigh: -0.20, low: 0.10 }
  },
  deadline_first: {
    label: "截止优先",
    description: "更早处理临近截止的事情。",
    weights: { urgency: 0.40, goalImpact: 0.20, blockingRisk: 0.20, taskValue: 0.10, energyFit: 0.10 },
    effortPolicy: { high: -0.35, mediumHigh: -0.20, low: 0.10 }
  },
  goal_first: {
    label: "目标优先",
    description: "更早处理推动今日目标的事情。",
    weights: { urgency: 0.22, goalImpact: 0.38, blockingRisk: 0.18, taskValue: 0.14, energyFit: 0.08 },
    effortPolicy: { high: -0.35, mediumHigh: -0.20, low: 0.10 }
  },
  low_effort_first: {
    label: "低负担优先",
    description: "优先插入更短、更容易完成的事情。",
    weights: { urgency: 0.25, goalImpact: 0.22, blockingRisk: 0.18, taskValue: 0.13, energyFit: 0.12 },
    effortPolicy: { high: -0.55, mediumHigh: -0.35, low: 0.20 }
  }
};

const DEFAULT_MODEL_CONFIG = {
  baseUrl: "https://api.deepseek.com",
  modelName: "deepseek-chat",
  apiKey: "",
  timeoutMs: 5000
};

class AttentionReorderApp {
  constructor() {
    this.storageKey = "attention_queue_demo_state";
    this.toastTimer = null;
    this.state = {
      rawInput: "",
      selectedExampleId: null,
      todayGoal: "完成 AI 创意大赛 Demo 初赛提交",
      currentQueue: [],
      completedTasks: [],
      lastQueue: [],
      extractedTasks: [],
      reorderResult: null,
      presetResults: null,
      manualOrderConstraints: [],
      manualOutIds: [],
      rulePreset: "balanced",
      isRuleDirty: false,
      isRuleDetailsOpen: false,
      isChangeDetailsOpen: false,
      lastCompletedTask: null,
      isCompletedExpanded: false,
      isProcessing: false,
      speechSupported: false,
      isIdeaSheetOpen: false,
      isEditingGoal: false,
      goalDraft: "",
      isGoalDirty: false,
      modelConfig: { ...DEFAULT_MODEL_CONFIG },
      isModelSettingsOpen: false,
      modelConnectionStatus: "unconfigured",
      modelConnectionMessage: "未填写 API Key，将使用备用规则",
      modelConnectionTestedAt: null
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

  normalizeRulePreset(rulePreset) {
    return Object.prototype.hasOwnProperty.call(RULE_PROFILES, rulePreset) ? rulePreset : "balanced";
  }

  normalizeModelConfig(modelConfig = {}) {
    const timeoutMs = Number(modelConfig.timeoutMs || DEFAULT_MODEL_CONFIG.timeoutMs);
    return {
      baseUrl: String(modelConfig.baseUrl || DEFAULT_MODEL_CONFIG.baseUrl),
      modelName: String(modelConfig.modelName || DEFAULT_MODEL_CONFIG.modelName),
      apiKey: String(modelConfig.apiKey || ""),
      timeoutMs: Number.isFinite(timeoutMs) ? Math.min(30000, Math.max(1000, timeoutMs)) : DEFAULT_MODEL_CONFIG.timeoutMs
    };
  }

  getRequestModelConfig() {
    const config = this.normalizeModelConfig(this.state.modelConfig);
    const baseUrl = config.baseUrl.trim();
    const modelName = config.modelName.trim();
    const apiKey = config.apiKey.trim();
    if (!baseUrl || !modelName || !apiKey) return null;
    return { baseUrl, modelName, apiKey, timeoutMs: config.timeoutMs };
  }

  normalizeModelConnectionStatus(status, modelConfig = this.state.modelConfig) {
    if (!this.hasCompleteModelConfig(modelConfig)) return "unconfigured";
    return ["untested", "testing", "connected", "failed"].includes(status) ? status : "untested";
  }

  hasCompleteModelConfig(modelConfig = this.state.modelConfig) {
    const config = this.normalizeModelConfig(modelConfig);
    return Boolean(config.baseUrl.trim() && config.modelName.trim() && config.apiKey.trim());
  }

  getModelConnectionLabel() {
    const labels = {
      unconfigured: "未配置",
      untested: "未测试",
      testing: "测试中",
      connected: "已连接",
      failed: "连接失败"
    };
    return labels[this.normalizeModelConnectionStatus(this.state.modelConnectionStatus)] || labels.unconfigured;
  }

  markModelConfigUntested() {
    const status = this.hasCompleteModelConfig() ? "untested" : "unconfigured";
    this.state.modelConnectionStatus = status;
    this.state.modelConnectionMessage = status === "untested" ? "配置已修改，请测试连接" : "未填写 API Key，将使用备用规则";
    this.state.modelConnectionTestedAt = null;

    const statusText = document.getElementById("model-connection-summary");
    if (statusText) statusText.textContent = `${this.getModelConnectionLabel()} · ${this.state.isModelSettingsOpen ? "收起" : "设置"}`;
    const messageText = document.getElementById("model-connection-message");
    if (messageText) messageText.textContent = this.state.modelConnectionMessage;
  }

  getRuleProfile(rulePreset = this.state.rulePreset) {
    return RULE_PROFILES[this.normalizeRulePreset(rulePreset)];
  }

  normalizeSelectedExampleId(exampleId, rawInput) {
    const example = DEMO_DATA.examples.find((item) => item.id === exampleId);
    return example && String(rawInput || "").trim() === example.input.trim() ? example.id : null;
  }

  loadSavedState() {
    try {
      const rawState = localStorage.getItem(this.storageKey);
      if (!rawState) return null;

      const parsed = JSON.parse(rawState);
      if (!Array.isArray(parsed.currentQueue)) return null;

      return {
        rawInput: parsed.rawInput || "",
        selectedExampleId: this.normalizeSelectedExampleId(parsed.selectedExampleId, parsed.rawInput || ""),
        todayGoal: parsed.todayGoal || "完成 AI 创意大赛 Demo 初赛提交",
        currentQueue: parsed.currentQueue,
        completedTasks: Array.isArray(parsed.completedTasks) ? parsed.completedTasks : [],
        lastQueue: parsed.lastQueue || [],
        extractedTasks: parsed.extractedTasks || [],
        reorderResult: parsed.reorderResult || null,
        presetResults: parsed.presetResults && typeof parsed.presetResults === "object" ? parsed.presetResults : null,
        manualOrderConstraints: parsed.manualOrderConstraints || [],
        manualOutIds: parsed.manualOutIds || [],
        rulePreset: this.normalizeRulePreset(parsed.rulePreset),
        isRuleDirty: Boolean(parsed.isRuleDirty),
        isRuleDetailsOpen: Boolean(parsed.isRuleDetailsOpen),
        isChangeDetailsOpen: Boolean(parsed.isChangeDetailsOpen),
        isCompletedExpanded: Boolean(parsed.isCompletedExpanded),
        goalDraft: parsed.todayGoal || "完成 AI 创意大赛 Demo 初赛提交",
        isGoalDirty: Boolean(parsed.isGoalDirty),
        modelConfig: this.normalizeModelConfig(parsed.modelConfig),
        isModelSettingsOpen: Boolean(parsed.isModelSettingsOpen),
        modelConnectionStatus: this.normalizeModelConnectionStatus(parsed.modelConnectionStatus, parsed.modelConfig),
        modelConnectionMessage: parsed.modelConnectionMessage || "未测试模型连接",
        modelConnectionTestedAt: parsed.modelConnectionTestedAt || null
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
        selectedExampleId: this.state.selectedExampleId,
        todayGoal: this.state.todayGoal,
        currentQueue: this.state.currentQueue,
        completedTasks: this.state.completedTasks,
        lastQueue: this.state.lastQueue,
        extractedTasks: this.state.extractedTasks,
        reorderResult: this.state.reorderResult,
        presetResults: this.state.presetResults,
        manualOrderConstraints: this.state.manualOrderConstraints,
        manualOutIds: this.state.manualOutIds,
        rulePreset: this.state.rulePreset,
        isRuleDirty: this.state.isRuleDirty,
        isRuleDetailsOpen: this.state.isRuleDetailsOpen,
        isChangeDetailsOpen: this.state.isChangeDetailsOpen,
        isCompletedExpanded: this.state.isCompletedExpanded,
        isGoalDirty: this.state.isGoalDirty,
        modelConfig: this.normalizeModelConfig(this.state.modelConfig),
        isModelSettingsOpen: this.state.isModelSettingsOpen,
        modelConnectionStatus: this.normalizeModelConnectionStatus(this.state.modelConnectionStatus, this.state.modelConfig),
        modelConnectionMessage: this.state.modelConnectionMessage,
        modelConnectionTestedAt: this.state.modelConnectionTestedAt
      };
      localStorage.setItem(this.storageKey, JSON.stringify(persisted));
    } catch (error) {
      this.showToast("本地保存失败，本次仍可继续体验");
    }
  }

  bindEvents() {
    const reorderBtn = document.getElementById("reorder-btn");
    const inputText = document.getElementById("input-text");
    const voiceBtn = document.getElementById("voice-btn");
    const closeSheetBtn = document.getElementById("close-idea-sheet");
    const sheetBackdrop = document.getElementById("idea-sheet-backdrop");
    const editGoalBtn = document.getElementById("edit-goal-btn");
    const cancelGoalBtn = document.getElementById("cancel-goal-btn");
    const saveGoalBtn = document.getElementById("save-goal-btn");
    const rerankGoalBtn = document.getElementById("rerank-goal-btn");
    const rerankRuleBtn = document.getElementById("rerank-rule-btn");
    const ruleDetailsBtn = document.getElementById("rule-details-toggle");
    const changeDetailsBtn = document.getElementById("change-details-toggle");
    const modelSettingsToggle = document.getElementById("model-settings-toggle");
    const saveModelConfigBtn = document.getElementById("save-model-config");
    const clearModelConfigBtn = document.getElementById("clear-model-config");
    const testModelConfigBtn = document.getElementById("test-model-config");
    const goalDraft = document.getElementById("goal-draft");

    if (closeSheetBtn) closeSheetBtn.onclick = () => this.closeIdeaSheet();
    if (sheetBackdrop) sheetBackdrop.onclick = () => this.closeIdeaSheet();
    if (reorderBtn) reorderBtn.onclick = () => this.handleReorder();
    if (voiceBtn) voiceBtn.onclick = () => this.handleVoiceInput();
    if (editGoalBtn) editGoalBtn.onclick = () => this.startGoalEdit();
    if (cancelGoalBtn) cancelGoalBtn.onclick = () => this.cancelGoalEdit();
    if (saveGoalBtn) saveGoalBtn.onclick = () => this.saveGoalEdit();
    if (rerankGoalBtn) rerankGoalBtn.onclick = () => this.handleRerankOnly();
    if (rerankRuleBtn) rerankRuleBtn.onclick = () => this.handleRerankOnly();
    if (ruleDetailsBtn) ruleDetailsBtn.onclick = () => this.toggleRuleDetails();
    if (changeDetailsBtn) changeDetailsBtn.onclick = () => this.toggleChangeDetails();
    if (modelSettingsToggle) modelSettingsToggle.onclick = () => this.toggleModelSettings();
    if (saveModelConfigBtn) saveModelConfigBtn.onclick = () => this.saveModelConfig();
    if (clearModelConfigBtn) clearModelConfigBtn.onclick = () => this.clearModelConfig();
    if (testModelConfigBtn) testModelConfigBtn.onclick = () => this.testModelConnection();

    document.querySelectorAll("[data-model-config-field]").forEach((input) => {
      input.oninput = (event) => {
        const field = event.currentTarget.dataset.modelConfigField;
        this.state.modelConfig = {
          ...this.normalizeModelConfig(this.state.modelConfig),
          [field]: field === "timeoutMs" ? Number(event.currentTarget.value) : event.currentTarget.value
        };
        this.markModelConfigUntested();
      };
    });

    if (goalDraft) {
      goalDraft.oninput = (event) => {
        this.state.goalDraft = event.target.value;
      };
    }

    if (inputText) {
      inputText.oninput = (event) => {
        this.state.rawInput = event.target.value;
        this.state.selectedExampleId = this.normalizeSelectedExampleId(this.state.selectedExampleId, this.state.rawInput);
        this.persistState();
        const reorderBtn = document.getElementById("reorder-btn");
        if (reorderBtn) {
          reorderBtn.disabled = this.state.isProcessing || !this.state.rawInput.trim();
        }
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

    document.querySelectorAll(".rule-preset-btn").forEach((btn) => {
      btn.onclick = (event) => this.selectRulePreset(event.currentTarget.dataset.rulePreset);
    });

    document.querySelectorAll("[data-scroll-target]").forEach((btn) => {
      btn.onclick = (event) => {
        const target = document.getElementById(event.currentTarget.dataset.scrollTarget);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    });

    document.querySelectorAll(".complete-task-btn, .hero-complete-btn").forEach((btn) => {
      btn.onpointerdown = (event) => {
        event.stopPropagation();
      };
      btn.onclick = (event) => {
        event.stopPropagation();
        this.completeTask(event.currentTarget.dataset.taskId);
      };
    });

    document.querySelectorAll(".pin-task-btn").forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        this.pinTaskToNow(event.currentTarget.dataset.taskId);
      };
    });

    const completedToggle = document.getElementById("completed-toggle");
    if (completedToggle) {
      completedToggle.onclick = () => this.toggleCompletedTasks();
    }
  }

  loadExample(exampleId) {
    const example = DEMO_DATA.examples.find((item) => item.id === exampleId);
    if (!example) return;

    const input = document.getElementById("input-text");
    if (input) input.value = example.input;
    this.state.rawInput = example.input;
    this.state.selectedExampleId = example.id;
    this.persistState();
    this.render();
  }

  getSelectedExampleForFastPath(inputText) {
    const example = DEMO_DATA.examples.find((item) => item.id === this.state.selectedExampleId);
    if (!example) return null;
    return inputText.trim() === example.input.trim() ? example : null;
  }

  applyExampleFastPath(example, inputText) {
    const previousQueue = this.cloneTasks(this.state.currentQueue);
    const presetResults = this.buildExamplePresetResults(example, inputText, previousQueue);
    const result = presetResults[this.normalizeRulePreset(this.state.rulePreset)];

    this.state.lastQueue = previousQueue;
    this.state.extractedTasks = result.extractedTasks;
    this.state.presetResults = presetResults;
    this.applyPresetResult(result);
    this.state.isProcessing = false;
    this.state.isRuleDirty = false;
    this.state.rawInput = "";
    this.state.selectedExampleId = null;
    this.state.isIdeaSheetOpen = false;
    this.persistState();
    this.render();
    this.showToast("已加入想法并重排");
  }

  async handleReorder() {
    const inputText = this.state.rawInput.trim();
    if (!inputText) {
      this.showToast("请输入一个想法或任务");
      return;
    }

    this.state.rawInput = inputText;
    const fastPathExample = this.getSelectedExampleForFastPath(inputText);
    if (fastPathExample) {
      this.applyExampleFastPath(fastPathExample, inputText);
      return;
    }

    this.state.isProcessing = true;
    this.render();

    try {
      const previousQueue = this.cloneTasks(this.state.currentQueue);
      const result = await this.requestReorder(inputText, previousQueue);

      this.state.lastQueue = previousQueue;
      this.state.extractedTasks = result.extractedTasks;
      this.state.presetResults = this.normalizePresetResults(result.presetResults);
      this.applyPresetResult(result);
      this.state.isProcessing = false;
      this.state.rulePreset = this.normalizeRulePreset(result.rulePreset || this.state.rulePreset);
      this.state.isRuleDirty = false;
      this.state.rawInput = "";
      this.state.selectedExampleId = null;
      this.state.isIdeaSheetOpen = false;
      this.persistState();
      this.render();
      this.showReorderSourceToast(result);
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
      this.state.presetResults = this.normalizePresetResults(result.presetResults);
      this.applyPresetResult(result);
      this.state.isProcessing = false;
      this.state.isGoalDirty = false;
      this.state.rulePreset = this.normalizeRulePreset(result.rulePreset || this.state.rulePreset);
      this.state.isRuleDirty = false;
      this.persistState();
      this.render();
      this.showReorderSourceToast(result);
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
    this.state.presetResults = null;
    this.persistState();
    this.render();
  }

  async selectRulePreset(rulePreset) {
    if (this.state.isProcessing) return;

    const nextPreset = this.normalizeRulePreset(rulePreset);
    if (nextPreset === this.state.rulePreset) return;

    this.state.rulePreset = nextPreset;
    this.state.isRuleDirty = false;
    let result = this.getPresetResult(nextPreset);
    if (!result) {
      this.state.presetResults = {
        ...(this.state.presetResults || {}),
        ...this.buildLocalPresetResults("", this.cloneTasks(this.state.currentQueue))
      };
      result = this.getPresetResult(nextPreset);
    }

    this.applyPresetResult(result);
    this.persistState();
    this.render();
    this.showToast(`已切换到「${this.getRuleProfile(this.state.rulePreset).label}」`);
  }

  toggleRuleDetails() {
    this.state.isRuleDetailsOpen = !this.state.isRuleDetailsOpen;
    this.persistState();
    this.render();
  }

  toggleChangeDetails() {
    this.state.isChangeDetailsOpen = !this.state.isChangeDetailsOpen;
    this.persistState();
    this.render();
  }

  toggleModelSettings() {
    this.state.isModelSettingsOpen = !this.state.isModelSettingsOpen;
    this.persistState();
    this.render();
  }

  saveModelConfig() {
    const config = this.normalizeModelConfig(this.state.modelConfig);
    if (!config.baseUrl.trim() || !config.modelName.trim() || !config.apiKey.trim()) {
      this.showToast("请填写完整的模型地址、模型名和 API Key");
      return;
    }

    this.state.modelConfig = config;
    this.state.modelConnectionStatus = "untested";
    this.state.modelConnectionMessage = "配置已保存，请测试连接";
    this.state.modelConnectionTestedAt = null;
    this.persistState();
    this.render();
    this.showToast("模型配置已保存，请测试连接");
  }

  clearModelConfig() {
    this.state.modelConfig = { ...DEFAULT_MODEL_CONFIG };
    this.state.modelConnectionStatus = "unconfigured";
    this.state.modelConnectionMessage = "未填写 API Key，将使用备用规则";
    this.state.modelConnectionTestedAt = null;
    this.persistState();
    this.render();
    this.showToast("已清除模型 API Key，将使用备用规则");
  }

  showReorderSourceToast(result) {
    if (result?.source === "model") {
      this.showToast("已使用你的模型完成分析");
      return;
    }
    if (result?.source === "none") {
      this.showToast("已重新安排当前队列");
      return;
    }
    this.showToast("未使用模型，已按备用规则重排");
  }

  async testModelConnection() {
    const modelConfig = this.getRequestModelConfig();
    if (!modelConfig) {
      this.state.modelConnectionStatus = "unconfigured";
      this.state.modelConnectionMessage = "请填写完整的模型地址、模型名和 API Key";
      this.persistState();
      this.render();
      this.showToast("请填写完整的模型配置");
      return;
    }

    this.state.modelConnectionStatus = "testing";
    this.state.modelConnectionMessage = "正在测试模型 API 连接";
    this.persistState();
    this.render();

    try {
      const response = await fetch("/api/model/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelConfig })
      });
      const result = await this.parseApiResponse(response);
      if (!response.ok || !result.ok) throw new Error(result.message || `API returned ${response.status}`);

      this.state.modelConnectionStatus = "connected";
      this.state.modelConnectionMessage = result.message || "模型 API 连接成功";
      this.state.modelConnectionTestedAt = new Date().toISOString();
      this.persistState();
      this.render();
      this.showToast("模型 API 连接成功");
    } catch (error) {
      this.state.modelConnectionStatus = "failed";
      this.state.modelConnectionMessage = error.message || "模型 API 连接失败";
      this.state.modelConnectionTestedAt = new Date().toISOString();
      this.persistState();
      this.render();
      this.showToast("模型 API 连接失败，将使用备用规则");
    }
  }

  async requestReorder(inputText, previousQueue) {
    const requestBody = this.buildReorderRequest(inputText);

    try {
      const response = await fetch("/api/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      const result = await this.parseApiResponse(response);
      if (!response.ok) throw new Error(result.warnings?.[0] || result.message || `API returned ${response.status}`);
      if (!Array.isArray(result.allTasks)) throw new Error("API result missing allTasks");
      if (result.source === "model") {
        this.state.modelConnectionStatus = "connected";
        this.state.modelConnectionMessage = "本次已使用你的模型完成分析";
        this.state.modelConnectionTestedAt = new Date().toISOString();
      }
      if (result.source === "fallback") {
        if (this.getRequestModelConfig()) {
          this.state.modelConnectionStatus = "failed";
          this.state.modelConnectionMessage = "本次未使用模型，已按备用规则重排";
          this.state.modelConnectionTestedAt = new Date().toISOString();
        }
      }
      return result;
    } catch (error) {
      if (this.getRequestModelConfig()) {
        this.state.modelConnectionStatus = "failed";
        this.state.modelConnectionMessage = error.message || "本次未使用模型，已按备用规则重排";
        this.state.modelConnectionTestedAt = new Date().toISOString();
      }
      const presetResults = this.buildLocalPresetResults(inputText, previousQueue);
      const fallbackResult = presetResults[this.normalizeRulePreset(this.state.rulePreset)];
      return {
        ...fallbackResult,
        source: "fallback",
        rulePreset: this.state.rulePreset,
        ruleProfile: this.getRuleProfile(),
        presetResults,
        summary: `已按智能规则完成重排。${fallbackResult.summary}`,
        warnings: ["已按智能规则完成重排"]
      };
    }
  }

  async parseApiResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      if (contentType.includes("text/html") || this.looksLikeHtml(text)) {
        throw new Error("没有收到后端 API 返回的 JSON。请确认使用 npm run dev 启动本项目，并打开 http://localhost:3000，而不是静态预览页面；如果刚更新代码，请重启服务并强制刷新页面。");
      }
      throw new Error(`API 返回内容不是有效 JSON：${this.formatResponsePreview(text)}`);
    }
  }

  looksLikeHtml(text) {
    return /^\s*<!doctype\s+html/i.test(text) || /^\s*<html[\s>]/i.test(text);
  }

  formatResponsePreview(text) {
    const preview = String(text || "").replace(/\s+/g, " ").trim().slice(0, 120);
    return preview || "空响应";
  }

  normalizePresetResults(presetResults) {
    if (!presetResults || typeof presetResults !== "object") return null;

    return Object.fromEntries(
      Object.keys(RULE_PROFILES)
        .map((preset) => {
          const result = presetResults[preset];
          return result && Array.isArray(result.allTasks) ? [preset, result] : null;
        })
        .filter(Boolean)
    );
  }

  getPresetResult(rulePreset) {
    const preset = this.normalizeRulePreset(rulePreset);
    return this.state.presetResults?.[preset] || null;
  }

  applyPresetResult(result) {
    if (!result || !Array.isArray(result.allTasks)) return;

    this.state.currentQueue = result.allTasks;
    this.state.reorderResult = result;
    this.state.extractedTasks = Array.isArray(result.extractedTasks) ? result.extractedTasks : this.state.extractedTasks;
    this.state.rulePreset = this.normalizeRulePreset(result.rulePreset || this.state.rulePreset);
  }

  buildLocalPresetResults(inputText, previousQueue) {
    const extractedTasks = this.taskExtractor(inputText);
    const normalizedTasks = this.normalizeTaskDrafts(extractedTasks, inputText);

    return this.buildPresetResultsFromTasks(inputText, previousQueue, normalizedTasks);
  }

  buildExamplePresetResults(example, inputText, previousQueue) {
    const normalizedTasks = this.normalizeTaskDrafts(
      example.extractedTasks.map((task) => ({ ...task })),
      inputText
    );

    return this.buildPresetResultsFromTasks(inputText, previousQueue, normalizedTasks);
  }

  buildPresetResultsFromTasks(inputText, previousQueue, normalizedTasks) {
    return Object.fromEntries(
      Object.keys(RULE_PROFILES).map((preset) => [
        preset,
        this.processPreparedReorder(inputText, this.cloneTasks(previousQueue), normalizedTasks, preset)
      ])
    );
  }

  buildReorderRequest(inputText) {
    const modelConfig = this.getRequestModelConfig();
    return {
      rawInput: inputText,
      todayGoal: this.state.todayGoal || "完成 AI 创意大赛 Demo 初赛提交",
      rulePreset: this.state.rulePreset,
      currentQueue: this.getTodayTasks(this.state.currentQueue),
      outOfToday: this.getOutOfTodayTasks(this.state.currentQueue),
      manualOrderConstraints: this.state.manualOrderConstraints,
      manualOutIds: this.state.manualOutIds,
      ...(modelConfig ? { modelConfig } : {}),
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
      this.showToast("当前浏览器不支持网页语音识别，可使用系统键盘语音输入或文字输入");
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
      const input = document.getElementById("input-text");
      if (input) input.value = transcript;
      this.state.rawInput = transcript;
      this.persistState();
      this.showToast("语音输入完成");
      this.render();
    };

    recognition.onerror = () => {
      this.showToast("语音识别失败，请重试");
    };

    recognition.start();
  }

  processReorder(inputText, previousQueue, rulePreset = this.state.rulePreset) {
    const extractedTasks = this.taskExtractor(inputText);
    const normalizedTasks = this.normalizeTaskDrafts(extractedTasks, inputText);
    return this.processPreparedReorder(inputText, previousQueue, normalizedTasks, rulePreset);
  }

  processPreparedReorder(inputText, previousQueue, normalizedTasks, rulePreset = this.state.rulePreset) {
    const mergedTasks = this.mergeWithCurrentQueue(previousQueue, normalizedTasks);
    const scoredTasks = this.scoringEngine(mergedTasks, rulePreset);
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
      rulePreset: this.normalizeRulePreset(rulePreset),
      ruleProfile: this.getRuleProfile(rulePreset),
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
    const fillerOnly = new Set(["我", "突然", "刚", "想到", "刚想到", "突然想到", "我突然想到", "我刚想到", "想起来", "发现", "刚发现", "突然发现"]);
    const normalizedInput = boundaryKeywords.reduce(
      (text, keyword) => text.replaceAll(keyword, "，"),
      inputText
    );
    const seen = new Set();

    return normalizedInput
      .split(/[、，,；;\n]+/g)
      .map((taskText) => this.cleanTaskTitle(taskText))
      .filter((title) => title.length >= 2)
      .filter((title) => !fillerOnly.has(title))
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
      .replace(/^(?:(我|突然|刚|忽然|才)?\s*(突然想到|刚想到|忽然想到|想到|想起来|发现|意识到|记起来|突然发现|刚发现)\s*)+/, "")
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

  scoringEngine(tasks, rulePreset = this.state.rulePreset) {
    const ruleProfile = this.getRuleProfile(rulePreset);
    return tasks.map((task) => {
      const score =
        task.urgency * ruleProfile.weights.urgency +
        task.goalImpact * ruleProfile.weights.goalImpact +
        task.blockingRisk * ruleProfile.weights.blockingRisk +
        task.taskValue * ruleProfile.weights.taskValue +
        task.energyFit * ruleProfile.weights.energyFit;
      const effortAdjustment =
        task.effort >= 5 ? ruleProfile.effortPolicy.high :
          task.effort === 4 ? ruleProfile.effortPolicy.mediumHigh :
            task.effort <= 2 ? ruleProfile.effortPolicy.low :
              0;

      return {
        ...task,
        score: Math.round((score + effortAdjustment) * 100) / 100
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
          reason: "你手动把它置为现在要做，系统会在后续重排中优先保留这个选择。"
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
    const newTasks = tasks.filter((task) => task.change === "new");
    const newNow = newTasks.filter((task) => task.recommendation === "do_now").length;
    const newLater = newTasks.filter((task) => !this.isOutOfToday(task) && task.recommendation !== "do_now").length;
    const newOut = newTasks.filter((task) => this.isOutOfToday(task)).length;

    let summary = "本次重排完成。";
    if (newTasks.length > 0) {
      const segments = [];
      if (newNow > 0) segments.push(`${newNow} 项进入现在做`);
      if (newLater > 0) segments.push(`${newLater} 项安排到今天晚点做`);
      if (newOut > 0) segments.push(`${newOut} 项不放进今天`);
      summary += ` 本次新增 ${newTasks.length} 项，${segments.join("，")}。`;
    }
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

  pinTaskToNow(taskId) {
    const allTasks = this.cloneTasks(this.state.currentQueue);
    const activeTasks = this.getTodayTasks(allTasks);
    const outTasks = this.getOutOfTodayTasks(allTasks);

    const targetIndex = activeTasks.findIndex((task) => task.id === taskId);
    if (targetIndex <= 0) return;

    const [targetTask] = activeTasks.splice(targetIndex, 1);
    activeTasks.unshift({
      ...targetTask,
      manualStatus: "manual_order",
      change: "manual_order",
      reason: "你手动把它置为现在要做，系统会在后续重排中优先保留这个选择。"
    });

    const rerankedActive = activeTasks.map((task, index) => ({
      ...task,
      previousRank: task.currentRank,
      currentRank: index + 1,
      recommendation: this.getManualRecommendation(task, index),
      change: task.id === taskId ? "manual_order" : this.getChangeState(task, index + 1)
    }));

    this.state.lastQueue = this.cloneTasks(this.state.currentQueue);
    this.state.currentQueue = [...rerankedActive, ...outTasks];
    this.state.manualOrderConstraints = this.deriveManualOrderConstraints(rerankedActive);
    this.state.reorderResult = this.createResultFromCurrentQueue("已将该任务置为现在要做。");
    this.state.presetResults = null;
    this.persistState();
    this.showToast("已置为现在要做");
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
    this.state.presetResults = null;
    this.persistState();
    this.showToast("已移出今天");
    this.render();
  }

  completeTask(taskId) {
    const allTasks = this.cloneTasks(this.state.currentQueue);
    const targetTask = allTasks.find((task) => task.id === taskId);
    if (!targetTask || this.isOutOfToday(targetTask)) return;

    const remainingTasks = allTasks.filter((task) => task.id !== taskId);
    const activeTasks = this.getTodayTasks(remainingTasks).map((task, index) => ({
      ...task,
      currentRank: index + 1,
      recommendation: this.getManualRecommendation(task, index)
    }));
    const outTasks = this.getOutOfTodayTasks(remainingTasks);
    const completedTask = {
      ...targetTask,
      completedAt: new Date().toISOString()
    };

    this.state.lastQueue = allTasks;
    this.state.currentQueue = [...activeTasks, ...outTasks];
    this.state.completedTasks = [completedTask, ...this.state.completedTasks.filter((task) => task.id !== taskId)];
    this.state.lastCompletedTask = completedTask;
    this.state.manualOutIds = this.state.manualOutIds.filter((id) => id !== taskId);
    this.state.manualOrderConstraints = this.state.manualOrderConstraints.filter(
      (constraint) => constraint.beforeTaskId !== taskId && constraint.afterTaskId !== taskId
    );
    this.state.presetResults = null;
    this.persistState();
    this.render();
    this.showUndoToast("已标记完成", () => this.undoLastCompletedTask());
  }

  undoLastCompletedTask() {
    const task = this.state.lastCompletedTask;
    if (!task) return;

    const completedTasks = this.state.completedTasks.filter((item) => item.id !== task.id);
    const activeTasks = this.getTodayTasks(this.state.currentQueue);
    const outTasks = this.getOutOfTodayTasks(this.state.currentQueue);
    const restoredTask = {
      ...task,
      completedAt: undefined,
      previousRank: null,
      currentRank: activeTasks.length + 1,
      recommendation: "schedule_later",
      change: "same",
      manualStatus: null,
      reason: "已从完成状态恢复，下一次重排会重新安排。"
    };

    this.state.currentQueue = [...activeTasks, restoredTask, ...outTasks];
    this.state.completedTasks = completedTasks;
    this.state.lastCompletedTask = null;
    this.state.presetResults = null;
    this.persistState();
    this.render();
    this.showToast("已撤销完成");
  }

  toggleCompletedTasks() {
    this.state.isCompletedExpanded = !this.state.isCompletedExpanded;
    this.persistState();
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
      rulePreset: this.state.rulePreset,
      ruleProfile: this.getRuleProfile(),
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
      manual_order: "置为现在做",
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
    if (this.toastTimer) clearTimeout(this.toastTimer);
    toast.classList.remove("actionable");
    toast.textContent = message;
    toast.classList.add("show");
    this.toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      this.toastTimer = null;
    }, 2000);
  }

  showUndoToast(message, onUndo) {
    const toast = document.getElementById("toast");
    if (this.toastTimer) clearTimeout(this.toastTimer);
    toast.classList.add("actionable");
    toast.innerHTML = `
      <span>${this.escapeHtml(message)}</span>
      <button id="toast-undo-btn" class="toast-action">撤销</button>
    `;
    toast.classList.add("show");

    const undoBtn = document.getElementById("toast-undo-btn");
    if (undoBtn) {
      undoBtn.onclick = () => {
        toast.classList.remove("show", "actionable");
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = null;
        onUndo();
      };
    }

    this.toastTimer = setTimeout(() => {
      toast.classList.remove("show", "actionable");
      this.toastTimer = null;
    }, 4000);
  }

  render() {
    document.body.classList.toggle("modal-open", this.state.isIdeaSheetOpen);
    this.renderHeader();
    this.renderFocusScreen();
    this.renderTodayQueue();
    this.renderCapturePanel();
    this.renderReasonPanel();
    this.bindEvents();
  }

  renderHeader() {
    const header = document.getElementById("header");
    const currentPreset = this.normalizeRulePreset(this.state.rulePreset);
    const presets = [
      ["balanced", "平衡"],
      ["deadline_first", "截止"],
      ["goal_first", "目标"],
      ["low_effort_first", "轻松"]
    ];

    header.innerHTML = `
      <div class="mode-wrap">
        <span class="app-title">现在做什么？</span>
        <span class="mode-label">选择你的注意力模式</span>
        <div class="mode-switcher" role="radiogroup" aria-label="选择注意力模式">
          <span class="mode-prefix">模式：</span>
          ${presets.map(([preset, label]) => `
            <button
              class="rule-preset-btn mode-button ${preset === currentPreset ? "active" : ""}"
              data-rule-preset="${preset}"
              type="button"
              role="radio"
              aria-checked="${preset === currentPreset ? "true" : "false"}"
              ${this.state.isProcessing ? "disabled" : ""}
            >${this.escapeHtml(label)}</button>
          `).join("")}
        </div>
        ${this.state.isRuleDirty ? `<button id="rerank-rule-btn" class="btn-primary compact top-rerank" ${this.state.isProcessing ? "disabled" : ""}>重新安排</button>` : ""}
      </div>
    `;
  }

  renderFocusScreen() {
    const container = document.getElementById("focus-screen");
    const queue = this.getTodayTasks(this.state.currentQueue);
    const currentTask = queue[0] || null;
    const profile = this.getRuleProfile();
    const completedCount = (this.state.completedTasks || []).length;

    if (!currentTask) {
      container.innerHTML = `
        <section class="focus-hero empty-focus">
          <p class="eyebrow"> <span class="live-dot"></span> 现在要做：</p>
          <h1 id="focus-title">现在没有必须立刻处理的事</h1>
          <p class="hero-reason">新增一个想法后，我会重新判断今天应该先发生什么。</p>
        </section>
        ${this.renderInlineIdeaComposer()}
        <button class="scroll-cue" type="button" data-scroll-target="today-queue">下滑看其他事项</button>
      `;
      return;
    }

    const scoreWidth = Math.max(8, Math.min(100, ((currentTask.score || 0) / 5) * 100));
    const total = this.getTodayTasks(this.state.currentQueue).length + this.getOutOfTodayTasks(this.state.currentQueue).length;
    const pendulum = this.renderFocusPendulum(queue);

    container.innerHTML = `
      <section class="focus-hero" aria-labelledby="focus-title">
        <div class="hero-copy">
          <p class="eyebrow"><span class="live-dot"></span> 现在要做：</p>
          <h1 id="focus-title">${this.escapeHtml(currentTask.title)}</h1>
          <p class="hero-reason">${this.escapeHtml(currentTask.reason || "根据当前排序，先处理这件事。")}</p>
          <div class="hero-meta">
            ${currentTask.deadline ? `<span>截止 ${this.escapeHtml(currentTask.deadline)}</span>` : ""}
            <button class="hero-complete-btn" type="button" data-task-id="${currentTask.id}">标记完成</button>
          </div>
        </div>
        ${pendulum}
      </section>
      ${this.renderInlineIdeaComposer()}
      <button class="scroll-cue" type="button" data-scroll-target="today-queue">↓下滑 · 还要做什么</button>
    `;
  }

  renderFocusPendulum(queue) {
    return `
      <div class="focus-pendulum" aria-hidden="true">
        <div class="pendulum-stage">
          <div class="pivot"></div>
          <div class="needle"></div>
        </div>
      </div>
    `;
  }

  renderInlineIdeaComposer() {
    const inputValue = this.escapeHtml(this.state.rawInput);
    const isSubmitDisabled = this.state.isProcessing || !this.state.rawInput.trim();
    const voiceFallbackAttr = this.state.speechSupported ? "" : `aria-describedby="voice-fallback-hint"`;

    return `
      <section class="idea-composer-card" aria-labelledby="idea-composer-title">
        <p class="composer-kicker"><span class="live-dot"></span> 有新想法？</p>
        <h2 id="idea-composer-title">说出来，今天会自动重新安排</h2>
        <div class="composer-input-row">
          <label class="sr-only" for="input-text">输入新的任务或想法</label>
          <div class="composer-input-shell">
            <textarea
              id="input-text"
              class="composer-input"
              placeholder="输入或说出一件事"
              autocomplete="off"
              rows="1"
              ${this.state.isProcessing ? "disabled" : ""}
            >${inputValue}</textarea>
            <button
              id="voice-btn"
              class="composer-mic-button ${this.state.speechSupported ? "" : "unsupported"}"
              type="button"
              aria-label="语音输入"
              ${this.state.isProcessing ? "disabled" : ""}
              ${voiceFallbackAttr}
            >
              ${getIcon('AudioOutlined')}
            </button>
          </div>
          <button
            id="reorder-btn"
            class="composer-submit"
            type="button"
            ${isSubmitDisabled ? "disabled" : ""}
          >${this.state.isProcessing ? "处理中..." : "加入并重排"}</button>
        </div>
        ${this.state.speechSupported ? "" : `<p id="voice-fallback-hint" class="voice-fallback-hint">当前浏览器不支持网页语音识别，可使用系统键盘语音输入。</p>`}
        <div class="composer-examples" aria-label="快速体验示例">
          <span class="examples-label">快速体验：</span>
          ${DEMO_DATA.examples.map((example) => `
            <button class="example-btn composer-example-btn" type="button" data-example-id="${example.id}" ${this.state.isProcessing ? "disabled" : ""}>${this.escapeHtml(example.name)}</button>
          `).join("")}
        </div>
        ${this.renderModelSettingsPanel()}
      </section>
    `;
  }

  renderModelSettingsPanel() {
    const config = this.normalizeModelConfig(this.state.modelConfig);
    const status = this.normalizeModelConnectionStatus(this.state.modelConnectionStatus);
    const statusLabel = this.getModelConnectionLabel();
    const message = this.state.modelConnectionMessage || "未测试模型连接";
    const testedAt = this.state.modelConnectionTestedAt ? new Date(this.state.modelConnectionTestedAt).toLocaleString("zh-CN") : "";

    return `
      <div class="model-settings-panel">
        <button
          id="model-settings-toggle"
          class="model-settings-toggle"
          type="button"
          aria-expanded="${this.state.isModelSettingsOpen ? "true" : "false"}"
        >
          <span>大模型 API</span>
          <span id="model-connection-summary">${statusLabel} · ${this.state.isModelSettingsOpen ? "收起" : "设置"}</span>
        </button>
        ${this.state.isModelSettingsOpen ? `
          <div class="model-settings-body">
            <p class="model-settings-hint">API Key 保存在当前浏览器。重排时会发送到本地后端，并由本地后端请求你配置的模型服务。</p>
            <div class="model-connection-status ${status}" role="status" aria-live="polite">
              <strong>${statusLabel}</strong>
              <span id="model-connection-message">${this.escapeHtml(message)}${testedAt ? ` · ${this.escapeHtml(testedAt)}` : ""}</span>
            </div>
            <label class="field-label" for="model-base-url">Base URL</label>
            <input
              id="model-base-url"
              class="model-config-input"
              data-model-config-field="baseUrl"
              type="url"
              value="${this.escapeHtml(config.baseUrl)}"
              placeholder="https://api.deepseek.com"
              ${this.state.isProcessing ? "disabled" : ""}
            >
            <label class="field-label" for="model-name">模型名</label>
            <input
              id="model-name"
              class="model-config-input"
              data-model-config-field="modelName"
              type="text"
              value="${this.escapeHtml(config.modelName)}"
              placeholder="deepseek-chat"
              ${this.state.isProcessing ? "disabled" : ""}
            >
            <label class="field-label" for="model-api-key">API Key</label>
            <input
              id="model-api-key"
              class="model-config-input"
              data-model-config-field="apiKey"
              type="password"
              autocomplete="off"
              spellcheck="false"
              value="${this.escapeHtml(config.apiKey)}"
              placeholder="sk-..."
              ${this.state.isProcessing ? "disabled" : ""}
            >
            <label class="field-label" for="model-timeout-ms">超时时间（毫秒）</label>
            <input
              id="model-timeout-ms"
              class="model-config-input"
              data-model-config-field="timeoutMs"
              type="number"
              min="1000"
              max="30000"
              step="500"
              value="${this.escapeHtml(config.timeoutMs)}"
              ${this.state.isProcessing ? "disabled" : ""}
            >
            <div class="model-settings-actions">
              <button id="test-model-config" class="btn-primary compact" type="button" ${this.state.isProcessing || status === "testing" ? "disabled" : ""}>${status === "testing" ? "测试中..." : "测试连接"}</button>
              <button id="save-model-config" class="btn-secondary compact" type="button" ${this.state.isProcessing ? "disabled" : ""}>保存配置</button>
              <button id="clear-model-config" class="btn-link" type="button" ${this.state.isProcessing ? "disabled" : ""}>清除 Key</button>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  renderTodayQueue() {
    const tasks = this.state.currentQueue;
    const queue = this.getTodayTasks(tasks);
    const outOfToday = this.getOutOfTodayTasks(tasks);
    const container = document.getElementById("today-queue");
    const focusTask = queue[0] || null;
    const remainingQueue = focusTask ? queue.filter((task) => task.id !== focusTask.id) : queue;

    const nowTasks = remainingQueue.filter((task) => task.recommendation === "do_now");
    const laterTasks = remainingQueue.filter((task) => task.recommendation !== "do_now");
    const completedCount = (this.state.completedTasks || []).length;
    const total = queue.length + outOfToday.length + completedCount;

    container.innerHTML = `
      <div class="queue-header">
        <div>
          <p class="section-kicker"><span class="live-dot"></span> 今日安排：</p>
          <h2 id="queue-title">还要做什么</h2>
        </div>
        <span class="queue-count">${completedCount}/${total} 已完成</span>
      </div>
      <p class="positioning-line">重排今日注意力，而不是追加待办。</p>
      ${nowTasks.length > 0 ? this.renderTaskGroup("接下来", nowTasks, "group-now", true) : ""}
      ${laterTasks.length > 0 ? this.renderTaskGroup("今天晚点做", laterTasks, "group-later", true) : ""}
      ${this.renderTaskGroup("不放进今天", outOfToday, "group-out", false)}
      ${this.renderCompletedTasks()}
    `;
  }

  renderTaskGroup(title, tasks, className, canPinToNow = false) {
    const emptyText = className === "group-now" ? "现在没有必须立刻处理的事" : "暂无任务";
    return `
      <div class="task-group ${className}">
        <div class="task-group-header">
          <h3>${title}</h3>
          <span>${tasks.length} 项</span>
        </div>
        <div class="task-list">
          ${tasks.length > 0 ? tasks.map((task) => this.renderTaskCard(task, className === "group-later", canPinToNow)).join("") : `<div class="empty-group">${emptyText}</div>`}
        </div>
      </div>
    `;
  }

  renderTaskCard(task, isLater = false, canPinToNow = false) {
    const recLabels = {
      do_now: { text: "立即做", class: "rec-now" },
      do_today: { text: "今天做", class: "rec-today" },
      schedule_later: { text: "稍后处理", class: "rec-later" },
      merge: { text: "合并处理", class: "rec-merge" },
      remove_today: { text: "不放进今天", class: "rec-remove" }
    };

    const rec = recLabels[task.recommendation] || recLabels.do_today;
    const rank = task.currentRank || "-";
    const scoreWidth = Math.max(8, Math.min(100, ((task.score || 0) / 5) * 100));
    const canComplete = !this.isOutOfToday(task);

    return `
      <div
        class="task-card ${this.isOutOfToday(task) ? "task-out" : ""} ${isLater ? "task-later" : ""} ${task.manualStatus ? "task-manual" : ""}"
        data-task-id="${this.escapeHtml(task.id)}"
      >
        <div class="task-card-actions">
          ${canComplete ? `
            <button
              class="complete-task-btn"
              data-task-id="${this.escapeHtml(task.id)}"
              aria-label="标记完成：${this.escapeHtml(task.title)}"
              title="标记完成"
            ></button>
          ` : ""}
          ${canPinToNow ? `
            <button
              class="pin-task-btn"
              type="button"
              data-task-id="${this.escapeHtml(task.id)}"
              aria-label="置为现在做：${this.escapeHtml(task.title)}"
              title="置为现在做"
            >↑ 现在</button>
          ` : ""}
        </div>
        <div class="task-rank">${rank}</div>
        <div class="task-content">
          <div class="task-header">
            <h3>${this.escapeHtml(task.title)}</h3>
          </div>
          <div class="task-meta">
            ${task.deadline ? `<span class="deadline">截止 ${this.escapeHtml(task.deadline)}</span>` : ""}
            <span class="recommendation ${rec.class}">${rec.text}</span>
          </div>
          <p class="task-reason">${this.escapeHtml(task.reason)}</p>
        </div>
      </div>
    `;
  }

  renderCapturePanel() {
    const panel = document.getElementById("capture-panel");

    panel.innerHTML = `
      ${this.renderIdeaSheet()}
    `;
  }

  renderIdeaSheet() {
    if (!this.state.isIdeaSheetOpen) return "";

    const voiceFallbackAttr = this.state.speechSupported ? "" : `aria-describedby="voice-fallback-hint"`;
    const sheetBusyAttr = this.state.isProcessing ? `aria-busy="true"` : "";

    return `
      <div id="idea-sheet-backdrop" class="sheet-backdrop"></div>
      <div class="idea-sheet ${this.state.isProcessing ? "is-processing" : ""}" role="dialog" aria-modal="true" aria-labelledby="idea-sheet-title" ${sheetBusyAttr}>
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <h2 id="idea-sheet-title">新增想法</h2>
          <button id="close-idea-sheet" class="btn-icon" aria-label="关闭" ${this.state.isProcessing ? "disabled" : ""}>×</button>
        </div>

        <label class="field-label" for="input-text">想法内容</label>
        <textarea
          id="input-text"
          placeholder="输入你的想法，例如：今晚要运动、洗地、洗澡"
          rows="4"
          ${this.state.isProcessing ? "disabled" : ""}
        >${this.escapeHtml(this.state.rawInput)}</textarea>

        <div class="examples-section">
          <p>快速体验示例</p>
          <div class="examples-list">
            ${DEMO_DATA.examples.map((example) => `
              <button class="example-btn" data-example-id="${example.id}" ${this.state.isProcessing ? "disabled" : ""}>${this.escapeHtml(example.name)}</button>
            `).join("")}
          </div>
        </div>

        <div class="sheet-actions">
          <div class="voice-action">
            <button
              id="voice-btn"
              class="btn-voice ${this.state.speechSupported ? "" : "unsupported"}"
              ${this.state.isProcessing ? "disabled" : ""}
              ${voiceFallbackAttr}
            >语音输入</button>
            ${this.state.speechSupported ? "" : `<p id="voice-fallback-hint" class="voice-fallback-hint">当前浏览器不支持网页语音识别，可使用系统键盘语音输入。</p>`}
          </div>
          <button id="reorder-btn" class="btn-primary ${this.state.isProcessing ? "processing" : ""}" ${this.state.isProcessing ? "disabled" : ""}>
            ${this.state.isProcessing ? "处理中..." : "新增并重排"}
          </button>
        </div>
        ${this.state.isProcessing ? `
          <div class="sheet-loading" role="status" aria-live="polite">
            <div class="loading-spinner"></div>
            <p>正在拆解想法并重排今天</p>
          </div>
        ` : ""}
      </div>
    `;
  }

  renderReasonPanel() {
    const panel = document.getElementById("reason-panel");

    if (!this.state.reorderResult) {
      panel.innerHTML = `
        <div class="summary-shell">
          <div class="summary-heading">
            <p class="section-kicker"><span class="live-dot"></span> 重排摘要：</p>
          </div>
          <div class="reason-empty">
            <h3>还没有新的重排结果</h3>
            <p>点击首屏底部“新增想法并重排”后，这里会展示本次取舍摘要。</p>
          </div>
          ${this.renderRulePanel()}
          ${this.renderSummaryFooter()}
        </div>
      `;
      return;
    }

    const result = this.state.reorderResult;
    const changeEvents = result.changeEvents || [];
    const warnings = result.warnings || [];
    const sourceLabels = {
      model: { text: "模型分析", class: "source-model" },
      fallback: { text: "备用规则", class: "source-fallback" },
      none: { text: "重新安排", class: "source-none" }
    };
    const source = sourceLabels[result.source];

    panel.innerHTML = `
      <div class="summary-shell">
        <div class="summary-heading">
          <p class="section-kicker"><span class="live-dot"></span> 重排摘要：</p>
        </div>
        <div class="summary-card">
          <p>${this.escapeHtml(result.summary)}</p>
          ${source ? `<span class="source-badge ${source.class}">${source.text}</span>` : ""}
        </div>
        ${warnings.length > 0 ? `
          <div class="warning-list">
            ${warnings.map((warning) => `<p>${this.escapeHtml(warning)}</p>`).join("")}
          </div>
        ` : ""}

        <button
          id="change-details-toggle"
          class="details-toggle"
          type="button"
          aria-expanded="${this.state.isChangeDetailsOpen ? "true" : "false"}"
        >
          <span>调整详情 · ${changeEvents.length} 项</span>
          <span>${this.state.isChangeDetailsOpen ? "收起" : "展开"}</span>
        </button>
        ${this.state.isChangeDetailsOpen ? `
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
        ` : ""}
        ${this.renderRulePanel()}
        ${this.renderSummaryFooter()}
      </div>
    `;
  }

  renderRulePanel() {
    const currentPreset = this.normalizeRulePreset(this.state.rulePreset);
    const profile = this.getRuleProfile(currentPreset);

    return `
      <div class="rule-panel">
        <div class="rule-panel-header">
          <div>
            <h3>当前排序偏好 · ${this.escapeHtml(profile.label)}</h3>
            <p>${this.escapeHtml(profile.description)}</p>
          </div>
        </div>
        ${this.state.isRuleDirty ? `<p class="rule-dirty">偏好已修改，下次新增或点击重新安排后生效。</p>` : ""}
        <button
          id="rule-details-toggle"
          class="rule-details-toggle"
          type="button"
          aria-expanded="${this.state.isRuleDetailsOpen ? "true" : "false"}"
        >${this.state.isRuleDetailsOpen ? "收起排序规则" : "查看排序规则"}</button>
        ${this.state.isRuleDetailsOpen ? this.renderRuleDetails(profile, currentPreset) : ""}
      </div>
    `;
  }

  renderRuleDetails(profile, rulePreset) {
    const weightLabels = {
      urgency: "截止紧急度",
      goalImpact: "今日目标影响",
      blockingRisk: "阻塞风险",
      taskValue: "任务价值",
      energyFit: "精力匹配"
    };
    const weights = Object.entries(profile.weights || {});
    const effort = profile.effortPolicy || {};

    return `
      <div class="rule-details">
        <p>AI 负责理解任务，规则引擎负责最终排序。手动排序、移出今天、标记完成优先于普通分数；硬截止和阻塞风险可能打破手动排序。</p>
        <div class="weight-list">
          ${weights.map(([key, value]) => `
            <div class="weight-row">
              <span>${this.escapeHtml(weightLabels[key] || key)}</span>
              <strong>${Math.round(value * 100)}%</strong>
            </div>
          `).join("")}
          <div class="weight-row">
            <span>耗时成本</span>
            <strong>${this.escapeHtml(this.getEffortPolicyText(effort))}</strong>
          </div>
        </div>
        <p class="rule-code">当前生效规则：${this.escapeHtml(rulePreset)}</p>
      </div>
    `;
  }

  getEffortPolicyText(effortPolicy) {
    const high = Number(effortPolicy.high || 0);
    const mediumHigh = Number(effortPolicy.mediumHigh || 0);
    const low = Number(effortPolicy.low || 0);
    return `高耗时 ${high.toFixed(2)}，偏高 ${mediumHigh.toFixed(2)}，低耗时 +${low.toFixed(2)}`;
  }

  renderCompletedTasks() {
    const completedTasks = this.state.completedTasks || [];
    if (completedTasks.length === 0) return "";

    return `
      <div class="completed-section">
        <button
          id="completed-toggle"
          class="completed-toggle"
          aria-expanded="${this.state.isCompletedExpanded ? "true" : "false"}"
        >
          <span>今日已完成 · ${completedTasks.length} 项</span>
          <span class="completed-chevron">${this.state.isCompletedExpanded ? "收起" : "展开"}</span>
        </button>
        ${this.state.isCompletedExpanded ? `
          <div class="completed-list">
            ${completedTasks.map((task) => `
              <div class="completed-item">
                <span>${this.escapeHtml(task.title)}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  renderSummaryFooter() {
    return `
      <div class="summary-footer">
        <button class="btn-link" type="button" data-scroll-target="focus-screen">↑ 回到现在要做</button>
      </div>
    `;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new AttentionReorderApp();
});
