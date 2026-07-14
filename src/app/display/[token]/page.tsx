import { notFound } from "next/navigation";
import { verifyDisplayKey } from "@/lib/display-link";
import { getBoard } from "@/lib/queue/queue";
import { Wall } from "./Wall";

export const dynamic = "force-dynamic";

export default async function DisplayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await verifyDisplayKey(token))) notFound();
  const initial = await getBoard();
  return <Wall displayKey={token} initial={initial} />;
}
