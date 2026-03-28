import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LiquidCard } from "./LiquidCard";
import { ChevronDown, ChevronUp, Quote, Tag } from "lucide-react";
import { useRotatingCopy } from "../../lib/rotatingCopy";
import { MoodStripSelector } from "./MoodStripSelector";

interface MainInputCardProps {
  moodPhrase: string;
  setMoodPhrase: (value: string) => void;
  quote: string;
  setQuote: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  extraEmotions?: string[];
  onToggleEmotion?: (tag: string) => void;
  isPending?: boolean;
}

const COMPANION_MESSAGES = [
  "往世乐土还安静着呢，有好多话想对我说的话，现在正合适哦 ♪",
  "不想前进的时候，就在这里停下脚步吧，爱莉会认真倾听的哟 ♪",
  "先写下一句吧，可爱的少女可是能完全读懂你的心哦 ♪",
  "今天这份闪闪发光的心情，也想被珍藏起来，对不对？",
  "要是还没想好开场白，不如先把第一句话交给我吧 ♪",
  "这里只有你我二人，正适合把你心里的小秘密悄悄告诉我呀。",
  "不用心急，想到哪就写到哪，你的真心就已经足够动人啦 ♪",
  "今天的记忆，是想写给自己，还是作为前行的灯火呢？",
  "若是有一点委屈，或者一点点想念，全都可以交给爱莉哦～",
  "悲伤与快乐都会在心底珍藏，慢慢来就好，我会一直在你身边 ♪",
];
const GUIDANCE_MESSAGES = [
  "要不要再为这一切添上一点点绚丽的色彩呢？",
  "这句话已经闪闪发光了呢，剩下的我们可以慢慢来哦。",
  "想让它在群星间闪耀，还是作为我们之间的小秘密？都由你决定哦 ♪",
  "你写下的每一个字，爱莉都会心怀感激地好好收下哟～",
  "这句话已经很让我心动啦，来，让我更深入地了解你一些吧？",
  "再多说两句嘛，这样在未来的某一天，你一眼就能认出重逢的奇迹呀。",
  "如果找不到合适的词，也可以先留个悬念，美丽的少女什么都懂嘛 ♪",
  "是飞向广阔的星海，还是留在往世乐土里？这个选择一直都属于你 ♪",
  "已经写得很棒啦！夸夸你哦，剩下的部分就随心意一点点补齐吧 ♪",
  "若是愿意，把时间也记录下来吧，爱莉想把这美妙的邂逅记得更清楚些呢。",
];
const WAITING_MESSAGES = [
  "等等……请等一下，先别滑走嘛♪ 爱莉正在帮你把这份心意好好珍藏哦。",
  "哎呀，别心急，给我一点时间把你的每一句话都听清楚嘛 ♪",
  "你的心意已经在路上啦，我会在这里认真地保管它 ♪",
  "爱莉正在为你整理这份回忆，很快就会带着惊喜回来见你啦 ♪",
  "这句话已经悄悄出发咯，我会好好护送它，直到绽放光辉的那一刻的。",
  "再陪我等一小会儿呀，爱莉可不想错过属于你的任何一个字呢 ♪",
];

export const MainInputCard: React.FC<MainInputCardProps> = ({
  moodPhrase,
  setMoodPhrase,
  quote,
  setQuote,
  description,
  setDescription,
  extraEmotions,
  onToggleEmotion,
  isPending,
}) => {
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const quoteInputRef = useRef<HTMLInputElement>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isQuoteFocused, setIsQuoteFocused] = useState(false);
  const [isDescFocused, setIsDescFocused] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const hasValue = moodPhrase.trim().length > 0;
  const hasQuote = quote.trim().length > 0;
  const hasDescription = description.trim().length > 0;
  const isComposerExpanded = isFocused || isQuoteFocused || isDescFocused;
  const isLanding = !hasValue && !isComposerExpanded;
  const isCompact = hasValue && !isComposerExpanded;
  const ambientMessages = isPending ? WAITING_MESSAGES : hasValue ? GUIDANCE_MESSAGES : COMPANION_MESSAGES;
  const ambientMessage = useRotatingCopy(ambientMessages, 15000, ambientMessages.length > 1);

  const isTargetInsideEditor = (target: EventTarget | null): boolean => {
    if (!(target instanceof Node)) return false;
    return editorAreaRef.current?.contains(target) ?? false;
  };

  const collapseEditor = () => {
    setIsFocused(false);
    setIsQuoteFocused(false);
    setIsDescFocused(false);
    setShowDetails(false);
  };

  const focusFieldAtEnd = (field: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (!field) return;
    field.focus({ preventScroll: true });
    const valueLength = field.value.length;
    field.setSelectionRange(valueLength, valueLength);
  };

  const activateQuoteEditor = () => {
    setIsQuoteFocused(true);
  };

  const activateDescriptionEditor = () => {
    setShowDetails(true);
    setIsDescFocused(true);
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (isTargetInsideEditor(event.target)) return;
      collapseEditor();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!isQuoteFocused) return;
    const frameId = window.requestAnimationFrame(() => {
      focusFieldAtEnd(quoteInputRef.current);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isQuoteFocused]);

  useEffect(() => {
    if (!isDescFocused) return;
    const frameId = window.requestAnimationFrame(() => {
      focusFieldAtEnd(descriptionTextareaRef.current);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isDescFocused]);

  return (
    <LiquidCard
      ref={editorAreaRef}
      className="w-full max-w-4xl mx-auto bg-white/45 dark:bg-black/30 overflow-hidden p-8 transition-all duration-700 shadow-2xl"
    >
      <div className="flex flex-col gap-8">
        {/* Main Input Section */}
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.p
              key={ambientMessage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              className="mb-6 max-w-3xl text-sm italic leading-relaxed text-slate-500/60 dark:text-slate-300/80"
            >
              {ambientMessage}
            </motion.p>
          </AnimatePresence>

          <textarea
            autoFocus={hasValue}
            maxLength={20}
            rows={1}
            className={`font-elysia-display w-full resize-none border-none bg-transparent p-0 outline-none placeholder:text-slate-400/40 focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-400/40 transition-all duration-700 ease-in-out overflow-hidden ${
              isLanding ? "text-2xl sm:text-[2.2rem] min-h-[64px] sm:min-h-[120px]" : isCompact ? "text-xl sm:text-2xl min-h-[32px] sm:min-h-[40px] font-bold" : "text-[1.35rem] sm:text-[2.4rem] min-h-[64px] sm:min-h-[140px]"
            }`}
            placeholder="嗨，今天有什么绚丽的想法，想要告诉我吗？♪"
            value={moodPhrase}
            onChange={(e) => {
              setMoodPhrase(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={(e) => {
              if (!isTargetInsideEditor(e.relatedTarget)) {
                setIsFocused(false);
              }
            }}
            disabled={isPending}
          />
        </div>

        {/* Quote & Details Transformation */}
        <AnimatePresence>
          {hasValue && (!isCompact || hasQuote || hasDescription || (extraEmotions && extraEmotions.length > 0)) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col gap-8 overflow-hidden"
            >
              {/* Row 1: Quote */}
              {(!isCompact || hasQuote) && (
                <div className="flex flex-col gap-3">
                  <AnimatePresence mode="wait">
                    {!isCompact ? (
                      <motion.div
                        key="quote-input"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex flex-col gap-2 overflow-hidden"
                      >
                        <span className="text-[10px] tracking-widest text-slate-400 uppercase font-bold flex items-center gap-1">
                          <Quote
                            className="w-3 h-3"
                            style={{ transform: 'scale(-1, -1)' }}
                          /> 今日誓言
                        </span>
                        <input
                          ref={quoteInputRef}
                          type="text"
                          maxLength={200}
                          value={quote}
                          onChange={(e) => setQuote(e.target.value)}
                          onFocus={() => setIsQuoteFocused(true)}
                          onBlur={(e) => {
                            if (!isTargetInsideEditor(e.relatedTarget)) {
                              setIsQuoteFocused(false);
                            }
                          }}
                          placeholder="把这份无瑕的记忆交给我保管吧♪"
                          className="w-full bg-white/30 dark:bg-black/40 border-none rounded-2xl px-5 py-3 text-base italic text-slate-600 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-200/50 transition-all shadow-inner"
                        />
                      </motion.div>
                    ) : hasQuote ? (
                      <motion.div
                        key="quote-display"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        onClick={activateQuoteEditor}
                        className="relative pl-6 py-1 cursor-pointer group overflow-hidden"
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-pink-300/60 rounded-full group-hover:bg-pink-400 transition-colors" />
                        <p className="italic text-slate-600 dark:text-slate-300 text-base leading-relaxed">
                          {quote}
                        </p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              )}

              {/* Row 2: Details */}
              {(!isCompact || hasDescription) && (
                <div className="flex flex-col gap-3">
                  <AnimatePresence mode="wait">
                    {!isCompact ? (
                      <div className="flex flex-col gap-3">
                        <motion.button
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          onClick={() => {
                            if (showDetails) {
                              setShowDetails(false);
                              setIsDescFocused(false);
                              return;
                            }
                            activateDescriptionEditor();
                          }}
                          className="flex items-center gap-2 text-[10px] tracking-widest text-slate-400 uppercase font-bold hover:text-pink-400 transition-colors w-fit overflow-hidden"
                        >
                          {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          再多告诉爱莉一点吧
                        </motion.button>

                        <AnimatePresence>
                          {showDetails && (
                            <motion.div
                              key="desc-input-area"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <textarea
                                ref={descriptionTextareaRef}
                                value={description}
                                maxLength={1000}
                                onChange={(e) => setDescription(e.target.value)}
                                onFocus={() => setIsDescFocused(true)}
                                onBlur={(e) => {
                                  if (!isTargetInsideEditor(e.relatedTarget)) {
                                    setIsDescFocused(false);
                                  }
                                }}
                                onClick={activateDescriptionEditor}
                                placeholder="遇到烦心事了吗？不如深呼吸，让思绪像飞花一样飘散吧~ 需不需要我给你一点小灵感呢？♪"
                                className={`w-full bg-white/30 dark:bg-black/40 border-none rounded-2xl px-5 py-4 text-sm text-slate-600 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-200/50 resize-none shadow-inner transition-[min-height] duration-300 ${
                                  isDescFocused ? "min-h-[140px]" : "min-h-[82px]"
                                }`}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ) : hasDescription ? (
                      <motion.div
                        key="desc-display"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div
                          onClick={activateDescriptionEditor}
                          className="flex flex-col gap-2 pl-4 py-2 cursor-pointer group"
                        >
                          {description.split("\n").filter(p => p.trim()).map((p, i) => (
                            <div key={i} className="relative text-slate-500 dark:text-slate-400 text-sm leading-relaxed break-words [overflow-wrap:anywhere]">
                              <div className="absolute -left-4 top-2.5 w-1.5 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full group-hover:bg-pink-300 transition-colors" />
                              {p}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              )}

              {/* Row 3: Emotions */}
              {extraEmotions && onToggleEmotion && (!isCompact || extraEmotions.length > 0) && (
                <div className="flex flex-col gap-3">
                  <AnimatePresence mode="wait">
                    {!isCompact ? (
                      <motion.div
                        key="emotions-selector"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden pt-2"
                      >
                        <div className={`flex flex-col gap-3 flex-1 w-full min-w-0`}>
                          <div className="flex items-center gap-2">
                            <Tag className="w-3 h-3 text-slate-400" />
                            <span className="text-[10px] tracking-widest text-slate-400 uppercase font-bold flex items-center gap-1">情绪心境</span>
                          </div>
                          <MoodStripSelector items={extraEmotions} selectedItems={extraEmotions} onToggle={onToggleEmotion} />
                        </div>
                      </motion.div>
                    ) : extraEmotions.length > 0 ? (
                      <motion.div
                        key="emotions-display"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden pt-2"
                      >
                        <div className="flex flex-wrap gap-2 pointer-events-none">
                          {extraEmotions.map((tag) => (
                            <span
                              key={tag}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors bg-pink-100/80 text-pink-600 dark:bg-pink-500/20 dark:text-pink-300 border border-pink-200/50 dark:border-pink-500/20 shadow-sm"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LiquidCard>
  );
};
