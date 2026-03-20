import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LiquidCard } from "./LiquidCard";
import { ActionPairRow } from "./ActionPairRow";
import { ChevronDown, ChevronUp, Tag as TagIcon, Quote } from "lucide-react";
import { useRotatingCopy } from "../../lib/rotatingCopy";

interface MainInputCardProps {
  moodPhrase: string;
  setMoodPhrase: (value: string) => void;
  quote: string;
  setQuote: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  extraEmotions: string[];
  setExtraEmotions: (value: string[]) => void;
  isPublic: boolean;
  onPublicToggle: (isPublic: boolean) => void;
  onSave: () => void;
  onJumpUniverse: () => void;
  isPending?: boolean;
  feedbackMessage?: string | null;
  feedbackTone?: "error" | "success";
}

const PREDEFINED_TAGS = ["温柔", "热烈", "想念", "孤独", "平静", "欢欣", "迷茫", "希望"];
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
  extraEmotions,
  setExtraEmotions,
  isPublic,
  onPublicToggle,
  onSave,
  onJumpUniverse,
  isPending,
  feedbackMessage,
  feedbackTone = "success",
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isQuoteFocused, setIsQuoteFocused] = useState(false);
  const [isDescFocused, setIsDescFocused] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const hasValue = moodPhrase.trim().length > 0;
  const isLanding = !hasValue && !isFocused;
  const isCompact = hasValue && !isFocused;
  const ambientMessages = isPending ? WAITING_MESSAGES : hasValue ? GUIDANCE_MESSAGES : COMPANION_MESSAGES;
  const ambientMessage = useRotatingCopy(ambientMessages, 10000, ambientMessages.length > 1);

  const toggleTag = (tag: string) => {
    if (extraEmotions.includes(tag)) {
      setExtraEmotions(extraEmotions.filter((t) => t !== tag));
    } else if (extraEmotions.length < 8) {
      setExtraEmotions([...extraEmotions, tag]);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-10">
      {/* Card: Mood + Quote + Details */}
      <LiquidCard className="bg-white/45 dark:bg-black/23 overflow-hidden p-10 transition-all duration-700 shadow-2xl">
        <div className="flex flex-col gap-8">
          {/* Main Input Section */}
          <div className="relative">
            <textarea
              autoFocus={hasValue}
              className={`font-elysia-display w-full resize-none border-none bg-transparent p-0 outline-none placeholder:text-slate-400/40 focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-300/20 transition-all duration-700 ease-in-out ${
                isLanding ? "text-[2.2rem] min-h-[120px]" : isCompact ? "text-2xl min-h-[40px] font-bold" : "text-[2.4rem] min-h-[140px]"
              }`}
              placeholder="把这一刻轻轻放下吧，爱莉希雅会认真倾听呀♪"
              value={moodPhrase}
              onChange={(e) => setMoodPhrase(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={isPending}
            />

            <AnimatePresence mode="wait">
              <motion.p
                key={ambientMessage}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-300/80"
              >
                {ambientMessage}
              </motion.p>
            </AnimatePresence>
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
                    {isQuoteFocused || !quote ? (
                      <motion.div
                        key="quote-input"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col gap-2"
                      >
                        <span className="text-[10px] tracking-widest text-slate-400 uppercase font-bold flex items-center gap-1">
                          <Quote
                            className="w-3 h-3"
                            style={{ transform: 'scale(-1, -1)' }}
                          /> 今日誓言
                        </span>
                        <input
                          type="text"
                          value={quote}
                          onChange={(e) => setQuote(e.target.value)}
                          onFocus={() => setIsQuoteFocused(true)}
                          onBlur={() => setIsQuoteFocused(false)}
                          placeholder="今天想把哪一句，留成只属于你的誓言呢？♪"
                          className="w-full bg-white/30 dark:bg-black/20 border-none rounded-2xl px-5 py-3 text-base italic text-slate-600 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-200/50 transition-all shadow-inner"
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="quote-display"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => setIsQuoteFocused(true)}
                        className="relative pl-6 py-1 cursor-pointer group"
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-pink-300/60 rounded-full group-hover:bg-pink-400 transition-colors" />
                        <p className="italic text-slate-600 dark:text-slate-300 text-base leading-relaxed">
                          {quote}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Row 2: Details (Unfold with bullet transformation) */}
                <div className="flex flex-col gap-4">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-2 text-[10px] tracking-widest text-slate-400 uppercase font-bold hover:text-pink-400 transition-colors w-fit"
                  >
                    {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    再多告诉爱莉一点吧
                  </button>

                  <AnimatePresence>
                    {showDetails && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        {isDescFocused || !description ? (
                          <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            onFocus={() => setIsDescFocused(true)}
                            onBlur={() => setIsDescFocused(false)}
                            placeholder="补一两句细节吧，好让未来的你认出今天的心跳♪"
                            className="w-full bg-white/30 dark:bg-black/20 border-none rounded-2xl px-5 py-4 text-sm text-slate-600 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-200/50 min-h-[140px] resize-none shadow-inner"
                          />
                        ) : (
                          <div
                            onClick={() => setIsDescFocused(true)}
                            className="flex flex-col gap-4 pl-6 cursor-pointer"
                          >
                            {description.split("\n").filter(p => p.trim()).map((p, i) => (
                              <div key={i} className="relative text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                                <div className="absolute -left-6 top-2.5 w-1.5 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
                                {p}
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LiquidCard>

      {/* Outside: Emotions & Buttons (Always visible) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 px-6">
        <div className={`flex flex-wrap gap-2.5 flex-1 transition-all duration-500 ${hasValue ? "opacity-100 translate-y-0" : "opacity-40 grayscale pointer-events-none"}`}>
          <div className="flex items-center gap-2 mr-3">
            <TagIcon className="w-4 h-4 text-slate-400" />
            <span className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-black">情绪</span>
          </div>
          {PREDEFINED_TAGS.map((tag) => {
            const active = extraEmotions.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
                  active
                    ? "bg-pink-100 dark:bg-pink-900/40 border-pink-200 dark:border-pink-800 text-pink-600 dark:text-pink-300 shadow-glow"
                    : "bg-white/20 dark:bg-black/20 border-white/60 dark:border-white/10 text-slate-500 hover:border-pink-200"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>

        <ActionPairRow
          type="save-universe"
          leftLabel="留下痕迹"
          rightLabel="星海回响"
          onLeftClick={onSave}
          onRightClick={onJumpUniverse}
          isRightActive={isPublic}
          rightActiveLabel={isPublic ? "星海已连接" : "私密存储中"}
          isSwitched={isPublic}
          onSwitchToggle={onPublicToggle}
          isPending={isPending}
        />
      </div>

      <AnimatePresence>
        {feedbackMessage ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`mx-6 rounded-[1.4rem] border px-4 py-3 text-sm leading-relaxed ${
              feedbackTone === "error"
                ? "border-amber-200/70 bg-amber-50/75 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200"
                : "border-emerald-200/70 bg-emerald-50/70 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-200"
            }`}
          >
            {feedbackMessage}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
