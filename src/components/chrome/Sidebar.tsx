"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { colorForId } from "@/lib/ui/display";

export function Sidebar({ workspaceId, collections }: {
  workspaceId: string; collections: { id: string; name: string }[];
}) {
  const path = usePathname();
  const base = `/workspaces/${workspaceId}`;
  const matrixHref = collections[0]
    ? `${base}/collections/${collections[0].id}/matrix`
    : base;
  const nav = [
    { href: base, icon: "layers", label: "Collections", match: (p: string) => p === base },
    { href: matrixHref, icon: "grid", label: "Literature matrix", match: (p: string) => p.includes("/matrix") },
    { href: `${base}/chat`, icon: "chat", label: "Chat", match: (p: string) => p.endsWith("/chat") },
    { href: `${base}/members`, icon: "users", label: "Members", match: (p: string) => p.endsWith("/members") },
  ];
  return (
    <aside className="sidebar themed">
      <Link className="brand" href={base}>
        <span className="brand-mark">LR</span>
        <span className="brand-name serif">LitReview</span>
      </Link>
      <Link className="btn btn-primary btn-block" style={{ margin: "0 0 6px" }} href={`${base}/upload`}>
        <Icon name="upload" /> Add paper
      </Link>
      <nav className="side-nav">
        {nav.map((it) => (
          <Link key={it.href} href={it.href} className={"side-link" + (it.match(path) ? " active" : "")}>
            <Icon name={it.icon} size={18} /> {it.label}
          </Link>
        ))}
      </nav>
      <div className="side-section">
        <div className="side-head">Collections</div>
        {collections.map((c) => (
          <Link key={c.id} className="side-coll" href={`${base}/collections/${c.id}`}>
            <span className="dot" style={{ background: colorForId(c.id) }} />
            <span className="side-coll-name">{c.name}</span>
          </Link>
        ))}
      </div>
      <div className="grow" />
    </aside>
  );
}
