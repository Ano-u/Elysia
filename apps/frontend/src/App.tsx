import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Moon,
  SquarePlay,
  SquareStop,
  Shield,
  Sun,
  Landmark,
  Compass,
  Network
} from "lucide-react";
import { NavIconButton } from "./components/ui/NavIconButton";
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
  const [navVisible, setNavVisible] = useState(true);
  const [navExpanded, setNavExpanded] = useState(true);
  const [hoveredLeft, setHoveredLeft] = useState(false);
  const [hoveredRight, setHoveredRight] = useState(false);

  const expandTimerRef = useRef<number | null>(null);
  const lastActiveViewRef = useRef<AppView>("home");
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
    if (activeView !== lastActiveViewRef.current) {
      lastActiveViewRef.current = activeView;
      setNavExpanded(true);
      setNavVisible(true);
    }
  }, [activeView]);

  useEffect(() => {
    if (expandTimerRef.current) {
      window.clearTimeout(expandTimerRef.current);
    }
    if (hoveredLeft || hoveredRight) {
      setNavExpanded(true);
      return;
    }
    expandTimerRef.current = window.setTimeout(() => {
      setNavExpanded(false);
    }, 2500);
    return () => {
      if (expandTimerRef.current) window.clearTimeout(expandTimerRef.current);
    };
  }, [activeView, hoveredLeft, hoveredRight]);

  useEffect(() => {
    const lastScrollYMap = new WeakMap<HTMLElement, number>();
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target || typeof target.scrollTop !== "number") return;

      const currentScrollY = target.scrollTop;
      const lastScrollY = lastScrollYMap.get(target) || 0;
      const diff = currentScrollY - lastScrollY;

      if (currentScrollY <= 0) {
        setNavVisible(true);
      } else if (diff > 5) {
        setNavVisible(false);
        setNavExpanded(false);
      } else if (diff < -5) {
        setNavVisible(true);
      }
      lastScrollYMap.set(target, currentScrollY);
    };
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const nearTopArea = e.clientY <= 140;
      if (nearTopArea) setNavVisible(true);
    };
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);
  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const isLeftExpanded = navExpanded || hoveredLeft || isCoarsePointer;
  const isRightExpanded = navExpanded || hoveredRight || isCoarsePointer;

  const rightControls = (
    <motion.div
      initial={false}
      animate={{ opacity: navVisible ? 1 : 0, y: navVisible ? 0 : -12 }}
      transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHoveredRight(true)}
      onMouseLeave={() => setHoveredRight(false)}
      onClick={() => { if (!navExpanded) setNavExpanded(true); }}
      className={`absolute right-6 top-6 z-50 flex items-center pointer-events-auto ${navVisible ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <AnimatePresence initial={false}>
        {isRightExpanded && (
          <motion.div
            key="motion-toggle"
            initial={{ opacity: 0, width: 0, scale: 0.8 }}
            animate={{ opacity: 1, width: 60, scale: 1 }}
            exit={{ opacity: 0, width: 0, scale: 0.8 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: "easeInOut" }}
            style={{ overflow: "visible" }}
          >
            <div style={{ width: 48, marginRight: 12 }}>
              <NavIconButton
                icon={reduceMotion ? <SquarePlay className="h-5 w-5 opacity-50" /> : <SquareStop className="h-5 w-5 opacity-100" />}
                label={reduceMotion ? "恢复动态" : "减弱动态"}
                onClick={toggleReduceMotion}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div layout transition={{ duration: reduceMotion ? 0 : 0.24 }}>
        <NavIconButton
          icon={theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          label={theme === "light" ? "天穹市" : "永恒礼堂"}
          onClick={toggleTheme}
        />
      </motion.div>
    </motion.div>
  );

  const leftControls = (
    <motion.div
      initial={false}
      animate={{ opacity: navVisible ? 1 : 0, y: navVisible ? 0 : -12 }}
      transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHoveredLeft(true)}
      onMouseLeave={() => setHoveredLeft(false)}
      onClick={() => { if (!navExpanded) setNavExpanded(true); }}
      className={`absolute left-6 top-6 z-[60] flex items-center pointer-events-auto ${navVisible ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <AnimatePresence initial={false}>
        {[
          { id: "home", view: "home" as AppView, icon: <Landmark className="h-5 w-5" />, label: "往世乐土" },
          { id: "universe", view: "universe" as AppView, icon: <Compass className="h-5 w-5" />, label: "星海回响" },
          { id: "mindmap", view: "mindmap" as AppView, icon: <Network className="h-5 w-5" />, label: "记忆织网" },
          ...(canOpenAdmin ? [{ id: "admin", view: "admin" as AppView, icon: <Shield className="h-5 w-5" />, label: "治理面板" }] : [])
        ].map(item => {
          if (!isLeftExpanded && activeView !== item.view) return null;
          return (
            <motion.div
              layout
              key={item.id}
              initial={{ opacity: 0, width: 0, scale: 0.8 }}
              animate={{ opacity: 1, width: 60, scale: 1 }}
              exit={{ opacity: 0, width: 0, scale: 0.8 }}
              transition={{ duration: reduceMotion ? 0 : 0.24, ease: "easeInOut" }}
              style={{ overflow: "visible" }}
            >
              <div style={{ width: 48, marginRight: 12 }}>
                <NavIconButton
                  icon={item.icon}
                  label={item.label}
                  onClick={() => setCurrentView(item.view)}
                  isActive={activeView === item.view}
                />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {rightControls}
      {leftControls}




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
              className="absolute inset-0 z-0 h-full w-full bg-slate-50 dark:bg-slate-900"
            >
              <AdminDashboard />
            </motion.div>
          )}
        </AnimatePresence>

        <AccessApplicationModal />
        <AppealsModal />
      </div>
  );
}

export default App;
