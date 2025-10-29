// src/app/admin/summary/page.tsx
export const dynamic = "force-dynamic"; // disable static pre-render
export const revalidate = 0;            // no ISR
export const runtime = "nodejs";        // use Node runtime (optional)

import SummaryClient from "./SummaryClient";

export default function Page() {
  return <SummaryClient />;
}
