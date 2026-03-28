export function isLikelyEnglish(text: string): boolean {
  return /^[\x00-\x7F\s\p{P}]+$/u.test(text);
}

export function countEnglishWords(text: string): number {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  return words.length;
}

function countNonWhitespaceChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

export function validateQuoteLength(quote: string): { ok: boolean; reason?: string } {
  if (quote.trim().length === 0) {
    return { ok: false, reason: "金句不能为空" };
  }

  if (isLikelyEnglish(quote)) {
    if (countEnglishWords(quote) > 30) {
      return { ok: false, reason: "英文金句最多 30 个词" };
    }
    return { ok: true };
  }

  if (quote.length > 20) {
    return { ok: false, reason: "中文金句最多 20 字" };
  }
  return { ok: true };
}

export function validateMoodPhraseLength(moodPhrase: string): { ok: boolean; reason?: string } {
  if (moodPhrase.trim().length === 0) {
    return { ok: false, reason: "标题不能为空" };
  }

  if (isLikelyEnglish(moodPhrase)) {
    if (countEnglishWords(moodPhrase) > 20) {
      return { ok: false, reason: "标题英文最多 20 个词" };
    }
    return { ok: true };
  }

  if (moodPhrase.length > 20) {
    return { ok: false, reason: "标题最多 20 字" };
  }
  return { ok: true };
}

export function validateCustomMoodLength(moodPhrase: string): { ok: boolean; reason?: string } {
  if (moodPhrase.trim().length === 0) {
    return { ok: false, reason: "自定义情绪不能为空" };
  }

  if (isLikelyEnglish(moodPhrase)) {
    if (countEnglishWords(moodPhrase) > 2) {
      return { ok: false, reason: "英文自定义情绪最多 2 个词" };
    }
    return { ok: true };
  }

  if (countNonWhitespaceChars(moodPhrase) > 5) {
    return { ok: false, reason: "中文自定义情绪最多 5 个字" };
  }
  return { ok: true };
}

export function hashIp(ip: string): string {
  // 轻量哈希，仅用于示例。生产环境建议使用加盐安全哈希。
  let hash = 0;
  for (let i = 0; i < ip.length; i += 1) {
    hash = (hash * 31 + ip.charCodeAt(i)) >>> 0;
  }
  return `ip_${hash.toString(16)}`;
}

export function nowMinute(): Date {
  const now = new Date();
  now.setSeconds(0);
  now.setMilliseconds(0);
  return now;
}
