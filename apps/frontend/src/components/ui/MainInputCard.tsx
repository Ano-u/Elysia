import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LiquidCard } from "./LiquidCard";
import { ChevronDown, ChevronUp, Quote } from "lucide-react";
import { useRotatingCopy } from "../../lib/rotatingCopy";

// eslint-disable-next-line react-refresh/only-export-components
export const PREDEFINED_TAGS = ["温柔", "热烈", "想念", "孤独", "平静", "欢欣", "迷茫", "希望"];

interface MainInputCardProps {
  moodPhrase: string;
  setMoodPhrase: (value: string) => void;
  quote: string;
  setQuote: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  isPending?: boolean;
}

const COMPANION_MESSAGES = [
  "爱莉希雅听得懂，这里很安静，正适合让心情轻轻开口。",
  "把这一刻轻轻放下吧，爱莉希雅会认真倾听呀♪",
  "先写下一句吧，爱莉会慢慢读懂你的心情♪",
  "今天的心情，也想被温柔记住，对吗？♪",
  "要是还没想好从哪里开始，就先把第一句交给爱莉吧。",
  "往世乐土安安静静的，正适合把那些没说完的话轻轻放下。",
  "不着急呀，想到哪里就写到哪里，真心本来就比完整更动人♪",
  "今天想先写给自己，还是写给未来的某一天呢？",
  "若是有一点委屈，或者一点点想念，也都可以交给这里。",
  "爱莉会替你把这一刻放在最柔软的位置，所以慢慢来就好♪",
];
const GUIDANCE_MESSAGES = [
  "要不要再补一点细节？",
  "先写下这一句就很好，剩下的可以慢慢来。",
  "想公开给星海，还是先留给自己呢？都由你决定♪",
  "爱莉会把你写下的每个字，都好好收起来呀♪",
  "这句话已经很动人啦，要不要再让爱莉多了解你一点点？",
  "补上两句细节吧，这样未来的你，一眼就能认出今天的心跳。",
  "若是还说不清楚，也可以先记一个情绪词，爱莉会懂的。",
  "想让它去星海里回响，还是只留在往世乐土里呢？这个选择一直都属于你♪",
  "这一句已经很好啦，剩下的部分，我们可以慢慢把它补完整。",
  "若你愿意，连今天的时间也写下来吧，爱莉想把这一刻记得更清楚些。",
];
const WAITING_MESSAGES = [
  "爱莉正在替你把这份心情轻轻安放，请稍等一下下♪",
  "别着急呀，爱莉会先把这一句好好听清。",
  "这份心意已经在路上啦，爱莉正在认真接住它♪",
  "爱莉正在替你把它安安稳稳收好，很快就回来回应你♪",
  "这一句已经送出去了，爱莉会先认真听清，再带它往前走。",
  "请再等一小会儿呀，爱莉不想错过你写下的任何一个字。",
];

export const MainInputCard: React.FC<MainInputCardProps> = ({
  moodPhrase,
  setMoodPhrase,
  quote,
  setQuote,
  description,
  setDescription,
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
      className="w-full max-w-4xl mx-auto bg-white/45 dark:bg-black/30 overflow-hidden p-10 transition-all duration-700 shadow-2xl"
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
            maxLength={200}
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
          {hasValue && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col gap-8 overflow-hidden"
            >
              {/* Row 1: Quote */}
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

              {/* Row 2: Details */}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LiquidCard>
  );
};
