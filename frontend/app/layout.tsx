import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Meridian | True Cost of Ownership",
  description:
    "A Toronto property analysis agent that turns list price into true 10-year ownership cost.",
};

// Applies the saved theme before paint to avoid a flash of the wrong theme.
// Default is warm light (matching the prototype); only dark is opt-in.
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem("meridian-theme");
    if (t !== "dark") document.documentElement.classList.add("light-mode");
  } catch (e) {
    document.documentElement.classList.add("light-mode");
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
