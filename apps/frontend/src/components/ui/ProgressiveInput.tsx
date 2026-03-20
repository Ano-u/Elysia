import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createRecord, getNudgeRecommendations } from "../../lib/apiClient";
import { readAdminInspirationTexts } from "../../lib/inspirationStore";
import { getCreateSuccessMessage } from "../../lib/publicationCopy";
import type { VisibilityIntent } from "../../types/api";

type DraftPayload = {
  moodPhrase: string;
  quote: string;
  description: string;
  extraEmotions: string[];
  occurredAt: string;
  visibilityIntent: VisibilityIntent;
};

type ProgressiveInputProps = {
  guideStep?: number | null;
  isGuideActive?: boolean;
  onGuideNext?: () => void;
  onGuideSkip?: () => void;
};

const DRAFT_KEY = "elysia-home-draft-v3";
const FALLBACK_INSPIRATIONS = [
  "先写下一句吧，爱莉会慢慢读懂你的心情♪",
  "先记一个词也可以呀：花、光、想念、勇气。",
  "把最真实的这一瞬轻轻放下吧，爱莉希雅会认真倾听呀♪",
  "不必着急完整，真诚地写下，就已经很美了。",
  "往世乐土安安静静的，正适合把没说完的话轻轻放下来。",
  "今天想先写给自己，还是写给未来的某一天呢？",
  "这一句已经很好啦，剩下的部分，可以慢慢补给爱莉看。",
  "若是今天有一点乱，也没关系，爱莉会陪你把它一点点理顺。",
];

function pickRandom(items: string[]): string {
  return items[Math.floor(Math.random() * items.length)] ?? FALLBACK_INSPIRATIONS[0];
}

function dedupeInspirations(items: string[]): string[] {
  const bucket = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }
    if (bucket.has(normalized)) {
      continue;
    }
    bucket.add(normalized);
    output.push(normalized);
  }
  return output;
}

function readInitialDraft(): DraftPayload {
  const emptyDraft: DraftPayload = {
    moodPhrase: "",
    quote: "",
    description: "",
    extraEmotions: [],
    occurredAt: "",
    visibilityIntent: "private",
  };

  if (typeof window === "undefined") {
    return emptyDraft;
  }

  const raw = window.localStorage.getItem(DRAFT_KEY);
  if (!raw) {
    return emptyDraft;
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
    return emptyDraft;
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

const GuideBubble: React.FC<{
  title: string;
  description: string;
  placement?: "top-right" | "bottom-right";
  onNext?: () => void;
  onSkip?: () => void;
}> = ({ title, description, placement = "top-right", onNext, onSkip }) => (
  <motion.div
    initial={{ opacity: 0, y: 8, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 8, scale: 0.98 }}
    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    className={`z-[95] w-[22rem] max-w-[calc(100%-0.75rem)] rounded-[1.55rem] border border-white/85 bg-[linear-gradient(140deg,rgba(255,247,255,0.94),rgba(249,238,255,0.9),rgba(236,246,255,0.93))] px-4 py-3 text-sm shadow-[0_16px_34px_rgba(182,135,255,0.2),0_8px_20px_rgba(255,174,222,0.28)] backdrop-blur-3xl dark:border-white/25 dark:bg-[linear-gradient(140deg,rgba(36,24,58,0.9),rgba(44,30,70,0.88),rgba(24,36,64,0.9))] ${
      placement === "bottom-right"
        ? "absolute right-0 bottom-full mb-3 sm:right-2"
        : "absolute right-3 top-3"
    }`}
    onClick={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
  >
    <p className="font-elysia-display text-lg text-transparent bg-clip-text bg-gradient-to-r from-[#fff6ff] via-[#ffd8f4] to-[#cae6ff] [text-shadow:0_0_14px_rgba(245,176,255,0.62),0_1px_0_rgba(58,33,89,0.45)]">
      {title}
    </p>
    <p className="mt-1 font-elysia-display text-sm leading-relaxed text-[#624f7f] [text-shadow:0_1px_0_rgba(255,255,255,0.6)] dark:text-[#f1e9ff] dark:[text-shadow:0_1px_0_rgba(16,8,33,0.75)]">
      {description}
    </p>
    <div className="mt-3 flex items-center justify-end gap-2 text-xs">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSkip?.();
        }}
        className="rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-slate-500 hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-slate-200"
      >
        跳过
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onNext?.();
        }}
        className="rounded-full bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        下一步
      </button>
    </div>
  </motion.div>
);

export const ProgressiveInput: React.FC<ProgressiveInputProps> = ({
  guideStep = null,
  isGuideActive = false,
  onGuideNext,
  onGuideSkip,
}) => {
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const moodSectionRef = useRef<HTMLDivElement>(null);
  const advancedSectionRef = useRef<HTMLDivElement>(null);
  const submitSectionRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();

  const isMoodGuideActive = isGuideActive && guideStep === 0;
  const isDescriptionGuideActive = isGuideActive && guideStep === 1;
  const isSubmitGuideActive = isGuideActive && guideStep === 2;
  const shouldBlurOthers = isGuideActive;

  const sectionFocusClass = (active: boolean): string => {
    if (!shouldBlurOthers) {
      return "";
    }
    if (active) {
      return "relative z-[72] opacity-100 blur-0 pointer-events-auto";
    }
    return "pointer-events-none opacity-36 blur-[2.4px] saturate-[0.78] contrast-[0.88]";
  };

  const nudgeMutation = useMutation({
    mutationFn: async () => {
      const result = await getNudgeRecommendations();
      return result.items ?? [];
    },
    onSuccess: (items) => {
      const merged = dedupeInspirations([...(items ?? []), ...readAdminInspirationTexts(), ...FALLBACK_INSPIRATIONS]);
      setHintMsg(pickRandom(merged));
      setShowIdleHint(true);
    },
    onError: () => {
      const merged = dedupeInspirations([...readAdminInspirationTexts(), ...FALLBACK_INSPIRATIONS]);
      setHintMsg(pickRandom(merged));
      setShowIdleHint(true);
    },
  });
  const requestIdleInspiration = nudgeMutation.mutate;

  useEffect(() => {
    if (!isGuideActive) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    if (isSubmitGuideActive) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
      return;
    }

    const target = isMoodGuideActive ? moodSectionRef.current : isDescriptionGuideActive ? advancedSectionRef.current : null;
    if (!target) {
      return;
    }

    const nextTop = Math.max(0, target.offsetTop - container.clientHeight / 2 + target.clientHeight / 2);
    container.scrollTo({
      top: nextTop,
      behavior: "smooth",
    });
  }, [isGuideActive, isMoodGuideActive, isDescriptionGuideActive, isSubmitGuideActive]);

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

  const hasAnyInput =
    moodPhrase.trim().length > 0 ||
    quote.trim().length > 0 ||
    description.trim().length > 0 ||
    extraEmotions.length > 0;
  const hasAdvancedContent =
    quote.trim().length > 0 ||
    description.trim().length > 0 ||
    extraEmotions.length > 0 ||
    occurredAt.trim().length > 0;

  useEffect(() => {
    if (hasAnyInput) {
      return;
    }

    const timer = window.setTimeout(() => {
      requestIdleInspiration();
    }, 7000);

    return () => window.clearTimeout(timer);
  }, [hasAnyInput, requestIdleInspiration]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasAnyInput) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasAnyInput]);

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
      setHintMsg(null);
      setSuccessMsg(getCreateSuccessMessage(response.publishStatus.status));
      localStorage.removeItem(DRAFT_KEY);
      queryClient.invalidateQueries({ queryKey: ["home-feed"] });
      queryClient.invalidateQueries({ queryKey: ["universe"] });
      queryClient.invalidateQueries({ queryKey: ["mindmap", "me"] });
    },
    onError: (error: unknown) => {
      const maybeErr = error as {
        status?: number;
        code?: string;
        message?: string;
        data?: { message?: string };
      };
      const serverMessage = maybeErr?.data?.message?.trim();
      const fallbackMessage = maybeErr.message?.trim();
      const normalizedMessage = (serverMessage || fallbackMessage || "").toLowerCase();

      setSuccessMsg(null);
      if (maybeErr.status === 401) {
        setErrorMsg("哎呀，爱莉刚刚没有听清这份心意，等登录稳稳回来，我们再试一次吧♪");
        return;
      }
      if (maybeErr.code === "ACCESS_GATE_BLOCKED") {
        setErrorMsg("现在还在准入审核里呢，爱莉已经记下你的心意了，再等等好吗？");
        return;
      }
      if (normalizedMessage.includes("not allowed")) {
        setErrorMsg("哎呀，这一步先被轻轻拦住啦，等风声安静一点，爱莉再陪你继续。");
        return;
      }
      if (normalizedMessage.includes("failed to fetch")) {
        setErrorMsg("哎呀，网络刚刚晃了一下，不过这份心情没有丢，爱莉陪你再试一次吧♪");
        return;
      }
      setErrorMsg("哎呀，爱莉刚刚没有听清，再让我认真听一次，好不好？♪");
    },
  });

  const shouldShowAdvanced =
    isDescriptionGuideActive ||
    (moodPhrase.trim().length > 0 && (expandAdvanced || hasAdvancedContent));

  const clearTransientMessages = () => {
    setShowIdleHint(false);
    setHintMsg(null);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const collapseAdvancedIfEmpty = (nextState?: {
    quote?: string;
    description?: string;
    extraEmotions?: string[];
    occurredAt?: string;
  }) => {
    if (isGuideActive || moodPhrase.trim().length === 0) {
      return;
    }

    const nextQuote = (nextState?.quote ?? quote).trim();
    const nextDescription = (nextState?.description ?? description).trim();
    const nextExtraEmotions = nextState?.extraEmotions ?? extraEmotions;
    const nextOccurredAt = (nextState?.occurredAt ?? occurredAt).trim();

    const stillHasAdvanced =
      nextQuote.length > 0 ||
      nextDescription.length > 0 ||
      nextExtraEmotions.length > 0 ||
      nextOccurredAt.length > 0;

    if (!stillHasAdvanced) {
      setExpandAdvanced(false);
    }
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
    const nextEmotions = extraEmotions.filter((item) => item !== emotion);
    setExtraEmotions(nextEmotions);
    collapseAdvancedIfEmpty({ extraEmotions: nextEmotions });
    clearTransientMessages();
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div
        ref={scrollContainerRef}
        className="hide-scrollbar flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 pb-[calc(0.4rem+env(safe-area-inset-bottom))]"
      >
        <div className="space-y-3 pb-4">
          <div
            ref={moodSectionRef}
            className={`relative overflow-hidden rounded-[2.35rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.78),rgba(251,243,251,0.62),rgba(242,247,255,0.74))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_24px_40px_rgba(167,188,220,0.17)] transition-all dark:border-white/12 dark:bg-[linear-gradient(130deg,rgba(22,29,47,0.78),rgba(44,31,47,0.56),rgba(24,34,54,0.72))] sm:p-7 ${
              isMoodGuideActive ? "scale-[1.01] ring-2 ring-pink-300/80 shadow-[0_16px_36px_rgba(253,183,220,0.36)]" : ""
            } ${sectionFocusClass(isMoodGuideActive)}`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_15%,rgba(255,255,255,0.78),transparent_44%),radial-gradient(circle_at_79%_0%,rgba(255,225,242,0.56),transparent_38%)]" />
            <div className="pointer-events-none absolute -top-12 left-8 h-24 w-24 rounded-full bg-white/35 blur-3xl dark:bg-white/8" />
            <div className="relative z-10">
              <p className="text-[11px] tracking-[0.18em] text-slate-400/95 dark:text-slate-300/60">ELYSIA · 心绪记录</p>
              <textarea
                className="font-elysia-display mt-2 min-h-[185px] w-full resize-none border-none bg-transparent p-0 text-[2rem] leading-[1.7] text-slate-700 outline-none placeholder:text-slate-400/58 focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-300/35 sm:min-h-[210px] sm:text-[2.2rem]"
                placeholder={"把这一刻轻轻放下吧，爱莉希雅会认真倾听呀♪"}
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
                  className="font-elysia-display relative z-10 mt-2 inline-flex rounded-[1.4rem] border border-white/70 bg-white/82 px-3.5 py-1.5 text-[1rem] leading-relaxed text-slate-500 shadow-sm dark:border-white/15 dark:bg-white/10 dark:text-slate-200/82"
                >
                  {hintMsg}
                </motion.p>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {isMoodGuideActive && (
                <GuideBubble
                  title="先写一句就已经很好"
                  description="先写下这一句就很好，剩下的可以慢慢来。爱莉会一直陪着你♪"
                  onNext={onGuideNext}
                  onSkip={onGuideSkip}
                />
              )}
            </AnimatePresence>
          </div>

        <AnimatePresence>
          {(moodPhrase.trim().length > 0 || isDescriptionGuideActive) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={`mt-1 grid gap-3 sm:grid-cols-2 ${sectionFocusClass(false)}`}
            >
              <label className="rounded-[1.6rem] border border-white/55 bg-white/62 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-white/12 dark:bg-black/22">
                <span className="text-xs text-slate-500 dark:text-slate-300/70">金句</span>
                <input
                  type="text"
                  value={quote}
                  onChange={(event) => {
                    setQuote(event.target.value);
                    setExpandAdvanced(true);
                    clearTransientMessages();
                  }}
                  placeholder="今天想把哪一句，留成只属于你的誓言呢？♪"
                  className="mt-1 w-full border-none bg-transparent p-0 text-sm text-slate-700 outline-none placeholder:text-slate-400/55 dark:text-slate-100 dark:placeholder:text-slate-300/35"
                />
              </label>

              <label className="rounded-[1.6rem] border border-white/55 bg-white/62 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-white/12 dark:bg-black/22">
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
          <div className={`mt-2 flex flex-wrap gap-2 ${sectionFocusClass(false)}`}>
            {extraEmotions.map((emotion) => (
              <button
                key={emotion}
                type="button"
                onClick={() => pullEmotion(emotion)}
                className="group rounded-full border border-pink-100/80 bg-pink-50/88 px-3 py-1 text-xs text-pink-600 transition-colors hover:border-rose-300/90 hover:bg-rose-500 hover:text-white dark:border-pink-300/20 dark:bg-pink-900/25 dark:text-pink-200 dark:hover:bg-rose-500"
                aria-label={`移除情绪 ${emotion}`}
              >
                <span className="group-hover:hidden">{emotion}</span>
                <span className="hidden group-hover:inline">移除</span>
              </button>
            ))}
          </div>
        )}

        <AnimatePresence>
          {shouldShowAdvanced && (
            <motion.div
              ref={advancedSectionRef}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`relative mt-2 space-y-3 overflow-hidden rounded-[1.9rem] p-1 transition-all ${
                isDescriptionGuideActive
                  ? "ring-2 ring-pink-300/80 shadow-[0_16px_36px_rgba(253,183,220,0.34)]"
                  : ""
              } ${sectionFocusClass(isDescriptionGuideActive)}`}
            >
              <label className="block rounded-[1.6rem] border border-white/55 bg-white/58 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/12 dark:bg-black/22">
                <span className="text-xs text-slate-500 dark:text-slate-300/70">描述</span>
                <textarea
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    clearTransientMessages();
                  }}
                  onFocus={() => {
                    setExpandAdvanced(true);
                    const container = scrollContainerRef.current;
                    const target = advancedSectionRef.current;
                    if (!container || !target) {
                      return;
                    }
                    const nextTop = Math.max(0, target.offsetTop - 24);
                    container.scrollTo({
                      top: nextTop,
                      behavior: "smooth",
                    });
                  }}
                  onBlur={(event) => {
                    collapseAdvancedIfEmpty({ description: event.target.value });
                  }}
                  placeholder="补一两句细节吧，好让未来的你认出今天的心跳♪"
                  className="hide-scrollbar mt-1 min-h-[140px] max-h-[240px] w-full resize-none overflow-y-auto border-none bg-transparent p-0 text-sm leading-relaxed text-slate-700 outline-none placeholder:text-slate-400/55 dark:text-slate-100 dark:placeholder:text-slate-300/35"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="rounded-[1.6rem] border border-white/55 bg-white/58 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/12 dark:bg-black/22">
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

                <div className="rounded-[1.6rem] border border-white/55 bg-white/58 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/12 dark:bg-black/22">
                  <p className="px-2 pb-1 text-xs text-slate-500 dark:text-slate-300/70">可见性</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setVisibilityIntent("private");
                        clearTransientMessages();
                      }}
                      className={`rounded-[1.05rem] px-3 py-2 text-xs transition-all ${
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
                      className={`rounded-[1.05rem] px-3 py-2 text-xs transition-all ${
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

              <AnimatePresence>
                {isDescriptionGuideActive && (
                  <GuideBubble
                    title="要不要再补一点细节？"
                    description="先写下这一句就很好，剩下的可以慢慢来。爱莉会在这里等你慢慢补全♪"
                    onNext={onGuideNext}
                    onSkip={onGuideSkip}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {moodPhrase.trim().length > 0 && !shouldShowAdvanced && (
          <button
            type="button"
            onClick={() => setExpandAdvanced(true)}
            className={`mt-1 self-start text-xs text-slate-500 underline decoration-dotted underline-offset-4 transition-colors hover:text-slate-700 dark:text-slate-300/80 dark:hover:text-slate-100 ${sectionFocusClass(false)}`}
          >
            要不要再补一点细节？
          </button>
        )}

        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className={`mt-1 rounded-[1.4rem] border border-amber-200/70 bg-amber-50/65 px-3 py-2 text-sm text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200 ${sectionFocusClass(false)}`}
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
              className={`mt-1 rounded-[1.4rem] border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-200 ${sectionFocusClass(false)}`}
            >
              {successMsg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        ref={submitSectionRef}
        className={`sticky bottom-0 z-20 mt-1 flex items-center justify-end border-t border-white/45 bg-[linear-gradient(180deg,rgba(248,251,255,0.56),rgba(248,251,255,0.9))] px-1 pb-2 pt-4 backdrop-blur-lg dark:border-white/12 dark:bg-[linear-gradient(180deg,rgba(13,20,34,0.52),rgba(13,20,34,0.9))] ${
          isSubmitGuideActive
            ? "rounded-[1.8rem] border-pink-200/90 bg-white/68 px-3 py-3 ring-2 ring-pink-300/80 shadow-[0_16px_34px_rgba(253,183,220,0.32)] dark:bg-black/24"
            : ""
        } ${sectionFocusClass(isSubmitGuideActive)}`}
      >
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !moodPhrase.trim()}
          className="rounded-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-2.5 text-sm font-medium text-white transition-all hover:scale-[1.03] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:from-slate-100 dark:via-white dark:to-slate-100 dark:text-slate-900"
        >
          {createMutation.isPending ? "爱莉正在替你记下哦..." : "轻轻留下痕迹"}
        </button>

        <AnimatePresence>
          {isSubmitGuideActive && (
                <GuideBubble
                  title="最后一步，轻轻提交"
                  description="想公开给星海，还是先留给自己呢？都由你决定♪"
                  placement="bottom-right"
                  onNext={onGuideNext}
                  onSkip={onGuideSkip}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  </div>
  );
};
