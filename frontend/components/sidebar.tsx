"use client";

import { BarChart3, Bookmark, Compass, MessageSquare, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Report", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/reports", label: "Saved", icon: Bookmark },
  { href: "/chat", label: "Chat", icon: MessageSquare },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-2 border-r border-white/60 bg-white/50 px-4 py-6 backdrop-blur md:flex">
      <div className="mb-4 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-mist">
          <Compass className="h-5 w-5" />
        </div>
        <span className="font-display text-lg text-ink">Meridian</span>
      </div>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
              active ? "bg-ink text-mist" : "text-slate hover:bg-mist/60 hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </aside>
  );
}
