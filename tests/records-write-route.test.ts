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
  applyPublicationDecision: vi.fn(() => Promise.resolve({ riskControlEventId: null, riskControlEndsAt: null })),
  buildRiskSummary: vi.fn(() => ({ level: "medium" })),
  createRecordRevision: vi.fn(() => Promise.resolve(1)),
  parseRecordVisibilityIntent: vi.fn((isPublic?: boolean) => (isPublic ? "public" : "private")),
  publicationLabel: vi.fn((status: string) => status),
}));

vi.mock("../src/lib/record-views.js", () => ({
  buildRecordAuthorPayload: vi.fn(),
  loadRecordSummary: vi.fn(),
  loadReplyContext: vi.fn(),
}));

vi.mock("../src/lib/mindmap-records.js", () => ({
  syncRecordMindMapNode: vi.fn(() => Promise.resolve("node-record")),
}));

import { recordsRoutes } from "../src/routes/records.js";
import { requireAccessApproved, requireNotInRiskControl } from "../src/lib/auth.js";
import { query, withTransaction } from "../src/lib/db.js";
import { createRecordRevision, applyPublicationDecision } from "../src/lib/record-publication.js";

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
  await app.register(recordsRoutes);
  return app;
}

describe("recordsRoutes write paths", () => {
  const approvedUser = makeUser();
  const mockedRequireAccessApproved = vi.mocked(requireAccessApproved);
  const mockedRequireNotInRiskControl = vi.mocked(requireNotInRiskControl);
  const mockedQuery = vi.mocked(query);
  const mockedWithTransaction = vi.mocked(withTransaction);
  const mockedCreateRecordRevision = vi.mocked(createRecordRevision);
  const mockedApplyPublicationDecision = vi.mocked(applyPublicationDecision);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireAccessApproved.mockResolvedValue(approvedUser);
    mockedRequireNotInRiskControl.mockResolvedValue(approvedUser);
    mockedCreateRecordRevision.mockResolvedValue(1);
    mockedApplyPublicationDecision.mockResolvedValue({
      riskControlEventId: null,
      riskControlEndsAt: null,
    });
  });

  it("keeps the title independent from a custom emotion on create", async () => {
    mockedQuery.mockResolvedValueOnce(makeQueryResult([{ image_count: "0" }]));

    const recordRow = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: approvedUser.id,
      mood_phrase: "标题还是标题",
      mood_mode: "custom" as const,
      custom_mood_phrase: "松弛",
      description: null,
      is_public: false,
      visibility_intent: "private" as const,
      publication_status: "pending_manual",
      publish_requested_at: null,
      published_at: null,
      risk_summary: { level: "medium" },
      review_notes: null,
      occurred_at: null,
      location_id: null,
      edit_deadline_at: "2026-04-28T00:00:00.000Z",
      created_at: "2026-03-28T00:00:00.000Z",
      updated_at: "2026-03-28T00:00:00.000Z",
    };

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(makeQueryResult([recordRow]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([recordRow])),
    };
    mockedWithTransaction.mockImplementation(async (handler) => handler(client as any));

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/records",
      payload: {
        moodPhrase: "标题还是标题",
        moodMode: "custom",
        customMoodPhrase: "松弛",
        extraEmotions: ["平静"],
        isPublic: false,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(client.query.mock.calls[0]?.[1]).toEqual([
      approvedUser.id,
      "标题还是标题",
      null,
      false,
      "private",
      "pending_manual",
      expect.any(String),
      null,
      null,
      "custom",
      "松弛",
    ]);
    expect(client.query.mock.calls).toEqual(
      expect.arrayContaining([
        [expect.stringContaining("INSERT INTO record_emotions"), [recordRow.id, "平静"]],
        [expect.stringContaining("INSERT INTO record_emotions"), [recordRow.id, "松弛"]],
      ]),
    );
    expect(mockedCreateRecordRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          moodPhrase: "标题还是标题",
          moodMode: "custom",
          customMoodPhrase: "松弛",
          extraEmotions: ["平静", "松弛"],
        }),
      }),
    );
    expect(mockedApplyPublicationDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        moodMode: "custom",
        customMoodPhrase: "松弛",
      }),
    );
  });

  it("treats submitted extraEmotions as authoritative when editing", async () => {
    mockedQuery.mockResolvedValueOnce(
      makeQueryResult([
        {
          id: "22222222-2222-4222-8222-222222222222",
          user_id: approvedUser.id,
          mood_phrase: "旧标题",
          mood_mode: "custom" as const,
          custom_mood_phrase: "松弛",
          description: null,
          is_public: false,
          visibility_intent: "private" as const,
          publication_status: "pending_manual",
          publish_requested_at: null,
          published_at: null,
          risk_summary: {},
          review_notes: null,
          occurred_at: null,
          location_id: null,
          edit_deadline_at: "2026-04-28T00:00:00.000Z",
          created_at: "2026-03-28T00:00:00.000Z",
          updated_at: "2026-03-28T00:00:00.000Z",
        },
      ]),
    );

    const updatedRow = {
      id: "22222222-2222-4222-8222-222222222222",
      user_id: approvedUser.id,
      mood_phrase: "新标题",
      mood_mode: "preset" as const,
      custom_mood_phrase: null,
      description: null,
      is_public: false,
      visibility_intent: "private" as const,
      publication_status: "private",
      publish_requested_at: null,
      published_at: null,
      risk_summary: { level: "very_low" },
      review_notes: null,
      occurred_at: null,
      location_id: null,
      edit_deadline_at: "2026-04-28T00:00:00.000Z",
      created_at: "2026-03-28T00:00:00.000Z",
      updated_at: "2026-03-28T01:00:00.000Z",
    };

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(
          makeQueryResult([
            {
              id: updatedRow.id,
              user_id: approvedUser.id,
              mood_phrase: "旧标题",
              description: null,
              quote: null,
              extra_emotions: ["平静", "松弛"],
              tags: [],
              has_images: false,
              visibility_intent: "private",
              occurred_at: null,
              location_id: null,
              mood_mode: "custom",
              custom_mood_phrase: "松弛",
            },
          ]),
        )
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([updatedRow])),
    };
    mockedWithTransaction.mockImplementation(async (handler) => handler(client as any));

    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/records/${updatedRow.id}`,
      payload: {
        moodPhrase: "新标题",
        extraEmotions: ["希望"],
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(client.query.mock.calls[1]?.[1]?.[1]).toBe("新标题");
    expect(client.query.mock.calls[1]?.[1]?.[9]).toBe("preset");
    expect(client.query.mock.calls[1]?.[1]?.[11]).toBeNull();
    expect(client.query.mock.calls).toEqual(
      expect.arrayContaining([
        [expect.stringContaining("DELETE FROM record_emotions"), [updatedRow.id]],
        [expect.stringContaining("INSERT INTO record_emotions"), [updatedRow.id, "希望"]],
      ]),
    );
    expect(mockedCreateRecordRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          moodPhrase: "新标题",
          moodMode: "preset",
          customMoodPhrase: null,
          extraEmotions: ["希望"],
        }),
      }),
    );
  });
});
