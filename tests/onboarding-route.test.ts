import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/auth.js", () => ({
  requireUser: vi.fn(),
}));

vi.mock("../src/lib/db.js", () => ({
  query: vi.fn(),
}));

import { requireUser } from "../src/lib/auth.js";
import { query } from "../src/lib/db.js";
import { nudgeRoutes } from "../src/routes/nudges.js";

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
  await app.register(nudgeRoutes);
  return app;
}

describe("nudgeRoutes onboarding guide", () => {
  const mockedRequireUser = vi.mocked(requireUser);
  const mockedQuery = vi.mocked(query);
  const originalForceShow = process.env.ONBOARDING_FORCE_SHOW;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireUser.mockResolvedValue(makeUser());
    process.env.NODE_ENV = "test";
    process.env.ONBOARDING_FORCE_SHOW = "false";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ONBOARDING_FORCE_SHOW = originalForceShow;
  });

  it("forces the first entry when the user has never sent content", async () => {
    mockedQuery
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce(
        makeQueryResult([
          {
            current_day: 1,
            completed_days: [],
            last_completed_at: null,
            metadata: {},
          },
        ]),
      )
      .mockResolvedValueOnce(makeQueryResult([{ sent_count: "0" }]))
      .mockResolvedValueOnce(makeQueryResult([]));

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/onboarding/progress?entryId=entry-1",
    });
    await app.close();
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      guide: {
        version: "home-guide-v3",
        display: {
          shouldShow: true,
          allowSkip: false,
          forceBlocking: true,
          reason: "first_entry_without_content",
        },
        draftTemplate: {
          visibilityIntent: "public",
          expectedPublishStatus: "published",
        },
        state: {
          entryCount: 1,
          lastEntryId: "entry-1",
        },
      },
      contentState: {
        hasSentAnyContent: false,
        sentContentCount: 0,
      },
    });
    expect(payload.guide.draftTemplate.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "moodPhrase", value: "Hello Elysia！" }),
        expect.objectContaining({ key: "quote", value: "欢迎来到往世乐土！" }),
        expect.objectContaining({ key: "description" }),
      ]),
    );
  });

  it("allows skipping on a later entry if the user still has no content", async () => {
    mockedQuery
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce(
        makeQueryResult([
          {
            current_day: 1,
            completed_days: [],
            last_completed_at: null,
            metadata: {
              guide: {
                entryCount: 1,
                lastEntryId: "entry-1",
                version: "home-guide-v2",
              },
            },
          },
        ]),
      )
      .mockResolvedValueOnce(makeQueryResult([{ sent_count: "0" }]))
      .mockResolvedValueOnce(makeQueryResult([]));

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/onboarding/progress?entryId=entry-2",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      guide: {
        display: {
          shouldShow: true,
          allowSkip: true,
          forceBlocking: false,
          reason: "returning_without_content",
        },
        state: {
          entryCount: 2,
          lastEntryId: "entry-2",
        },
      },
    });
  });

  it("rejects skip attempts on the first mandatory entry", async () => {
    mockedQuery
      .mockResolvedValueOnce(
        makeQueryResult([
          {
            metadata: {
              guide: {
                entryCount: 1,
                lastEntryId: "entry-1",
              },
            },
          },
        ]),
      )
      .mockResolvedValueOnce(makeQueryResult([{ sent_count: "0" }]));

    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/onboarding/guide-state",
      payload: {
        skippedAt: "2026-03-28T08:00:00.000Z",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: "首次进入且尚未发送任何内容时，当前引导不能跳过。",
      code: "ONBOARDING_SKIP_DISABLED",
    });
    expect(mockedQuery).toHaveBeenCalledTimes(2);
  });

  it("still shows the guide in local debug mode even after content exists", async () => {
    process.env.ONBOARDING_FORCE_SHOW = "true";

    mockedQuery
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce(
        makeQueryResult([
          {
            current_day: 2,
            completed_days: [1],
            last_completed_at: "2026-03-27T08:00:00.000Z",
            metadata: {
              guide: {
                entryCount: 3,
                completedAt: "2026-03-27T08:10:00.000Z",
              },
            },
          },
        ]),
      )
      .mockResolvedValueOnce(makeQueryResult([{ sent_count: "2" }]));

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/onboarding/progress?entryId=debug-entry",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      guide: {
        display: {
          shouldShow: true,
          allowSkip: true,
          forceBlocking: false,
          reason: "local_debug",
          localDebugForceShow: true,
        },
      },
      contentState: {
        hasSentAnyContent: true,
        sentContentCount: 2,
      },
    });
  });
});
