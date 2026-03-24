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
});
