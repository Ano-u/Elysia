import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/auth.js", () => ({
  requireAccessApproved: vi.fn(),
  requireNotInRiskControl: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("../src/lib/db.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("../src/lib/realtime.js", () => ({
  broadcast: vi.fn(),
}));

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("../src/lib/record-publication.js", () => ({
  applyPublicationDecision: vi.fn(),
  buildRiskSummary: vi.fn(() => ({ level: "very_low" })),
  createRecordRevision: vi.fn(() => Promise.resolve(1)),
  parseRecordVisibilityIntent: vi.fn((isPublic?: boolean) => (isPublic ? "public" : "private")),
  publicationLabel: vi.fn((status: string) => status),
}));

vi.mock("../src/lib/record-views.js", () => ({
  buildRecordAuthorPayload: vi.fn((summary) => ({
    id: summary.user_id,
    displayName: summary.display_name,
    avatarUrl: summary.avatar_url,
  })),
  loadRecordSummary: vi.fn(),
  loadReplyContext: vi.fn(),
}));

import { recordsRoutes } from "../src/routes/records.js";
import { loadRecordSummary, loadReplyContext } from "../src/lib/record-views.js";
import { requireUser } from "../src/lib/auth.js";
import { EXTRA_EMOTION_POOL, HIGH_FREQUENCY_MOOD_TAGS, ROTATING_MOOD_TAG_POOL } from "../src/lib/mood-catalog.js";

const ids = {
  root: "11111111-1111-4111-8111-111111111111",
  parent: "22222222-2222-4222-8222-222222222222",
  reply: "33333333-3333-4333-8333-333333333333",
  comment: "44444444-4444-4444-8444-444444444444",
};

async function buildApp() {
  const app = Fastify();
  await app.register(recordsRoutes);
  return app;
}

describe("recordsRoutes detail response", () => {
  const mockedLoadRecordSummary = vi.mocked(loadRecordSummary);
  const mockedLoadReplyContext = vi.mocked(loadReplyContext);
  const mockedRequireUser = vi.mocked(requireUser);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns homepageDisplay alongside the existing mood option fields", async () => {
    mockedRequireUser.mockResolvedValueOnce({
      id: "user-1",
      username: "tester",
      displayName: "Tester",
      role: "user",
    } as never);

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/records/mood-options",
    });
    await app.close();

    const body = response.json();
    const highFrequencySet = new Set(HIGH_FREQUENCY_MOOD_TAGS);
    const lowFrequencySet = new Set([
      ...ROTATING_MOOD_TAG_POOL,
      ...EXTRA_EMOTION_POOL,
    ]);

    expect(response.statusCode).toBe(200);
    expect(body.primary).toEqual(Array.from(HIGH_FREQUENCY_MOOD_TAGS));
    expect(body.extra).toEqual(Array.from(EXTRA_EMOTION_POOL));
    expect(body.rotating).toBeInstanceOf(Array);
    expect(body.custom).toMatchObject({
      enabled: true,
      maxChineseChars: 5,
      maxEnglishWords: 2,
      reviewPipeline: ["rules", "lexicon", "ai", "admin"],
    });
    expect(body.homepageDisplay).toHaveLength(14);
    expect(new Set(body.homepageDisplay).size).toBe(14);
    expect(body.homepageDisplay).not.toContain("custom");
    expect(body.homepageDisplay.filter((tag: string) => highFrequencySet.has(tag))).toHaveLength(4);
    expect(body.homepageDisplay.filter((tag: string) => lowFrequencySet.has(tag) && !highFrequencySet.has(tag))).toHaveLength(10);
  });

  it("returns author and replyContext for a public reply card", async () => {
    mockedLoadRecordSummary.mockResolvedValueOnce({
      id: ids.reply,
      user_id: "user-2",
      mood_phrase: "回复卡片标题",
      description: "回复卡片描述",
      is_public: true,
      visibility_intent: "public",
      publication_status: "published",
      publish_requested_at: "2026-03-24T00:00:00.000Z",
      published_at: "2026-03-24T00:00:00.000Z",
      risk_summary: { level: "low" },
      review_notes: null,
      occurred_at: null,
      location_id: null,
      edit_deadline_at: "2026-04-23T00:00:00.000Z",
      created_at: "2026-03-24T00:00:00.000Z",
      updated_at: "2026-03-24T00:00:00.000Z",
      source_record_id: ids.parent,
      source_comment_id: ids.comment,
      quote: "一句誓言",
      extra_emotions: ["平静", "想念"],
      tags: [],
      display_name: "Reply Author",
      avatar_url: "https://example.com/avatar.png",
    });
    mockedLoadReplyContext.mockResolvedValueOnce({
      content: "这是一段回复正文",
      parentRecordId: ids.parent,
      rootRecordId: ids.root,
      parentTarget: {
        id: ids.parent,
        moodPhrase: "父回复",
        quote: null,
        createdAt: "2026-03-23T10:00:00.000Z",
        isPublic: true,
        publicationStatus: "published",
        author: {
          id: "user-3",
          displayName: "Parent Author",
          avatarUrl: null,
        },
      },
      rootTarget: {
        id: ids.root,
        moodPhrase: "主帖",
        quote: "主帖誓言",
        createdAt: "2026-03-22T10:00:00.000Z",
        isPublic: true,
        publicationStatus: "published",
        author: {
          id: "user-4",
          displayName: "Root Author",
          avatarUrl: null,
        },
      },
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/records/${ids.reply}`,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      record: {
        id: ids.reply,
        user_id: "user-2",
        mood_phrase: "回复卡片标题",
        description: "回复卡片描述",
        is_public: true,
        visibility_intent: "public",
        publication_status: "published",
        publish_requested_at: "2026-03-24T00:00:00.000Z",
        published_at: "2026-03-24T00:00:00.000Z",
        risk_summary: { level: "low" },
        review_notes: null,
        occurred_at: null,
        location_id: null,
        location_summary: null,
        mood_mode: "preset",
        custom_mood_phrase: null,
        source_record_id: ids.parent,
        source_comment_id: ids.comment,
        edit_deadline_at: "2026-04-23T00:00:00.000Z",
        created_at: "2026-03-24T00:00:00.000Z",
        updated_at: "2026-03-24T00:00:00.000Z",
      },
      quote: "一句誓言",
      extraEmotions: ["平静", "想念"],
      tags: [],
      author: {
        id: "user-2",
        displayName: "Reply Author",
        avatarUrl: "https://example.com/avatar.png",
      },
      replyContext: {
        content: "这是一段回复正文",
        parentRecordId: ids.parent,
        rootRecordId: ids.root,
        parentTarget: {
          id: ids.parent,
          moodPhrase: "父回复",
          quote: null,
          createdAt: "2026-03-23T10:00:00.000Z",
          isPublic: true,
          publicationStatus: "published",
          author: {
            id: "user-3",
            displayName: "Parent Author",
            avatarUrl: null,
          },
        },
        rootTarget: {
          id: ids.root,
          moodPhrase: "主帖",
          quote: "主帖誓言",
          createdAt: "2026-03-22T10:00:00.000Z",
          isPublic: true,
          publicationStatus: "published",
          author: {
            id: "user-4",
            displayName: "Root Author",
            avatarUrl: null,
          },
        },
      },
    });
  });

  it("redacts public detail for non-owner viewers", async () => {
    mockedLoadRecordSummary.mockResolvedValueOnce({
      id: ids.reply,
      user_id: "user-2",
      mood_phrase: "想被接住",
      mood_mode: "custom",
      custom_mood_phrase: "想被接住",
      description: "联系我 13800138000，周末在上海市浦东新区世纪大道88号见，网址 https://spam.example.com",
      is_public: true,
      visibility_intent: "public",
      publication_status: "published",
      publish_requested_at: "2026-03-24T00:00:00.000Z",
      published_at: "2026-03-24T00:00:00.000Z",
      risk_summary: { level: "medium" },
      review_notes: null,
      occurred_at: "2026-03-24T08:00:00.000Z",
      location_id: "99999999-9999-4999-8999-999999999999",
      edit_deadline_at: "2026-04-23T00:00:00.000Z",
      created_at: "2026-03-24T00:00:00.000Z",
      updated_at: "2026-03-24T00:00:00.000Z",
      source_record_id: ids.parent,
      source_comment_id: ids.comment,
      quote: "看这里 https://promo.example.com",
      extra_emotions: ["平静"],
      tags: ["希望"],
      display_name: "Reply Author",
      avatar_url: "https://example.com/avatar.png",
      location_country: "中国",
      location_region: "上海",
      location_city: "上海",
    });
    mockedLoadReplyContext.mockResolvedValueOnce(null);

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/records/${ids.reply}`,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      record: {
        description: "联系我 [已隐藏联系方式]，[已模糊地址]见，网址 [已隐藏链接]",
        occurred_at: "2026-03",
        location_id: null,
        location_summary: {
          label: "上海",
          precision: "city",
        },
        mood_mode: "custom",
        custom_mood_phrase: "想被接住",
      },
      quote: "看这里 [已隐藏链接]",
    });
  });
});
