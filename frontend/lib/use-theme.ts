"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "meridian-theme";

export type Theme = "dark" | "light";

/**
 * Reads/sets the theme by toggling `.light-mode` on <html> and persisting to
 * localStorage. The initial class is applied pre-paint by a script in layout.tsx,
 * so this hook only syncs React state and handles user toggles.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const isLight = document.documentElement.classList.contains("light-mode");
    setTheme(isLight ? "light" : "dark");
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("light-mode", next === "light");
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
