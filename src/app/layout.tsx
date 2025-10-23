import "./globals.css";
import TopProgressBar from "@/components/TopProgressBar";
import type { ReactNode } from "react";
import { Suspense } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
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
