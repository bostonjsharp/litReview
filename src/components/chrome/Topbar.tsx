"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { WorkspaceMenu } from "./WorkspaceMenu";
import { initials } from "@/lib/ui/display";

export function Topbar({ workspace, workspaces, userName }: {
  workspace: { id: string; name: string; role: string; memberCount: number };
  workspaces: { id: string; name: string }[];
  userName: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();

  function runSearch() {
    const query = q.trim();
    if (query) router.push(`/workspaces/${workspace.id}/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <header className="topbar themed">
      <div className="ws-switch-wrap">
        <button className="ws-switch" onClick={() => setOpen(!open)}>
          <span className="ws-mark">{initials(workspace.name)}</span>
          <span className="ws-text">
            <span className="ws-name">{workspace.name}</span>
            <span className="ws-role">{workspace.role === "owner" ? "Owner" : "Member"} · {workspace.memberCount} members</span>
          </span>
          <Icon name="chevronDown" size={16} style={{ color: "var(--muted)" }} />
        </button>
        {open && <WorkspaceMenu activeId={workspace.id} workspaces={workspaces} close={() => setOpen(false)} />}
      </div>
      <div className="topbar-search">
        <Icon name="search" size={17} style={{ color: "var(--faint)" }} />
        <input
          placeholder="Search papers, notes, themes…"
          aria-label="Search papers, notes and themes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
        />
        <span className="kbd">⏎</span>
      </div>
      <div className="row gap2">
        <ThemeToggle />
        <Link className="topbar-me" href="/" title="Your account"><Avatar name={userName} size={32} /></Link>
      </div>
    </header>
  );
}
