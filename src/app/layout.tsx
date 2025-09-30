import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import "./globals.css";

const PwaRegistrar = dynamic(() => import("@/components/PwaRegistrar"), { ssr: false });
const InstallPromptButton = dynamic(() => import("@/components/InstallPromptButton"), { ssr: false });

export const metadata: Metadata = {
  title: "Token of Excellence",
  applicationName: "Token of Excellence",
  description: "Scan a sticker and give virtual tokens.",
   manifest: "/manifest.json",
  themeColor: "#111111",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Token of Excellence",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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