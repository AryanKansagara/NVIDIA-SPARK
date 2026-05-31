import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Meridian | True Cost of Ownership",
  description:
    "A Toronto property analysis agent that turns list price into true 5, 10, 15 & 20-year ownership cost projections.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    // `light-mode` is the default theme (matches the prototype). The theme
    // toggle in app-context flips this class and persists to localStorage;
    // an inline script below applies the saved choice before paint.
    <html lang="en" className={`light-mode ${dmSans.variable} ${geistMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('meridian.theme');var d=document.documentElement;if(t==='dark'){d.classList.remove('light-mode');}else{d.classList.add('light-mode');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
