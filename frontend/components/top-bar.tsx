"use client";

import { ArrowLeft, Bookmark, Download, FileText, MessageSquare, Moon, Sun, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

function initials(name?: string | null): string {
  if (!name) return "—";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const NAV = [
  { href: "/analyze", label: "Analyze", icon: FileText },
  { href: "/reports", label: "Saved", icon: Bookmark },
  { href: "/chat", label: "Chat", icon: MessageSquare },
];

/** Fire a global event the report screen listens for to export itself to PDF. */
export const EXPORT_PDF_EVENT = "meridian:export-pdf";

export function TopBar() {
  const { profile, health, theme, toggleTheme } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const llmLocal = health?.llm_local ?? false;
  // Export is only meaningful on the report view.
  const onReport = pathname.startsWith("/analyze");

  return (
    <header className="no-print sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-[color:var(--border-faint)] bg-[color:var(--bg)]/80 px-4 py-3 backdrop-blur-xl md:px-8">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--text-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--text-muted)]" />
          </span>
          <span className="text-sm font-medium uppercase tracking-[0.12em] text-[color:var(--text-primary)]">
            Meridian
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent-light)]"
                    : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {/* Local-model health badge */}
        <span
          className={cn(
            "hidden items-center gap-2 rounded-pill border px-3 py-1.5 text-[11px] font-medium sm:inline-flex",
            llmLocal
              ? "border-[rgba(52,211,153,0.3)] bg-[color:var(--green-tint)] text-[color:var(--green)]"
              : "border-[rgba(251,191,36,0.3)] bg-[color:var(--amber-tint)] text-[color:var(--amber)]",
          )}
          title={health?.model ?? ""}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              llmLocal ? "bg-[color:var(--green)]" : "bg-[color:var(--amber)]",
            )}
          />
          {llmLocal ? "Nemotron · local" : "Nemotron · offline"}
        </span>

        {onReport && (
          <>
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1.5 rounded-pill border border-[color:var(--border-faint)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border)]"
              title="Back"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(EXPORT_PDF_EVENT))}
              className="flex items-center gap-1.5 rounded-pill border border-[color:var(--border-faint)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border)]"
              title="Export report as PDF"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-pill border border-[color:var(--border-faint)] text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border)]"
          aria-label="Toggle theme"
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>

        <Link
          href="/profile"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--accent)] text-sm font-semibold text-white transition-transform hover:scale-105"
          title={profile.name ?? "Profile"}
        >
          {profile.name ? initials(profile.name) : <User className="h-4 w-4" />}
        </Link>
      </div>
    </header>
  );
}
