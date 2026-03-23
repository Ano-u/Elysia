// eslint-disable-next-line no-control-regex
const ENGLISH_ONLY_PATTERN = /^[\x00-\x7F\s\p{P}]+$/u;

function isLikelyEnglish(text: string): boolean {
  return ENGLISH_ONLY_PATTERN.test(text);
}

function countEnglishWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0).length;
}

export function validateMoodPhraseLength(input: string): { ok: true } | { ok: false; reason: string } {
  const value = input.trim();
  if (value.length === 0) {
    return { ok: false, reason: "先写下一句标题，再让爱莉帮你送出吧♪" };
  }

  if (isLikelyEnglish(value)) {
    if (countEnglishWords(value) > 20) {
      return { ok: false, reason: "标题英文最多 20 个词，请精简后再试♪" };
    }
    return { ok: true };
  }

  if (value.length > 20) {
    return { ok: false, reason: "标题最多 20 个字，请精简后再试♪" };
  }

  return { ok: true };
}

