"use client";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

export function RetryButton({
  parentType,
  parentId,
}: {
  parentType: "paper" | "review";
  parentId: string;
}) {
  const router = useRouter();

  async function retry() {
    await fetch("/api/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentType, parentId }),
    });
    router.refresh();
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={retry}>
      <Icon name="refresh" size={14} /> Retry
    </button>
  );
}
