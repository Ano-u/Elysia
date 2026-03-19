import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LiquidCard } from "./LiquidCard";
import { ActionPairRow } from "./ActionPairRow";
import { ChevronDown, ChevronUp, Tag as TagIcon, Quote } from "lucide-react";

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
}

const PREDEFINED_TAGS = ["温柔", "热烈", "想念", "孤独", "平静", "欢欣", "迷茫", "希望"];

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
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isQuoteFocused, setIsQuoteFocused] = useState(false);
  const [isDescFocused, setIsDescFocused] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const hasValue = moodPhrase.trim().length > 0;
  const isLanding = !hasValue && !isFocused;
  const isCompact = hasValue && !isFocused;

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
              placeholder="把此刻轻轻放进礼堂，让爱替你记住它"
              value={moodPhrase}
              onChange={(e) => setMoodPhrase(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
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
                          placeholder="想把哪句话做成今日誓言..."
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
                    详细描述
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
                            placeholder="补一两句细节，让未来的自己更懂今天..."
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
    </div>
  );
};
