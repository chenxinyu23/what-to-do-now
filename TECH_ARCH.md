# 现在做什么？技术架构文档

> 文档状态：当前 Demo 架构与演进设计记录；以仓库代码为最终实现依据。最后整理：2026-07-29。

## 1. 文档目标

本文档描述“现在做什么？”初赛 Demo 的技术架构。目标是在不依赖复杂后端的前提下，完成一个可交互、可本地打开、可 Zip 提交的移动端优先 HTML Demo。

本架构优先保证：

1. 可离线打开。
2. 交互链路完整。
3. Demo 稳定可控。
4. 后续可平滑接入真实大模型和语音识别。

核心版本会在静态前端之外增加轻量后端代理，用于保护模型 API Key、调用模型、校验结构化输出，并在后端执行权威重排逻辑。

## 2. 技术目标

| 目标 | 说明 |
| --- | --- |
| 交付形式 | 静态 Web 文件，Zip 打包提交 |
| 运行方式 | V0.1 解压后直接打开 `index.html`；核心版本通过 `node server/server.js` 启动 |
| 主要设备 | 移动端浏览器优先，桌面端自适应 |
| 核心链路 | 输入想法 -> 抽取任务 -> 重排队列 -> 解释取舍 |
| 初赛依赖 | 不强依赖后端服务和外部 API |
| 核心版本依赖 | 轻量 Express 后端、模型 API、环境变量配置 |
| 扩展方向 | provider adapter、Web Speech API、PWA、移动 App |

## 3. 总体架构

### 3.1 初赛架构

```text
Browser
  |
  |-- index.html
  |-- styles
  |-- scripts
  |
  |-- UI Layer
  |     |-- CapturePanel
  |     |-- TodayQueue
  |     |-- ReasonPanel
  |     |-- ScoreDetail
  |
  |-- App State
  |     |-- currentQueue
  |     |-- rawInput
  |     |-- extractedTasks
  |     |-- reorderResult
  |
  |-- Domain Logic
  |     |-- taskExtractor
  |     |-- scoringEngine
  |     |-- reorderEngine
  |     |-- explanationGenerator
  |
  |-- Optional Browser APIs
        |-- Web Speech API
        |-- LocalStorage
```

初赛版本推荐将 HTML、CSS、JavaScript 放在同一个文件中，降低提交和打开成本。若代码量变大，也可以拆成：

```text
index.html
assets/
  styles.css
  app.js
  demo-data.js
```

### 3.2 核心版本架构

```text
Browser
  |
  |-- Static Frontend
  |     |-- index.html
  |     |-- assets/app.js
  |     |-- local fallback reorder logic
  |
  |-- POST /api/reorder
        |
        v
  Express Backend
  |
  |-- ReorderService
  |     |-- TaskAnalysisProvider
  |     |-- SchemaValidator
  |     |-- ScoringEngine
  |     |-- ReorderEngine
  |     |-- ExplanationGenerator
  |     |-- FallbackExtractor
  |
  |-- Model Provider
        |-- OpenAI-compatible provider
```

核心版本中，后端是权威重排实现。前端保留本地轻量兜底，只在 `/api/reorder` 不可用或开发离线演示时使用。

### 3.3 Provider Adapter

模型调用必须封装在 provider adapter 后面，业务逻辑不能直接依赖具体 SDK 类型。

```ts
interface TaskAnalysisProvider {
  analyze(request: ReorderRequest): Promise<TaskAnalysisResult>;
}
```

第一版只实现一个 OpenAI-compatible provider，通过基础地址和模型名称切换具体服务：

```text
MODEL_BASE_URL=...
MODEL_NAME=...
MODEL_API_KEY=...
MODEL_TIMEOUT_MS=5000
PORT=3000
```

### 3.4 模型选择策略

第一阶段模型只承担“结构化任务分析”职责，不做最终排序和约束决策。因此默认优先中文性价比，而不是最强推理能力。

推荐顺序：

1. 默认候选：DeepSeek Chat / V3 类通用模型。
2. 备选候选：Qwen Plus。
3. 质量对照：OpenAI 小模型。

暂不做自动模型路由。需要比较模型时，通过 `.env` 手动切换 `MODEL_BASE_URL`、`MODEL_NAME` 和 `MODEL_API_KEY`，再运行固定评测集。

优化顺序：

1. 先优化 prompt。
2. 再优化 schema 和评分锚点。
3. 再优化本地规则引擎。
4. 仍不稳定时再升级模型。

## 4. 技术选型

### 4.1 初赛推荐选型

| 层级 | 选型 | 原因 |
| --- | --- | --- |
| 页面 | HTML5 | 可直接打开，适合 Zip 提交 |
| 样式 | CSS3 | 无构建依赖，兼容性好 |
| 逻辑 | Vanilla JavaScript | 不依赖框架，提交简单 |
| 状态 | 内存对象 | Demo 数据量小，无需状态库 |
| 语音 | Web Speech API，可选 | 浏览器支持时增强体验 |
| 持久化 | LocalStorage，可选 | 保存示例队列和用户修改 |
| AI | V0.1 本地模拟；核心版本经后端接入模型 | 保证 Demo 稳定并保护 API Key |

### 4.2 为什么不优先使用框架

初赛提交需要 HTML Zip 包，评委打开即用。使用 React/Vue/Next.js 会引入构建、资源路径和部署复杂度。若后续做高完成度版本，可以再切换到框架。

### 4.3 后续可选技术栈

| 阶段 | 推荐 |
| --- | --- |
| V0.2 核心版本 | Express + Node.js，静态前端保持不变 |
| V0.3 前端增强 | Vite + React 或 Vue |
| PWA | Vite + Workbox |
| 后端 | Node.js / Python FastAPI |
| 数据库 | SQLite / Supabase / PostgreSQL |
| 移动 App | React Native / Expo |

### 4.4 核心版本技术选型

| 层级 | 选型 | 原因 |
| --- | --- | --- |
| 后端 | Node.js + Express | 静态文件托管和 JSON API 足够简单 |
| API | `POST /api/reorder` | 单一核心入口，便于前后端契约稳定 |
| 模型接入 | Provider adapter | 起步只接一个模型，后续可替换 |
| 配置 | 环境变量 + `.env.example` | 避免 API Key 进入前端和仓库 |
| 校验 | 轻量 schema validator | 校验模型 JSON，失败自动 fallback |
| 重排 | 后端规则引擎 | 统一执行评分、手动约束和硬约束 |

## 5. 模块划分

### 5.1 UI Layer

#### CapturePanel

职责：

1. 展示语音按钮。
2. 展示文字输入框。
3. 提供示例输入按钮。
4. 触发重排流程。

输入：

```text
rawInput: string
```

输出：

```text
onSubmit(rawInput)
```

#### TodayQueue

职责：

1. 展示当前任务队列。
2. 展示排名。
3. 展示任务变化状态。
4. 展示推荐动作。

输入：

```text
queue: Task[]
```

#### ReasonPanel

职责：

1. 展示本次重排摘要。
2. 展示任务提前、下降、移出今天的原因。
3. 展示今日安排分组。

输入：

```text
reorderResult: ReorderResult
```

#### ScoreDetail

职责：

1. 展示任务评分维度。
2. 用进度条或标签表示紧急度、目标影响、阻塞风险等。

输入：

```text
task: Task
```

### 5.2 Domain Logic

#### taskExtractor

职责：

从自然语言输入中提取任务。

初赛策略：

1. 对示例输入使用固定映射。
2. 对普通输入使用简单规则拆分。
3. 若接入大模型，则替换为 LLM 结构化抽取。

输出：

```text
TaskDraft[]
```

#### scoringEngine

职责：

为任务计算优先级分数。

评分维度：

1. urgency
2. goalImpact
3. blockingRisk
4. effort
5. energyFit
6. taskValue

计算公式：

```text
baseScore =
  urgency * 0.30
+ goalImpact * 0.25
+ blockingRisk * 0.20
+ taskValue * 0.15
+ energyFit * 0.10

effortPenalty =
  effort >= 5 ? 0.35 :
  effort == 4 ? 0.20 :
  effort <= 2 ? -0.10 : 0

score = baseScore - effortPenalty
```

effort 是成本维度，不作为越高越好的正向分数。低 effort 可获得轻微加成，高 effort 会有轻微惩罚，但不能压过明确截止、目标影响和阻塞风险。

#### reorderEngine

职责：

1. 合并旧队列和新任务。
2. 计算每个任务的新分数。
3. 按分数生成基础顺序。
4. 应用用户手动排序形成的相对顺序约束。
5. 应用用户手动移出今天约束。
6. 在硬约束出现时允许覆盖手动排序。
7. 判断变化状态。
8. 生成推荐动作。

变化状态：

```text
new
up
down
same
out
```

#### explanationGenerator

职责：

根据评分维度和变化状态生成解释文案。

要求：

1. 必须引用具体维度。
2. 避免空泛表达。
3. 文案短而明确。

示例：

```text
截止时间最近，且直接影响参赛提交，因此上升到第 1 位。
```

## 6. 数据模型

### 6.1 Task

```ts
type TaskChange = "new" | "up" | "down" | "same" | "out" | "manual_order";
type ManualStatus = "manual_order" | "manual_out" | "manual_preserved" | null;
type Recommendation =
  | "do_now"
  | "do_today"
  | "schedule_later"
  | "merge"
  | "remove_today";

interface Task {
  id: string;
  title: string;
  source: "initial" | "text_input" | "voice_input" | "demo";
  deadline?: string;
  category: "submit" | "communicate" | "research" | "develop" | "life" | "other";
  urgency: number;
  goalImpact: number;
  blockingRisk: number;
  effort: number;
  energyFit: number;
  taskValue: number;
  score: number;
  recommendation: Recommendation;
  reason: string;
  previousRank: number | null;
  currentRank: number | null;
  change: TaskChange;
  manualStatus: ManualStatus;
}
```

### 6.2 TaskDraft

```ts
interface TaskDraft {
  title: string;
  deadline?: string;
  category?: Task["category"];
  source: "text_input" | "voice_input" | "demo";
}
```

### 6.3 ReorderResult

```ts
interface ReorderResult {
  source: "model" | "fallback" | "none";
  summary: string;
  inputText: string;
  extractedTasks: Task[];
  queue: Task[];
  outOfToday: Task[];
  tradeoffSuggestions: TradeoffSuggestion[];
  preservedManualConstraints: ManualOrderConstraint[];
  brokenManualConstraints: BrokenManualConstraint[];
  allTasks: Task[];
  warnings: string[];
}

interface TradeoffSuggestion {
  taskId: string;
  action: Recommendation;
  reason: string;
}
```

### 6.4 ManualOrderConstraint

```ts
interface ManualOrderConstraint {
  beforeTaskId: string;
  afterTaskId: string;
  createdAt: number;
}

interface BrokenManualConstraint {
  beforeTaskId: string;
  afterTaskId: string;
  reason: "deadline" | "blocking" | "explicit_today";
}
```

手动排序记录相对顺序，不记录绝对排名。例如用户把 A 拖到 B 前面时，记录 `A should stay before B`。这样新任务仍可以插入队列前方，但 AI 不会轻易推翻用户手动形成的相对顺序。

### 6.5 ReorderRequest

```ts
interface ReorderRequest {
  rawInput: string;
  todayGoal: string;
  currentQueue: Task[];
  outOfToday: Task[];
  manualOrderConstraints: ManualOrderConstraint[];
  manualOutIds: string[];
  userContext: {
    currentTimeLabel: "morning" | "afternoon" | "evening" | "night" | string;
    energyLevel: "low" | "medium" | "high";
  };
}
```

`todayGoal` 第一版提供默认值：`完成 AI 创意大赛 Demo 初赛提交`，同时在前端提供轻量可编辑输入。

### 6.6 TaskAnalysisResult

模型只输出任务分析，不输出最终排序。

```ts
interface TaskAnalysisResult {
  extractedTasks: AnalyzedTaskDraft[];
  inputSummary: string;
  warnings: string[];
}

interface AnalyzedTaskDraft {
  tempId: string;
  title: string;
  deadlineText?: string;
  category: Task["category"];
  urgency: number;
  goalImpact: number;
  blockingRisk: number;
  effort: number;
  energyFit: number;
  taskValue: number;
  explicitToday: boolean;
  confidence: number;
  scoreReasons: {
    urgency: string;
    goalImpact: string;
    blockingRisk: string;
    effort: string;
    energyFit: string;
    taskValue: string;
  };
}
```

### 6.7 AppState

```ts
interface AppState {
  rawInput: string;
  todayGoal: string;
  currentQueue: Task[];
  lastQueue: Task[];
  extractedTasks: Task[];
  reorderResult: ReorderResult | null;
  manualOrderConstraints: ManualOrderConstraint[];
  manualOutIds: string[];
  isProcessing: boolean;
  speechSupported: boolean;
}
```

## 7. 数据流

### 7.1 V0.1 本地重排流程

```text
User Input
  |
  v
validateInput(rawInput)
  |
  v
taskExtractor(rawInput)
  |
  v
normalizeTaskDrafts(taskDrafts)
  |
  v
mergeWithCurrentQueue(currentQueue, newTasks)
  |
  v
scoringEngine(tasks)
  |
  v
applyManualOutRules(scoredTasks, manualOutIds)
  |
  v
reorderEngine(scoredTasks, manualOrderConstraints)
  |
  v
explanationGenerator(reorderedTasks)
  |
  v
update AppState
  |
  v
render UI
```

### 7.2 核心版本重排流程

```text
Frontend
  |
  v
build ReorderRequest
  |
  v
POST /api/reorder
  |
  v
Backend validate request
  |
  v
TaskAnalysisProvider.analyze(request)
  |
  +-- success + valid JSON -> normalize analyzed tasks
  |
  +-- timeout / invalid JSON / empty tasks -> fallback extractor
  |
  v
ScoringEngine
  |
  v
ReorderEngine
  |
  v
ExplanationGenerator
  |
  v
return ReorderResult
  |
  v
Frontend render result and persist state
```

### 7.3 手动排序流程

```text
Drag Task Card
  |
  v
update queue order immediately
  |
  v
deriveManualOrderConstraints(queue)
  |
  v
mark dragged task as manual_order
  |
  v
persist local state
  |
  v
render UI
```

### 7.4 手动移出今天流程

```text
Drop Task Into "不放进今天"
  |
  v
add task id to manualOutIds
  |
  v
set recommendation = remove_today
  |
  v
mark task as manual_out
  |
  v
persist local state
  |
  v
render UI
```

### 7.5 语音输入流程

```text
Tap Voice Button
  |
  v
check Web Speech API support
  |
  +-- supported -> start recognition -> fill rawInput
  |
  +-- unsupported -> show fallback message -> use system keyboard voice input or text input
```

## 8. 任务抽取策略

### 8.1 初赛稳定策略

为了保证 Demo 稳定，初赛推荐：

1. 内置高质量示例输入。
2. 对示例输入返回预设结构化结果。
3. 对非示例输入使用简单拆分和默认评分。

示例匹配：

```text
如果输入包含“推荐信”“竞品”“报名材料”，返回预设的 3 个任务。
```

### 8.2 规则拆分策略

可根据中文连接词拆分：

1. 还要
2. 顺便
3. 记得
4. 明天
5. 今晚
6. 然后
7. 另外

注意：规则拆分只作为兜底，不追求完全准确。

### 8.3 模型分析接入策略

核心版本接入模型时，定义统一 provider 接口：

```ts
interface TaskAnalysisProvider {
  analyze(request: ReorderRequest): Promise<TaskAnalysisResult>;
}
```

要求模型返回结构化任务分析 JSON：

```json
{
  "extractedTasks": [
    {
      "tempId": "draft_1",
      "title": "提交报名材料",
      "deadlineText": "明天中午前",
      "category": "submit",
      "urgency": 5,
      "goalImpact": 5,
      "blockingRisk": 4,
      "effort": 2,
      "energyFit": 4,
      "taskValue": 5,
      "explicitToday": true,
      "confidence": 0.92,
      "scoreReasons": {
        "urgency": "明天中午前截止",
        "goalImpact": "直接影响参赛提交",
        "blockingRisk": "不提交会阻塞报名流程",
        "effort": "材料已接近完成，补交成本较低",
        "energyFit": "适合当前高精力时段处理",
        "taskValue": "完成后直接推进参赛"
      }
    }
  ],
  "inputSummary": "用户新增了报名相关任务。",
  "warnings": []
}
```

模型不得返回最终排名、推荐动作或是否覆盖用户手动排序的决定。

### 8.4 Schema 校验与归一化

后端收到模型输出后必须执行：

1. JSON parse。
2. schema validate。
3. 将评分 clamp 到 1-5。
4. 将 `category` 归一化到允许枚举。
5. 丢弃标题为空或置信度极低的任务。
6. 如果有效任务为空，进入 fallback。

### 8.5 Fallback 策略

以下情况进入本地兜底：

1. 模型请求超时。
2. 模型返回非 JSON。
3. schema 校验失败。
4. 有效任务为空。
5. provider 配置缺失。

兜底路径使用本地 `taskExtractor` 和默认评分，最终仍由同一个 `ScoringEngine`、`ReorderEngine` 和 `ExplanationGenerator` 输出 `ReorderResult`。响应中必须设置 `source: "fallback"`。

## 9. 推荐动作规则

### 9.1 do_now

条件：

1. score >= 4.4。
2. urgency >= 4 或 blockingRisk >= 4。

### 9.2 do_today

条件：

1. score >= 3.5。
2. 与今日目标相关。

### 9.3 schedule_later

条件：

1. score 在 2.5 到 3.5 之间。
2. 仍有价值，但不是当前最优先。

### 9.4 merge

条件：

1. 与已有任务主题高度相似。
2. 可以合并执行。

### 9.5 remove_today

条件：

1. score < 2.5。
2. 无明确截止时间。
3. 与今日目标弱相关。

## 10. API 契约

### 10.1 POST /api/reorder

请求：

```json
{
  "rawInput": "明天中午前要交报名材料",
  "todayGoal": "完成 AI 创意大赛 Demo 初赛提交",
  "currentQueue": [],
  "outOfToday": [],
  "manualOrderConstraints": [],
  "manualOutIds": [],
  "userContext": {
    "currentTimeLabel": "下午",
    "energyLevel": "medium"
  }
}
```

响应：

```json
{
  "source": "model",
  "summary": "本次重排优先处理临近截止和阻塞风险任务。",
  "extractedTasks": [],
  "queue": [],
  "outOfToday": [],
  "changeEvents": [],
  "preservedManualConstraints": [],
  "brokenManualConstraints": [],
  "allTasks": [],
  "warnings": []
}
```

约束：

1. `source` 必须为 `model`、`fallback` 或 `none`；`none` 表示本次没有新增输入，只重新安排现有队列。
2. 旧任务必须保留原 `id`。
3. 新任务 ID 由后端生成。
4. 响应必须是前端可直接渲染的最终结果。
5. 后端内部错误不直接暴露给普通用户，使用 `warnings` 表达可读降级信息。

### 10.2 后端模块

```text
server/
  server.js
  config.js
  providers/
    task-analysis-provider.js
    openai-provider.js
  schema.js
  reorder-service.js
  scoring-engine.js
  reorder-engine.js
  explanation-generator.js
  fallback-extractor.js
```

模块职责：

| 模块 | 职责 |
| --- | --- |
| `server.js` | 托管静态文件，注册 `/api/reorder` |
| `config.js` | 读取端口、provider、模型名和 API Key |
| `openai-provider.js` | 调用模型并返回原始结构化结果 |
| `schema.js` | 校验和归一化模型输出 |
| `reorder-service.js` | 编排 provider、fallback、评分和重排 |
| `scoring-engine.js` | 计算 `score` |
| `reorder-engine.js` | 执行排序、手动约束和硬约束 |
| `explanation-generator.js` | 生成最终解释和变化事件 |
| `fallback-extractor.js` | 模型不可用时做本地抽取 |

## 11. UI 架构

### 11.1 移动端布局

```text
Header
  产品名
  一句话说明

TodayQueue
  任务卡片列表

CapturePanel
  语音按钮
  文字输入
  示例按钮
  重排按钮

ReasonPanel
  本次重排摘要
  今日安排
```

### 11.2 桌面端布局

```text
Grid Layout
  Left: CapturePanel
  Center: TodayQueue
  Right: ReasonPanel
```

### 11.3 任务卡片状态

| 状态 | 视觉 |
| --- | --- |
| new | 蓝色标签“新增” |
| up | 绿色标签“上升” |
| down | 橙色标签“下降” |
| same | 灰色标签“保持” |
| out | 红色标签“移出” |
| manual_order | 蓝色标签“用户调整” |
| manual_out | 红色标签“用户移出” |

### 11.4 拖拽交互

1. 今日队列任务卡片设置为可拖拽。
2. 用户拖动到同组其他任务前后时，立即更新顺序。
3. 用户拖到“不放进今天”分组时，任务进入手动移出状态。
4. 拖拽期间卡片显示抓取态和放置态。
5. 移动端优先保证触控可用；若浏览器不支持原生拖拽，则保持 AI 重排主流程可用。

### 11.5 今日目标与新增想法入口

核心版本将今日目标作为固定顶部上下文展示。今日目标是今日排序的决策锚点，但不是唯一排序规则；最终排序仍综合 `urgency`、`goalImpact`、`blockingRisk`、`taskValue`、`energyFit`、`effort`、手动排序和手动移出约束。

```text
顶部固定目标栏：今日目标 / 编辑 / 重新安排
中间滚动列表：现在做 / 今天晚点做 / 不放进今天
底部固定按钮：+ 新增想法
底部弹窗：新增想法 textarea / 语音输入 / 填入示例 / 新增并重排
```

前端每次请求 `/api/reorder` 时带上 `todayGoal`。规则引擎不直接解析目标，只使用模型输出的 `goalImpact`。修改今日目标后不自动调用模型，前端标记目标已修改并显示“重新安排”；用户确认后可用空 `rawInput` 调用现有重排流程。

空输入重排 MVP：

1. `rawInput` 为空时，后端不新增任务。
2. 后端基于现有 `currentQueue`、`outOfToday`、手动约束重新评分和重排。
3. 本阶段不要求模型重新评估已有任务的 `goalImpact`。
4. 新增想法弹窗未提交关闭时保留草稿；提交成功后清空草稿。
5. 弹窗打开时锁定背景滚动，提交中防止重复点击。

## 12. 状态管理

初赛使用单一全局状态对象：

```js
const state = {
  rawInput: "",
  todayGoal: "完成 AI 创意大赛 Demo 初赛提交",
  currentQueue: [],
  lastQueue: [],
  extractedTasks: [],
  reorderResult: null,
  manualOrderConstraints: [],
  manualOutIds: [],
  isProcessing: false,
  speechSupported: false,
  isIdeaSheetOpen: false,
  ideaDraft: "",
  goalDraft: "",
  isEditingGoal: false,
  isGoalDirty: false
};
```

状态更新流程：

```text
setState(partialState)
  |
  v
merge state
  |
  v
render()
```

不引入 Redux、Pinia、Zustand 等状态库。

## 13. 本地存储

### 13.1 初赛是否需要

需要。手动排序和手动移出代表当前 Demo 会话中的用户反馈，刷新页面后应保留，避免用户觉得反馈没有进入系统。

### 13.2 存储内容

使用 LocalStorage 保存：

1. 当前队列。
2. 最近一次输入。
3. 最近一次重排结果。
4. 手动相对顺序约束。
5. 手动移出今天的任务 ID。

Key 设计：

```text
attention_queue_demo_state
```

同时提供“重置示例”入口，清空 LocalStorage 并恢复默认队列，保证评委可以回到标准演示状态。

## 14. 手动反馈与 AI 冲突规则

### 14.1 保留用户相对顺序

`reorderEngine` 先按评分排序，再应用 `manualOrderConstraints`。当两个任务之间没有硬约束冲突时，用户指定的相对顺序优先于普通分数差异。

### 14.2 硬约束覆盖

只有以下情况允许 AI 打破用户手动顺序：

1. 临近截止：`urgency >= 5`。
2. 阻塞他人或后续流程：`blockingRisk >= 5`。
3. 用户明确要求今天必须完成：任务来源文本包含“必须”“一定要”“马上”等强信号，或任务评分中体现为 `urgency >= 5` 且 `goalImpact >= 4`。

打破手动顺序时，`explanationGenerator` 必须生成说明，例如：“因截止时间临近，临时优先于你的手动排序。”

### 14.3 手动移出今天

`manualOutIds` 中的任务默认保持 `remove_today`，不被普通重排放回今天。若出现硬约束，只生成“建议放回今天”的解释，不直接覆盖用户移出。

### 14.4 标记完成

完成项只保存在前端本地状态，不进入 `/api/reorder` 请求，也不参与模型分析、规则排序或本地 fallback。标记完成时从 `currentQueue` 移除该任务，并清理引用该任务的 `manualOutIds` 和 `manualOrderConstraints`。

撤销最近一次完成时，将任务恢复到今日队列末尾，不恢复旧手动排序约束或旧 `manual_out` 状态。初赛 Demo 不提供直接删除事项能力。

## 15. 排序规则可见与偏好预设

前端请求 `/api/reorder` 时可带 `rulePreset`，后端规范化为 `balanced | deadline_first | goal_first | low_effort_first`，未知值回退 `balanced`。响应返回实际生效的 `rulePreset` 和 `ruleProfile`，前端用它展示规则详情。

偏好预设只调整现有评分权重和 `effort` 成本策略，不新增维度，不改变硬约束、手动排序、手动移出或标记完成规则。用户切换偏好后保存到 localStorage，但不自动重排；用户点击“重新安排”后用空输入走现有重排流程。

## 16. 异常处理

| 场景 | 处理 |
| --- | --- |
| 输入为空 | 提示“请输入一个想法或任务” |
| 未识别到任务 | 提示“未识别到可执行事项，可以换一种描述” |
| 语音不可用 | 提示“当前浏览器不支持网页语音识别，可使用系统键盘语音输入或文字输入” |
| 模型调用失败 | 后端回退到本地兜底逻辑，响应 `source: "fallback"` |
| 模型 JSON 解析失败 | 后端丢弃无效输出并进入 fallback |
| 屏幕过窄 | 使用单列布局 |
| LocalStorage 读取失败 | 忽略本地状态并恢复默认队列 |
| 拖拽中断 | 保持拖拽前顺序 |

## 16. 性能要求

| 指标 | 要求 |
| --- | --- |
| 首屏加载 | 本地打开 1 秒内显示 |
| 重排响应 | 本地模拟 500ms 内完成 |
| 核心 API 响应 | 正常模型调用建议 5 秒内返回，超时进入 fallback |
| 动画时长 | 150-300ms |
| 文件大小 | Zip 包建议小于 5MB |
| 依赖数量 | V0.1 尽量 0 外部依赖；核心版本只引入必要后端依赖 |

## 17. 可访问性与兼容性

### 17.1 兼容目标

1. Chrome 最新版。
2. Edge 最新版。
3. Safari 最新版。
4. 移动端 Chrome/Safari。

### 17.2 可访问性要求

1. 按钮有明确文本或 `aria-label`。
2. 色彩状态不能只依赖颜色，需要配合文字标签。
3. 输入框有 placeholder。
4. 字号在移动端不小于 14px。
5. 点击区域不小于 44px。
6. 可拖拽任务有明确的拖拽提示文本或视觉把手。

## 18. 安全与隐私

初赛本地 Demo 不上传用户数据。

核心版本接入模型 API 后，需要：

1. 明确告知用户输入会发送到模型服务。
2. 不上传敏感个人信息。
3. API Key 不能写死在前端。
4. 通过后端代理调用模型。
5. 提供清空本地数据能力。
6. `.env` 不提交到仓库，只提交 `.env.example`。

## 19. 文件结构建议

### 19.1 单文件版本

```text
index.html
PRD.md
TECH_ARCH.md
idea.md
```

### 19.2 拆分版本

```text
index.html
assets/
  styles.css
  app.js
  demo-data.js
docs/
  PRD.md
  TECH_ARCH.md
```

初赛建议保持单文件或轻量拆分，避免资源路径问题。

### 19.3 核心版本

```text
index.html
assets/
  styles.css
  app.js
  demo-data.js
server/
  server.js
  config.js
  providers/
    task-analysis-provider.js
    openai-provider.js
  schema.js
  reorder-service.js
  scoring-engine.js
  reorder-engine.js
  explanation-generator.js
  fallback-extractor.js
.env.example
PRD.md
TECH_ARCH.md
idea.md
```

核心版本通过 Express 同时托管静态文件和 `/api/reorder`，前端仍保持轻量 Vanilla JS。

## 20. 后续演进

### 20.1 V0.2 核心 AI

1. 新增后端代理。
2. 定义模型输出 JSON Schema。
3. 加入模型输出校验。
4. 后端执行权威评分和重排。
5. 模型失败时回退本地逻辑。
6. 前端增加今日目标输入。

### 20.2 V0.3 PWA

1. 支持添加到主屏幕。
2. 支持离线缓存。
3. 支持本地通知。
4. 支持更接近 App 的启动体验。

### 20.3 V1.0 App

1. 原生语音输入。
2. 锁屏快捷捕获。
3. 系统通知。
4. 日历和提醒集成。
5. 多端同步。

## 21. 开发顺序建议

1. 保留现有静态前端和本地兜底逻辑。
2. 增加 `.env.example` 和 `server/config.js`。
3. 增加 Express `server/server.js`，托管静态文件和 `/api/reorder`。
4. 定义 `ReorderRequest` / `ReorderResult` schema。
5. 实现 provider adapter 和第一版模型 provider。
6. 实现 schema 校验和归一化。
7. 将评分、重排、解释逻辑迁到后端权威实现。
8. 实现 fallback extractor。
9. 前端增加今日目标输入并请求 `/api/reorder`。
10. 前端在 API 不可用时使用本地兜底。
11. 增加核心重排规则的单元测试或脚本烟测。
12. 做移动端和 API 失败场景测试。

## 22. 技术成功标准

本 Demo 技术上成功的标准：

1. 不启动服务也能打开。
2. 不接外部 API 也能跑通核心链路。
3. 用户输入示例后，能看到队列顺序变化。
4. 每个变化都有解释。
5. 移动端展示不溢出、不重叠。
6. 拖拽排序后，后续 AI 重排会体现用户反馈。
7. 核心版本中 API Key 不出现在前端。
8. `/api/reorder` 能返回 `source: "model"`、`source: "fallback"` 或空输入重排时的 `source: "none"`。
9. 模型输出无效时仍能返回可渲染重排结果。
10. 评委 3 分钟内可以完整体验一次。
