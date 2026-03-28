import React, { useState, useMemo } from "react";
import { RefreshCw, Plus } from "lucide-react";

const SYSTEM_MOODS = [
  "平静 Peaceful", "喜悦 Joyful", "期待 Hopeful", "疲惫 Tired", 
  "迷茫 Lost", "感恩 Grateful", "孤独 Lonely", "释然 Relieved", 
  "焦虑 Anxious", "激动 Excited", "治愈 Healed", "遗憾 Regretful", 
  "怀念 Nostalgic", "勇敢 Brave", "委屈 Aggrieved", "灵感 Inspired", 
  "满足 Content", "沮丧 Frustrated", "温暖 Warm", "轻松 Relaxed"
];

export const MoodSelector: React.FC<{
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const [page, setPage] = useState(0);
  // Auto switch to custom mode if value is not in SYSTEM_MOODS and is not empty
  const isCustomValue = value !== "" && !SYSTEM_MOODS.includes(value);
  const [isCustomMode, setIsCustomMode] = useState(isCustomValue);
  
  const pageSize = 8;
  const totalPages = Math.ceil(SYSTEM_MOODS.length / pageSize);
  
  const currentMoods = useMemo(() => {
    const start = page * pageSize;
    return SYSTEM_MOODS.slice(start, start + pageSize);
  }, [page]);

  const handleNextPage = () => {
    setPage((p) => (p + 1) % totalPages);
  };

  const validateCustom = (text: string) => {
    const cnMatch = text.match(/[\u4e00-\u9fa5]/g);
    const hasCn = !!cnMatch;
    if (hasCn) {
      return text.length <= 5;
    }
    const words = text.trim().split(/\s+/).filter(Boolean);
    return words.length <= 2;
  };

  const isCustom = isCustomMode || isCustomValue;

  return (
    <div className="w-full relative z-10">
      <p className="text-[12px] elysia-glow-text mb-4">ELYSIA · 心绪记录</p>
      
      {!isCustom ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2.5">
            {currentMoods.map(mood => (
              <button
                key={mood}
                type="button"
                disabled={disabled}
                onClick={() => onChange(mood)}
                className={`rounded-full px-4 py-2 text-[0.95rem] transition-all border ${
                  value === mood 
                    ? "bg-pink-100 border-pink-300 text-pink-700 dark:bg-pink-900/40 dark:border-pink-500/50 dark:text-pink-100 shadow-sm" 
                    : "bg-white/60 border-white/50 text-slate-600 hover:bg-white/90 dark:bg-black/20 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                }`}
              >
                {mood}
              </button>
            ))}
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setIsCustomMode(true);
                onChange("");
              }}
              className="rounded-full px-4 py-2 text-[0.95rem] transition-all border bg-white/60 border-white/50 text-slate-600 hover:bg-white/90 dark:bg-black/20 dark:border-white/10 dark:text-slate-300 flex items-center gap-1.5"
            >
              <Plus size={15} />
              自定义
            </button>
          </div>
          <button 
            type="button" 
            onClick={handleNextPage}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 self-start px-2 py-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <RefreshCw size={14} />
            换一批 ({page + 1}/{totalPages})
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={value}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "" || validateCustom(val) || val.length < value.length) {
                onChange(val);
              }
            }}
            disabled={disabled}
            placeholder="自定义心情 (中文≤5字，英文≤2词)"
            className="font-elysia-display w-full resize-none border-b border-pink-200/60 dark:border-pink-900/40 bg-transparent py-2 text-[2rem] leading-[1.4] text-slate-700 outline-none placeholder:text-slate-400/58 focus:border-pink-400 dark:text-slate-100 dark:placeholder:text-slate-300/35 sm:text-[2.2rem] transition-colors"
            autoFocus
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-slate-400">
              *自定义心情需经过审核后才能公开展示
            </span>
            <button 
              type="button" 
              onClick={() => {
                setIsCustomMode(false);
                onChange("");
              }}
              className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 px-3 py-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              返回预设心情
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
