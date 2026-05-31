"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { OnboardingModal } from "@/components/onboarding-modal";
import { FloatingChat } from "@/components/floating-chat";
import { AppProvider } from "@/lib/app-context";

// Landing and the pitch deck render full-bleed (their own nav). Every other
// route gets the slim app TopBar. The onboarding modal is mounted globally so
// it can appear on first entry to any app route.
const FULL_BLEED = new Set(["/", "/deck", "/chat"]);

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullBleed = FULL_BLEED.has(pathname);
  // Always-on assistant everywhere except the marketing landing and pitch deck.
  // (FloatingChat itself also hides on /chat, which has its own full chat UI.)
  const showChat = pathname !== "/" && pathname !== "/deck";

  if (fullBleed) {
    return (
      <>
        {children}
        {pathname !== "/" && pathname !== "/deck" && <OnboardingModal />}
        {showChat && <FloatingChat />}
      </>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">{children}</main>
      <OnboardingModal />
      {showChat && <FloatingChat />}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <ShellInner>{children}</ShellInner>
    </AppProvider>
  );
}
