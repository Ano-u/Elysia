import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/auth.js", () => ({
  requireAccessApproved: vi.fn(),
  requireNotInRiskControl: vi.fn(),
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
  publicationLabel: vi.fn((status: string) => (status === "private" ? "仅自己可见" : "已公开")),
}));

vi.mock("../src/lib/record-views.js", () => ({
  buildRecordSummaryPayload: vi.fn(({ summary }) => ({
    id: summary.id,
    user_id: summary.user_id,
    mood_phrase: summary.display_mood_phrase ?? summary.mood_phrase,
    description: summary.public_description ?? summary.description,
    visibility_intent: summary.visibility_intent,
    publication_status: summary.publication_status,
    is_public: summary.is_public,
    created_at: summary.created_at,
    updated_at: summary.updated_at,
    sanitized: true,
  })),
  loadRecordSummary: vi.fn(),
  loadReplyContext: vi.fn(),
}));

import { commentsRoutes } from "../src/routes/comments.js";
import { requireAccessApproved, requireNotInRiskControl } from "../src/lib/auth.js";
import { query, withTransaction } from "../src/lib/db.js";
import { loadRecordSummary, loadReplyContext } from "../src/lib/record-views.js";

const ids = {
  parent: "22222222-2222-4222-8222-222222222222",
  publicReply: "44444444-4444-4444-8444-444444444444",
  comment1: "88888888-8888-4888-8888-888888888888",
};

function makeUser() {
  return {
    id: "user-1",
    username: "tester",
    displayName: "Tester",
    avatarUrl: null,
    role: "user" as const,
    isBanned: false,
    banUntil: null,
    accessStatus: "approved" as const,
    riskControlUntil: null,
    riskControlReason: null,
  };
}

function makeQueryResult<T>(rows: T[]) {
  return {
    rows,
    rowCount: rows.length,
  } as { rows: T[]; rowCount: number };
}

async function buildApp() {
  const app = Fastify();
  await app.register(commentsRoutes);
  return app;
}

describe("commentsRoutes", () => {
  const approvedUser = makeUser();
  const mockedRequireAccessApproved = vi.mocked(requireAccessApproved);
  const mockedRequireNotInRiskControl = vi.mocked(requireNotInRiskControl);
  const mockedQuery = vi.mocked(query);
  const mockedWithTransaction = vi.mocked(withTransaction);
  const mockedLoadRecordSummary = vi.mocked(loadRecordSummary);
  const mockedLoadReplyContext = vi.mocked(loadReplyContext);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireAccessApproved.mockResolvedValue(approvedUser);
    mockedRequireNotInRiskControl.mockResolvedValue(approvedUser);
  });

  it("回复卡片返回中应包含审核元信息", async () => {
    mockedQuery.mockResolvedValueOnce(
      makeQueryResult([
        {
          id: ids.parent,
          user_id: "author-1",
          mood_phrase: "主帖",
          is_public: true,
          publication_status: "published",
          root_record_id: ids.parent,
        },
      ]),
    );

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(
          makeQueryResult([
            {
              id: ids.comment1,
              record_id: ids.parent,
              user_id: "user-1",
              content: "加微看详情",
              parent_record_id: ids.parent,
              root_record_id: ids.parent,
              created_at: "2026-03-24T00:00:00.000Z",
            },
          ]),
        )
        .mockResolvedValueOnce(makeQueryResult([{ id: ids.publicReply }]))
        .mockResolvedValue(makeQueryResult([])),
    };
    mockedWithTransaction.mockImplementation(async (handler) => handler(client as any));
    mockedLoadRecordSummary.mockResolvedValueOnce({
      id: ids.publicReply,
      user_id: "user-1",
      mood_phrase: "vx",
      display_mood_phrase: "此刻心情",
      description: "原始描述",
      public_description: "[疑似推广信息已隐藏]",
      is_public: false,
      visibility_intent: "public",
      publication_status: "pending_manual",
      publish_requested_at: "2026-03-24T00:00:00.000Z",
      published_at: null,
      risk_summary: {},
      review_notes: null,
      occurred_at: null,
      public_occurred_at: null,
      location_id: null,
      public_location_label: null,
      edit_deadline_at: "2026-04-23T00:00:00.000Z",
      created_at: "2026-03-24T00:00:00.000Z",
      updated_at: "2026-03-24T00:00:00.000Z",
      source_record_id: ids.parent,
      source_comment_id: ids.comment1,
      quote: null,
      public_quote: null,
      extra_emotions: [],
      tags: [],
      display_name: "Tester",
      avatar_url: null,
    });
    mockedLoadReplyContext.mockResolvedValueOnce(null);

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/records/${ids.parent}/comments`,
      payload: {
        content: "加微看详情",
        moodPhrase: "vx",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      moderation: {
        customMood: true,
        strictReviewRequired: true,
        publicSanitizationApplied: true,
      },
      publishStatus: {
        status: "pending_manual",
      },
    });
  });
});
