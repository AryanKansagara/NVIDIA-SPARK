"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { AppProvider } from "@/lib/app-context";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <TopBar />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8">
            {children}
          </main>
        </div>
      </div>
    </AppProvider>
  );
}
