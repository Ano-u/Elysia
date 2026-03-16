import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AuroraBackground } from "./components/layout/AuroraBackground";
import { CrystalButton } from "./components/ui/CrystalButton";
import { HomeView } from "./domains/home/HomeView";
import { UniverseView } from "./domains/universe/UniverseView";
import { MindMapView } from "./domains/mindmap/MindMapView";
import { Moon, Sun, Home, Compass, Network, Settings2 } from "lucide-react";
import { useUiStore } from "./store/uiStore";

function App() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [currentView, setCurrentView] = useState<
    "home" | "universe" | "mindmap"
  >("home");
  const { reduceMotion, toggleReduceMotion } = useUiStore();

  useEffect(() => {
    // Sync theme with HTML document
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <AuroraBackground>
      <div className="relative w-full h-screen overflow-hidden">
        {/* Top Navigation / Controls */}
        <div className="absolute top-6 right-6 flex gap-3 z-50">
          <CrystalButton
            variant="ghost"
            size="icon"
            onClick={toggleReduceMotion}
            className="rounded-full"
            title={reduceMotion ? "开启华丽动画" : "减弱动画效果"}
          >
            <Settings2
              className={`w-5 h-5 ${reduceMotion ? "opacity-50" : "opacity-100"}`}
            />
          </CrystalButton>
          <CrystalButton
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="rounded-full"
          >
            {theme === "light" ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5" />
            )}
          </CrystalButton>
        </div>

        {/* Bottom Tab Navigation */}
        <div className="absolute bottom-0 w-full md:bottom-8 md:w-max md:left-1/2 md:-translate-x-1/2 flex items-center justify-around md:justify-center p-3 md:p-2 md:rounded-full bg-white/60 md:bg-white/10 dark:bg-black/40 md:dark:bg-black/20 backdrop-blur-xl border-t md:border border-white/20 dark:border-white/10 shadow-[var(--shadow-crystal)] z-50 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-2 transition-all duration-300">
          <CrystalButton
            variant={currentView === "home" ? "primary" : "ghost"}
            onClick={() => setCurrentView("home")}
            className={`rounded-xl md:rounded-full px-4 md:px-6 py-2 md:py-2 transition-all flex flex-col md:flex-row items-center gap-1 md:gap-2 h-auto ${currentView === "home" ? (reduceMotion ? "font-bold" : "scale-105") : "opacity-70 hover:opacity-100"}`}
          >
            <Home className="w-5 h-5 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-sm">空间站</span>
          </CrystalButton>
          <div className="hidden md:block w-px h-6 bg-white/20 dark:bg-white/10 mx-2" />
          <CrystalButton
            variant={currentView === "universe" ? "primary" : "ghost"}
            onClick={() => setCurrentView("universe")}
            className={`rounded-xl md:rounded-full px-4 md:px-6 py-2 md:py-2 transition-all flex flex-col md:flex-row items-center gap-1 md:gap-2 h-auto ${currentView === "universe" ? (reduceMotion ? "font-bold" : "scale-105") : "opacity-70 hover:opacity-100"}`}
          >
            <Compass className="w-5 h-5 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-sm">星海漫游</span>
          </CrystalButton>
          <div className="hidden md:block w-px h-6 bg-white/20 dark:bg-white/10 mx-2" />
          <CrystalButton
            variant={currentView === "mindmap" ? "primary" : "ghost"}
            onClick={() => setCurrentView("mindmap")}
            className={`rounded-xl md:rounded-full px-4 md:px-6 py-2 md:py-2 transition-all flex flex-col md:flex-row items-center gap-1 md:gap-2 h-auto ${currentView === "mindmap" ? (reduceMotion ? "font-bold" : "scale-105") : "opacity-70 hover:opacity-100"}`}
          >
            <Network className="w-5 h-5 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-sm">记忆之网</span>
          </CrystalButton>
        </div>

        <AnimatePresence mode="wait">
          {currentView === "home" && (
            <motion.div
              key="home"
              initial={
                reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }
              }
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
              transition={{
                duration: reduceMotion ? 0.3 : 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="absolute inset-0 w-full h-full"
            >
              <HomeView />
            </motion.div>
          )}
          {currentView === "universe" && (
            <motion.div
              key="universe"
              initial={
                reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }
              }
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
              transition={{
                duration: reduceMotion ? 0.3 : 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="absolute inset-0 w-full h-full"
            >
              <UniverseView />
            </motion.div>
          )}
          {currentView === "mindmap" && (
            <motion.div
              key="mindmap"
              initial={
                reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }
              }
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
              transition={{
                duration: reduceMotion ? 0.3 : 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="absolute inset-0 w-full h-full"
            >
              <MindMapView />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuroraBackground>
  );
}

export default App;
