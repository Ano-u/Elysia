import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/db.js", () => ({
  query: vi.fn(),
}));

import { universeRoutes } from "../src/routes/universe.js";
import { query } from "../src/lib/db.js";

function makeQueryResult<T>(rows: T[]) {
  return {
    rows,
    rowCount: rows.length,
  } as { rows: T[]; rowCount: number };
}

async function buildApp() {
  const app = Fastify();
  await app.register(universeRoutes);
  return app;
}

describe("universeRoutes", () => {
  const mockedQuery = vi.mocked(query);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("viewport 返回访客脱敏后的内容字段", async () => {
    mockedQuery.mockResolvedValueOnce(
      makeQueryResult([
        {
          id: "reply-1",
          user_id: "user-1",
          mood_phrase: "原始情绪",
          display_mood_phrase: "此刻心情",
          description: "这是一张回复卡片，地点在上海市浦东新区世纪大道88号",
          public_description: "这是一张回复卡片，地点在上海市",
          created_at: "2026-03-24T00:00:00.000Z",
          is_public: true,
          quote: "https://example.com/original",
          public_quote: "[链接已隐藏]",
          public_location_label: "上海市",
          public_occurred_at: "2026-03-01T00:00:00.000Z",
          display_name: "Reply Author",
          avatar_url: null,
          hearts: "2",
          hugs: "1",
          stars: "0",
          butterflies: "0",
          flowers: "0",
          tags: [],
          extra_emotions: ["治愈"],
          is_reply: true,
          parent_record_id: "parent-1",
          root_record_id: "root-1",
          show_parent_arrow: true,
          show_root_arrow: true,
          vx: 12.5,
          vy: -6.25,
          personal_score: 1,
        },
      ]),
    );

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/universe/viewport?x=0&y=-10&w=20&h=20&limit=10",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      viewport: { x: 0, y: -10, w: 20, h: 20 },
      items: [
        {
          id: "reply-1",
          user_id: "user-1",
          mood_phrase: "此刻心情",
          description: "这是一张回复卡片，地点在上海市",
          created_at: "2026-03-24T00:00:00.000Z",
          is_public: true,
          quote: "[链接已隐藏]",
          display_name: "Reply Author",
          avatar_url: null,
          hearts: "2",
          hugs: "1",
          stars: "0",
          butterflies: "0",
          flowers: "0",
          tags: [],
          extra_emotions: ["治愈"],
          sanitized: true,
          public_location_label: "上海市",
          public_occurred_at: "2026-03-01T00:00:00.000Z",
          replyContext: {
            isReply: true,
            parentRecordId: "parent-1",
            rootRecordId: "root-1",
            showParentArrow: true,
            showRootArrow: true,
          },
          coord: { x: 12.5, y: -6.25 },
          personalScore: 1,
        },
      ],
      focus: {
        primary: {
          id: "reply-1",
          user_id: "user-1",
          mood_phrase: "此刻心情",
          description: "这是一张回复卡片，地点在上海市",
          created_at: "2026-03-24T00:00:00.000Z",
          is_public: true,
          quote: "[链接已隐藏]",
          display_name: "Reply Author",
          avatar_url: null,
          hearts: "2",
          hugs: "1",
          stars: "0",
          butterflies: "0",
          flowers: "0",
          tags: [],
          extra_emotions: ["治愈"],
          sanitized: true,
          public_location_label: "上海市",
          public_occurred_at: "2026-03-01T00:00:00.000Z",
          replyContext: {
            isReply: true,
            parentRecordId: "parent-1",
            rootRecordId: "root-1",
            showParentArrow: true,
            showRootArrow: true,
          },
          coord: { x: 12.5, y: -6.25 },
          personalScore: 1,
        },
        secondary: [],
      },
      renderHint: {
        blurFirst: true,
        focusRefreshSeconds: 20,
      },
    });
  });
});
