"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

export function WorkspaceOnboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");

  async function create() {
    setStatus("Creating…");
    const res = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    if (res.ok) { const w = await res.json(); router.push(`/workspaces/${w.id}`); } else setStatus("Could not create workspace.");
  }
  async function join() {
    setStatus("Joining…");
    const res = await fetch("/api/workspaces/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    if (res.ok) { const w = await res.json(); router.push(`/workspaces/${w.id}`); } else setStatus("Invalid invite code.");
  }

  return (
    <>
      <div className="onb-grid">
        <div className="card onb-card primary">
          <span className="onb-ico"><Icon name="plus" size={22} /></span>
          <h3 className="serif">Create a workspace</h3>
          <p>Start a private space for your team&apos;s papers and reviews.</p>
          <div className="field">
            <label className="label">Workspace name</label>
            <input className="input input-lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hart Lab" />
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={!name.trim()} onClick={create}>Create workspace</button>
        </div>
        <div className="card onb-card">
          <span className="onb-ico"><Icon name="users" size={22} /></span>
          <h3 className="serif">Join a workspace</h3>
          <p>Have an invite code from a colleague? Enter it here.</p>
          <div className="field">
            <label className="label">Invite code</label>
            <input className="input input-lg" style={{ fontFamily: "var(--mono)", letterSpacing: ".12em", textTransform: "uppercase" }}
              value={code} onChange={(e) => setCode(e.target.value)} placeholder="7F3K-92QD" />
          </div>
          <button className="btn btn-ghost btn-lg btn-block" disabled={!code.trim()} onClick={join}>Join workspace</button>
        </div>
      </div>
      {status && <p className="meta" style={{ textAlign: "center", marginTop: 16 }}>{status}</p>}
    </>
  );
}
