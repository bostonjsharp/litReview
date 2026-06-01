"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

export function NewCollectionCard({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [q, setQ] = useState("");

  async function create() {
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, name, researchQuestion: q }),
    });
    if (res.ok) {
      setOpen(false);
      setName("");
      setQ("");
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button className="card coll-card coll-new" onClick={() => setOpen(true)}>
        <Icon name="plus" size={20} />
        <span>New collection</span>
      </button>
    );
  }

  return (
    <div className="card coll-card">
      <input
        className="input"
        placeholder="Collection name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="textarea"
        placeholder="Research question"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="row gap2">
        <button
          className="btn btn-primary btn-sm"
          disabled={!name.trim()}
          onClick={create}
        >
          Create
        </button>
        <button className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
