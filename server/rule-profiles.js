const RULE_PROFILES = {
  balanced: {
    label: "平衡",
    description: "综合考虑截止、目标、阻塞和任务价值。",
    weights: {
      urgency: 0.30,
      goalImpact: 0.25,
      blockingRisk: 0.20,
      taskValue: 0.15,
      energyFit: 0.10
    },
    effortPolicy: {
      high: -0.35,
      mediumHigh: -0.20,
      low: 0.10
    }
  },
  deadline_first: {
    label: "截止优先",
    description: "更早处理临近截止的事情。",
    weights: {
      urgency: 0.40,
      goalImpact: 0.20,
      blockingRisk: 0.20,
      taskValue: 0.10,
      energyFit: 0.10
    },
    effortPolicy: {
      high: -0.35,
      mediumHigh: -0.20,
      low: 0.10
    }
  },
  goal_first: {
    label: "目标优先",
    description: "更早处理推动今日目标的事情。",
    weights: {
      urgency: 0.22,
      goalImpact: 0.38,
      blockingRisk: 0.18,
      taskValue: 0.14,
      energyFit: 0.08
    },
    effortPolicy: {
      high: -0.35,
      mediumHigh: -0.20,
      low: 0.10
    }
  },
  low_effort_first: {
    label: "低负担优先",
    description: "优先插入更短、更容易完成的事情。",
    weights: {
      urgency: 0.25,
      goalImpact: 0.22,
      blockingRisk: 0.18,
      taskValue: 0.13,
      energyFit: 0.12
    },
    effortPolicy: {
      high: -0.55,
      mediumHigh: -0.35,
      low: 0.20
    }
  }
};

function getRuleProfile(rulePreset = "balanced") {
  const preset = Object.prototype.hasOwnProperty.call(RULE_PROFILES, rulePreset) ? rulePreset : "balanced";
  return {
    rulePreset: preset,
    ruleProfile: RULE_PROFILES[preset]
  };
}

module.exports = {
  getRuleProfile,
  RULE_PROFILES
};
