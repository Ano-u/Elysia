import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "../../lib/api";
import { LiquidCard } from "../../components/ui/LiquidCard";
import {
  readAdminInspirations,
  writeAdminInspirations,
  type AdminInspirationItem,
} from "../../lib/inspirationStore";

type RiskEventStatus = "active" | "released" | "warned" | "banned";
type BanEventStatus = "active" | "lifted";
type AppealStatus = "pending" | "approved" | "rejected";

type ModerationQueueItem = {
  id: string;
  target_type: string;
  target_id: string;
  queue_type: string;
  priority: number;
  reason: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type RiskEventItem = {
  id: string;
  user_id: string;
  record_id: string | null;
  trigger_source: string;
  risk_level: string;
  reason: string;
  status: RiskEventStatus;
  starts_at: string;
  ends_at: string;
  created_at: string;
  resolved_at: string | null;
  resolve_note: string | null;
};

type BanItem = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  violation_type: string;
  reason: string;
  is_permanent: boolean;
  status: BanEventStatus;
  created_at: string;
  lifted_at: string | null;
  lift_reason: string | null;
};

type AppealItem = {
  id: string;
  ban_event_id: string;
  username: string;
  display_name: string;
  appeal_text: string;
  status: AppealStatus;
  resolution_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  ban_reason: string;
};

type AuditLogItem = {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: unknown;
  created_at: string;
};

type AiConfigResponse =
  | {
      configured: false;
    }
  | {
      configured: true;
      config: {
        baseUrl: string;
        endpointType: "responses" | "completions";
        model: string;
        isEnabled: boolean;
        apiKeyMasked: string;
        updatedAt: string;
      };
    };

type AiScanResponse = {
  ok: true;
  runId: string;
  matched: number;
  parsed: number;
  applied: number;
  published?: number;
  pendingManual?: number;
  secondReview?: number;
  riskControl?: number;
};

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as { message?: string; data?: { message?: string } };
  return maybe?.data?.message ?? maybe?.message ?? fallback;
}

const MODERATION_NOTE_TEMPLATES = [
  "内容表达清晰，符合社区规范，允许公开展示。",
  "内容存在边界风险，请按提示修改后重新提交。",
  "内容违反社区规范，当前版本不予通过。",
];

const APPEAL_NOTE_TEMPLATES = [
  "经复核，当前证据不足以维持限制，恢复账号功能。",
  "经复核，原处罚依据充分，维持原裁决。",
  "请后续遵守社区规则，避免再次触发同类限制。",
];

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "moderation" | "access" | "risk" | "bans" | "appeals" | "audit" | "inspirations" | "ai"
  >("moderation");

  return (
    <div className="h-full min-h-0 overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 pt-[88px] text-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-200">
      <div className="mx-auto grid h-full min-h-0 max-w-[1360px] gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="min-h-0 overflow-y-auto rounded-3xl border border-white/45 bg-white/45 p-4 shadow-[var(--shadow-crystal)] backdrop-blur-xl dark:border-white/12 dark:bg-black/20">
          <h2 className="font-elysia-display px-2 text-2xl text-slate-700 dark:text-slate-100">治理控制台</h2>
          <p className="px-2 pt-1 text-xs text-slate-500 dark:text-slate-300/80">温柔治理，清晰裁决。</p>
          <div className="mt-4 flex flex-col gap-1.5">
            <NavButton active={activeTab === "moderation"} onClick={() => setActiveTab("moderation")}>
              审核队列
            </NavButton>
            <NavButton active={activeTab === "access"} onClick={() => setActiveTab("access")}>
              准入申请池
            </NavButton>
            <NavButton active={activeTab === "risk"} onClick={() => setActiveTab("risk")}>
              风控队列
            </NavButton>
            <NavButton active={activeTab === "bans"} onClick={() => setActiveTab("bans")}>
              封禁中心
            </NavButton>
            <NavButton active={activeTab === "appeals"} onClick={() => setActiveTab("appeals")}>
              申诉中心
            </NavButton>
            <NavButton active={activeTab === "audit"} onClick={() => setActiveTab("audit")}>
              审计日志
            </NavButton>
            <NavButton active={activeTab === "inspirations"} onClick={() => setActiveTab("inspirations")}>
              灵感管理
            </NavButton>
            <NavButton active={activeTab === "ai"} onClick={() => setActiveTab("ai")}>
              AI 审核设置
            </NavButton>
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto rounded-3xl border border-white/45 bg-white/42 p-5 shadow-[var(--shadow-crystal)] backdrop-blur-xl dark:border-white/12 dark:bg-black/18">
          {activeTab === "moderation" && <ModerationQueue />}
          {activeTab === "access" && <AccessApplications />}
          {activeTab === "risk" && <RiskQueue />}
          {activeTab === "bans" && <BanCenter />}
          {activeTab === "appeals" && <AppealsCenter />}
          {activeTab === "audit" && <AuditLogs />}
          {activeTab === "inspirations" && <InspirationsManager />}
          {activeTab === "ai" && <AiConfig />}
        </main>
      </div>
    </div>
  );
};

const NavButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`rounded-2xl px-3 py-2.5 text-left text-sm transition-colors ${
      active
        ? "bg-white text-slate-700 shadow-sm dark:bg-white/18 dark:text-white"
        : "text-slate-500 hover:bg-white/70 dark:text-slate-300/80 dark:hover:bg-white/8"
    }`}
  >
    {children}
  </button>
);

const ModerationQueue = () => {
  const queryClient = useQueryClient();
  const [queueType, setQueueType] = useState<"all" | "moderation" | "second_review" | "risk_control" | "media_review">(
    "all",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [batchNote, setBatchNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-moderation-queue", queueType],
    queryFn: () => {
      const params = new URLSearchParams({
        queueStatus: "open",
        limit: "80",
      });
      if (queueType !== "all") {
        params.set("queueType", queueType);
      }
      return fetchApi<{ items: ModerationQueueItem[] }>(`/api/admin/moderation/queue?${params.toString()}`);
    },
  });

  const decisionMutation = useMutation({
    mutationFn: ({
      id,
      decision,
      note,
    }: {
      id: string;
      decision: "approve" | "reject" | "needs_changes" | "second_review" | "risk_control";
      note?: string;
    }) =>
      fetchApi(`/api/admin/moderation/records/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, note }),
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-moderation-queue"] });
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "单条审核操作失败"));
    },
  });

  const batchMutation = useMutation({
    mutationFn: async ({
      items,
      decision,
      note,
    }: {
      items: ModerationQueueItem[];
      decision: "approve" | "reject" | "needs_changes";
      note?: string;
    }) => {
      await Promise.all(
        items.map((item) =>
          fetchApi(`/api/admin/moderation/records/${item.target_id}/decision`, {
            method: "POST",
            body: JSON.stringify({
              decision,
              note: note || "批量裁决",
            }),
          }),
        ),
      );
    },
    onSuccess: () => {
      setError(null);
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["admin-moderation-queue"] });
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "批量审核失败"));
    },
  });

  const items = data?.items ?? [];
  const recordItems = items.filter((item) => item.target_type === "record");
  const allSelectableIds = recordItems.map((item) => item.id);
  const allSelected =
    allSelectableIds.length > 0 && allSelectableIds.every((id) => selected.includes(id));
  const selectedRecordItems = recordItems.filter((item) => selected.includes(item.id));

  if (isLoading) return <div>加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-elysia-display text-3xl text-slate-700 dark:text-slate-100">审核队列</h3>
        <select
          value={queueType}
          onChange={(event) =>
            setQueueType(event.target.value as "all" | "moderation" | "second_review" | "risk_control" | "media_review")
          }
          className="rounded-full border border-white/45 bg-white/60 px-3 py-1.5 text-xs text-slate-600 dark:border-white/12 dark:bg-black/22 dark:text-slate-200"
        >
          <option value="all">全部</option>
          <option value="moderation">文本审核</option>
          <option value="second_review">二次审查</option>
          <option value="risk_control">风控裁决</option>
          <option value="media_review">媒体审核</option>
        </select>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/70 px-4 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/25 dark:text-rose-200">
          {error}
        </div>
      )}

      {recordItems.length > 0 && (
        <LiquidCard className="p-4 bg-white/45 dark:bg-black/22">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300/85">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) =>
                  setSelected(event.target.checked ? allSelectableIds : [])
                }
              />
              全选记录项
            </label>
            <span className="text-xs text-slate-500 dark:text-slate-300/75">已选 {selectedRecordItems.length} 条记录</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={batchNote}
              onChange={(event) => setBatchNote(event.target.value)}
              className="min-w-[240px] flex-1 rounded-full border border-white/45 bg-white/60 px-3 py-2 text-xs outline-none dark:border-white/12 dark:bg-black/22"
              placeholder="批量裁决备注（可选）"
            />
            {MODERATION_NOTE_TEMPLATES.map((template, index) => (
              <button
                key={template}
                type="button"
                onClick={() => setBatchNote(template)}
                className="rounded-full border border-white/45 bg-white/70 px-3 py-1.5 text-xs text-slate-600 hover:bg-white dark:border-white/12 dark:bg-black/22 dark:text-slate-200"
              >
                模板 {index + 1}
              </button>
            ))}
            <button
              type="button"
              disabled={selectedRecordItems.length === 0 || batchMutation.isPending}
              onClick={() =>
                batchMutation.mutate({
                  items: selectedRecordItems,
                  decision: "approve",
                  note: batchNote,
                })
              }
              className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs text-emerald-700 disabled:opacity-50"
            >
              批量通过
            </button>
            <button
              type="button"
              disabled={selectedRecordItems.length === 0 || batchMutation.isPending}
              onClick={() =>
                batchMutation.mutate({
                  items: selectedRecordItems,
                  decision: "needs_changes",
                  note: batchNote,
                })
              }
              className="rounded-full bg-amber-100 px-3 py-1.5 text-xs text-amber-700 disabled:opacity-50"
            >
              批量改修
            </button>
            <button
              type="button"
              disabled={selectedRecordItems.length === 0 || batchMutation.isPending}
              onClick={() =>
                batchMutation.mutate({
                  items: selectedRecordItems,
                  decision: "reject",
                  note: batchNote,
                })
              }
              className="rounded-full bg-rose-100 px-3 py-1.5 text-xs text-rose-700 disabled:opacity-50"
            >
              批量驳回
            </button>
          </div>
        </LiquidCard>
      )}

      {items.length === 0 ? (
        <div className="text-slate-500">当前没有待审核内容。</div>
      ) : (
        <div className="grid gap-4">
          {items.map((typedItem) => {
            const currentNote = notes[typedItem.id] ?? "";
            const isRecord = typedItem.target_type === "record";
            const isSelected = selected.includes(typedItem.id);
            const pending =
              (decisionMutation.isPending && decisionMutation.variables?.id === typedItem.target_id) ||
              batchMutation.isPending;
            return (
              <LiquidCard key={typedItem.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {isRecord && (
                    <label className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300/75">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...new Set([...current, typedItem.id])]
                              : current.filter((id) => id !== typedItem.id),
                          )
                        }
                      />
                      选中
                    </label>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    {typedItem.queue_type}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    P{typedItem.priority}
                  </span>
                </div>
                <p className="mt-2 break-all text-xs text-slate-500 dark:text-slate-300/80">
                  Target: {typedItem.target_id}
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-200/85">{typedItem.reason}</p>
                {typedItem.payload && (
                  <details className="mt-3 rounded-xl border border-white/45 bg-white/55 px-3 py-2 text-xs dark:border-white/12 dark:bg-black/22">
                    <summary className="cursor-pointer text-slate-500 dark:text-slate-300/75">查看载荷</summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-slate-600 dark:text-slate-200/80">
                      {JSON.stringify(typedItem.payload, null, 2)}
                    </pre>
                  </details>
                )}
                {isRecord ? (
                  <>
                    <input
                      value={currentNote}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [typedItem.id]: event.target.value }))
                      }
                      className="mt-3 w-full rounded-full border border-white/45 bg-white/60 px-3 py-2 text-sm outline-none dark:border-white/12 dark:bg-black/22"
                      placeholder="单条处理备注（可选）"
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        disabled={pending}
                        onClick={() =>
                          decisionMutation.mutate({
                            id: typedItem.target_id,
                            decision: "approve",
                            note: currentNote || batchNote || "人工通过",
                          })
                        }
                        className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs text-emerald-700 disabled:opacity-50"
                      >
                        通过
                      </button>
                      <button
                        disabled={pending}
                        onClick={() =>
                          decisionMutation.mutate({
                            id: typedItem.target_id,
                            decision: "needs_changes",
                            note: currentNote || batchNote || "请修改后重提",
                          })
                        }
                        className="rounded-full bg-amber-100 px-3 py-1.5 text-xs text-amber-700 disabled:opacity-50"
                      >
                        修改
                      </button>
                      <button
                        disabled={pending}
                        onClick={() =>
                          decisionMutation.mutate({
                            id: typedItem.target_id,
                            decision: "reject",
                            note: currentNote || batchNote || "内容不符合发布规范",
                          })
                        }
                        className="rounded-full bg-rose-100 px-3 py-1.5 text-xs text-rose-700 disabled:opacity-50"
                      >
                        驳回
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-300/75">该条目请在对应子面板处理。</p>
                )}
              </LiquidCard>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AccessApplications = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-access-apps", status],
    queryFn: () => fetchApi<{ items: Record<string, unknown>[] }>(`/api/admin/access/applications?status=${status}&limit=60`),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: "approve" | "reject"; note?: string }) =>
      fetchApi(`/api/admin/access/applications/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-access-apps"] });
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "准入处理失败"));
    },
  });

  if (isLoading) return <div>加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-elysia-display text-3xl text-slate-700 dark:text-slate-100">准入申请池</h3>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as "pending" | "approved" | "rejected")}
          className="rounded-full border border-white/45 bg-white/60 px-3 py-1.5 text-xs text-slate-600 dark:border-white/12 dark:bg-black/22 dark:text-slate-200"
        >
          <option value="pending">待处理</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
        </select>
      </div>
      {error && (
        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/70 px-4 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/25 dark:text-rose-200">
          {error}
        </div>
      )}
      <div className="grid gap-4">
        {data?.items?.map((item) => {
          const typedItem = item as {
            id: string;
            essay: string;
            status: "pending" | "approved" | "rejected";
            review_note?: string | null;
            submitted_at?: string;
            reviewed_at?: string | null;
          };
          const currentNote = note[typedItem.id] ?? "";
          const pending = actionMutation.isPending && actionMutation.variables?.id === typedItem.id;
          return (
            <LiquidCard key={typedItem.id} className="p-4">
              <p className="text-xs text-slate-500 dark:text-slate-300/75">
                提交于 {formatDateTime(typedItem.submitted_at)} · 状态 {typedItem.status}
              </p>
              <p className="mb-4 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-200/85">{typedItem.essay}</p>
              {typedItem.status === "pending" ? (
                <>
                  <input
                    value={currentNote}
                    onChange={(event) => setNote((current) => ({ ...current, [typedItem.id]: event.target.value }))}
                    className="w-full rounded-full border border-white/45 bg-white/60 px-3 py-2 text-sm outline-none dark:border-white/12 dark:bg-black/22"
                    placeholder="处理备注（可选）"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={pending}
                      onClick={() => actionMutation.mutate({ id: typedItem.id, action: "approve", note: currentNote || "欢迎加入 Elysia" })}
                      className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs text-emerald-700 disabled:opacity-50"
                    >
                      通过
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => actionMutation.mutate({ id: typedItem.id, action: "reject", note: currentNote || "暂不符合准入要求" })}
                      className="rounded-full bg-rose-100 px-3 py-1.5 text-xs text-rose-700 disabled:opacity-50"
                    >
                      驳回
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-300/75">
                  审核于 {formatDateTime(typedItem.reviewed_at)} · 备注: {typedItem.review_note ?? "无"}
                </p>
              )}
            </LiquidCard>
          );
        })}
      </div>
    </div>
  );
};

const RiskQueue = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RiskEventStatus>("active");
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const riskQuery = useQuery({
    queryKey: ["admin-risk-events", status],
    queryFn: () =>
      fetchApi<{ items: RiskEventItem[] }>(`/api/admin/risk-control/events?status=${status}&limit=60`),
  });

  const actionMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      action: "release" | "warn" | "ban_temp" | "ban_permanent";
      note?: string;
      banHours?: number;
    }) =>
      fetchApi(`/api/admin/risk-control/events/${payload.id}/action`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-risk-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-bans"] });
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "风控处理失败"));
    },
  });

  const items = riskQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-elysia-display text-3xl text-slate-700 dark:text-slate-100">风控队列</h3>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as RiskEventStatus)}
          className="rounded-full border border-white/45 bg-white/60 px-3 py-1.5 text-xs text-slate-600 dark:border-white/12 dark:bg-black/22 dark:text-slate-200"
        >
          <option value="active">待处理</option>
          <option value="released">已释放</option>
          <option value="warned">已警告</option>
          <option value="banned">已封禁</option>
        </select>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/70 px-4 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/25 dark:text-rose-200">
          {error}
        </div>
      )}

      {riskQuery.isLoading && <div>加载中...</div>}
      {!riskQuery.isLoading && items.length === 0 && (
        <LiquidCard className="p-6 text-sm text-slate-500 dark:text-slate-300/80">当前状态下没有风控事件。</LiquidCard>
      )}

      <div className="grid gap-4">
        {items.map((item) => {
          const currentNote = note[item.id] ?? item.reason;
          const pending = actionMutation.isPending && actionMutation.variables?.id === item.id;
          return (
            <LiquidCard key={item.id} className="p-4 bg-white/45 dark:bg-black/22">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  风险 {item.risk_level}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  {item.trigger_source}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-300/70">{formatDateTime(item.created_at)}</span>
              </div>
              <p className="mt-2 break-all text-xs text-slate-500 dark:text-slate-300/80">
                用户 {item.user_id} {item.record_id ? `· 记录 ${item.record_id}` : ""}
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-200/85">{item.reason}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-300/80">
                窗口 {formatDateTime(item.starts_at)} - {formatDateTime(item.ends_at)}
              </p>

              {item.status === "active" ? (
                <>
                  <input
                    value={currentNote}
                    onChange={(event) => setNote((current) => ({ ...current, [item.id]: event.target.value }))}
                    className="mt-3 w-full rounded-full border border-white/45 bg-white/60 px-3 py-2 text-sm outline-none dark:border-white/12 dark:bg-black/22"
                    placeholder="处理备注"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => actionMutation.mutate({ id: item.id, action: "release", note: currentNote })}
                      className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs text-emerald-700 disabled:opacity-50"
                    >
                      解除风控
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => actionMutation.mutate({ id: item.id, action: "warn", note: currentNote })}
                      className="rounded-full bg-amber-100 px-3 py-1.5 text-xs text-amber-700 disabled:opacity-50"
                    >
                      仅警告
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        actionMutation.mutate({
                          id: item.id,
                          action: "ban_temp",
                          note: currentNote,
                          banHours: 168,
                        })
                      }
                      className="rounded-full bg-rose-100 px-3 py-1.5 text-xs text-rose-700 disabled:opacity-50"
                    >
                      转 7 天封禁
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-300/75">
                  已处理于 {formatDateTime(item.resolved_at)} · 说明: {item.resolve_note ?? "无"}
                </p>
              )}
            </LiquidCard>
          );
        })}
      </div>
    </div>
  );
};

const BanCenter = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"all" | BanEventStatus>("all");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const bansQuery = useQuery({
    queryKey: ["admin-bans", status],
    queryFn: () =>
      fetchApi<{ items: BanItem[] }>(
        `/api/admin/bans?${status === "all" ? "limit=60" : `status=${status}&limit=60`}`,
      ),
  });

  const liftMutation = useMutation({
    mutationFn: (payload: { id: string; reason: string }) =>
      fetchApi(`/api/admin/bans/${payload.id}/lift`, {
        method: "POST",
        body: JSON.stringify({
          reason: payload.reason,
          liftUser: true,
          liftIp: true,
        }),
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-bans"] });
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "解除封禁失败"));
    },
  });

  const items = bansQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-elysia-display text-3xl text-slate-700 dark:text-slate-100">封禁中心</h3>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | BanEventStatus)}
          className="rounded-full border border-white/45 bg-white/60 px-3 py-1.5 text-xs text-slate-600 dark:border-white/12 dark:bg-black/22 dark:text-slate-200"
        >
          <option value="all">全部</option>
          <option value="active">生效中</option>
          <option value="lifted">已解除</option>
        </select>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/70 px-4 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/25 dark:text-rose-200">
          {error}
        </div>
      )}

      {bansQuery.isLoading && <div>加载中...</div>}
      {!bansQuery.isLoading && items.length === 0 && (
        <LiquidCard className="p-6 text-sm text-slate-500 dark:text-slate-300/80">当前分组下没有封禁记录。</LiquidCard>
      )}

      <div className="grid gap-4">
        {items.map((item) => {
          const currentReason = reason[item.id] ?? "管理员手动解除";
          const pending = liftMutation.isPending && liftMutation.variables?.id === item.id;
          return (
            <LiquidCard key={item.id} className="p-4 bg-white/45 dark:bg-black/22">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  {item.status === "active" ? "封禁生效中" : "已解除"}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  {item.is_permanent ? "永久封禁" : "临时封禁"}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-300/70">{formatDateTime(item.created_at)}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-200/85">
                {item.display_name} (@{item.username}) · {item.violation_type}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-200/85">{item.reason}</p>

              {item.status === "active" ? (
                <>
                  <input
                    value={currentReason}
                    onChange={(event) => setReason((current) => ({ ...current, [item.id]: event.target.value }))}
                    className="mt-3 w-full rounded-full border border-white/45 bg-white/60 px-3 py-2 text-sm outline-none dark:border-white/12 dark:bg-black/22"
                    placeholder="解除理由（2-500 字）"
                  />
                  <button
                    type="button"
                    disabled={pending || currentReason.trim().length < 2}
                    onClick={() => liftMutation.mutate({ id: item.id, reason: currentReason })}
                    className="mt-3 rounded-full bg-emerald-100 px-3 py-1.5 text-xs text-emerald-700 disabled:opacity-50"
                  >
                    解除封禁
                  </button>
                </>
              ) : (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-300/75">
                  解除于 {formatDateTime(item.lifted_at)} · 说明: {item.lift_reason ?? "无"}
                </p>
              )}
            </LiquidCard>
          );
        })}
      </div>
    </div>
  );
};

const AppealsCenter = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AppealStatus>("pending");
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const appealsQuery = useQuery({
    queryKey: ["admin-appeals", status],
    queryFn: () => fetchApi<{ items: AppealItem[] }>(`/api/admin/appeals?status=${status}&limit=60`),
  });

  const approveMutation = useMutation({
    mutationFn: (payload: { id: string; resolutionNote: string }) =>
      fetchApi(`/api/admin/appeals/${payload.id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          liftUser: true,
          liftIp: true,
        }),
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-appeals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-bans"] });
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "通过申诉失败"));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (payload: { id: string; resolutionNote: string }) =>
      fetchApi(`/api/admin/appeals/${payload.id}/reject`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-appeals"] });
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "驳回申诉失败"));
    },
  });

  const items = appealsQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-elysia-display text-3xl text-slate-700 dark:text-slate-100">申诉中心</h3>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as AppealStatus)}
          className="rounded-full border border-white/45 bg-white/60 px-3 py-1.5 text-xs text-slate-600 dark:border-white/12 dark:bg-black/22 dark:text-slate-200"
        >
          <option value="pending">待处理</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
        </select>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/70 px-4 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/25 dark:text-rose-200">
          {error}
        </div>
      )}

      {appealsQuery.isLoading && <div>加载中...</div>}
      {!appealsQuery.isLoading && items.length === 0 && (
        <LiquidCard className="p-6 text-sm text-slate-500 dark:text-slate-300/80">当前分组下没有申诉记录。</LiquidCard>
      )}

      <div className="grid gap-4">
        {items.map((item) => {
          const currentNote = note[item.id] ?? "";
          const pending =
            (approveMutation.isPending && approveMutation.variables?.id === item.id) ||
            (rejectMutation.isPending && rejectMutation.variables?.id === item.id);

          return (
            <LiquidCard key={item.id} className="p-4 bg-white/45 dark:bg-black/22">
              <p className="text-sm text-slate-500 dark:text-slate-300/80">
                {item.display_name} (@{item.username}) · {formatDateTime(item.submitted_at)}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-300/75">封禁原因: {item.ban_reason}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-200/85">{item.appeal_text}</p>

              {item.status === "pending" ? (
                <>
                  <textarea
                    value={currentNote}
                    onChange={(event) => setNote((current) => ({ ...current, [item.id]: event.target.value }))}
                    placeholder="裁决说明（2-500 字）"
                    className="mt-3 min-h-[72px] w-full rounded-2xl border border-white/45 bg-white/60 px-3 py-2 text-sm outline-none dark:border-white/12 dark:bg-black/22"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {APPEAL_NOTE_TEMPLATES.map((template, index) => (
                      <button
                        key={template}
                        type="button"
                        onClick={() =>
                          setNote((current) => ({
                            ...current,
                            [item.id]: template,
                          }))
                        }
                        className="rounded-full border border-white/45 bg-white/70 px-3 py-1 text-xs text-slate-600 hover:bg-white dark:border-white/12 dark:bg-black/22 dark:text-slate-200"
                      >
                        模板 {index + 1}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={pending || currentNote.trim().length < 2}
                      onClick={() => approveMutation.mutate({ id: item.id, resolutionNote: currentNote })}
                      className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs text-emerald-700 disabled:opacity-50"
                    >
                      通过申诉
                    </button>
                    <button
                      type="button"
                      disabled={pending || currentNote.trim().length < 2}
                      onClick={() => rejectMutation.mutate({ id: item.id, resolutionNote: currentNote })}
                      className="rounded-full bg-rose-100 px-3 py-1.5 text-xs text-rose-700 disabled:opacity-50"
                    >
                      驳回申诉
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-300/75">
                  处理于 {formatDateTime(item.reviewed_at)} · 说明: {item.resolution_note ?? "无"}
                </p>
              )}
            </LiquidCard>
          );
        })}
      </div>
    </div>
  );
};

const AuditLogs = () => {
  const [keyword, setKeyword] = useState("");
  const [action, setAction] = useState<string>("all");
  const [rangeHours, setRangeHours] = useState<number>(24);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: () => fetchApi<{ items: AuditLogItem[] }>("/api/admin/analytics/audit-logs"),
  });

  const allActions = Array.from(new Set((data?.items ?? []).map((item) => item.action))).sort();
  const trimmedKeyword = keyword.trim().toLowerCase();
  const latestTimestamp = data?.items?.length ? new Date(data.items[0].created_at).getTime() : NaN;
  const items =
    data?.items.filter((item) => {
      if (action !== "all" && item.action !== action) {
        return false;
      }
      if (rangeHours > 0) {
        const diff = latestTimestamp - new Date(item.created_at).getTime();
        if (Number.isFinite(diff) && diff > rangeHours * 60 * 60 * 1000) {
          return false;
        }
      }
      if (!trimmedKeyword) {
        return true;
      }
      const haystack = `${item.action} ${item.target_type} ${item.target_id ?? ""} ${item.actor_user_id ?? ""}`.toLowerCase();
      return haystack.includes(trimmedKeyword);
    }) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-elysia-display text-3xl text-slate-700 dark:text-slate-100">审计日志</h3>
        <div className="flex flex-wrap gap-2">
          <select
            value={rangeHours}
            onChange={(event) => setRangeHours(Number(event.target.value))}
            className="rounded-full border border-white/45 bg-white/60 px-3 py-1.5 text-xs text-slate-600 dark:border-white/12 dark:bg-black/22 dark:text-slate-200"
          >
            <option value={6}>最近6小时</option>
            <option value={24}>最近24小时</option>
            <option value={72}>最近3天</option>
            <option value={168}>最近7天</option>
            <option value={0}>全部时间</option>
          </select>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="rounded-full border border-white/45 bg-white/60 px-3 py-1.5 text-xs text-slate-600 dark:border-white/12 dark:bg-black/22 dark:text-slate-200"
          >
            <option value="all">全部动作</option>
            {allActions.map((actionItem) => (
              <option key={actionItem} value={actionItem}>
                {actionItem}
              </option>
            ))}
          </select>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索 action / target / actor"
            className="min-w-[220px] rounded-full border border-white/45 bg-white/60 px-3 py-1.5 text-xs text-slate-600 outline-none dark:border-white/12 dark:bg-black/22 dark:text-slate-200"
          />
        </div>
      </div>

      {isLoading && <div>加载中...</div>}
      {!isLoading && items.length === 0 && (
        <LiquidCard className="p-6 text-sm text-slate-500 dark:text-slate-300/80">没有匹配到审计记录。</LiquidCard>
      )}

      <div className="grid gap-3">
        {items.map((item) => (
          <LiquidCard key={item.id} className="p-4 bg-white/45 dark:bg-black/22">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                {item.action}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                {item.target_type}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-300/70">{formatDateTime(item.created_at)}</span>
            </div>
            <p className="mt-2 break-all text-xs text-slate-500 dark:text-slate-300/80">
              actor: {item.actor_user_id ?? "system"} · target: {item.target_id ?? "—"}
            </p>
            <details className="mt-2 rounded-xl border border-white/45 bg-white/55 px-3 py-2 text-xs dark:border-white/12 dark:bg-black/22">
              <summary className="cursor-pointer text-slate-500 dark:text-slate-300/75">查看 payload</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-slate-600 dark:text-slate-200/80">
                {JSON.stringify(item.payload ?? {}, null, 2)}
              </pre>
            </details>
          </LiquidCard>
        ))}
      </div>
    </div>
  );
};

const InspirationsManager = () => {
  const [items, setItems] = useState<AdminInspirationItem[]>(() => readAdminInspirations());
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setItems(readAdminInspirations());
    const onStorage = () => sync();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addInspiration = () => {
    const text = draft.trim();
    if (text.length < 6) {
      setError("灵感文案至少 6 个字。");
      return;
    }
    if (text.length > 120) {
      setError("灵感文案请控制在 120 字以内。");
      return;
    }
    if (items.some((item) => item.text === text)) {
      setError("这条灵感已经存在。");
      return;
    }
    const next = writeAdminInspirations([
      { id: `insp-${Date.now()}`, text, createdAt: new Date().toISOString() },
      ...items,
    ]);
    setItems(next);
    setDraft("");
    setError(null);
  };

  const removeInspiration = (id: string) => {
    const next = writeAdminInspirations(items.filter((item) => item.id !== id));
    setItems(next);
    setError(null);
  };

  return (
    <div className="max-w-3xl space-y-4">
      <h3 className="font-elysia-display text-3xl text-slate-700 dark:text-slate-100">灵感管理</h3>
      <p className="text-sm text-slate-500 dark:text-slate-300/80">
        这里添加的文案会在用户进入 Home 后、7 秒无编辑时自动出现在输入区下方。用户开始编辑后提示会淡出。
      </p>

      <LiquidCard className="p-4 bg-white/45 dark:bg-black/22">
        <textarea
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          placeholder="写一条温柔的灵感提示..."
          className="min-h-[96px] w-full rounded-[1.35rem] border border-white/45 bg-white/60 px-3 py-2 text-sm outline-none dark:border-white/12 dark:bg-black/22"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-300/70">
          <span>建议 6-120 字</span>
          <span>{draft.trim().length} 字</span>
        </div>
        {error && (
          <p className="mt-2 rounded-xl border border-rose-200/70 bg-rose-50/70 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/25 dark:text-rose-200">
            {error}
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={addInspiration}
            className="rounded-full bg-slate-900 px-4 py-2 text-xs text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            添加灵感
          </button>
        </div>
      </LiquidCard>

      <div className="grid gap-3">
        {items.map((item) => (
          <LiquidCard key={item.id} className="p-4 bg-white/45 dark:bg-black/22">
            <p className="text-sm text-slate-600 dark:text-slate-200/90">{item.text}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-slate-400 dark:text-slate-300/70">
                添加于 {formatDateTime(item.createdAt)}
              </span>
              <button
                type="button"
                onClick={() => removeInspiration(item.id)}
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-900/25 dark:text-rose-200 dark:hover:bg-rose-900/35"
              >
                删除
              </button>
            </div>
          </LiquidCard>
        ))}
        {items.length === 0 && (
          <LiquidCard className="p-6 text-sm text-slate-500 dark:text-slate-300/80">还没有灵感文案，先添加一条吧。</LiquidCard>
        )}
      </div>
    </div>
  );
};

const AiConfig = () => {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState({
    baseUrl: "",
    apiKey: "",
    endpointType: "" as "" | "responses" | "completions",
    model: "",
    isEnabled: null as boolean | null,
  });
  const [scanResult, setScanResult] = useState<AiScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["admin-ai-config"],
    queryFn: () => fetchApi<AiConfigResponse>("/api/admin/ai-review/config"),
  });
  const currentConfig = configQuery.data?.configured ? configQuery.data.config : null;
  const resolvedBaseUrl = config.baseUrl.trim() || currentConfig?.baseUrl || "https://api.openai.com/v1";
  const resolvedEndpointType = (config.endpointType || currentConfig?.endpointType || "responses") as
    | "responses"
    | "completions";
  const resolvedModel = config.model.trim() || currentConfig?.model || "gpt-5-mini";
  const resolvedEnabled = config.isEnabled ?? currentConfig?.isEnabled ?? true;

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchApi("/api/admin/ai-review/config", {
        method: "PUT",
        body: JSON.stringify({
          baseUrl: resolvedBaseUrl,
          endpointType: resolvedEndpointType,
          model: resolvedModel,
          isEnabled: resolvedEnabled,
          apiKey: config.apiKey.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-ai-config"] });
      setConfig((current) => ({ ...current, apiKey: "" }));
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "配置保存失败"));
    },
  });

  const scanMutation = useMutation({
    mutationFn: () => fetchApi<AiScanResponse>("/api/admin/ai-review/scan-recent", { method: "POST" }),
    onSuccess: (result) => {
      setError(null);
      setScanResult(result);
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "扫描失败"));
    },
  });

  return (
    <div className="max-w-xl space-y-6">
      <h3 className="font-elysia-display text-3xl text-slate-700 dark:text-slate-100">AI 审核设置</h3>
      {error && (
        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/70 px-4 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/25 dark:text-rose-200">
          {error}
        </div>
      )}
      {scanResult && (
        <LiquidCard className="p-4 text-sm text-slate-600 dark:text-slate-200/85">
          扫描结果: 匹配 {scanResult.matched} 条，解析 {scanResult.parsed} 条，应用 {scanResult.applied} 条。
        </LiquidCard>
      )}
      <div className="space-y-4">
        <input
          value={resolvedBaseUrl}
          onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
          className="w-full rounded-xl border border-white/45 bg-white/60 p-2 text-sm dark:border-white/12 dark:bg-black/22"
          placeholder="Base URL"
        />
        <select
          value={resolvedEndpointType}
          onChange={(e) =>
            setConfig({
              ...config,
              endpointType: e.target.value as "responses" | "completions",
            })
          }
          className="w-full rounded-xl border border-white/45 bg-white/60 p-2 text-sm dark:border-white/12 dark:bg-black/22"
        >
          <option value="responses">responses</option>
          <option value="completions">completions</option>
        </select>
        <input
          type="password"
          value={config.apiKey}
          onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
          className="w-full rounded-xl border border-white/45 bg-white/60 p-2 text-sm dark:border-white/12 dark:bg-black/22"
          placeholder="API Key（留空不修改）"
        />
        <input
          value={resolvedModel}
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
          className="w-full rounded-xl border border-white/45 bg-white/60 p-2 text-sm dark:border-white/12 dark:bg-black/22"
          placeholder="Model"
        />
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300/85">
          <input
            type="checkbox"
            checked={resolvedEnabled}
            onChange={(e) => setConfig({ ...config, isEnabled: e.target.checked })}
          />
          启用 AI 审核
        </label>
        {currentConfig && (
          <p className="text-xs text-slate-500 dark:text-slate-300/75">
            当前密钥: {currentConfig.apiKeyMasked} · 更新于 {formatDateTime(currentConfig.updatedAt)}
          </p>
        )}
        <div className="flex gap-4 pt-2">
          <button onClick={() => saveMutation.mutate()} className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white">
            保存配置
          </button>
          <button onClick={() => scanMutation.mutate()} className="rounded-full bg-pink-100 px-4 py-2 text-sm text-pink-700">
            手动扫描最近1小时
          </button>
        </div>
      </div>
    </div>
  );
};
