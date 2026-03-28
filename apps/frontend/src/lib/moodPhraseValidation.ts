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
    return { ok: false, reason: "要先留下一个标题，爱莉才能帮你送出这份心意呀♪" };
  }

  if (isLikelyEnglish(value)) {
    if (countEnglishWords(value) > 20) {
      return { ok: false, reason: "标题最多只能写 20 个词哦，稍微精简一下我们再出发吧♪" };
    }
    return { ok: true };
  }

  if (value.length > 20) {
    return { ok: false, reason: "标题最多只能写 20 个字哦，把悬念留给下一次不是更浪漫嘛♪" };
  }

  return { ok: true };
}
