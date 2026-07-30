export const DEMO_DATA = {
  initialQueue: [
    {
      id: "task_demo_home",
      title: "搭建 Demo 首页",
      source: "initial",
      deadline: "今天下午",
      category: "develop",
      urgency: 4,
      goalImpact: 5,
      blockingRisk: 3,
      effort: 4,
      energyFit: 4,
      taskValue: 5,
      score: 4.1,
      recommendation: "do_now",
      reason: "今天核心任务，直接影响 Demo 展示效果。",
      previousRank: 1,
      currentRank: 1,
      change: "same"
    },
    {
      id: "task_code_review",
      title: "代码审查",
      source: "initial",
      deadline: "今天晚上",
      category: "develop",
      urgency: 3,
      goalImpact: 4,
      blockingRisk: 3,
      effort: 3,
      energyFit: 3,
      taskValue: 4,
      score: 3.45,
      recommendation: "do_today",
      reason: "保证代码质量，建议在 Demo 完成后进行。",
      previousRank: 2,
      currentRank: 2,
      change: "same"
    },
    {
      id: "task_competitor_research",
      title: "查竞品资料",
      source: "initial",
      deadline: "明天",
      category: "research",
      urgency: 2,
      goalImpact: 3,
      blockingRisk: 2,
      effort: 3,
      energyFit: 3,
      taskValue: 4,
      score: 2.85,
      recommendation: "schedule_later",
      reason: "有助于了解市场情况，但不应挤占当前高优先级任务。",
      previousRank: 3,
      currentRank: 3,
      change: "same"
    },
    {
      id: "task_project_doc",
      title: "整理项目说明文档",
      source: "initial",
      deadline: "本周内",
      category: "other",
      urgency: 2,
      goalImpact: 3,
      blockingRisk: 1,
      effort: 3,
      energyFit: 3,
      taskValue: 3,
      score: 2.45,
      recommendation: "remove_today",
      reason: "重要但不紧急，今天处理会挤占 Demo 交付时间。",
      previousRank: 4,
      currentRank: 4,
      change: "same"
    }
  ],
  examples: [
    {
      id: "example_1",
      name: "Demo 提交",
      input: "刚想到还要录制 1 分钟演示视频、检查线上链接、补一版项目说明。",
      extractedTasks: [
        {
          title: "录制 1 分钟演示视频",
          deadline: "今天",
          category: "submit",
          source: "text_input",
          urgency: 4,
          goalImpact: 5,
          blockingRisk: 4,
          effort: 3,
          energyFit: 4,
          taskValue: 5,
          recommendation: "do_now",
          reason: "直接影响用户理解 Demo，需要优先准备。"
        },
        {
          title: "检查线上链接",
          deadline: "今天",
          category: "develop",
          source: "text_input",
          urgency: 5,
          goalImpact: 5,
          blockingRisk: 5,
          effort: 1,
          energyFit: 5,
          taskValue: 5,
          recommendation: "do_now",
          reason: "线上链接不可用会直接阻塞提交体验，且检查成本低。"
        },
        {
          title: "补一版项目说明",
          deadline: "今天",
          category: "submit",
          source: "text_input",
          urgency: 3,
          goalImpact: 4,
          blockingRisk: 2,
          effort: 3,
          energyFit: 3,
          taskValue: 4,
          recommendation: "schedule_later",
          reason: "有助于提交材料完整，但应排在链接检查和演示视频之后。"
        }
      ]
    },
    {
      id: "example_2",
      name: "日常开发",
      input: "刚发现移动端按钮会遮挡文字，另外要修一下空状态文案，今晚还想研究新的动画库。",
      extractedTasks: [
        {
          title: "修复移动端按钮遮挡文字",
          deadline: "今天",
          category: "develop",
          source: "text_input",
          urgency: 5,
          goalImpact: 5,
          blockingRisk: 4,
          effort: 2,
          energyFit: 4,
          taskValue: 5,
          recommendation: "do_now",
          reason: "直接影响 Demo 体验，且属于明确 bug，应优先修复。"
        },
        {
          title: "修正空状态文案",
          deadline: "今天",
          category: "develop",
          source: "text_input",
          urgency: 4,
          goalImpact: 4,
          blockingRisk: 2,
          effort: 1,
          energyFit: 5,
          taskValue: 4,
          recommendation: "do_today",
          reason: "修复成本低，能提升页面专业度。"
        },
        {
          title: "研究新的动画库",
          deadline: "",
          category: "research",
          source: "text_input",
          urgency: 1,
          goalImpact: 2,
          blockingRisk: 1,
          effort: 4,
          energyFit: 2,
          taskValue: 2,
          recommendation: "remove_today",
          reason: "没有明确截止时间，且会分散当前修复 Demo 的注意力。"
        }
      ]
    },
    {
      id: "example_3",
      name: "生活琐事",
      input: "记得买洗衣液，顺便整理桌面，还有晚上想刷一下视频放松。",
      extractedTasks: [
        {
          title: "买洗衣液",
          deadline: "",
          category: "life",
          source: "text_input",
          urgency: 2,
          goalImpact: 1,
          blockingRisk: 1,
          effort: 1,
          energyFit: 4,
          taskValue: 2,
          recommendation: "schedule_later",
          reason: "低认知成本，适合和外出任务一起顺路处理。"
        },
        {
          title: "整理桌面",
          deadline: "",
          category: "life",
          source: "text_input",
          urgency: 1,
          goalImpact: 1,
          blockingRisk: 1,
          effort: 3,
          energyFit: 2,
          taskValue: 2,
          recommendation: "remove_today",
          reason: "没有明确截止时间，今天处理会挤占核心任务时间。"
        },
        {
          title: "刷视频放松",
          deadline: "晚上",
          category: "life",
          source: "text_input",
          urgency: 1,
          goalImpact: 1,
          blockingRisk: 1,
          effort: 2,
          energyFit: 2,
          taskValue: 1,
          recommendation: "remove_today",
          reason: "可以作为休息方式，但不应进入今日任务队列。"
        }
      ]
    }
  ]
};
