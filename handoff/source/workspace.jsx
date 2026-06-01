/* ============================================================
   LitReview — Dashboard, Collection, Members & invite, Upload
   ============================================================ */

function PaperThumb() {
  return <div className="placeholder paper-thumb">PDF</div>;
}

function PaperRow({ p, onOpen }) {
  const L = window.LR;
  const clickable = p.status === "ready";
  return (
    <div className={"paper-row" + (clickable ? " click" : "")} onClick={() => clickable && onOpen(p)}>
      <PaperThumb />
      <div className="paper-main">
        <div className="paper-title">{p.title}</div>
        <div className="paper-meta">
          <span className="meta">{p.authors.join(", ")} · {p.year}</span>
          <span className="meta">{p.journal}</span>
        </div>
      </div>
      {p.status === "ready" && p.annCount > 0 && (
        <span className="ann-pill"><Icon name="note" size={14} /> {p.annCount}</span>
      )}
      {p.status === "ready"
        ? <span className="meta tabular">p.{p.pages}</span>
        : <Badge status={p.status} />}
      {p.status === "failed" && <button className="btn btn-sm btn-ghost"><Icon name="refresh" size={14} /> Retry</button>}
      {clickable && <Icon name="chevronRight" size={17} style={{ color: "var(--faint)" }} />}
    </div>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard({ nav, workspace }) {
  const L = window.LR;
  return (
    <div className="app-canvas fade-enter">
      <PageHead eyebrow={workspace.name} title="Collections"
        sub="Each collection is a research question — group the papers and reviews that help answer it.">
        <button className="btn btn-ghost" onClick={() => nav("members")}><Icon name="users" size={16} /> Members</button>
        <button className="btn btn-primary" onClick={() => nav("upload")}><Icon name="plus" /> Add paper</button>
      </PageHead>

      <div className="stat-row">
        <div className="stat"><span className="n tabular">3</span><span className="l">collections</span></div>
        <div className="stat"><span className="n tabular">41</span><span className="l">papers</span></div>
        <div className="stat"><span className="n tabular">128</span><span className="l">annotations</span></div>
        <div className="stat"><span className="n tabular">6</span><span className="l">themes</span></div>
        <div className="grow" />
        <div className="stat" style={{ alignItems: "flex-end" }}>
          <button className="btn btn-quiet btn-sm" onClick={() => nav("chat")}><Icon name="chat" size={15} /> Ask the corpus</button>
        </div>
      </div>

      <div className="coll-grid">
        {L.collections.map((c) => {
          const papers = c.paperIds.map((id) => L.paperById[id]);
          return (
            <div className="card card-hover coll-card" key={c.id} onClick={() => nav("collection", { id: c.id })}>
              <div className="c-top">
                <span className="c-dot" style={{ background: c.color }} />
                <span className="c-name">{c.name}</span>
              </div>
              <div className="c-q">{c.question}</div>
              <div className="c-foot">
                <span className="item"><Icon name="book" size={15} /> {c.paperIds.length} papers</span>
                <span className="item"><Icon name="file" size={15} /> {c.reviewIds.length} reviews</span>
              </div>
            </div>
          );
        })}
        <button className="card coll-card coll-new" onClick={() => nav("upload")}>
          <Icon name="plus" size={22} />
          <span style={{ fontWeight: 600 }}>New collection</span>
          <span className="meta">Pose a research question</span>
        </button>
      </div>
    </div>
  );
}

/* ---------- Collection detail ---------- */
function Collection({ nav, params }) {
  const L = window.LR;
  const c = L.collections.find((x) => x.id === params.id) || L.collections[0];
  const papers = c.paperIds.map((id) => L.paperById[id]);
  const reviews = c.reviewIds.map((id) => L.reviews.find((r) => r.id === id));
  return (
    <div className="app-canvas fade-enter">
      <button className="reader-back" style={{ marginBottom: 18 }} onClick={() => nav("dashboard")}>
        <Icon name="chevronLeft" size={16} /> All collections
      </button>

      <div className="coll-hero">
        <div className="row gap3" style={{ marginBottom: 4 }}>
          <span className="c-dot" style={{ width: 10, height: 10, borderRadius: 99, background: c.color }} />
          <span className="c-name" style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--muted)" }}>{c.name}</span>
        </div>
        <div className="eyebrow" style={{ color: "var(--faint)" }}>Research question</div>
        <div className="q">{c.question}</div>
        <div className="row gap2" style={{ marginTop: 22 }}>
          <button className="btn btn-primary" onClick={() => nav("upload")}><Icon name="plus" /> Add paper</button>
          <button className="btn btn-ghost" onClick={() => nav("matrix")}><Icon name="grid" size={16} /> Open matrix</button>
          <button className="btn btn-ghost" onClick={() => nav("chat")}><Icon name="chat" size={16} /> Ask about this</button>
        </div>
      </div>

      <div className="list-head">
        <h2>Papers <span className="count">{papers.length}</span></h2>
        <button className="btn btn-quiet btn-sm"><Icon name="filter" size={14} /> Filter</button>
      </div>
      <div className="card list-card">
        {papers.map((p) => <PaperRow key={p.id} p={p} onOpen={(pp) => nav("reader", { id: pp.id })} />)}
      </div>

      {reviews.length > 0 && (
        <>
          <div className="list-head"><h2>Reviews <span className="count">{reviews.length}</span></h2>
            <button className="btn btn-quiet btn-sm" onClick={() => nav("composer")}><Icon name="plus" size={14} /> New review</button>
          </div>
          <div className="card list-card">
            {reviews.map((r) => (
              <div className="paper-row click" key={r.id} onClick={() => nav("composer", { id: r.id })}>
                <div className="placeholder paper-thumb" style={{ background: "var(--accent-faint)", color: "var(--accent)", border: "1px solid var(--accent-soft-border)" }}>REV</div>
                <div className="paper-main">
                  <div className="paper-title">{r.title}</div>
                  <div className="paper-meta"><span className="meta">{r.entries} blocks · by {r.createdBy}</span></div>
                </div>
                {r.status === "ready" ? <span className="meta">Synthesis</span> : <Badge status={r.status} />}
                <Icon name="chevronRight" size={17} style={{ color: "var(--faint)" }} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Members & invite ---------- */
function Members({ nav, workspace }) {
  const L = window.LR;
  const [copied, setCopied] = React.useState(false);
  const isOwner = workspace.role === "owner";
  function copy() { setCopied(true); setTimeout(() => setCopied(false), 1600); }
  return (
    <div className="app-canvas fade-enter">
      <PageHead eyebrow={workspace.name} title="Members"
        sub="Everyone here reads and writes the same content. Invite collaborators with a link.">
      </PageHead>

      <div className="card invite-card">
        <div className="il">
          <h3>Invite link</h3>
          <p>Anyone with this link can join {workspace.name} and access all of its collections.</p>
        </div>
        <div className="col gap3" style={{ alignItems: "flex-end" }}>
          <div className="invite-box">
            <div className="invite-link">
              <Icon name="link" size={15} style={{ color: "var(--faint)" }} />
              <span className="pre">litreview.app/join/</span><span className="code">{workspace.invite}</span>
            </div>
            <button className="btn btn-primary" onClick={copy} style={{ width: 110, justifyContent: "center" }}>
              {copied ? <><Icon name="check" size={16} /> Copied</> : <><Icon name="copy" size={16} /> Copy</>}
            </button>
          </div>
          {isOwner && (
            <button className="btn btn-quiet btn-sm"><Icon name="refresh" size={14} /> Regenerate link</button>
          )}
        </div>
      </div>

      <div className="list-head">
        <h2>People <span className="count">{L.members.length}</span></h2>
      </div>
      <div className="card list-card">
        {L.members.map((m) => (
          <div className="member-row" key={m.id}>
            <Avatar name={m.name} color={m.color} size={40} />
            <div className="member-main">
              <div className="mn">{m.name} {m.you && <span className="you-tag">(you)</span>}</div>
              <div className="me">{m.email}</div>
            </div>
            <span className={"role-tag " + (m.role === "owner" ? "role-owner" : "role-member")}>{m.role}</span>
            {isOwner && !m.you && m.role !== "owner" && (
              <button className="btn btn-sm btn-danger"><Icon name="x" size={14} /> Remove</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Upload / import ---------- */
function Upload({ nav, workspace }) {
  const L = window.LR;
  const [kind, setKind] = React.useState("paper");
  const [coll, setColl] = React.useState(L.collections[0].id);
  const queue = [
    { name: "Renkl_2014_toward_an_instructionally.pdf", status: "ready", pct: 100 },
    { name: "Ayres_2006_impact_of_reducing.pdf", status: "processing", pct: 64 },
    { name: "scan_kirschner_2006.pdf", status: "failed", pct: 100 },
  ];
  return (
    <div className="app-canvas fade-enter">
      <div className="upload-wrap">
        <PageHead eyebrow={workspace.name + " · import"} title="Add to your corpus"
          sub="Drop a PDF or paste text. We extract the title, authors and full text in the background." />

        <div className="row spread" style={{ marginBottom: 20 }}>
          <div className="seg">
            <button className={kind === "paper" ? "on" : ""} onClick={() => setKind("paper")}><Icon name="book" size={16} /> Paper</button>
            <button className={kind === "review" ? "on" : ""} onClick={() => setKind("review")}><Icon name="file" size={16} /> Review</button>
          </div>
          <div className="field" style={{ minWidth: 280 }}>
            <div className="row gap2">
              <span className="label" style={{ whiteSpace: "nowrap" }}>Collection</span>
              <select className="input" value={coll} onChange={(e) => setColl(e.target.value)} style={{ height: 40 }}>
                {L.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="dropzone">
          <div className="di"><Icon name="upload" size={26} /></div>
          <h3>Drop a {kind === "paper" ? "PDF" : "review document"} here</h3>
          <p>or <span style={{ color: "var(--accent)", fontWeight: 600 }}>browse your files</span> · up to 40 MB</p>
          <div className="or-paste">
            <button className="btn btn-ghost btn-sm"><Icon name="note" size={14} /> Paste text instead</button>
          </div>
        </div>

        <div className="meta" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="layers" size={14} /> Importing into <b style={{ color: "var(--ink-2)" }}>{workspace.name}</b> ·
          workspace&nbsp;<span className="mono">{workspace.id}</span>
        </div>

        <div className="list-head"><h2>Recent imports <span className="count">{queue.length}</span></h2></div>
        <div className="card list-card queue">
          {queue.map((q) => (
            <div className="queue-item" key={q.name}>
              <div className="placeholder paper-thumb"><Icon name="file" size={16} /></div>
              <div className="paper-main">
                <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink)" }}>{q.name}</div>
                {q.status === "failed" && <div className="meta" style={{ color: "var(--danger)", marginTop: 4 }}>Couldn't extract text — try a text-based PDF</div>}
              </div>
              {q.status === "processing" && (
                <div className="q-prog"><div className="q-bar"><i style={{ width: q.pct + "%" }} /></div></div>
              )}
              <Badge status={q.status} />
              {q.status === "failed" && <button className="btn btn-sm btn-ghost"><Icon name="refresh" size={14} /> Retry</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, Collection, Members, Upload });
