import "./globals.css";
import TopProgressBar from "@/components/TopProgressBar";
import type { ReactNode } from "react";
import { Suspense } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* in <head> */}
      <link rel="manifest" href="/manifest.json" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="Token of Excellence" />
      <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />

      <body>
        {/* 🔧 Wrap any client component that uses usePathname/useSearchParams */}
        <Suspense fallback={null}>
          <TopProgressBar />
        </Suspense>

        {children}
      </body>
    </html>
  );
}
