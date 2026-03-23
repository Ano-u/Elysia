import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Moon,
  Settings2,
  Shield,
  Sun,
} from "lucide-react";
import { AuroraBackground } from "./components/layout/AuroraBackground";
import { CrystalButton } from "./components/ui/CrystalButton";
import { AccessApplicationModal } from "./components/ui/AccessApplicationModal";
import { AppealsModal } from "./components/ui/AppealsModal";
import { HomeView } from "./domains/home/HomeView";
import { UniverseView } from "./domains/universe/UniverseView";
import { MindMapView } from "./domains/mindmap/MindMapView";
import { AdminDashboard } from "./domains/admin/AdminDashboard";
import { getAuthMe, switchUser } from "./lib/apiClient";
import { useUiStore } from "./store/uiStore";

type AppView = "home" | "universe" | "mindmap" | "admin";

const FIRST_VISIT_STORAGE_KEY = "elysia-first-visit-at";
const THEME_STORAGE_KEY = "elysia-theme";
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") {
      return "light";
    }
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "dark" || storedTheme === "light") {
      return storedTheme;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [currentView, setCurrentView] = useState<AppView>("home");
  const [isCoarsePointer, setIsCoarsePointer] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(pointer: coarse)").matches;
  });
  const [isPointerIdle, setIsPointerIdle] = useState(false);
  const [isNearTopRightZone, setIsNearTopRightZone] = useState(false);
  const [isTopControlsHovered, setIsTopControlsHovered] = useState(false);
  const [hasVisitedOverFiveDays] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    const saved = window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY);
    const parsed = saved ? Number(saved) : NaN;
    if (!saved || !Number.isFinite(parsed)) {
      return false;
    }
    return Date.now() - parsed >= FIVE_DAYS_MS;
  });
  const lastPointerMoveAtRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);
  const { reduceMotion, toggleReduceMotion } = useUiStore();
  const queryClient = useQueryClient();

  const isLocalDev = import.meta.env.DEV;

  const authQuery = useQuery({
    queryKey: ["auth-me"],
    queryFn: getAuthMe,
    retry: false,
  });

  const ensureDevAdminMutation = useMutation({
    mutationFn: () =>
      switchUser({
        username: "local_admin",
        displayName: "本地管理员",
        role: "admin",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    },
  });
  const ensureDevAdmin = ensureDevAdminMutation.mutate;

  const canOpenAdmin = authQuery.data?.user?.role === "admin";
  const activeView: AppView = !canOpenAdmin && currentView === "admin" ? "home" : currentView;
  const isUniverseView = activeView === "universe";
  const isMindMapView = activeView === "mindmap";
  const showSceneNav = isUniverseView || isMindMapView;

  useEffect(() => {
    if (
      !isLocalDev ||
      authQuery.isLoading ||
      authQuery.isFetching ||
      ensureDevAdminMutation.isPending ||
      ensureDevAdminMutation.isError
    ) {
      return;
    }
    if (authQuery.data?.user?.role === "admin") {
      return;
    }
    ensureDevAdmin();
  }, [
    isLocalDev,
    authQuery.isLoading,
    authQuery.isFetching,
    authQuery.data?.user?.role,
    ensureDevAdminMutation.isPending,
    ensureDevAdminMutation.isError,
    ensureDevAdmin,
  ]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    const saved = localStorage.getItem(FIRST_VISIT_STORAGE_KEY);
    if (!saved) {
      localStorage.setItem(FIRST_VISIT_STORAGE_KEY, String(Date.now()));
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      if (!window.localStorage.getItem(THEME_STORAGE_KEY)) {
        setTheme(e.matches ? "dark" : "light");
      }
    };
    // Support for older browsers that don't have addEventListener on MediaQueryList
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const onChange = (event: MediaQueryListEvent) => setIsCoarsePointer(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    lastPointerMoveAtRef.current = Date.now();

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }

      const { innerWidth } = window;
      const nearTopRight = event.clientX >= innerWidth - 260 && event.clientY <= 180;

      setIsNearTopRightZone(nearTopRight);
      lastPointerMoveAtRef.current = Date.now();
      setIsPointerIdle(false);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(() => {
        if (Date.now() - lastPointerMoveAtRef.current >= 1150) {
          setIsPointerIdle(true);
        }
      }, 1200);
    };

    window.addEventListener("pointermove", onPointerMove);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  const showTopControls =
    isCoarsePointer ||
    !hasVisitedOverFiveDays ||
    isTopControlsHovered ||
    (isNearTopRightZone && !isPointerIdle);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const topControls = (
    <motion.div
      initial={false}
      animate={{
        opacity: showTopControls ? 1 : 0,
        y: showTopControls ? 0 : -12,
      }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setIsTopControlsHovered(true)}
      onMouseLeave={() => setIsTopControlsHovered(false)}
      className={`absolute right-6 top-6 z-50 flex gap-3 ${showTopControls ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <CrystalButton
        variant="ghost"
        size="icon"
        onClick={toggleReduceMotion}
        className="rounded-full"
        title={reduceMotion ? "恢复动态" : "减弱动态"}
      >
        <Settings2 className={`h-5 w-5 ${reduceMotion ? "opacity-50" : "opacity-100"}`} />
      </CrystalButton>
      <CrystalButton
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="rounded-full"
        title={theme === "light" ? "天穹市" : "永恒礼堂"}
      >
        {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </CrystalButton>
    </motion.div>
  );

  const adminControl = canOpenAdmin ? (
    <motion.div
      initial={false}
      animate={{
        opacity: showTopControls ? 1 : 0,
        y: showTopControls ? 0 : -12,
      }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setIsTopControlsHovered(true)}
      onMouseLeave={() => setIsTopControlsHovered(false)}
      className={`absolute left-6 top-6 z-50 flex gap-3 ${showTopControls ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <CrystalButton variant="ghost" size="icon" onClick={() => setCurrentView("admin")} className="rounded-full">
        <Shield className="h-5 w-5" />
      </CrystalButton>
    </motion.div>
  ) : null;

  return (
    <AuroraBackground>
      <div className="relative h-screen w-full overflow-hidden">
        {activeView !== "home" && topControls}

        {showSceneNav && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-6 top-6 z-[60] flex flex-wrap items-center gap-2 rounded-full border border-white/50 bg-white/58 p-1.5 shadow-lg backdrop-blur-xl dark:border-white/15 dark:bg-black/28"
          >
            <CrystalButton
              variant="ghost"
              size="sm"
              onClick={() => setCurrentView("home")}
              className="rounded-full px-4"
            >
              往世乐土
            </CrystalButton>
            <CrystalButton
              variant={isUniverseView ? "primary" : "ghost"}
              size="sm"
              onClick={() => setCurrentView("universe")}
              className="rounded-full px-4"
            >
              星海回响
            </CrystalButton>
            <CrystalButton
              variant={isMindMapView ? "primary" : "ghost"}
              size="sm"
              onClick={() => setCurrentView("mindmap")}
              className="rounded-full px-4"
            >
              记忆织网
            </CrystalButton>
          </motion.div>
        )}


        <AnimatePresence mode="wait">
          {activeView === "home" && (
            <motion.div
              key="home"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
              transition={{ duration: reduceMotion ? 0.28 : 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 h-full w-full"
            >
              <HomeView
                onNavigate={setCurrentView}
                viewerUserId={authQuery.data?.user?.id ?? null}
                authReady={!authQuery.isLoading && !authQuery.isFetching}
                isLocalDev={isLocalDev}
                topControls={topControls}
                adminControl={adminControl}
                theme={theme}
              />
            </motion.div>
          )}
          {activeView === "universe" && (
            <motion.div
              key="universe"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
              transition={{ duration: reduceMotion ? 0.28 : 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 h-full w-full"
            >
              <UniverseView />
            </motion.div>
          )}
          {activeView === "mindmap" && (
            <motion.div
              key="mindmap"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
              transition={{ duration: reduceMotion ? 0.28 : 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 h-full w-full"
            >
              <MindMapView />
            </motion.div>
          )}
          {activeView === "admin" && canOpenAdmin && (
            <motion.div
              key="admin"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
              transition={{ duration: reduceMotion ? 0.28 : 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 z-[100] h-full w-full bg-slate-50 dark:bg-slate-900"
            >
              <div className="absolute left-6 top-6 z-[120]">
                <CrystalButton variant="ghost" onClick={() => setCurrentView("home")} className="rounded-full">
                  往世乐土
                </CrystalButton>
              </div>
              <AdminDashboard />
            </motion.div>
          )}
        </AnimatePresence>

        {canOpenAdmin && activeView !== "home" && activeView !== "admin" && (
          adminControl
        )}

        <AccessApplicationModal />
        <AppealsModal />
      </div>
    </AuroraBackground>
  );
}

export default App;
