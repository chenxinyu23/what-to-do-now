class AttentionReorderApp {
  constructor() {
    this.state = {
      rawInput: "",
      currentQueue: [],
      lastQueue: [],
      extractedTasks: [],
      reorderResult: null,
      isProcessing: false,
      speechSupported: false
    };
    this.init();
  }

  init() {
    this.checkSpeechSupport();
    this.loadInitialState();
    this.render();
  }

  checkSpeechSupport() {
    this.state.speechSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }

  loadInitialState() {
    this.state.currentQueue = DEMO_DATA.initialQueue.map(task => ({ ...task }));
    this.state.lastQueue = [];
  }

  bindEvents() {
    const reorderBtn = document.getElementById('reorder-btn');
    const inputText = document.getElementById('input-text');
    const voiceBtn = document.getElementById('voice-btn');
    if (!reorderBtn || !inputText || !voiceBtn) return;

    reorderBtn.onclick = () => this.handleReorder();
    inputText.onkeypress = (e) => {
      if (e.key === 'Enter') this.handleReorder();
    };
    voiceBtn.onclick = () => this.handleVoiceInput();
    
    document.querySelectorAll('.example-btn').forEach(btn => {
      btn.onclick = (e) => {
        const exampleId = e.target.dataset.exampleId;
        this.loadExample(exampleId);
      };
    });
  }

  loadExample(exampleId) {
    const example = DEMO_DATA.examples.find(e => e.id === exampleId);
    if (example) {
      document.getElementById('input-text').value = example.input;
      this.state.rawInput = example.input;
    }
  }

  handleReorder() {
    const inputText = document.getElementById('input-text').value.trim();
    if (!inputText) {
      this.showToast('请输入一个想法或任务');
      return;
    }

    this.state.rawInput = inputText;
    this.state.isProcessing = true;
    this.render();

    setTimeout(() => {
      const result = this.processReorder(inputText);
      this.state.isProcessing = false;
      this.state.reorderResult = result;
      this.render();
    }, 800);
  }

  handleVoiceInput() {
    if (!this.state.speechSupported) {
      this.showToast('当前浏览器不支持语音识别，请使用文字输入');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    this.showToast('正在听...');

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      document.getElementById('input-text').value = transcript;
      this.state.rawInput = transcript;
      this.showToast('语音输入完成');
    };

    recognition.onerror = (event) => {
      this.showToast('语音识别失败，请重试');
    };

    recognition.start();
  }

  processReorder(inputText) {
    const extractedTasks = this.taskExtractor(inputText);
    const normalizedTasks = this.normalizeTaskDrafts(extractedTasks);
    const mergedTasks = this.mergeWithCurrentQueue(this.state.currentQueue, normalizedTasks);
    const scoredTasks = this.scoringEngine(mergedTasks);
    const reorderedTasks = this.reorderEngine(scoredTasks);
    const explainedTasks = this.explanationGenerator(reorderedTasks);
    
    const queue = explainedTasks.filter(t => t.recommendation !== 'remove_today');
    const outOfToday = explainedTasks.filter(t => t.recommendation === 'remove_today');
    
    return {
      summary: this.generateSummary(explainedTasks),
      inputText: inputText,
      extractedTasks: normalizedTasks,
      queue: queue,
      outOfToday: outOfToday,
      tradeoffSuggestions: this.generateTradeoffSuggestions(explainedTasks),
      allTasks: explainedTasks
    };
  }

  taskExtractor(inputText) {
    for (const example of DEMO_DATA.examples) {
      if (inputText.includes(example.input) || example.input.includes(inputText)) {
        return example.extractedTasks.map(t => ({ ...t }));
      }
    }

    const keywords = ['还要', '顺便', '记得', '明天', '今晚', '然后', '另外', '以及', '还有'];
    let tasks = [];
    let remaining = inputText;
    
    for (const keyword of keywords) {
      while (remaining.includes(keyword)) {
        const idx = remaining.indexOf(keyword);
        const taskText = remaining.substring(0, idx).trim();
        if (taskText.length > 2) {
          tasks.push(this.createDefaultTask(taskText));
        }
        remaining = remaining.substring(idx + keyword.length);
      }
    }
    
    if (remaining.trim().length > 2) {
      tasks.push(this.createDefaultTask(remaining.trim()));
    }

    if (tasks.length === 0) {
      tasks.push(this.createDefaultTask(inputText));
    }

    return tasks;
  }

  createDefaultTask(title) {
    return {
      title: title,
      deadline: "",
      category: "other",
      source: "text_input",
      urgency: 3,
      goalImpact: 3,
      blockingRisk: 2,
      effort: 3,
      energyFit: 3,
      taskValue: 3,
      recommendation: "do_today",
      reason: "根据输入自动识别的任务。"
    };
  }

  normalizeTaskDrafts(taskDrafts) {
    return taskDrafts.map((draft, index) => ({
      id: `task_${Date.now()}_${index}`,
      ...draft,
      urgency: draft.urgency || 3,
      goalImpact: draft.goalImpact || 3,
      blockingRisk: draft.blockingRisk || 2,
      effort: draft.effort || 3,
      energyFit: draft.energyFit || 3,
      taskValue: draft.taskValue || 3,
      score: 0,
      previousRank: null,
      currentRank: null,
      change: "new"
    }));
  }

  mergeWithCurrentQueue(currentQueue, newTasks) {
    const existingIds = new Set(currentQueue.map(t => t.id));
    const newIds = new Set(newTasks.map(t => t.id));
    
    const merged = currentQueue.map(task => ({
      ...task,
      previousRank: task.currentRank,
      change: newIds.has(task.id) ? "same" : task.change
    }));
    
    newTasks.forEach(task => {
      if (!existingIds.has(task.id)) {
        merged.push(task);
      }
    });
    
    return merged;
  }

  scoringEngine(tasks) {
    return tasks.map(task => {
      const score = 
        task.urgency * 0.30 +
        task.goalImpact * 0.25 +
        task.blockingRisk * 0.20 +
        task.taskValue * 0.15 +
        task.energyFit * 0.10;
      
      let recommendation = this.getRecommendation(score, task);
      
      return {
        ...task,
        score: Math.round(score * 100) / 100
      };
    });
  }

  getRecommendation(score, task) {
    if (score >= 4.4 && (task.urgency >= 4 || task.blockingRisk >= 4)) {
      return "do_now";
    } else if (score >= 3.5) {
      return "do_today";
    } else if (score >= 2.5) {
      return "schedule_later";
    } else {
      return "remove_today";
    }
  }

  reorderEngine(scoredTasks) {
    const sorted = [...scoredTasks].sort((a, b) => b.score - a.score);
    
    return sorted.map((task, index) => {
      let change = task.change;
      if (change === "new") {
        change = "new";
      } else if (task.previousRank !== null) {
        if (index + 1 < task.previousRank) {
          change = "up";
        } else if (index + 1 > task.previousRank) {
          change = "down";
        } else {
          change = "same";
        }
      }
      
      return {
        ...task,
        currentRank: index + 1,
        change: change,
        recommendation: this.getRecommendation(task.score, task)
      };
    });
  }

  explanationGenerator(tasks) {
    return tasks.map(task => {
      if (task.reason) {
        return task;
      }
      
      const reasons = [];
      if (task.urgency >= 4) reasons.push('截止时间较近');
      if (task.goalImpact >= 4) reasons.push('目标影响较大');
      if (task.blockingRisk >= 4) reasons.push('阻塞风险较高');
      if (task.taskValue >= 4) reasons.push('任务价值较高');
      if (task.energyFit >= 4) reasons.push('精力匹配度好');
      if (task.effort <= 2) reasons.push('耗时较短');
      
      let reason = '';
      if (reasons.length > 0) {
        reason = `${reasons.join('，')}，因此${this.getReasonSuffix(task)}。`;
      } else {
        reason = '根据综合评分排序。';
      }
      
      return {
        ...task,
        reason: reason
      };
    });
  }

  getReasonSuffix(task) {
    if (task.change === 'new') return '新增到队列';
    if (task.change === 'up') return '排名上升';
    if (task.change === 'down') return '排名下降';
    if (task.recommendation === 'do_now') return '建议立即处理';
    if (task.recommendation === 'do_today') return '建议今天完成';
    if (task.recommendation === 'schedule_later') return '建议今天晚点处理';
    if (task.recommendation === 'merge') return '建议合并处理';
    if (task.recommendation === 'remove_today') return '建议移出今天';
    return '保持当前位置';
  }

  generateSummary(tasks) {
    const highPriority = tasks.filter(t => t.score >= 4.0).length;
    const removed = tasks.filter(t => t.recommendation === 'remove_today').length;
    const changed = tasks.filter(t => t.change === 'up' || t.change === 'down').length;
    
    let summary = '本次重排完成。';
    if (highPriority > 0) summary += ` 发现 ${highPriority} 个高优先级任务。`;
    if (changed > 0) summary += ` ${changed} 个任务排名发生变化。`;
    if (removed > 0) summary += ` ${removed} 个任务不放进今天。`;
    
    return summary;
  }

  generateTradeoffSuggestions(tasks) {
    return tasks
      .filter(t => t.recommendation !== 'do_now' && t.recommendation !== 'do_today')
      .map(t => ({
        taskId: t.id,
        action: t.recommendation,
        reason: t.reason
      }));
  }

  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  render() {
    this.renderHeader();
    this.renderTodayQueue();
    this.renderCapturePanel();
    this.renderReasonPanel();
  }

  renderHeader() {
    const header = document.getElementById('header');
    header.innerHTML = `
      <h1>AI 注意力重排助手</h1>
      <p>新想法插入时，帮你重新分配今天的注意力</p>
    `;
  }

  renderTodayQueue() {
    const queue = this.state.reorderResult ? this.state.reorderResult.queue : this.state.currentQueue;
    const outOfToday = this.state.reorderResult
      ? this.state.reorderResult.outOfToday
      : this.state.currentQueue.filter(t => t.recommendation === 'remove_today' || t.recommendation === 'merge');
    const container = document.getElementById('today-queue');
    
    const nowTasks = queue.filter(t => t.recommendation === 'do_now');
    const laterTasks = queue.filter(t => t.recommendation === 'do_today' || t.recommendation === 'schedule_later');
    const notTodayTasks = outOfToday.filter(t => t.recommendation === 'remove_today' || t.recommendation === 'merge');
    const total = nowTasks.length + laterTasks.length + notTodayTasks.length;
    
    container.innerHTML = `
      <div class="queue-header">
        <h2>怎么安排今天</h2>
        <span class="queue-count">共 ${total} 项</span>
      </div>
      ${this.renderTaskGroup('现在做', nowTasks, 'group-now')}
      ${laterTasks.length > 0 ? `
        ${this.renderTaskGroup('今天晚点做', laterTasks, 'group-later')}
      ` : ''}
      ${notTodayTasks.length > 0 ? `
        ${this.renderTaskGroup('不放进今天', notTodayTasks, 'group-out')}
      ` : ''}
    `;
  }

  renderTaskGroup(title, tasks, className) {
    if (tasks.length === 0) {
      return `
        <div class="task-group ${className}">
          <div class="task-group-header">
            <h3>${title}</h3>
          </div>
          <div class="empty-group">暂无任务</div>
        </div>
      `;
    }

    return `
      <div class="task-group ${className}">
        <div class="task-group-header">
          <h3>${title}</h3>
          <span>${tasks.length} 项</span>
        </div>
        <div class="task-list">
          ${tasks.map(task => this.renderTaskCard(task, className === 'group-later')).join('')}
        </div>
      </div>
    `;
  }

  renderTaskCard(task, isLater = false) {
    const changeLabels = {
      new: { text: '新增', class: 'label-new' },
      up: { text: '上升', class: 'label-up' },
      down: { text: '下降', class: 'label-down' },
      same: { text: '保持', class: 'label-same' },
      out: { text: '移出', class: 'label-out' }
    };
    
    const recLabels = {
      do_now: { text: '立即做', class: 'rec-now' },
      do_today: { text: '今天做', class: 'rec-today' },
      schedule_later: { text: '稍后处理', class: 'rec-later' },
      merge: { text: '合并处理', class: 'rec-merge' },
      remove_today: { text: '不放进今天', class: 'rec-remove' }
    };

    const change = changeLabels[task.change] || changeLabels.same;
    const rec = recLabels[task.recommendation] || recLabels.do_today;
    
    return `
      <div class="task-card ${task.recommendation === 'remove_today' ? 'task-out' : ''} ${isLater ? 'task-later' : ''}">
        <div class="task-rank">${task.currentRank || '-'}</div>
        <div class="task-content">
          <div class="task-header">
            <h3>${task.title}</h3>
            <span class="label ${change.class}">${change.text}</span>
          </div>
          <div class="task-meta">
            ${task.deadline ? `<span class="deadline">⏰ ${task.deadline}</span>` : ''}
            <span class="recommendation ${rec.class}">${rec.text}</span>
          </div>
          <p class="task-reason">${task.reason}</p>
          <div class="score-detail">
            <div class="score-bar" style="width: ${(task.score / 5) * 100}%">
              <span>${task.score.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderCapturePanel() {
    const panel = document.getElementById('capture-panel');
    
    panel.innerHTML = `
      <div class="input-section">
        <textarea 
          id="input-text" 
          placeholder="输入你的想法，例如：'我突然想到还要问老师推荐信，晚上顺便看一下竞品，明天中午前要交报名材料。'"
          rows="3"
        >${this.state.rawInput}</textarea>
      </div>
      
      <div class="action-section">
        <button id="voice-btn" class="btn-voice" ${!this.state.speechSupported ? 'disabled' : ''}>
          🎤 语音输入
        </button>
        <button id="reorder-btn" class="btn-primary ${this.state.isProcessing ? 'processing' : ''}">
          ${this.state.isProcessing ? '处理中...' : '重排今日队列'}
        </button>
      </div>
      
      <div class="examples-section">
        <p>快速体验示例：</p>
        <div class="examples-list">
          ${DEMO_DATA.examples.map(ex => `
            <button class="example-btn" data-example-id="${ex.id}">${ex.name}</button>
          `).join('')}
        </div>
      </div>
    `;
    
    this.bindEvents();
  }

  renderReasonPanel() {
    const panel = document.getElementById('reason-panel');
    
    if (!this.state.reorderResult) {
      panel.innerHTML = `
        <div class="reason-empty">
          <h3>💡 AI 取舍解释</h3>
          <p>输入想法并点击"重排今日队列"，查看 AI 如何把任务分到“现在做 / 今天晚点做 / 不放进今天”。</p>
        </div>
      `;
      return;
    }

    const result = this.state.reorderResult;
    
    const laterTasks = result.queue.filter(t => t.recommendation === 'do_today' || t.recommendation === 'schedule_later');
    const outTasks = result.outOfToday || [];
    const nowTasks = result.queue.filter(t => t.recommendation === 'do_now');
    
    panel.innerHTML = `
      <h3>📊 本次重排摘要</h3>
      <div class="summary-card">
        <p>${result.summary}</p>
      </div>
      
      <h3>🔄 变化详情</h3>
      <div class="changes-list">
        ${result.queue.map(task => {
          if (task.change === 'new' || task.change === 'up' || task.change === 'down') {
            return `
              <div class="change-item">
                <span class="change-label ${task.change}">${task.change === 'new' ? '新增' : task.change === 'up' ? '上升' : '下降'}</span>
                <span class="change-title">${task.title}</span>
                <span class="change-reason">${task.reason}</span>
              </div>
            `;
          }
          return '';
        }).join('')}
      </div>
      
      <h3>🧭 今日安排</h3>
      <div class="tradeoff-list">
        ${[
          ...nowTasks.map(task => ({ ...task, groupTitle: '现在做' })),
          ...laterTasks.map(task => ({ ...task, groupTitle: '今天晚点做' })),
          ...outTasks.map(task => ({ ...task, groupTitle: '不放进今天' }))
        ].map(task => {
            const actionText = task.recommendation === 'do_now'
              ? '现在做'
              : task.recommendation === 'do_today' || task.recommendation === 'schedule_later'
                ? '今天晚点做'
                : task.recommendation === 'merge'
                  ? '合并处理'
                  : '不放进今天';
            return `
              <div class="tradeoff-card">
                <div class="tradeoff-header">
                  <span class="tradeoff-action ${task.recommendation}">${actionText}</span>
                  <span class="tradeoff-score">${task.score.toFixed(1)}分</span>
                </div>
                <h4>${task.title}</h4>
                ${task.deadline ? `<span class="tradeoff-deadline">⏰ ${task.deadline}</span>` : ''}
                <p>${task.reason}</p>
              </div>
            `;
          }).join('')}
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AttentionReorderApp();
});
