import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  reduceMotion: boolean;
  toggleReduceMotion: () => void;
  setReduceMotion: (value: boolean) => void;
}

// 检查系统是否偏好减少动画
const getSystemPrefersReducedMotion = () => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      reduceMotion: getSystemPrefersReducedMotion(),
      toggleReduceMotion: () =>
        set((state) => ({ reduceMotion: !state.reduceMotion })),
      setReduceMotion: (value) => set({ reduceMotion: value }),
    }),
    {
      name: "elysia-ui-preferences",
    },
  ),
);
