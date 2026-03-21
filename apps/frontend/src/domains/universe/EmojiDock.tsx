import React from "react";

/** 5 个可拖拽表情 */
export const REACTION_EMOJIS = [
  { type: "heart", emoji: "💗", label: "心心", color: "rgba(255,105,180,0.5)" },
  { type: "hug", emoji: "🤗", label: "拥抱", color: "rgba(255,200,100,0.5)" },
  { type: "star", emoji: "⭐", label: "闪耀", color: "rgba(255,230,120,0.5)" },
  { type: "butterfly", emoji: "🦋", label: "蝴蝶", color: "rgba(200,162,232,0.5)" },
  { type: "flower", emoji: "🌸", label: "花朵", color: "rgba(240,182,214,0.5)" },
] as const;

export const EmojiDock: React.FC = () => {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, type: string) => {
    e.dataTransfer.setData("text/emoji-type", type);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="absolute bottom-6 right-6 z-50 flex flex-col gap-2 items-center">
      <div className="rounded-2xl border border-white/40 dark:border-white/15 bg-white/50 dark:bg-black/40 backdrop-blur-xl p-2 flex flex-col gap-1.5 shadow-[var(--shadow-crystal)]">
        {REACTION_EMOJIS.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => handleDragStart(e, item.type)}
            className="w-10 h-10 flex items-center justify-center rounded-xl cursor-grab active:cursor-grabbing hover:bg-white/40 dark:hover:bg-white/10 transition-colors select-none"
            title={item.label}
          >
            <span className="text-xl pointer-events-none">{item.emoji}</span>
          </div>
        ))}
      </div>
      <span className="text-[10px] text-white/50 dark:text-white/30">拖到卡片上</span>
    </div>
  );
};
