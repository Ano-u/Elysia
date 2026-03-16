import { create } from "zustand";

export interface DraftState {
  content: string; // 首句
  quote: string; // 金句
  emotion: string; // 附加情绪
  lastUpdated: number | null;
  setContent: (content: string) => void;
  setQuote: (quote: string) => void;
  setEmotion: (emotion: string) => void;
  saveDraft: () => Promise<void>;
  resetDraft: () => void;
}

// 模拟防抖保存
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useDraftStore = create<DraftState>((set, get) => ({
  content: "",
  quote: "",
  emotion: "",
  lastUpdated: null,

  setContent: (content) => {
    set({ content, lastUpdated: Date.now() });
    get().saveDraft();
  },

  setQuote: (quote) => {
    set({ quote, lastUpdated: Date.now() });
    get().saveDraft();
  },

  setEmotion: (emotion) => {
    set({ emotion, lastUpdated: Date.now() });
    get().saveDraft();
  },

  saveDraft: async () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    return new Promise((resolve) => {
      saveTimeout = setTimeout(() => {
        // 模拟本地存储或 API 调用
        console.log("保存草稿:", {
          content: get().content,
          quote: get().quote,
          emotion: get().emotion,
          time: new Date(get().lastUpdated || Date.now()).toISOString(),
        });
        resolve();
      }, 1000); // 1秒防抖
    });
  },

  resetDraft: () =>
    set({ content: "", quote: "", emotion: "", lastUpdated: null }),
}));
