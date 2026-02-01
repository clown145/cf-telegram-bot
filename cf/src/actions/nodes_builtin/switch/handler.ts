import type { ActionHandler } from "../../handlers";

function normalizeValue(value: unknown, insensitive: boolean): string {
  const str = value === null || value === undefined ? "" : String(value);
  return insensitive ? str.toLowerCase() : str;
}

export const handler: ActionHandler = async (params) => {
  const rawValue = params.value ?? params.input ?? params.switch_value;
  const insensitive = Boolean(params.case_insensitive);
  const value = normalizeValue(rawValue, insensitive);

  const cases: Array<{ key: string; value: string }> = [];
  for (let i = 1; i <= 4; i += 1) {
    const rawCase = params[`case_${i}`];
    if (rawCase === undefined || rawCase === null || rawCase === "") {
      continue;
    }
    cases.push({ key: `case_${i}`, value: normalizeValue(rawCase, insensitive) });
  }

  let matchedKey: string | null = null;
  let matchedValue: string | null = null;
  let matchedIndex: number | null = null;
  for (let i = 0; i < cases.length; i += 1) {
    if (value === cases[i].value) {
      matchedKey = cases[i].key;
      matchedValue = cases[i].value;
      matchedIndex = Number(cases[i].key.replace("case_", "")) || null;
      break;
    }
  }

  const flow = matchedKey ?? "default";
  return {
    __flow__: flow,
    matched_case: matchedValue,
    matched_index: matchedIndex,
  };
};
