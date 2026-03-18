import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createRecord, getNudgeRecommendations, submitNudgeFeedback } from "../../lib/apiClient";
import type { VisibilityIntent } from "../../types/api";

type DraftPayload = {
  moodPhrase: string;
  quote: string;
  description: string;
  extraEmotions: string[];
  occurredAt: string;
  visibilityIntent: VisibilityIntent;
};

const DRAFT_KEY = "elysia-home-draft-v2";
const INSPIRATIONS = [
  "先写一小句: 今天的我，想被温柔地抱一下。",
  "先记一个词也好: 花、光、想念、勇气。",
  "把最真实的那一瞬交给礼堂，它会替你珍藏。",
  "不必完美，真诚地写下，就已经很美了。",
];

function pickFallbackInspiration(): string {
  return INSPIRATIONS[Math.floor(Math.random() * INSPIRATIONS.length)];
}

function readInitialDraft(): DraftPayload {
  if (typeof window === "undefined") {
    return {
      moodPhrase: "",
      quote: "",
      description: "",
      extraEmotions: [],
      occurredAt: "",
      visibilityIntent: "private",
    };
  }

  const raw = window.localStorage.getItem(DRAFT_KEY);
  if (!raw) {
    return {
      moodPhrase: "",
      quote: "",
      description: "",
      extraEmotions: [],
      occurredAt: "",
      visibilityIntent: "private",
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DraftPayload>;
    return {
      moodPhrase: parsed.moodPhrase ?? "",
      quote: parsed.quote ?? "",
      description: parsed.description ?? "",
      extraEmotions: Array.isArray(parsed.extraEmotions) ? parsed.extraEmotions : [],
      occurredAt: parsed.occurredAt ?? "",
      visibilityIntent: parsed.visibilityIntent === "public" ? "public" : "private",
    };
  } catch {
    window.localStorage.removeItem(DRAFT_KEY);
    return {
      moodPhrase: "",
      quote: "",
      description: "",
      extraEmotions: [],
      occurredAt: "",
      visibilityIntent: "private",
    };
  }
}

function toIsoDateTime(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

export const ProgressiveInput: React.FC = () => {
  const [initialDraft] = useState<DraftPayload>(() => readInitialDraft());

  const [moodPhrase, setMoodPhrase] = useState(initialDraft.moodPhrase);
  const [quote, setQuote] = useState(initialDraft.quote);
  const [description, setDescription] = useState(initialDraft.description);
  const [emotionInput, setEmotionInput] = useState("");
  const [extraEmotions, setExtraEmotions] = useState<string[]>(initialDraft.extraEmotions);
  const [occurredAt, setOccurredAt] = useState(initialDraft.occurredAt);
  const [visibilityIntent, setVisibilityIntent] = useState<VisibilityIntent>(initialDraft.visibilityIntent);
  const [expandAdvanced, setExpandAdvanced] = useState(
    Boolean(
      initialDraft.quote.trim() ||
        initialDraft.description.trim() ||
        initialDraft.extraEmotions.length ||
        initialDraft.occurredAt.trim(),
    ),
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [hintMsg, setHintMsg] = useState<string | null>(null);
  const [showIdleHint, setShowIdleHint] = useState(false);

  const queryClient = useQueryClient();

  const draftPayload = useMemo<DraftPayload>(
    () => ({
      moodPhrase,
      quote,
      description,
      extraEmotions,
      occurredAt,
      visibilityIntent,
    }),
    [moodPhrase, quote, description, extraEmotions, occurredAt, visibilityIntent],
  );

  useEffect(() => {
    const hasContent =
      moodPhrase.trim().length > 0 ||
      quote.trim().length > 0 ||
      description.trim().length > 0 ||
      extraEmotions.length > 0 ||
      occurredAt.trim().length > 0;

    const timer = window.setTimeout(() => {
      if (!hasContent) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftPayload));
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [draftPayload, moodPhrase, quote, description, extraEmotions, occurredAt]);

  useEffect(() => {
    const hasAnyInput =
      moodPhrase.trim().length > 0 ||
      quote.trim().length > 0 ||
      description.trim().length > 0 ||
      extraEmotions.length > 0;

    if (hasAnyInput) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShowIdleHint(true);
      setHintMsg("你只要写下一句，礼堂就会为你亮一盏灯。");
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [moodPhrase, quote, description, extraEmotions]);

  useEffect(() => {
    const hasDraft =
      moodPhrase.trim().length > 0 ||
      quote.trim().length > 0 ||
      description.trim().length > 0 ||
      extraEmotions.length > 0;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDraft) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [moodPhrase, quote, description, extraEmotions]);

  const createMutation = useMutation({
    mutationFn: () =>
      createRecord({
        moodPhrase: moodPhrase.trim(),
        quote: quote.trim() || undefined,
        description: description.trim() || undefined,
        extraEmotions: extraEmotions.length ? extraEmotions : undefined,
        occurredAt: toIsoDateTime(occurredAt),
        isPublic: visibilityIntent === "public",
      }),
    onSuccess: (response) => {
      setMoodPhrase("");
      setQuote("");
      setDescription("");
      setEmotionInput("");
      setExtraEmotions([]);
      setOccurredAt("");
      setVisibilityIntent("private");
      setExpandAdvanced(false);
      setErrorMsg(null);
      setShowIdleHint(false);
      setSuccessMsg(`已记录: ${response.publishStatus.label}`);
      localStorage.removeItem(DRAFT_KEY);
      queryClient.invalidateQueries({ queryKey: ["home-feed"] });
      queryClient.invalidateQueries({ queryKey: ["universe"] });
      queryClient.invalidateQueries({ queryKey: ["mindmap", "me"] });
    },
    onError: (error: unknown) => {
      const maybeErr = error as { data?: { message?: string } };
      setSuccessMsg(null);
      setErrorMsg(maybeErr?.data?.message || "记录时遇到了一点小问题，要再试一次吗？");
    },
  });

  const nudgeMutation = useMutation({
    mutationFn: async ({ source }: { source: "idle" | "manual" }) => {
      const result = await getNudgeRecommendations();
      if (source === "manual") {
        void submitNudgeFeedback({
          action: "manual_trigger",
          context: { source: "home-inspiration" },
        }).catch(() => undefined);
      }
      return result.items ?? [];
    },
    onSuccess: (items) => {
      const fromApi = items.filter(Boolean);
      setHintMsg(fromApi.length ? fromApi[Math.floor(Math.random() * fromApi.length)] : pickFallbackInspiration());
      setShowIdleHint(true);
    },
    onError: () => {
      setHintMsg(pickFallbackInspiration());
      setShowIdleHint(true);
    },
  });

  const shouldShowAdvanced =
    moodPhrase.trim().length > 0 &&
    (expandAdvanced ||
      quote.trim().length > 0 ||
      description.trim().length > 0 ||
      extraEmotions.length > 0 ||
      occurredAt.trim().length > 0);

  const clearTransientMessages = () => {
    setShowIdleHint(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const requestInspiration = (source: "idle" | "manual") => {
    nudgeMutation.mutate({ source });
  };

  const pushEmotion = () => {
    const normalized = emotionInput.trim();
    if (!normalized) {
      return;
    }
    if (extraEmotions.includes(normalized) || extraEmotions.length >= 8) {
      setEmotionInput("");
      return;
    }
    setExtraEmotions((current) => [...current, normalized]);
    setEmotionInput("");
    setExpandAdvanced(true);
    clearTransientMessages();
  };

  const pullEmotion = (emotion: string) => {
    setExtraEmotions((current) => current.filter((item) => item !== emotion));
    clearTransientMessages();
  };

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.78),rgba(251,243,251,0.62),rgba(242,247,255,0.74))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_24px_40px_rgba(167,188,220,0.17)] dark:border-white/12 dark:bg-[linear-gradient(130deg,rgba(22,29,47,0.78),rgba(44,31,47,0.56),rgba(24,34,54,0.72))] sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_15%,rgba(255,255,255,0.78),transparent_44%),radial-gradient(circle_at_79%_0%,rgba(255,225,242,0.56),transparent_38%)]" />
        <div className="pointer-events-none absolute -top-12 left-8 h-24 w-24 rounded-full bg-white/35 blur-3xl dark:bg-white/8" />
        <div className="relative z-10">
          <p className="text-[11px] tracking-[0.18em] text-slate-400/95 dark:text-slate-300/60">SPACE STATION · 永恒礼堂记录</p>
        <textarea
          className="font-elysia-display mt-2 min-h-[185px] w-full resize-none border-none bg-transparent p-0 text-[2rem] leading-[1.75] text-slate-700 outline-none placeholder:text-slate-400/58 focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-300/35 sm:min-h-[210px] sm:text-[2.2rem]"
          placeholder="把此刻轻轻放进礼堂，让爱替你记住它..."
          value={moodPhrase}
          onChange={(event) => {
            setMoodPhrase(event.target.value);
            clearTransientMessages();
          }}
          disabled={createMutation.isPending}
        />
        </div>

        <AnimatePresence>
          {(showIdleHint || hintMsg) && !moodPhrase.trim().length && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="font-elysia-poem relative z-10 mt-2 inline-flex rounded-full border border-white/70 bg-white/78 px-3 py-1 text-xl leading-none text-slate-500 shadow-sm dark:border-white/15 dark:bg-white/10 dark:text-slate-200/82"
            >
              {hintMsg}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {moodPhrase.trim().length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <label className="rounded-2xl border border-white/55 bg-white/62 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-white/12 dark:bg-black/22">
              <span className="text-xs text-slate-500 dark:text-slate-300/70">金句</span>
              <input
                type="text"
                value={quote}
                onChange={(event) => {
                  setQuote(event.target.value);
                  setExpandAdvanced(true);
                  clearTransientMessages();
                }}
                placeholder="想把哪句话做成今日誓言..."
                className="mt-1 w-full border-none bg-transparent p-0 text-sm text-slate-700 outline-none placeholder:text-slate-400/55 dark:text-slate-100 dark:placeholder:text-slate-300/35"
              />
            </label>

            <label className="rounded-2xl border border-white/55 bg-white/62 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-white/12 dark:bg-black/22">
              <span className="text-xs text-slate-500 dark:text-slate-300/70">附加情绪</span>
              <input
                type="text"
                value={emotionInput}
                onChange={(event) => {
                  setEmotionInput(event.target.value);
                  clearTransientMessages();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    pushEmotion();
                  }
                }}
                onBlur={pushEmotion}
                placeholder="温柔、热烈、想念..."
                className="mt-1 w-full border-none bg-transparent p-0 text-sm text-slate-700 outline-none placeholder:text-slate-400/55 dark:text-slate-100 dark:placeholder:text-slate-300/35"
              />
            </label>
          </motion.div>
        )}
      </AnimatePresence>

      {extraEmotions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {extraEmotions.map((emotion) => (
            <button
              key={emotion}
              type="button"
              onClick={() => pullEmotion(emotion)}
              className="rounded-full border border-pink-100/80 bg-pink-50/88 px-2.5 py-1 text-xs text-pink-600 transition-colors hover:bg-pink-100 dark:border-pink-300/20 dark:bg-pink-900/25 dark:text-pink-200 dark:hover:bg-pink-900/40"
            >
              {emotion} · 移除
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {shouldShowAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-3 overflow-hidden"
          >
            <label className="block rounded-2xl border border-white/55 bg-white/58 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/12 dark:bg-black/22">
              <span className="text-xs text-slate-500 dark:text-slate-300/70">展开描述</span>
              <textarea
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  clearTransientMessages();
                }}
                placeholder="可以再补一两句，让未来的自己更懂今天。"
                className="mt-1 min-h-[84px] w-full resize-y border-none bg-transparent p-0 text-sm text-slate-700 outline-none placeholder:text-slate-400/55 dark:text-slate-100 dark:placeholder:text-slate-300/35"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="rounded-2xl border border-white/55 bg-white/58 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/12 dark:bg-black/22">
                <span className="text-xs text-slate-500 dark:text-slate-300/70">记录时间</span>
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(event) => {
                    setOccurredAt(event.target.value);
                    clearTransientMessages();
                  }}
                  className="mt-1 w-full border-none bg-transparent p-0 text-sm text-slate-700 outline-none dark:text-slate-100"
                />
              </label>

              <div className="rounded-2xl border border-white/55 bg-white/58 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/12 dark:bg-black/22">
                <p className="px-2 pb-1 text-xs text-slate-500 dark:text-slate-300/70">可见性</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setVisibilityIntent("private");
                      clearTransientMessages();
                    }}
                    className={`rounded-xl px-3 py-2 text-xs transition-all ${
                      visibilityIntent === "private"
                        ? "bg-white text-slate-700 shadow-sm dark:bg-white/20 dark:text-white"
                        : "text-slate-500 hover:bg-white/65 dark:text-slate-300 dark:hover:bg-white/10"
                    }`}
                  >
                    仅自己
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVisibilityIntent("public");
                      clearTransientMessages();
                    }}
                    className={`rounded-xl px-3 py-2 text-xs transition-all ${
                      visibilityIntent === "public"
                        ? "bg-white text-slate-700 shadow-sm dark:bg-white/20 dark:text-white"
                        : "text-slate-500 hover:bg-white/65 dark:text-slate-300 dark:hover:bg-white/10"
                    }`}
                  >
                    公开申请
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {moodPhrase.trim().length > 0 && !shouldShowAdvanced && (
        <button
          type="button"
          onClick={() => setExpandAdvanced(true)}
          className="mt-3 self-start text-xs text-slate-500 underline decoration-dotted underline-offset-4 transition-colors hover:text-slate-700 dark:text-slate-300/80 dark:hover:text-slate-100"
        >
          再补一点细节
        </button>
      )}

      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/65 px-3 py-2 text-sm text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200"
          >
            {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mt-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-200"
          >
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/45 pt-4 dark:border-white/12">
        <button
          type="button"
          onClick={() => requestInspiration("manual")}
          disabled={nudgeMutation.isPending}
          className="rounded-full border border-white/65 bg-white/75 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
        >
          {nudgeMutation.isPending ? "灵感赶来中..." : "给我一句爱莉式灵感"}
        </button>
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !moodPhrase.trim()}
          className="rounded-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-2.5 text-sm font-medium text-white transition-all hover:scale-[1.03] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:from-slate-100 dark:via-white dark:to-slate-100 dark:text-slate-900"
        >
          {createMutation.isPending ? "记录中..." : "留下痕迹"}
        </button>
      </div>
    </div>
  );
};
