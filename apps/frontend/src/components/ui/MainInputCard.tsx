import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LiquidCard } from "./LiquidCard";
import { ActionPairRow } from "./ActionPairRow";
import { ChevronDown, ChevronUp, Tag as TagIcon } from "lucide-react";

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
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
      {/* Card: Mood + Quote + Details */}
      <LiquidCard className="bg-white/45 dark:bg-black/23 overflow-hidden p-8 transition-all duration-500">
        <div className="flex flex-col gap-6">
          {/* Main Input Section */}
          <div className="relative">
            <textarea
              autoFocus={hasValue}
              className={`font-elysia-display w-full resize-none border-none bg-transparent p-0 outline-none placeholder:text-slate-400/50 focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-300/30 transition-all duration-500 ease-in-out ${
                isLanding ? "text-[2.5rem] min-h-[120px]" : isCompact ? "text-xl min-h-[40px] font-bold" : "text-[2rem] min-h-[100px]"
              }`}
              placeholder="把此刻轻轻放进 Elysia..."
              value={moodPhrase}
              onChange={(e) => setMoodPhrase(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={isPending}
            />
          </div>

          {/* Quote & Details */}
          <AnimatePresence>
            {hasValue && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col gap-6 overflow-hidden"
              >
                {/* Row 1: Quote */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] tracking-widest text-slate-400 uppercase font-medium">
                    今日誓言
                  </span>
                  <input
                    type="text"
                    value={quote}
                    onChange={(e) => setQuote(e.target.value)}
                    placeholder="..."
                    className="w-full bg-white/30 dark:bg-black/10 border-none rounded-xl px-4 py-2 text-sm italic text-slate-600 dark:text-slate-300 outline-none focus:ring-1 focus:ring-pink-200 transition-all"
                  />
                </div>

                {/* Row 3: Details (Unfold) */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-2 text-[10px] tracking-widest text-slate-400 uppercase font-medium hover:text-slate-600 transition-colors w-fit"
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
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="补一两句细节，让未来的自己更懂今天..."
                          className="w-full bg-white/30 dark:bg-black/10 border-none rounded-xl px-4 py-3 text-sm text-slate-600 dark:text-slate-300 outline-none focus:ring-1 focus:ring-pink-200 min-h-[100px] resize-none"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LiquidCard>

      {/* Outside: Emotions & Buttons */}
      <AnimatePresence>
        {hasValue && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4"
          >
            <div className="flex flex-wrap gap-2 flex-1">
              <div className="flex items-center gap-2 mr-2">
                <TagIcon className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] tracking-widest text-slate-400 uppercase font-medium">情绪</span>
              </div>
              {PREDEFINED_TAGS.map((tag) => {
                const active = extraEmotions.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1 rounded-full text-[10px] border transition-all ${
                      active 
                        ? "bg-pink-100 dark:bg-pink-900/30 border-pink-200 dark:border-pink-800/50 text-pink-600 dark:text-pink-300" 
                        : "bg-white/20 dark:bg-black/10 border-white/40 dark:border-white/5 text-slate-500 hover:bg-white/40 dark:hover:bg-white/5"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <ActionPairRow
              leftLabel="留下痕迹"
              rightLabel="星海回响"
              onLeftClick={onSave}
              onRightClick={onJumpUniverse}
              isRightActive={isPublic}
              rightActiveLabel={isPublic ? "公开中" : "仅私密"}
              isSwitched={isPublic}
              onSwitchToggle={onPublicToggle}
              isPending={isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
