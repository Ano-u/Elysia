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
  "庆幸",
  "想靠近",
  "想逃开",
  "低落",
  "轻盈",
] as const;

export const EXTRA_EMOTION_POOL = [
  "被理解",
  "被点亮",
  "想拥抱",
  "想休息",
  "想分享",
  "松了口气",
  "心里发酸",
  "隐隐不安",
  "慢慢恢复",
  "需要勇气",
  "想再试试",
  "想被看见",
] as const;

const PRESET_MOOD_TAG_SET = new Set<string>([
  ...HIGH_FREQUENCY_MOOD_TAGS,
  ...ROTATING_MOOD_TAG_POOL,
  ...EXTRA_EMOTION_POOL,
]);

const HOMEPAGE_DISPLAY_SIZE = 14;
const HOMEPAGE_PRIMARY_COUNT = 4;

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function nextSeed(seed: number): number {
  return (seed * 1664525 + 1013904223) >>> 0;
}

function dedupeTags(tags: readonly string[]): string[] {
  return Array.from(new Set(tags));
}

function pickSeededTags(tags: readonly string[], seed: string, size: number): string[] {
  const pool = dedupeTags(tags);
  if (pool.length <= size) {
    return pool;
  }

  let cursor = hashSeed(seed) || 1;
  const picked: string[] = [];
  while (picked.length < size && pool.length > 0) {
    cursor = nextSeed(cursor);
    const index = cursor % pool.length;
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

function shuffleSeededTags(tags: readonly string[], seed: string): string[] {
  const shuffled = [...tags];
  let cursor = hashSeed(seed) || 1;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    cursor = nextSeed(cursor);
    const swapIndex = cursor % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
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

export function buildHomepageMoodDisplay(seed: string): string[] {
  const primaryPool = dedupeTags(HIGH_FREQUENCY_MOOD_TAGS);
  const primarySet = new Set(primaryPool);
  const secondaryPool = dedupeTags([
    ...ROTATING_MOOD_TAG_POOL,
    ...EXTRA_EMOTION_POOL,
  ]).filter((tag) => !primarySet.has(tag));

  const primaryPicks = pickSeededTags(primaryPool, `${seed}:home:primary`, HOMEPAGE_PRIMARY_COUNT);
  const secondaryPicks = pickSeededTags(
    secondaryPool,
    `${seed}:home:secondary`,
    Math.max(HOMEPAGE_DISPLAY_SIZE - primaryPicks.length, 0),
  );

  return shuffleSeededTags([...primaryPicks, ...secondaryPicks], `${seed}:home:shuffle`);
}

export function buildMoodCatalog(seed: string) {
  return {
    primary: Array.from(HIGH_FREQUENCY_MOOD_TAGS),
    rotating: buildRotatingMoodSelection(seed),
    extra: Array.from(EXTRA_EMOTION_POOL),
    homepageDisplay: buildHomepageMoodDisplay(seed),
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
