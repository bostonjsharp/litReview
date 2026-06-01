"use client";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { initials } from "@/lib/ui/display";
import { signOutAction } from "@/app/actions/auth";

export function WorkspaceMenu({ activeId, workspaces, close }: {
  activeId: string; workspaces: { id: string; name: string }[]; close: () => void;
}) {
  const router = useRouter();
  return (
    <>
      <div className="menu-scrim" onClick={close} />
      <div className="menu ws-menu fade-enter">
        <div className="menu-label">Workspaces</div>
        {workspaces.map((w) => (
          <button key={w.id} className={"menu-ws" + (w.id === activeId ? " active" : "")}
            onClick={() => { close(); router.push(`/workspaces/${w.id}`); }}>
            <span className="ws-mark sm">{initials(w.name)}</span>
            <span className="col" style={{ alignItems: "flex-start", gap: 1 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{w.name}</span>
            </span>
            {w.id === activeId && <Icon name="check" size={16} style={{ color: "var(--accent)", marginLeft: "auto" }} />}
          </button>
        ))}
        <div className="divider" style={{ margin: "6px 0" }} />
        <button className="menu-item" onClick={() => { close(); router.push("/onboarding"); }}>
          <Icon name="plus" size={16} /> Create or join workspace
        </button>
        <button className="menu-item" onClick={() => { close(); router.push("/"); }}>
          <Icon name="grid" size={16} /> All workspaces
        </button>
        <form action={signOutAction}>
          <button type="submit" className="menu-item danger"><Icon name="logout" size={16} /> Sign out</button>
        </form>
      </div>
    </>
  );
}
