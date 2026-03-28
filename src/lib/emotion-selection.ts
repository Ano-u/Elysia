import { isPresetMoodTag } from "./mood-catalog.js";
import { validateCustomMoodLength } from "./utils.js";

export const moodModeValues = ["preset", "other_random", "custom"] as const;
export type MoodMode = (typeof moodModeValues)[number];

export const MAX_SELECTED_EMOTIONS = 2;

type NormalizeEmotionSelectionInput = {
  extraEmotions?: string[] | null;
  moodMode?: MoodMode | null;
  customMoodPhrase?: string | null;
};

export type EmotionSelection = {
  extraEmotions: string[];
  moodMode: MoodMode;
  customMoodPhrase: string | null;
  isCustomMood: boolean;
};

function dedupeEmotions(extraEmotions: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const emotion of extraEmotions) {
    const value = emotion.trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function normalizeEmotionSelection(input: NormalizeEmotionSelectionInput): EmotionSelection {
  const normalizedExtraEmotions = dedupeEmotions(input.extraEmotions ?? []);
  const explicitCustomMood = input.customMoodPhrase?.trim() || null;
  const inferredCustomMoods = normalizedExtraEmotions.filter((emotion) => !isPresetMoodTag(emotion));

  if (inferredCustomMoods.length > 1) {
    throw new Error("最多只能填写 1 个自定义情绪");
  }

  if (input.moodMode === "custom" && !explicitCustomMood && inferredCustomMoods.length === 0) {
    throw new Error("自定义情绪不能为空");
  }

  if (explicitCustomMood && inferredCustomMoods.length > 0 && !inferredCustomMoods.includes(explicitCustomMood)) {
    throw new Error("自定义情绪与已选情绪不一致");
  }

  const customMoodPhrase = explicitCustomMood ?? inferredCustomMoods[0] ?? null;
  if (customMoodPhrase) {
    const customMoodCheck = validateCustomMoodLength(customMoodPhrase);
    if (!customMoodCheck.ok) {
      throw new Error(customMoodCheck.reason ?? "自定义情绪不合法");
    }
  }

  const finalExtraEmotions = customMoodPhrase && !normalizedExtraEmotions.includes(customMoodPhrase)
    ? [...normalizedExtraEmotions, customMoodPhrase]
    : normalizedExtraEmotions;

  if (finalExtraEmotions.length > MAX_SELECTED_EMOTIONS) {
    throw new Error(`情绪标签最多选择 ${MAX_SELECTED_EMOTIONS} 个`);
  }

  return {
    extraEmotions: finalExtraEmotions,
    moodMode: customMoodPhrase ? "custom" : input.moodMode === "other_random" ? "other_random" : "preset",
    customMoodPhrase,
    isCustomMood: Boolean(customMoodPhrase),
  };
}
