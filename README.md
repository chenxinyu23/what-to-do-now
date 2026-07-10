# AI 注意力重排助手

新想法插入时，不是追加待办，而是重新分配今天的注意力。

一个移动端优先的今日队列 Demo。前端负责捕获想法和展示重排结果，后端通过 OpenAI-compatible 模型接口做任务分析，并用本地规则引擎生成最终排序。

## 使用说明

推荐体验路径：

1. 查看顶部“今日目标”。
2. 点击底部 `+ 新增想法`。
3. 点击 `快速体验示例` 中的第一个示例，或输入：`刚想到还要录制 1 分钟演示视频、检查线上链接、补一版项目说明`。
4. 点击 `新增并重排`。
5. 查看 `现在做 / 今天晚点做 / 不放进今天` 的变化，以及 `AI 取舍解释`。

核心亮点：

- 一句话拆成多个可执行事项。
- 今日目标驱动重排，而不是把新任务堆到列表末尾。
- 模型负责理解任务，规则引擎负责最终排序。
- 支持手动排序、移出今天、标记完成和排序偏好预设。
- 模型不可用时自动使用备用规则，保证 Demo 可体验。

## 启动

```bash
npm install
cp .env.example .env
npm run dev
```

打开：

```text
http://localhost:3000
```

Express 会同时托管前端页面和后端接口：

```text
GET /
GET /assets/*
POST /api/reorder
```

## 模型配置

个人开发阶段默认优先使用中文性价比模型。推荐从 DeepSeek Chat 开始：

```text
MODEL_PROVIDER=openai-compatible
MODEL_BASE_URL=https://api.deepseek.com
MODEL_NAME=deepseek-chat
MODEL_API_KEY=你的 API Key
```

如果暂时没有 API Key，也可以留空。服务仍会启动，`/api/reorder` 会返回：

```json
{ "source": "fallback" }
```

这表示模型链路不可用、超时或输出未通过校验，本次会使用备用规则完成重排。界面上如果看到“备用规则”，应优先检查模型配置、网络、超时和 fallback 抽取效果。

备选模型：

```text
# Qwen Plus
MODEL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MODEL_NAME=qwen-plus

# OpenAI 小模型对照
MODEL_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4o-mini
```

第一阶段不做自动模型路由。需要比较模型时，手动修改 `.env` 后重启服务。

## 评测模型

先启动服务：

```bash
npm run dev
```

另开一个终端运行固定中文评测集：

```bash
npm run eval:model
```

评测脚本会读取 `evals/task-analysis-cases.json`，逐条请求本地 `/api/reorder`，并把结果保存到：

```text
evals/results/latest.json
```

评测会自动检查固定期望，并输出每条 case 的 `OK` / `CHECK` 状态：

- `source`
- 耗时
- 抽取任务数量
- 期望任务标题覆盖情况
- deadline / blocking / explicitToday 等硬信号覆盖情况
- category / urgency / blockingRisk / explicitToday
- warnings

默认模式下，质量检查未通过只会标记为 `CHECK`，不会让命令失败，方便个人开发阶段反复校准。需要作为门禁时使用：

```bash
npm run eval:model -- --strict
```

建议调优顺序：

1. 先用 DeepSeek Chat 跑完整评测集，确认任务抽取和硬信号识别是否稳定。
2. 如果失败集中在标题拆分、deadline、blocking 或 explicitToday，优先调整模型 prompt。
3. 如果输出格式不稳定，优先收紧服务端 schema 校验。
4. 如果任务已识别但排序不符合预期，优先调整本地规则引擎，而不是让模型直接决定最终顺序。
5. DeepSeek 稳定后，再手动切换 `.env` 对比 Qwen Plus；OpenAI 小模型只作为质量参考。

## 常用命令

```bash
npm run dev      # 启动前后端
npm test         # 后端核心规则测试
npm run check    # JS 语法检查
npm run eval:model
```
