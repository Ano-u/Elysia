import { useEffect, useState } from "react";

function pickNextIndex(length: number, current: number): number {
  if (length <= 1) {
    return 0;
  }

  let next = current;
  while (next === current) {
    next = Math.floor(Math.random() * length);
  }
  return next;
}

export function pickRandomCopy(items: readonly string[], fallback = ""): string {
  if (items.length === 0) {
    return fallback;
  }
  return items[Math.floor(Math.random() * items.length)] ?? fallback;
}

export function useRotatingCopy(
  items: readonly string[],
  intervalMs = 10000,
  enabled = true,
): string {
  const [index, setIndex] = useState(() =>
    items.length > 0 ? Math.floor(Math.random() * items.length) : 0,
  );

  useEffect(() => {
    setIndex(items.length > 0 ? Math.floor(Math.random() * items.length) : 0);
  }, [items]);

  useEffect(() => {
    if (!enabled || items.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setIndex((current) => pickNextIndex(items.length, current));
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, items]);

  return items[index] ?? items[0] ?? "";
}
