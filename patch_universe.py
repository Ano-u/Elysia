import re
import os

with open("apps/frontend/src/domains/universe/UniverseView.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
imports = """import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainInputCard, PREDEFINED_TAGS } from "../../components/ui/MainInputCard";
import { ActionPairRow } from "../../components/ui/ActionPairRow";
import { createReply } from "../../lib/apiClient";
import { Tag as TagIcon, MessageCircle } from "lucide-react";"""

content = re.sub(
    r'import \{ useQuery \} from "@tanstack/react-query";',
    imports,
    content
)

emotion_selector = """
const EmotionSelector: React.FC<{
  extraEmotions: string[];
  onToggle: (tag: string) => void;
}> = ({ extraEmotions, onToggle }) => (
  <div className="flex flex-wrap gap-2.5 flex-1 mb-6 mt-4">
    <div className="flex items-center gap-2 mr-3">
      <TagIcon className="w-4 h-4 text-slate-400" />
      <span className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-black">情绪</span>
    </div>
    {PREDEFINED_TAGS.map((tag) => {
      const active = extraEmotions.includes(tag);
      return (
        <button
          key={tag}
          onClick={() => onToggle(tag)}
          className={`px-3 py-1 rounded-full text-[10px] border-2 transition-all ${
            active
              ? "bg-pink-100/40 dark:bg-pink-900/30 border-pink-200/30 dark:border-pink-800/40 text-pink-600 dark:text-pink-300 shadow-glow"
              : "bg-white/20 dark:bg-black/40 border-white/30 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-pink-200 dark:hover:border-pink-800"
          }`}
        >
          {tag}
        </button>
      );
    })}
  </div>
);

export const UniverseView: React.FC = () => {
"""
content = content.replace("export const UniverseView: React.FC = () => {", emotion_selector)

state_injections = """  const [selectedCard, setSelectedCard] = useState<any | null>(null);

  // For reply panel
  const queryClient = useQueryClient();
  const [isReplying, setIsReplying] = useState(false);
  const [replyDraft, setReplyDraft] = useState({
    moodPhrase: "",
    quote: "",
    description: "",
    extraEmotions: [] as string[],
    visibilityIntent: "public" as "public" | "private",
  });
  
  const createMutation = useMutation({
    mutationFn: (data: any) => createReply(selectedCard?.id, data),
    onSuccess: () => {
      setIsReplying(false);
      setReplyDraft({
        moodPhrase: "",
        quote: "",
        description: "",
        extraEmotions: [],
        visibilityIntent: "public",
      });
      // 可以加个 toast 或刷新逻辑
    }
  });

  const handleSaveReply = () => {
    if (!replyDraft.moodPhrase.trim()) return;
    createMutation.mutate({
      content: replyDraft.moodPhrase,
      moodPhrase: replyDraft.moodPhrase,
      quote: replyDraft.quote,
      description: replyDraft.description,
      extraEmotions: replyDraft.extraEmotions,
      isPublic: replyDraft.visibilityIntent === "public"
    });
  };

  const selectedCardRef = useRef<any | null>(null);
  useEffect(() => {
    selectedCardRef.current = selectedCard;
  }, [selectedCard]);
"""
content = content.replace("  const [selectedCard, setSelectedCard] = useState<any | null>(null);", state_injections)

handle_wheel_fix = """    const handleWheel = (e: WheelEvent) => {
      if (selectedCardRef.current) return;
      // 防止触控板双指滚动变成页面滚动或前进后退
      e.preventDefault();"""
content = content.replace("""    const handleWheel = (e: WheelEvent) => {
      // 防止触控板双指滚动变成页面滚动或前进后退
      e.preventDefault();""", handle_wheel_fix)

modal_start_old = """            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto hide-scrollbar rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl p-8"
              onClick={(e) => e.stopPropagation()}
            >"""

modal_start_new = """            <div className="flex gap-4 items-stretch h-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 overflow-y-auto hide-scrollbar flex-1 relative">"""

content = content.replace(modal_start_old, modal_start_new)

modal_wrapper_old = """            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedCard(null)}"""
modal_wrapper_new = """            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm"
            onClick={() => { setSelectedCard(null); setIsReplying(false); }}"""
content = content.replace(modal_wrapper_old, modal_wrapper_new)

desc_old = """                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed bg-white/40 dark:bg-black/20 p-4 rounded-2xl border border-white/50 dark:border-white/5 whitespace-pre-wrap break-words">
                      {selectedCard.description}
                    </p>"""
desc_new = """                    <div className="max-h-[30vh] overflow-y-auto hide-scrollbar pr-2">
                      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed bg-white/40 dark:bg-black/20 p-4 rounded-2xl border border-white/50 dark:border-white/5 whitespace-pre-wrap break-words">
                        {selectedCard.description}
                      </p>
                    </div>"""
content = content.replace(desc_old, desc_new)

footer_old = """                <button 
                  onClick={() => setSelectedCard(null)}
                  className="px-6 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium hover:scale-105 transition-transform shadow-lg"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </motion.div>"""
footer_new = """                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsReplying(!isReplying)}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-300 text-sm font-medium hover:scale-105 transition-transform shadow-sm"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {isReplying ? "取消评论" : "添加评论"}
                  </button>
                  <button 
                    onClick={() => { setSelectedCard(null); setIsReplying(false); }}
                    className="px-6 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium hover:scale-105 transition-transform shadow-lg"
                  >
                    关闭
                  </button>
                </div>
              </div>
              </div>
            </motion.div>

            {/* Right Side: The Reply Panel */}
            <AnimatePresence>
              {isReplying && (
                <motion.div
                  initial={{ width: 0, opacity: 0, x: -20 }}
                  animate={{ width: 440, opacity: 1, x: 0 }}
                  exit={{ width: 0, opacity: 0, x: -20 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="overflow-hidden h-full flex-shrink-0"
                >
                  <div cla
