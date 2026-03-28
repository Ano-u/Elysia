import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type LexiconTerm = {
  term: string;
  normalized: string;
  compact: string;
  label: string;
  source: string;
  length: number;
};

type SensitiveLexiconCache = {
  loadedAt: number;
  terms: LexiconTerm[];
  sources: string[];
};

export type SensitiveLexiconMatch = {
  matched: boolean;
  labels: string[];
  terms: string[];
  sources: string[];
  fuzzy: boolean;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LEXICON_DIR = path.resolve(__dirname, "../../moderation/sensitive-lexicon");
const CACHE_TTL_MS = 30_000;

let cache: SensitiveLexiconCache | null = null;

function normalizeLexiconText(text: string): { normalized: string; compact: string } {
  const normalized = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[8]/g, "b")
    .replace(/[\s\-_.,/\\|+*~`'"“”‘’]+/g, " ")
    .trim();
  const compact = normalized.replace(/[^\p{L}\p{N}]+/gu, "");
  return { normalized, compact };
}

function isLikelyUsefulLexiconTerm(term: string): boolean {
  const compact = normalizeLexiconText(term).compact;
  if (!compact) {
    return false;
  }

  if (/^[a-z]+$/i.test(compact)) {
    return compact.length >= 3;
  }

  return compact.length >= 2;
}

function listTextFiles(rootDir: string): string[] {
  const files: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".txt")) {
        files.push(fullPath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function computeLabel(rootDir: string, filePath: string): string {
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, "/");
  const withoutExt = relativePath.replace(/\.txt$/i, "");
  return `lexicon:${withoutExt}`;
}

function loadLexiconTerms(rootDir: string): SensitiveLexiconCache {
  const sources = listTextFiles(rootDir);
  const terms: LexiconTerm[] = [];

  for (const source of sources) {
    const content = readFileSync(source, "utf8");
    const label = computeLabel(rootDir, source);
    for (const rawLine of content.split(/\r?\n/)) {
      const term = rawLine.trim();
      if (!term || term.startsWith("#") || term.startsWith("//")) {
        continue;
      }
      if (!isLikelyUsefulLexiconTerm(term)) {
        continue;
      }

      const normalized = normalizeLexiconText(term);
      terms.push({
        term,
        normalized: normalized.normalized,
        compact: normalized.compact,
        label,
        source: source,
        length: normalized.compact.length || normalized.normalized.length,
      });
    }
  }

  return {
    loadedAt: Date.now(),
    terms,
    sources,
  };
}

function resolveLexiconRootDir(): string | null {
  const candidates = [process.env.SENSITIVE_LEXICON_DIR, DEFAULT_LEXICON_DIR].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  for (const candidate of candidates) {
    try {
      const fileStat = statSync(candidate);
      if (fileStat.isDirectory()) {
        return candidate;
      }
    } catch {
      // Ignore missing lexicon directories and fall back to the next candidate.
    }
  }

  return null;
}

function getLexiconCache(): SensitiveLexiconCache | null {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }

  const rootDir = resolveLexiconRootDir();
  if (!rootDir) {
    cache = {
      loadedAt: Date.now(),
      terms: [],
      sources: [],
    };
    return cache;
  }

  cache = loadLexiconTerms(rootDir);
  return cache;
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (!left.length) {
    return right.length;
  }
  if (!right.length) {
    return left.length;
  }

  const previous = new Array<number>(right.length + 1).fill(0).map((_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let col = 1; col <= right.length; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      current[col] = Math.min(
        previous[col] + 1,
        current[col - 1] + 1,
        previous[col - 1] + substitutionCost,
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function shouldTryFuzzy(compactText: string): boolean {
  return compactText.length >= 2 && compactText.length <= 12;
}

function fuzzyMatches(compactText: string, compactTerm: string): boolean {
  if (!shouldTryFuzzy(compactText) || !compactTerm) {
    return false;
  }

  const lengthGap = Math.abs(compactText.length - compactTerm.length);
  if (lengthGap > 1) {
    return false;
  }

  const distance = levenshteinDistance(compactText, compactTerm);
  const maxDistance = compactTerm.length >= 4 ? 1 : 0;
  return distance <= maxDistance;
}

export function reloadSensitiveLexicon(): void {
  cache = null;
  getLexiconCache();
}

export function detectSensitiveLexiconMatches(text: string): SensitiveLexiconMatch {
  const lexicon = getLexiconCache();
  if (!lexicon || lexicon.terms.length === 0) {
    return {
      matched: false,
      labels: [],
      terms: [],
      sources: [],
      fuzzy: false,
    };
  }

  const normalized = normalizeLexiconText(text);
  const labels = new Set<string>();
  const terms = new Set<string>();
  const sources = new Set<string>();
  let fuzzy = false;

  for (const item of lexicon.terms) {
    const hitExact =
      (item.normalized && normalized.normalized.includes(item.normalized))
      || (item.compact && normalized.compact.includes(item.compact));
    const hitFuzzy = !hitExact && fuzzyMatches(normalized.compact, item.compact);

    if (!hitExact && !hitFuzzy) {
      continue;
    }

    labels.add(item.label);
    terms.add(item.term);
    sources.add(item.source);
    fuzzy ||= hitFuzzy;

    if (labels.size >= 6 && terms.size >= 6) {
      break;
    }
  }

  return {
    matched: labels.size > 0,
    labels: Array.from(labels),
    terms: Array.from(terms),
    sources: Array.from(sources),
    fuzzy,
  };
}
