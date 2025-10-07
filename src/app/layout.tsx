"use client";

import type { Metadata, Viewport } from "next";
import "./globals.css";

import PwaRegistrar from "@/components/PwaRegistrar";
import InstallPromptButton from "@/components/InstallPromptButton";

export const metadata: Metadata = {
  title: "Token of Excellence",
  applicationName: "Token of Excellence",
  description: "Scan a sticker and give virtual tokens.",
  // ✅ point to your single manifest file in /public
  manifest: "/manifest.webmanifest",
  // ✅ this becomes <meta name="theme-color" ...>
  themeColor: "#065f46",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-192.png" },
      { url: "/icons/icon-512.png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Token of Excellence",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PwaRegistrar />
        <InstallPromptButton />
        {children}
      </body>
    </html>
  );
}
