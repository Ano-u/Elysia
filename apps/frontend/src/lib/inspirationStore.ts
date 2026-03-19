export type AdminInspirationItem = {
  id: string;
  text: string;
  createdAt: string;
};

export const ADMIN_INSPIRATION_STORAGE_KEY = "elysia-admin-inspirations-v1";

const DEFAULT_ADMIN_INSPIRATIONS = [
  "今天哪怕只写下一句话，也是在认真抱住自己。",
  "把不确定留在这里，Elysia 会陪你慢慢看清它。",
];

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `insp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeItems(items: AdminInspirationItem[]): AdminInspirationItem[] {
  const seen = new Set<string>();
  const next: AdminInspirationItem[] = [];
  for (const item of items) {
    const text = item.text.trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    next.push({
      id: item.id || generateId(),
      text,
      createdAt: item.createdAt || new Date().toISOString(),
    });
  }
  return next;
}

export function readAdminInspirations(): AdminInspirationItem[] {
  if (typeof window === "undefined") {
    return DEFAULT_ADMIN_INSPIRATIONS.map((text, index) => ({
      id: `default-${index + 1}`,
      text,
      createdAt: new Date(0).toISOString(),
    }));
  }

  const raw = window.localStorage.getItem(ADMIN_INSPIRATION_STORAGE_KEY);
  if (!raw) {
    const seeded = DEFAULT_ADMIN_INSPIRATIONS.map((text) => ({
      id: generateId(),
      text,
      createdAt: new Date().toISOString(),
    }));
    window.localStorage.setItem(ADMIN_INSPIRATION_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw) as AdminInspirationItem[];
    const normalized = normalizeItems(Array.isArray(parsed) ? parsed : []);
    if (!normalized.length) {
      const fallback = DEFAULT_ADMIN_INSPIRATIONS.map((text) => ({
        id: generateId(),
        text,
        createdAt: new Date().toISOString(),
      }));
      window.localStorage.setItem(ADMIN_INSPIRATION_STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }
    if (normalized.length !== parsed.length) {
      window.localStorage.setItem(ADMIN_INSPIRATION_STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    const fallback = DEFAULT_ADMIN_INSPIRATIONS.map((text) => ({
      id: generateId(),
      text,
      createdAt: new Date().toISOString(),
    }));
    window.localStorage.setItem(ADMIN_INSPIRATION_STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

export function writeAdminInspirations(items: AdminInspirationItem[]): AdminInspirationItem[] {
  const normalized = normalizeItems(items);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADMIN_INSPIRATION_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function readAdminInspirationTexts(): string[] {
  return readAdminInspirations().map((item) => item.text);
}

