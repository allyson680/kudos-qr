// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

import PwaRegistrar from "@/components/PwaRegistrar";
import InstallPromptButton from "@/components/InstallPromptButton";

export const metadata: Metadata = {
  title: "Token of Excellence",
  applicationName: "Token of Excellence",
  description: "Scan a sticker and give virtual tokens.",
  // make sure this matches your file name in /public
  manifest: "/manifest.json",
  themeColor: "#111111",
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
  themeColor: "#111111",
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
