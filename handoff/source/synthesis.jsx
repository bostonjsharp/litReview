/* ============================================================
   LitReview — Literature matrix + Chat
   ============================================================ */

function Matrix({ nav }) {
  const L = window.LR;
  const [suggest, setSuggest] = React.useState(false);
  const [added, setAdded] = React.useState([]);
  const [themeCols, setThemeCols] = React.useState(L.matrixThemes);

  function applyTheme(name) {
    const id = "th_new_" + name.replace(/\s/g, "");
    L.themeById[id] = { id, name };
    setThemeCols((c) => [...c, id]);
    setAdded((a) => [...a, name]);
  }

  return (
    <div className="app-main" style={{ height: "100%" }}>
      <div className="app-canvas" style={{ paddingBottom: 18 }}>
        <PageHead eyebrow="Worked-example fading" title="Literature matrix"
          sub="Rows are papers, columns are themes. Each cell collects that paper's notes on that theme, linked to the source.">
          <button className="btn btn-ghost" onClick={() => nav("dashboard")}><Icon name="chevronLeft" size={16} /> Collection</button>
          <button className="btn btn-primary" onClick={() => setSuggest(true)}><Icon name="sparkle" size={16} /> Suggest themes</button>
        </PageHead>
      </div>

      <div className="matrix-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th className="corner">
                <div className="meta" style={{ textTransform: "uppercase", letterSpacing: ".08em" }}>{L.matrixPapers.length} papers · {themeCols.length} themes</div>
              </th>
              {themeCols.map((tid) => {
                const cells = L.matrixPapers.filter((pid) => L.matrixCells[pid + "|" + tid]).length;
                return (
                  <th key={tid}>
                    <div className="col-theme"><span className="c-dot" style={{ width: 8, height: 8, borderRadius: 99, background: "var(--accent)" }} /> {L.themeById[tid].name}</div>
                    <div className="col-count">{cells} papers</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {L.matrixPapers.map((pid) => {
              const p = L.paperById[pid];
              return (
                <tr key={pid}>
                  <th>
                    <div className="row-paper-title">{p.title}</div>
                    <div className="row-paper-meta">{p.authors[0].split(" ").pop()} · {p.year}</div>
                  </th>
                  {themeCols.map((tid) => {
                    const notes = L.matrixCells[pid + "|" + tid];
                    return (
                      <td key={tid} className={notes ? "" : "empty"}>
                        {notes
                          ? notes.map((n, i) => (
                              <div className="cell-note" key={i} onClick={() => nav("reader", { id: pid })}>
                                <div className="cn-q">"{n.q}"</div>
                                <div className="cn-p"><Icon name="link" size={11} /> p.{n.page}</div>
                              </div>
                            ))
                          : <button className="cell-empty-add"><Icon name="plus" size={16} /></button>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {suggest && (
        <>
          <div className="menu-scrim" style={{ background: "rgba(10,20,15,.3)", zIndex: 49 }} onClick={() => setSuggest(false)} />
          <div className="suggest-panel">
            <div className="suggest-head">
              <div className="sh-eye"><Icon name="sparkle" size={16} /><span className="eyebrow">AI suggestion</span></div>
              <h2>Themes worth adding</h2>
              <p className="muted" style={{ fontSize: 13.5 }}>Proposed from patterns across your annotations. Review before applying.</p>
            </div>
            <div className="suggest-body">
              {L.suggestedThemes.map((s) => {
                const on = added.includes(s.name);
                return (
                  <div className={"suggest-item" + (on ? " added" : "")} key={s.name}>
                    <div className="si-top">
                      <span className="si-name">{s.name}</span>
                      {on
                        ? <span className="chip"><Icon name="check" size={12} /> Added</span>
                        : <button className="btn btn-ghost btn-sm" onClick={() => applyTheme(s.name)}><Icon name="plus" size={14} /> Add</button>}
                    </div>
                    <div className="si-why">{s.rationale}</div>
                    <div className="si-count">{s.count} annotations match</div>
                  </div>
                );
              })}
            </div>
            <div className="suggest-foot">
              <button className="btn btn-ghost btn-block" onClick={() => setSuggest(false)}>Done</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Chat ---------- */
const SUGGESTED_Q = [
  "What does the corpus say about fading worked examples for novices?",
  "Which measurement instruments separate intrinsic from extraneous load?",
  "Where do the papers disagree about the expertise reversal effect?",
];

function Chat({ nav }) {
  const L = window.LR;
  const [scope, setScope] = React.useState("workspace");
  const [convo, setConvo] = React.useState([]);
  const [input, setInput] = React.useState("");
  const scrollRef = React.useRef(null);

  function ask(q) {
    const question = (q || input).trim();
    if (!question) return;
    setConvo((c) => [...c, { role: "q", text: question }]);
    setInput("");
    setTimeout(() => {
      setConvo((c) => [...c, {
        role: "a",
        text: "Across the workspace, the evidence converges: replacing conventional problems with worked examples lowers working-memory load during acquisition[1], and high-variability examples improve transfer rather than rote performance[2]. The qualification that recurs is developmental — guidance should be faded in step with the learner's growing expertise, not on a fixed schedule[3].",
        cites: L.chatCitations,
      }]);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }), 60);
    }, 350);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }), 60);
  }

  return (
    <div className="app-main" style={{ height: "100%" }}>
      <div className="chat">
        <div className="chat-scope">
          <span className="meta" style={{ marginRight: 4 }}>Scope</span>
          <button className={"scope-pill" + (scope === "workspace" ? " on" : "")} onClick={() => setScope("workspace")}>
            <Icon name="layers" size={14} /> Whole workspace
          </button>
          <button className={"scope-pill" + (scope === "collection" ? " on" : "")} onClick={() => setScope("collection")}>
            <Icon name="grid" size={14} /> Worked-example fading
          </button>
          <button className={"scope-pill" + (scope === "paper" ? " on" : "")} onClick={() => setScope("paper")}>
            <Icon name="book" size={14} /> Single paper
          </button>
        </div>

        {convo.length === 0 ? (
          <div className="chat-empty">
            <div className="ce-mark"><Icon name="chat" size={28} /></div>
            <h2>Ask your corpus</h2>
            <p className="muted">Answers are drawn only from this workspace's papers, reviews and notes — each claim links back to its source.</p>
            <div className="chat-suggest">
              {SUGGESTED_Q.map((q) => (
                <button key={q} onClick={() => ask(q)}>{q}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-scroll" ref={scrollRef}>
            {convo.map((m, i) => m.role === "q" ? (
              <div className="msg-q" key={i}>{m.text}</div>
            ) : (
              <div className="msg-a" key={i}>
                <div className="ai-mark"><Icon name="sparkle" size={17} /></div>
                <div className="msg-a-body">
                  <div className="answer fade-enter" dangerouslySetInnerHTML={{ __html: m.text.replace(/\[(\d)\]/g, '<sup>$1</sup>') }} />
                  <div className="cites">
                    <div className="cites-head">{m.cites.length} sources</div>
                    {m.cites.map((c, j) => (
                      <div className="cite" key={j} onClick={() => nav("reader", { id: "p_sweller88" })}>
                        <span className="cite-num">{j + 1}</span>
                        <div className="cite-body">
                          <div className="cite-src"><span className="cite-type">{c.type}</span> {c.paper} · p.{c.page}</div>
                          <div className="cite-q">"{c.text}"</div>
                        </div>
                        <Icon name="arrowRight" size={15} style={{ color: "var(--faint)", alignSelf: "center" }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="chat-input-wrap">
          <div className="chat-input">
            <textarea rows={1} placeholder="Ask about your papers…" value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
            <button className="btn btn-primary btn-icon" style={{ width: 40, height: 40 }} onClick={() => ask()}>
              <Icon name="arrowRight" size={18} />
            </button>
          </div>
          <div className="chat-hint">Answers cite only your workspace · {scope === "workspace" ? "41 papers" : scope === "collection" ? "4 papers" : "1 paper"} in scope</div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Matrix, Chat });
