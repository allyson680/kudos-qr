import { redirect } from "next/navigation";

export default function Page() {
  redirect("/vote");
  return null;
}

