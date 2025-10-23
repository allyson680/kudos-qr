// src/app/layout.tsx
import "./globals.css";
import TopProgressBar from "@/components/TopProgressBar";
import type { ReactNode } from "react";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TopProgressBar />
        {children}
      </body>
    </html>
  );
}
