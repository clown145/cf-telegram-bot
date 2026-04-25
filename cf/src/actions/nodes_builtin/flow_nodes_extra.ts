import type { ActionHandler } from "../handlers";
import type { ModularActionDefinition } from "../modularActions";

type NodePackage = {
  definition: ModularActionDefinition;
  handler: ActionHandler;
};

function parseWeights(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry > 0);
  }
  const raw = String(value || "").trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
}

const randomHandler: ActionHandler = async (params) => {
  const maxChoicesRaw = Number(params.choice_count ?? params.max_choices ?? 2);
  const maxChoices = Math.max(1, Math.min(4, Number.isFinite(maxChoicesRaw) ? Math.trunc(maxChoicesRaw) : 2));
  const weights = parseWeights(params.weights).slice(0, maxChoices);
  let selectedIndex = 1;

  if (weights.length === maxChoices) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < weights.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) {
        selectedIndex = i + 1;
        break;
      }
    }
  } else {
    selectedIndex = Math.floor(Math.random() * maxChoices) + 1;
  }

  return {
    __flow__: `choice_${selectedIndex}`,
    selected_index: selectedIndex,
    selected_flow: `choice_${selectedIndex}`,
  };
};

export const FLOW_EXTRA_NODE_PACKAGES: NodePackage[] = [
  {
    definition: {
      id: "random",
      version: "1.0.0",
      name: "Random Branch",
      description: "Randomly choose one of up to four flow branches.",
      category: "flow",
      tags: ["flow", "random", "branch"],
      inputs: [
        {
          name: "choice_count",
          type: "integer",
          default: 2,
          description: "Number of active branches, from 1 to 4.",
        },
        {
          name: "weights",
          type: "string",
          default: "",
          description: "Optional comma-separated weights, e.g. 70,30.",
        },
      ],
      outputs: [
        { name: "choice_1", type: "flow", description: "Random branch 1." },
        { name: "choice_2", type: "flow", description: "Random branch 2." },
        { name: "choice_3", type: "flow", description: "Random branch 3." },
        { name: "choice_4", type: "flow", description: "Random branch 4." },
        { name: "selected_index", type: "integer", description: "Selected branch index." },
        { name: "selected_flow", type: "string", description: "Selected flow output name." },
      ],
      i18n: {
        name: { "zh-CN": "随机分支", "en-US": "Random Branch" },
        description: { "zh-CN": "随机选择一个流程分支。", "en-US": "Randomly choose a flow branch." },
      },
      ui: { icon: "shuffle", color: "#f59e0b", group: "flow" },
      runtime: {
        execution: "local",
        sideEffects: false,
        allowNetwork: false,
      },
      compatibility: {
        engineVersion: ">=0.1.0",
      },
    },
    handler: randomHandler,
  },
];

export default FLOW_EXTRA_NODE_PACKAGES;
