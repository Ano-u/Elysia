export const HIGH_FREQUENCY_MOOD_TAGS = [
  "平静",
  "温柔",
  "希望",
  "想念",
  "释然",
  "迷茫",
  "疲惫",
  "开心",
] as const;

export const ROTATING_MOOD_TAG_POOL = [
  "雀跃",
  "安心",
  "委屈",
  "心酸",
  "愧疚",
  "笃定",
  "松弛",
  "窒闷",
  "失重",
  "清醒",
  "依恋",
  "庆幸",
  "怅然",
  "发懵",
  "嫉妒",
  "羞怯",
  "悸动",
  "倔强",
  "热望",
  "悬着",
  "振奋",
  "迟疑",
  "无奈",
  "慌张",
  "安定",
  "愉悦",
  "心软",
  "苦涩",
  "雀跃",
  "钝感",
  "失眠",
  "空茫",
  "挂念",
  "庆生",
  "被理解",
  "想靠近",
  "想逃开",
  "低落",
  "轻盈",
  "被点亮",
] as const;

export const EXTRA_EMOTION_POOL = [
  "被理解",
  "想拥抱",
  "想休息",
  "心里发酸",
  "有点委屈",
  "终于松口气",
  "隐隐不安",
  "慢慢恢复",
  "很想分享",
  "需要勇气",
  "想再试试",
  "想被看见",
] as const;

const PRESET_MOOD_TAG_SET = new Set<string>([
  ...HIGH_FREQUENCY_MOOD_TAGS,
  ...ROTATING_MOOD_TAG_POOL,
  ...EXTRA_EMOTION_POOL,
]);

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function buildRotatingMoodSelection(seed: string, size = 10): string[] {
  const pool = Array.from(ROTATING_MOOD_TAG_POOL);
  if (pool.length <= size) {
    return pool;
  }

  let cursor = hashSeed(seed) % pool.length;
  const picked: string[] = [];
  while (picked.length < size && pool.length > 0) {
    const index = cursor % pool.length;
    picked.push(pool.splice(index, 1)[0]);
    cursor = (cursor * 1103515245 + 12345) >>> 0;
  }
  return picked;
}

export function buildMoodCatalog(seed: string) {
  return {
    primary: Array.from(HIGH_FREQUENCY_MOOD_TAGS),
    rotating: buildRotatingMoodSelection(seed),
    extra: Array.from(EXTRA_EMOTION_POOL),
    custom: {
      enabled: true,
      maxChineseChars: 5,
      maxEnglishWords: 2,
      reviewPipeline: ["rules", "lexicon", "ai", "admin"],
    },
  };
}

export function isPresetMoodTag(tag: string): boolean {
  return PRESET_MOOD_TAG_SET.has(tag.trim());
}
