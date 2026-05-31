"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getHealth, getProfile, type HealthStatus, type Profile } from "@/lib/api";
import type { MeridianReport } from "@/lib/report";

export type Theme = "dark" | "light";

const THEME_KEY = "meridian.theme";
const ONBOARDED_KEY = "meridian.onboarded";

type AppContextValue = {
  profile: Profile;
  health: HealthStatus | null;
  refreshProfile: () => void;
  refreshHealth: () => void;

  theme: Theme;
  toggleTheme: () => void;

  // First-run onboarding: true until the user completes or skips the modal.
  firstRun: boolean;
  completeOnboarding: () => void;

  // The most recent real report, shared so the floating chat can use it as
  // grounding context and the report survives client-side navigation.
  activeReport: MeridianReport | null;
  setActiveReport: (r: MeridianReport | null) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>({});
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [firstRun, setFirstRun] = useState(false);
  const [activeReport, setActiveReport] = useState<MeridianReport | null>(null);

  const refreshProfile = useCallback(() => {
    getProfile().then(setProfile).catch(() => {});
  }, []);
  const refreshHealth = useCallback(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  const applyTheme = useCallback((next: Theme) => {
    setTheme(next);
    const root = document.documentElement;
    if (next === "light") root.classList.add("light-mode");
    else root.classList.remove("light-mode");
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(theme === "light" ? "dark" : "light");
  }, [applyTheme, theme]);

  const completeOnboarding = useCallback(() => {
    setFirstRun(false);
    try {
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      /* ignore */
    }
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    setTheme(readTheme());
    let onboarded = false;
    try {
      onboarded = localStorage.getItem(ONBOARDED_KEY) === "1";
    } catch {
      /* ignore */
    }
    setFirstRun(!onboarded);
    refreshProfile();
    refreshHealth();
    const id = setInterval(refreshHealth, 15000);
    return () => clearInterval(id);
  }, [refreshProfile, refreshHealth]);

  return (
    <AppContext.Provider
      value={{
        profile,
        health,
        refreshProfile,
        refreshHealth,
        theme,
        toggleTheme,
        firstRun,
        completeOnboarding,
        activeReport,
        setActiveReport,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
