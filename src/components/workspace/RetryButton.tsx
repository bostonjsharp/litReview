"use client";
import { useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentType, parentId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        setError("Retry failed");
      }
    } catch {
      setError("Retry failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="row gap1" style={{ alignItems: "center" }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={retry}
        disabled={loading}
      >
        <Icon name="refresh" size={14} /> {loading ? "Retrying…" : "Retry"}
      </button>
      {error && (
        <span className="meta" style={{ color: "var(--error, #e55)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
