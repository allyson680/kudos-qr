export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

import SummaryClient from "./SummaryClient";

export default function Page() {
  return <SummaryClient />;
}
