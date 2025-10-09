import type { Metadata, Viewport } from "next";
import "./globals.css";

// If you have client-only buttons like InstallPromptButton, render them inside <body>.
// Do NOT export metadata from a file marked "use client".

export const metadata: Metadata = {
  title: "Token of Excellence",
  applicationName: "Token of Excellence",
  description: "Scan a sticker and give virtual tokens.",
  manifest: "/manifest.json", // points to the file above
  themeColor: "#065f46",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/icons/icon-192.png" },
      { url: "/icons/icon-512.png" }
    ]
  },
  appleWebApp: {
    capable: true,
    title: "Token of Excellence",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Safe to render client-only components here */}
        {/* <PwaRegistrar /> */}
        {/* <InstallPromptButton /> */}
        {children}
      </body>
    </html>
  );
}
