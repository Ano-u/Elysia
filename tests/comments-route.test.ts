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
  buildRecordSummaryPayload: vi.fn(({ summary, replyContext }) => ({
    id: summary.id,
    user_id: summary.user_id,
    mood_phrase: summary.mood_phrase,
    description: summary.description,
    visibility_intent: summary.visibility_intent,
    publication_status: summary.publication_status,
    is_public: summary.is_public,
    created_at: summary.created_at,
    updated_at: summary.updated_at,
    replyContext,
  })),
  loadRecordSummary: vi.fn(),
  loadReplyContext: vi.fn(),
}));

import { commentsRoutes } from "../src/routes/comments.js";
import { requireAccessApproved, requireNotInRiskControl } from "../src/lib/auth.js";
import { query, withTransaction } from "../src/lib/db.js";
import { broadcast } from "../src/lib/realtime.js";
import { writeAuditLog } from "../src/lib/audit.js";
import {
  applyPublicationDecision,
  createRecordRevision,
  buildRiskSummary,
} from "../src/lib/record-publication.js";
import { loadRecordSummary, loadReplyContext } from "../src/lib/record-views.js";

const ids = {
  root: "11111111-1111-4111-8111-111111111111",
  parent: "22222222-2222-4222-8222-222222222222",
  parentReply: "33333333-3333-4333-8333-333333333333",
  publicReply: "44444444-4444-4444-8444-444444444444",
  nestedReply: "55555555-5555-4555-8555-555555555555",
  privateParent: "66666666-6666-4666-8666-666666666666",
  privateReply: "77777777-7777-4777-8777-777777777777",
  comment1: "88888888-8888-4888-8888-888888888888",
  comment2: "99999999-9999-4999-8999-999999999999",
  comment3: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
  const mockedBroadcast = vi.mocked(broadcast);
  const mockedWriteAuditLog = vi.mocked(writeAuditLog);
  const mockedCreateRecordRevision = vi.mocked(createRecordRevision);
  const mockedApplyPublicationDecision = vi.mocked(applyPublicationDecision);
  const mockedBuildRiskSummary = vi.mocked(buildRiskSummary);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireAccessApproved.mockResolvedValue(approvedUser);
    mockedRequireNotInRiskControl.mockResolvedValue(approvedUser);
    mockedCreateRecordRevision.mockResolvedValue(1);
    mockedApplyPublicationDecision.mockResolvedValue({
      riskControlEventId: null,
      riskControlEndsAt: null,
    });
    mockedBuildRiskSummary.mockReturnValue({ level: "very_low" });
  });

  it("creates a public reply card for a published main post", async () => {
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
              content: "这是一条回复",
              parent_record_id: ids.parent,
              root_record_id: ids.parent,
              created_at: "2026-03-24T00:00:00.000Z",
            },
          ]),
        )
        .mockResolvedValueOnce(makeQueryResult([{ id: ids.publicReply }]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([{ id: "node-reply" }])),
    };
    mockedWithTransaction.mockImplementation(async (handler) => handler(client as any));
    mockedLoadRecordSummary.mockResolvedValueOnce({
      id: ids.publicReply,
      user_id: "user-1",
      mood_phrase: "回复标题",
      description: "补充描述",
      is_public: true,
      visibility_intent: "public",
      publication_status: "published",
      publish_requested_at: "2026-03-24T00:00:00.000Z",
      published_at: "2026-03-24T00:00:00.000Z",
      risk_summary: {},
      review_notes: null,
      occurred_at: null,
      location_id: null,
      edit_deadline_at: "2026-04-23T00:00:00.000Z",
      created_at: "2026-03-24T00:00:00.000Z",
      updated_at: "2026-03-24T00:00:00.000Z",
      source_record_id: ids.parent,
      source_comment_id: ids.comment1,
      quote: null,
      extra_emotions: ["平静"],
      tags: [],
      display_name: "Tester",
      avatar_url: null,
    });
    mockedLoadReplyContext.mockResolvedValueOnce({
      content: "这是一条回复",
      parentRecordId: ids.parent,
      rootRecordId: ids.parent,
      parentTarget: null,
      rootTarget: null,
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/records/${ids.parent}/comments`,
      payload: {
        content: "这是一条回复",
        moodPhrase: "回复标题",
        description: "补充描述",
        extraEmotions: ["平静"],
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      comment: {
        id: ids.comment1,
        content: "这是一条回复",
        parentRecordId: ids.parent,
        rootRecordId: ids.parent,
      },
      record: {
        id: ids.publicReply,
        mood_phrase: "回复标题",
        is_public: true,
        publication_status: "published",
      },
      publishStatus: {
        status: "published",
        label: "已公开",
      },
    });
    expect(mockedRequireNotInRiskControl).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO record_links"),
      [ids.publicReply, ids.parent, "user-1"],
    );
    expect(mockedBroadcast).toHaveBeenCalledWith(
      "record.created",
      expect.objectContaining({
        recordId: ids.publicReply,
        parentRecordId: ids.parent,
        rootRecordId: ids.parent,
        event: "reply_created",
      }),
    );
    expect(mockedWriteAuditLog).toHaveBeenCalled();
  });

  it("creates a nested reply with both parent and root links", async () => {
    mockedQuery.mockResolvedValueOnce(
      makeQueryResult([
        {
          id: ids.parentReply,
          user_id: "author-2",
          mood_phrase: "上一层回复",
          is_public: true,
          publication_status: "published",
          root_record_id: ids.root,
        },
      ]),
    );

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(
          makeQueryResult([
            {
              id: ids.comment2,
              record_id: ids.parentReply,
              user_id: "user-1",
              content: "继续回复",
              parent_record_id: ids.parentReply,
              root_record_id: ids.root,
              created_at: "2026-03-24T01:00:00.000Z",
            },
          ]),
        )
        .mockResolvedValueOnce(makeQueryResult([{ id: ids.nestedReply }]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(
          makeQueryResult([
            { id: "node-parent", record_id: ids.parentReply },
            { id: "node-root", record_id: ids.root },
          ]),
        )
        .mockResolvedValueOnce(makeQueryResult([{ id: "node-reply" }]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([])),
    };
    mockedWithTransaction.mockImplementation(async (handler) => handler(client as any));
    mockedLoadRecordSummary.mockResolvedValueOnce({
      id: ids.nestedReply,
      user_id: "user-1",
      mood_phrase: "二级回复标题",
      description: null,
      is_public: true,
      visibility_intent: "public",
      publication_status: "published",
      publish_requested_at: "2026-03-24T01:00:00.000Z",
      published_at: "2026-03-24T01:00:00.000Z",
      risk_summary: {},
      review_notes: null,
      occurred_at: null,
      location_id: null,
      edit_deadline_at: "2026-04-23T01:00:00.000Z",
      created_at: "2026-03-24T01:00:00.000Z",
      updated_at: "2026-03-24T01:00:00.000Z",
      source_record_id: ids.parentReply,
      source_comment_id: ids.comment2,
      quote: null,
      extra_emotions: [],
      tags: [],
      display_name: "Tester",
      avatar_url: null,
    });
    mockedLoadReplyContext.mockResolvedValueOnce({
      content: "继续回复",
      parentRecordId: ids.parentReply,
      rootRecordId: ids.root,
      parentTarget: null,
      rootTarget: null,
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/records/${ids.parentReply}/comments`,
      payload: {
        content: "继续回复",
        moodPhrase: "二级回复标题",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().comment).toMatchObject({
      parentRecordId: ids.parentReply,
      rootRecordId: ids.root,
    });
    expect(client.query.mock.calls).toEqual(
      expect.arrayContaining([
        [expect.stringContaining("INSERT INTO record_links"), [ids.nestedReply, ids.parentReply, "user-1"]],
        [expect.stringContaining("INSERT INTO record_links"), [ids.nestedReply, ids.root, "user-1"]],
        [expect.stringContaining("INSERT INTO mindmap_edges"), ["node-reply", "node-parent"]],
        [expect.stringContaining("INSERT INTO mindmap_edges"), ["node-reply", "node-root"]],
      ]),
    );
  });

  it("allows private replies without running the risk-control gate", async () => {
    mockedQuery.mockResolvedValueOnce(
      makeQueryResult([
        {
          id: ids.privateParent,
          user_id: "author-3",
          mood_phrase: "公开主帖",
          is_public: true,
          publication_status: "published",
          root_record_id: ids.privateParent,
        },
      ]),
    );

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(
          makeQueryResult([
            {
              id: ids.comment3,
              record_id: ids.privateParent,
              user_id: "user-1",
              content: "悄悄回复",
              parent_record_id: ids.privateParent,
              root_record_id: ids.privateParent,
              created_at: "2026-03-24T02:00:00.000Z",
            },
          ]),
        )
        .mockResolvedValueOnce(makeQueryResult([{ id: ids.privateReply }]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([{ id: "node-reply" }])),
    };
    mockedWithTransaction.mockImplementation(async (handler) => handler(client as any));
    mockedLoadRecordSummary.mockResolvedValueOnce({
      id: ids.privateReply,
      user_id: "user-1",
      mood_phrase: "私密回复",
      description: null,
      is_public: false,
      visibility_intent: "private",
      publication_status: "private",
      publish_requested_at: null,
      published_at: null,
      risk_summary: {},
      review_notes: null,
      occurred_at: null,
      location_id: null,
      edit_deadline_at: "2026-04-23T02:00:00.000Z",
      created_at: "2026-03-24T02:00:00.000Z",
      updated_at: "2026-03-24T02:00:00.000Z",
      source_record_id: ids.privateParent,
      source_comment_id: ids.comment3,
      quote: null,
      extra_emotions: [],
      tags: [],
      display_name: "Tester",
      avatar_url: null,
    });
    mockedLoadReplyContext.mockResolvedValueOnce({
      content: "悄悄回复",
      parentRecordId: ids.privateParent,
      rootRecordId: ids.privateParent,
      parentTarget: null,
      rootTarget: null,
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/records/${ids.privateParent}/comments`,
      payload: {
        content: "悄悄回复",
        moodPhrase: "私密回复",
        isPublic: false,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().publishStatus).toEqual({
      status: "private",
      label: "仅自己可见",
    });
    expect(mockedRequireNotInRiskControl).not.toHaveBeenCalled();
  });
});
