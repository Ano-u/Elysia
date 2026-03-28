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
  buildRecordSummaryPayload: vi.fn(({ summary, replyContext, requesterUserId }) => ({
    id: summary.id,
    user_id: summary.user_id,
    mood_phrase: requesterUserId === summary.user_id ? summary.mood_phrase : summary.display_mood_phrase ?? summary.mood_phrase,
    description: requesterUserId === summary.user_id ? summary.description : summary.public_description ?? summary.description,
    visibility_intent: summary.visibility_intent,
    publication_status: summary.publication_status,
    is_public: summary.is_public,
    created_at: summary.created_at,
    updated_at: summary.updated_at,
    replyContext,
    sanitized: requesterUserId !== summary.user_id,
  })),
  loadRecordSummary: vi.fn(),
  loadReplyContext: vi.fn(),
}));

import { recordsRoutes } from "../src/routes/records.js";
import { loadRecordSummary, loadReplyContext } from "../src/lib/record-views.js";

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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("访客读取公开记录时应拿到脱敏字段", async () => {
    mockedLoadRecordSummary.mockResolvedValueOnce({
      id: ids.reply,
      user_id: "user-2",
      mood_phrase: "原始情绪",
      display_mood_phrase: "此刻心情",
      description: "我在上海市浦东新区世纪大道88号见到了你",
      public_description: "我在上海市见到了你",
      is_public: true,
      visibility_intent: "public",
      publication_status: "published",
      publish_requested_at: "2026-03-24T00:00:00.000Z",
      published_at: "2026-03-24T00:00:00.000Z",
      risk_summary: { level: "low" },
      review_notes: null,
      occurred_at: "2026-03-24T08:30:00.000Z",
      public_occurred_at: "2026-03-01T00:00:00.000Z",
      location_id: "loc-1",
      public_location_label: "上海市",
      edit_deadline_at: "2026-04-23T00:00:00.000Z",
      created_at: "2026-03-24T00:00:00.000Z",
      updated_at: "2026-03-24T00:00:00.000Z",
      source_record_id: ids.parent,
      source_comment_id: ids.comment,
      quote: "https://example.com/original",
      public_quote: "[链接已隐藏]",
      extra_emotions: ["平静", "想念"],
      tags: [],
      display_name: "Reply Author",
      avatar_url: "https://example.com/avatar.png",
    });
    mockedLoadReplyContext.mockResolvedValueOnce({
      content: "这是一段回复正文",
      parentRecordId: ids.parent,
      rootRecordId: ids.root,
      parentTarget: null,
      rootTarget: null,
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
        mood_phrase: "此刻心情",
        description: "我在上海市见到了你",
        is_public: true,
        visibility_intent: "public",
        publication_status: "published",
        publish_requested_at: "2026-03-24T00:00:00.000Z",
        published_at: "2026-03-24T00:00:00.000Z",
        risk_summary: { level: "low" },
        review_notes: null,
        occurred_at: "2026-03-01T00:00:00.000Z",
        location_id: null,
        public_location_label: "上海市",
        source_record_id: ids.parent,
        source_comment_id: ids.comment,
        edit_deadline_at: "2026-04-23T00:00:00.000Z",
        created_at: "2026-03-24T00:00:00.000Z",
        updated_at: "2026-03-24T00:00:00.000Z",
        sanitized: true,
      },
      quote: "[链接已隐藏]",
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
        parentTarget: null,
        rootTarget: null,
      },
      rawContent: null,
    });
  });
});
