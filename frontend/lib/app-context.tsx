"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getHealth, getProfile, type HealthStatus, type Profile } from "@/lib/api";

type AppContextValue = {
  profile: Profile;
  health: HealthStatus | null;
  refreshProfile: () => void;
  refreshHealth: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>({});
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const refreshProfile = () => {
    getProfile().then(setProfile).catch(() => {});
  };
  const refreshHealth = () => {
    getHealth().then(setHealth).catch(() => setHealth(null));
  };

  useEffect(() => {
    refreshProfile();
    refreshHealth();
    const id = setInterval(refreshHealth, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <AppContext.Provider value={{ profile, health, refreshProfile, refreshHealth }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
