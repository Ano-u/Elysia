import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/auth.js", () => ({
  requireUser: vi.fn(),
}));

vi.mock("../src/lib/db.js", () => ({
  query: vi.fn(),
}));

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn(),
}));

import { mindmapRoutes } from "../src/routes/mindmap.js";
import { requireUser } from "../src/lib/auth.js";
import { query } from "../src/lib/db.js";

function makeQueryResult<T>(rows: T[]) {
  return {
    rows,
    rowCount: rows.length,
  } as { rows: T[]; rowCount: number };
}

function makeUser() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
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

async function buildApp() {
  const app = Fastify();
  await app.register(mindmapRoutes);
  return app;
}

describe("mindmapRoutes /mindmap/me", () => {
  const mockedRequireUser = vi.mocked(requireUser);
  const mockedQuery = vi.mocked(query);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireUser.mockResolvedValue(makeUser());
  });

  it("returns spiral-ready nodes with self reply and star reply context", async () => {
    mockedQuery.mockResolvedValueOnce(
      makeQueryResult([
        {
          node_id: "node-star",
          record_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          mood_phrase: "晨光会抵达",
          label: "晨光会抵达",
          created_at: "2026-03-22T08:00:00.000Z",
          reply_content: "我听见你啦",
          parent_record_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          root_record_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          is_self_reply: false,
        },
        {
          node_id: "node-self",
          record_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          mood_phrase: "写给昨天的自己",
          label: "写给昨天的自己",
          created_at: "2026-03-21T08:00:00.000Z",
          reply_content: "继续前进",
          parent_record_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          root_record_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          is_self_reply: true,
        },
        {
          node_id: "node-root",
          record_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          mood_phrase: "晨光会抵达",
          label: "晨光会抵达",
          created_at: "2026-03-20T08:00:00.000Z",
          reply_content: null,
          parent_record_id: null,
          root_record_id: null,
          is_self_reply: false,
        },
      ]),
    );
    mockedQuery.mockResolvedValueOnce(
      makeQueryResult([
        {
          record_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          tag: "希望",
        },
        {
          record_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          tag: "希望",
        },
      ]),
    );
    mockedQuery.mockResolvedValueOnce(
      makeQueryResult([
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          user_id: "11111111-1111-4111-8111-111111111111",
          mood_phrase: "晨光会抵达",
          quote: null,
          is_public: false,
          publication_status: "private",
          created_at: "2026-03-20T08:00:00.000Z",
          display_name: "Tester",
          avatar_url: null,
        },
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          user_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          mood_phrase: "有人在吗？",
          quote: null,
          is_public: true,
          publication_status: "published",
          created_at: "2026-03-22T01:00:00.000Z",
          display_name: "伊甸",
          avatar_url: "https://example.com/eden.png",
        },
      ]),
    );

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/mindmap/me?mode=deep",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mode: "deep",
      nodes: [
        {
          id: "node-star",
          recordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          type: "record",
          label: "晨光会抵达",
          createdAt: "2026-03-22T08:00:00.000Z",
          isSelfReply: false,
          replyContext: {
            isReply: true,
            content: "我听见你啦",
            parentRecordId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            rootRecordId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            parentTarget: {
              id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              moodPhrase: "有人在吗？",
              author: {
                id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                displayName: "伊甸",
                avatarUrl: "https://example.com/eden.png",
              },
            },
          },
        },
        {
          id: "node-self",
          recordId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          isSelfReply: true,
          replyContext: {
            parentRecordId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            parentTarget: {
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              moodPhrase: "晨光会抵达",
              author: {
                id: "11111111-1111-4111-8111-111111111111",
                displayName: "Tester",
                avatarUrl: null,
              },
            },
          },
        },
        {
          id: "node-root",
          recordId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          isSelfReply: false,
          replyContext: null,
        },
      ],
      edges: [
        {
          id: "self:node-self:node-root",
          source: "node-self",
          target: "node-root",
          type: "self_reply",
          strength: 1,
        },
        {
          id: "theme:node-root:node-star",
          source: "node-star",
          target: "node-root",
          type: "theme_link",
          strength: 0.7,
        },
      ],
      hints: {
        layout: "spiral-bloom",
        selfReplyClusters: true,
        hoverReplyGhosts: true,
      },
    });
  });

  it("returns a focus-centered spiral projection for a specific record", async () => {
    mockedQuery.mockResolvedValueOnce(
      makeQueryResult([
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          user_id: "99999999-9999-4999-8999-999999999999",
          mood_phrase: "同一片天空",
          is_public: true,
          publication_status: "published",
        },
      ]),
    );
    mockedQuery.mockResolvedValueOnce(
      makeQueryResult([
        { record_id: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
        { record_id: "12121212-1212-4212-8212-121212121212" },
        { record_id: "34343434-3434-4343-8343-343434343434" },
      ]),
    );
    mockedQuery.mockResolvedValueOnce(
      makeQueryResult([
        {
          node_id: "node-child",
          record_id: "12121212-1212-4212-8212-121212121212",
          mood_phrase: "再次回应",
          label: "再次回应",
          created_at: "2026-03-21T08:00:00.000Z",
          reply_content: "我还在这里",
          parent_record_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          root_record_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          is_self_reply: true,
        },
        {
          node_id: "node-focus",
          record_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          mood_phrase: "同一片天空",
          label: "同一片天空",
          created_at: "2026-03-20T08:00:00.000Z",
          reply_content: null,
          parent_record_id: null,
          root_record_id: null,
          is_self_reply: false,
        },
        {
          node_id: "node-theme",
          record_id: "34343434-3434-4343-8343-343434343434",
          mood_phrase: "同一片天空",
          label: "同一片天空",
          created_at: "2026-03-18T08:00:00.000Z",
          reply_content: null,
          parent_record_id: null,
          root_record_id: null,
          is_self_reply: false,
        },
      ]),
    );
    mockedQuery.mockResolvedValueOnce(makeQueryResult([]));
    mockedQuery.mockResolvedValueOnce(
      makeQueryResult([
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          user_id: "99999999-9999-4999-8999-999999999999",
          mood_phrase: "同一片天空",
          quote: null,
          is_public: true,
          publication_status: "published",
          created_at: "2026-03-20T08:00:00.000Z",
          display_name: "Another User",
          avatar_url: null,
        },
      ]),
    );

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/mindmap/ffffffff-ffff-4fff-8fff-ffffffffffff?mode=simple",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mode: "simple",
      focusRecordId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      nodes: [
        {
          id: "node-child",
          recordId: "12121212-1212-4212-8212-121212121212",
          isSelfReply: true,
          replyContext: {
            parentRecordId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            parentTarget: {
              id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
              moodPhrase: "同一片天空",
            },
          },
        },
        {
          id: "node-focus",
          recordId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          isFocus: true,
          isSelfReply: false,
          replyContext: null,
        },
        {
          id: "node-theme",
          recordId: "34343434-3434-4343-8343-343434343434",
          isSelfReply: false,
          replyContext: null,
        },
      ],
      edges: [
        {
          id: "self:node-child:node-focus",
          source: "node-child",
          target: "node-focus",
          type: "self_reply",
          strength: 1,
        },
        {
          id: "theme:node-focus:node-theme",
          source: "node-focus",
          target: "node-theme",
          type: "theme_link",
          strength: 0.52,
        },
      ],
      hints: {
        layout: "spiral-bloom",
        selfReplyClusters: true,
        hoverReplyGhosts: true,
        focusRecordId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      },
    });
  });
});
