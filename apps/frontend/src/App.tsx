import { type ComponentType, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Compass,
  Home,
  Moon,
  Network,
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
    return storedTheme === "dark" ? "dark" : "light";
  });
  const [currentView, setCurrentView] = useState<AppView>("home");
  const [isCoarsePointer, setIsCoarsePointer] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(pointer: coarse)").matches;
  });
  const [isPointerIdle, setIsPointerIdle] = useState(false);
  const [isNearBottomZone, setIsNearBottomZone] = useState(false);
  const [isNearTopRightZone, setIsNearTopRightZone] = useState(false);
  const [isBottomNavHovered, setIsBottomNavHovered] = useState(false);
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

      const { innerWidth, innerHeight } = window;
      const nearBottom = event.clientY >= innerHeight - 170;
      const nearTopRight = event.clientX >= innerWidth - 260 && event.clientY <= 180;

      setIsNearBottomZone(nearBottom);
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

  const showBottomNav = isCoarsePointer || isBottomNavHovered || (isNearBottomZone && !isPointerIdle);
  const showTopControls =
    isCoarsePointer ||
    !hasVisitedOverFiveDays ||
    isTopControlsHovered ||
    (isNearTopRightZone && !isPointerIdle);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const tabs: Array<{
    id: AppView;
    label: string;
    icon: ComponentType<{ className?: string }>;
    visible: boolean;
  }> = [
    { id: "home", label: "Elysia 记录", icon: Home, visible: true },
    { id: "universe", label: "星海回响", icon: Compass, visible: true },
    { id: "mindmap", label: "记忆织网", icon: Network, visible: true },
    { id: "admin", label: "治理控制台", icon: Shield, visible: canOpenAdmin },
  ];

  return (
    <AuroraBackground>
      <div className="relative h-screen w-full overflow-hidden">
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
            title={reduceMotion ? "恢复 Elysia 动态光影" : "减弱 Elysia 动态光影"}
          >
            <Settings2 className={`h-5 w-5 ${reduceMotion ? "opacity-50" : "opacity-100"}`} />
          </CrystalButton>
          <CrystalButton variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full">
            {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </CrystalButton>
        </motion.div>

        <motion.div
          initial={false}
          animate={{
            opacity: showBottomNav ? 1 : 0,
            y: showBottomNav ? 0 : 20,
          }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          onMouseEnter={() => setIsBottomNavHovered(true)}
          onMouseLeave={() => setIsBottomNavHovered(false)}
          className={`absolute bottom-0 z-50 w-full pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-8 md:left-1/2 md:w-max md:-translate-x-1/2 md:pb-0 ${showBottomNav ? "pointer-events-auto" : "pointer-events-none"}`}
        >
          <div
            className={`flex items-center justify-around rounded-none border-t p-3 backdrop-blur-xl transition-all duration-300 md:justify-center md:rounded-full md:border md:p-2 ${
              showBottomNav
                ? "bg-white/60 shadow-[var(--shadow-crystal)] dark:bg-black/35"
                : "border-transparent bg-white/0 shadow-none dark:bg-black/0"
            } border-white/20 dark:border-white/10`}
          >
            {tabs
              .filter((tab) => tab.visible)
              .map((tab, index, visibleTabs) => {
                const Icon = tab.icon;
                const active = activeView === tab.id;
                return (
                  <div key={tab.id} className="flex items-center">
                    <CrystalButton
                      variant={active ? "primary" : "ghost"}
                      onClick={() => {
                        if (tab.id === "admin" && !canOpenAdmin) {
                          return;
                        }
                        setCurrentView(tab.id);
                      }}
                      className={`h-auto rounded-2xl px-4 py-2 transition-all md:rounded-full md:px-6 ${
                        active
                          ? reduceMotion
                            ? "font-bold"
                            : "scale-105"
                          : "opacity-70 hover:opacity-100"
                      } flex flex-col items-center gap-1 md:flex-row md:gap-2`}
                    >
                      <Icon className="h-5 w-5 md:h-4 md:w-4" />
                      <span className="text-[10px] md:text-sm">{tab.label}</span>
                    </CrystalButton>
                    {index < visibleTabs.length - 1 && (
                      <div className="mx-2 hidden h-6 w-px bg-white/20 dark:bg-white/10 md:block" />
                    )}
                  </div>
                );
              })}
          </div>
        </motion.div>

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
              <HomeView />
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
                  退出控制台
                </CrystalButton>
              </div>
              <AdminDashboard />
            </motion.div>
          )}
        </AnimatePresence>

        <AccessApplicationModal />
        <AppealsModal />
      </div>
    </AuroraBackground>
  );
}

export default App;
