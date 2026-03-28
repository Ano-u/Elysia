import { describe, expect, it } from "vitest";

import {
  buildMoodCatalog,
  EXTRA_EMOTION_POOL,
  HIGH_FREQUENCY_MOOD_TAGS,
  ROTATING_MOOD_TAG_POOL,
} from "../src/lib/mood-catalog.js";

describe("buildMoodCatalog", () => {
  it("returns a homepageDisplay with 14 unique tags using a 4/10 high-frequency split", () => {
    const catalog = buildMoodCatalog("user-1:seed");
    const homepageDisplay = catalog.homepageDisplay;
    const highFrequencySet = new Set(HIGH_FREQUENCY_MOOD_TAGS);
    const lowFrequencySet = new Set([
      ...ROTATING_MOOD_TAG_POOL,
      ...EXTRA_EMOTION_POOL,
    ]);

    expect(homepageDisplay).toHaveLength(14);
    expect(new Set(homepageDisplay).size).toBe(14);
    expect(homepageDisplay).not.toContain("custom");
    expect(homepageDisplay.filter((tag) => highFrequencySet.has(tag))).toHaveLength(4);
    expect(homepageDisplay.filter((tag) => lowFrequencySet.has(tag) && !highFrequencySet.has(tag))).toHaveLength(10);
  });
});
