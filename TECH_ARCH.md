# AI 注意力重排助手技术架构文档

## 1. 文档目标

本文档描述“AI 注意力重排助手”初赛 Demo 的技术架构。目标是在不依赖复杂后端的前提下，完成一个可交互、可本地打开、可 Zip 提交的移动端优先 HTML Demo。

本架构优先保证：

1. 可离线打开。
2. 交互链路完整。
3. Demo 稳定可控。
4. 后续可平滑接入真实大模型和语音识别。

## 2. 技术目标

| 目标 | 说明 |
| --- | --- |
| 交付形式 | 静态 Web 文件，Zip 打包提交 |
| 运行方式 | 解压后直接打开 `index.html` |
| 主要设备 | 移动端浏览器优先，桌面端自适应 |
| 核心链路 | 输入想法 -> 抽取任务 -> 重排队列 -> 解释取舍 |
| 初赛依赖 | 不强依赖后端服务和外部 API |
| 扩展方向 | 可接入大模型 API、Web Speech API、PWA、移动 App |

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

### 3.2 可扩展架构

```text
Client Web/PWA/App
  |
  |-- API Gateway
        |
        |-- LLM Service
        |-- User Profile Service
        |-- Task History Service
        |-- Calendar/Notification Integrations
```

当前初赛不实现后端，但模块设计保留接口边界，方便后续替换模拟逻辑。

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
| AI | 本地模拟优先，API 可选 | 保证 Demo 稳定 |

### 4.2 为什么不优先使用框架

初赛提交需要 HTML Zip 包，评委打开即用。使用 React/Vue/Next.js 会引入构建、资源路径和部署复杂度。若后续做高完成度版本，可以再切换到框架。

### 4.3 后续可选技术栈

| 阶段 | 推荐 |
| --- | --- |
| V0.2 | Vite + React 或 Vue |
| PWA | Vite + Workbox |
| 后端 | Node.js / Python FastAPI |
| 数据库 | SQLite / Supabase / PostgreSQL |
| 移动 App | React Native / Expo |

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
score = urgency * 0.30
      + goalImpact * 0.25
      + blockingRisk * 0.20
      + taskValue * 0.15
      + energyFit * 0.10
```

effort 不直接计入总分，主要用于推荐动作和执行建议。

#### reorderEngine

职责：

1. 合并旧队列和新任务。
2. 计算每个任务的新分数。
3. 按分数排序。
4. 判断变化状态。
5. 生成推荐动作。

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
type TaskChange = "new" | "up" | "down" | "same" | "out";
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
  summary: string;
  inputText: string;
  extractedTasks: Task[];
  queue: Task[];
  outOfToday: Task[];
  tradeoffSuggestions: TradeoffSuggestion[];
}

interface TradeoffSuggestion {
  taskId: string;
  action: Recommendation;
  reason: string;
}
```

### 6.4 AppState

```ts
interface AppState {
  rawInput: string;
  currentQueue: Task[];
  lastQueue: Task[];
  extractedTasks: Task[];
  reorderResult: ReorderResult | null;
  isProcessing: boolean;
  speechSupported: boolean;
}
```

## 7. 数据流

### 7.1 重排流程

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
reorderEngine(scoredTasks)
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

### 7.2 语音输入流程

```text
Tap Voice Button
  |
  v
check Web Speech API support
  |
  +-- supported -> start recognition -> fill rawInput
  |
  +-- unsupported -> show fallback message -> use text input
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

### 8.3 LLM 接入策略

若后续接入大模型，定义统一接口：

```ts
async function extractTasksWithLLM(input: string, currentQueue: Task[]): Promise<ReorderResult>
```

要求模型返回 JSON：

```json
{
  "summary": "本次重排优先处理有明确截止时间和会阻塞后续流程的任务。",
  "tasks": [
    {
      "title": "提交报名材料",
      "deadline": "明天中午前",
      "urgency": 5,
      "goalImpact": 5,
      "blockingRisk": 4,
      "effort": 2,
      "energyFit": 4,
      "taskValue": 5,
      "recommendation": "do_now",
      "reason": "截止时间最近，直接影响参赛提交。"
    }
  ]
}
```

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

## 10. UI 架构

### 10.1 移动端布局

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

### 10.2 桌面端布局

```text
Grid Layout
  Left: CapturePanel
  Center: TodayQueue
  Right: ReasonPanel
```

### 10.3 任务卡片状态

| 状态 | 视觉 |
| --- | --- |
| new | 蓝色标签“新增” |
| up | 绿色标签“上升” |
| down | 橙色标签“下降” |
| same | 灰色标签“保持” |
| out | 红色标签“移出” |

## 11. 状态管理

初赛使用单一全局状态对象：

```js
const state = {
  rawInput: "",
  currentQueue: [],
  lastQueue: [],
  extractedTasks: [],
  reorderResult: null,
  isProcessing: false,
  speechSupported: false
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

## 12. 本地存储

### 12.1 初赛是否需要

非必须。为了确保评委每次打开都能看到标准演示，可以默认不持久化。

### 12.2 可选方案

使用 LocalStorage 保存：

1. 当前队列。
2. 最近一次输入。
3. 最近一次重排结果。

Key 设计：

```text
attention_queue_demo_state
```

## 13. 异常处理

| 场景 | 处理 |
| --- | --- |
| 输入为空 | 提示“请输入一个想法或任务” |
| 未识别到任务 | 提示“未识别到可执行事项，可以换一种描述” |
| 语音不可用 | 提示“当前浏览器不支持语音识别，请使用文字输入” |
| LLM 调用失败 | 回退到本地模拟逻辑 |
| JSON 解析失败 | 使用默认示例结果兜底 |
| 屏幕过窄 | 使用单列布局 |

## 14. 性能要求

| 指标 | 要求 |
| --- | --- |
| 首屏加载 | 本地打开 1 秒内显示 |
| 重排响应 | 本地模拟 500ms 内完成 |
| 动画时长 | 150-300ms |
| 文件大小 | Zip 包建议小于 5MB |
| 依赖数量 | 初赛尽量 0 外部依赖 |

## 15. 可访问性与兼容性

### 15.1 兼容目标

1. Chrome 最新版。
2. Edge 最新版。
3. Safari 最新版。
4. 移动端 Chrome/Safari。

### 15.2 可访问性要求

1. 按钮有明确文本或 `aria-label`。
2. 色彩状态不能只依赖颜色，需要配合文字标签。
3. 输入框有 placeholder。
4. 字号在移动端不小于 14px。
5. 点击区域不小于 44px。

## 16. 安全与隐私

初赛本地 Demo 不上传用户数据。

若后续接入大模型 API，需要：

1. 明确告知用户输入会发送到模型服务。
2. 不上传敏感个人信息。
3. API Key 不能写死在前端。
4. 通过后端代理调用模型。
5. 提供清空本地数据能力。

## 17. 文件结构建议

### 17.1 单文件版本

```text
index.html
PRD.md
TECH_ARCH.md
idea.md
```

### 17.2 拆分版本

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

## 18. 后续演进

### 18.1 V0.2 接入真实 AI

1. 新增后端代理。
2. 定义 LLM JSON Schema。
3. 加入模型输出校验。
4. 模型失败时回退本地逻辑。

### 18.2 V0.3 PWA

1. 支持添加到主屏幕。
2. 支持离线缓存。
3. 支持本地通知。
4. 支持更接近 App 的启动体验。

### 18.3 V1.0 App

1. 原生语音输入。
2. 锁屏快捷捕获。
3. 系统通知。
4. 日历和提醒集成。
5. 多端同步。

## 19. 开发顺序建议

1. 完成静态 UI。
2. 建立任务数据结构。
3. 实现默认今日队列。
4. 实现输入框和示例输入。
5. 实现本地任务抽取。
6. 实现评分和重排。
7. 实现解释生成。
8. 实现变化状态和标签。
9. 做移动端适配。
10. 做 Zip 打包前测试。

## 20. 技术成功标准

本 Demo 技术上成功的标准：

1. 不启动服务也能打开。
2. 不接外部 API 也能跑通核心链路。
3. 用户输入示例后，能看到队列顺序变化。
4. 每个变化都有解释。
5. 移动端展示不溢出、不重叠。
6. 评委 3 分钟内可以完整体验一次。
