/* ============================================================
   LitReview — Paper reader (hero) + Review composer
   ============================================================ */

/* split a paragraph's text, wrapping any annotated quote in <mark> */
function renderPara(text, paraIdx, anns, activeId, onClick) {
  const here = anns.filter((a) => a.para === paraIdx && text.includes(a.quote));
  if (here.length === 0) return text;
  // assume non-overlapping; handle first match of each
  let nodes = [text];
  here.forEach((a) => {
    const next = [];
    nodes.forEach((seg) => {
      if (typeof seg !== "string" || !seg.includes(a.quote)) { next.push(seg); return; }
      const i = seg.indexOf(a.quote);
      next.push(seg.slice(0, i));
      next.push(
        <mark key={a.id} className={"hl" + (activeId === a.id ? " active" : "")}
          onClick={(e) => { e.stopPropagation(); onClick(a.id); }}>{a.quote}</mark>
      );
      next.push(seg.slice(i + a.quote.length));
    });
    nodes = next;
  });
  return nodes;
}

function Reader({ nav, params }) {
  const L = window.LR;
  const paper = L.paperById[params.id] || L.paperById["p_sweller88"];
  const [anns, setAnns] = React.useState(L.annotations);
  const [activeId, setActiveId] = React.useState(null);
  const [sel, setSel] = React.useState(null); // {quote, x, y}
  const [draft, setDraft] = React.useState(null); // {quote, comment, themes}
  const [themePopFor, setThemePopFor] = React.useState(null);
  const docRef = React.useRef(null);
  const railRef = React.useRef(null);

  function onMouseUp() {
    const s = window.getSelection();
    const txt = s.toString().trim();
    if (!txt || txt.length < 4) { setSel(null); return; }
    const range = s.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const host = docRef.current.getBoundingClientRect();
    setSel({ quote: txt, x: rect.left - host.left + rect.width / 2, y: rect.top - host.top });
  }

  function startNote() {
    setDraft({ quote: sel.quote, comment: "", themes: [] });
    setSel(null);
    window.getSelection().removeAllRanges();
    setTimeout(() => railRef.current && railRef.current.scrollTo({ top: 0, behavior: "smooth" }), 50);
  }

  function saveNote() {
    const a = { id: "a" + Date.now(), para: -1, quote: draft.quote, comment: draft.comment || "—",
      themes: draft.themes, author: "Elena Hart", page: paper.year ? 260 : 1, isNew: true };
    setAnns([a, ...anns]);
    setDraft(null);
  }

  function toggleTheme(annId, themeId) {
    if (annId === "draft") {
      setDraft((d) => ({ ...d, themes: d.themes.includes(themeId) ? d.themes.filter((t) => t !== themeId) : [...d.themes, themeId] }));
      return;
    }
    setAnns((list) => list.map((a) => a.id === annId
      ? { ...a, themes: a.themes.includes(themeId) ? a.themes.filter((t) => t !== themeId) : [...a.themes, themeId] }
      : a));
  }

  return (
    <div className="reader">
      <div className="reader-main">
        <div className="reader-topbar">
          <button className="reader-back" onClick={() => nav("collection", { id: "c_fading" })}>
            <Icon name="chevronLeft" size={16} /> Worked-example fading
          </button>
          <div className="grow" />
          <span className="meta">{anns.length} notes</span>
          <button className="btn-icon" title="Reading settings"><Icon name="settings" size={17} /></button>
        </div>

        <div className="reader-doc" ref={docRef} style={{ position: "relative" }}>
          <div className="reader-eyebrow">
            <span>{paper.journal}</span><span>·</span><span>{paper.year}</span><span>·</span><span>{paper.pages} pages</span>
          </div>
          <h1 className="reader-title">{paper.title}</h1>
          <div className="reader-byline">{paper.authors.join(", ")}</div>
          <div className="reader-doi mono">DOI {paper.doi}</div>

          <div className="reader-body" onMouseUp={onMouseUp}>
            {L.readerParagraphs.map((p, i) => (
              <p key={i} className={i === 0 ? "dropcap" : ""}>
                {renderPara(p, i, anns, activeId, (id) => { setActiveId(id); railRef.current && document.getElementById("note-" + id)?.scrollIntoViewIfNeeded?.(); })}
              </p>
            ))}
          </div>

          {sel && (
            <div className="sel-pop" style={{ left: sel.x, top: sel.y - 8 }}>
              <button onClick={startNote}><Icon name="highlighter" size={16} /> Highlight &amp; note</button>
            </div>
          )}
        </div>
      </div>

      {/* notes rail */}
      <aside className="notes-rail themed">
        <div className="notes-head">
          <h3>Notes <span className="meta">{anns.length}</span></h3>
          <button className="btn-icon" title="Filter by theme"><Icon name="filter" size={16} /></button>
        </div>
        <div className="notes-scroll" ref={railRef}>
          {draft && (
            <div className="note-compose fade-enter">
              <div className="nc-quote">"{draft.quote}"</div>
              <textarea className="textarea" rows={3} autoFocus placeholder="What does this passage tell you?"
                value={draft.comment} onChange={(e) => setDraft({ ...draft, comment: e.target.value })} />
              <div className="note-themes" style={{ marginTop: 10, position: "relative" }}>
                {draft.themes.map((t) => (
                  <span className="chip" key={t}>{L.themeById[t].name}
                    <button onClick={() => toggleTheme("draft", t)}><Icon name="x" size={11} /></button>
                  </span>
                ))}
                <button className="chip chip-add" onClick={() => setThemePopFor(themePopFor === "draft" ? null : "draft")}>
                  <Icon name="plus" size={12} /> theme
                </button>
                {themePopFor === "draft" && (
                  <ThemePop anns={draft.themes} onPick={(id) => toggleTheme("draft", id)} close={() => setThemePopFor(null)} />
                )}
              </div>
              <div className="row gap2" style={{ marginTop: 12 }}>
                <button className="btn btn-primary btn-sm" onClick={saveNote}><Icon name="check" size={14} /> Save note</button>
                <button className="btn btn-quiet btn-sm" onClick={() => setDraft(null)}>Cancel</button>
              </div>
            </div>
          )}

          {anns.map((a) => (
            <div key={a.id} id={"note-" + a.id}
              className={"note" + (activeId === a.id ? " active" : "")}
              onClick={() => setActiveId(a.id)}>
              <div className="note-quote">"{a.quote}"</div>
              {a.comment && <div className="note-comment">{a.comment}</div>}
              <div className="note-themes" style={{ position: "relative" }}>
                {a.themes.map((t) => (
                  <span className="chip" key={t}>{L.themeById[t].name}
                    <button onClick={(e) => { e.stopPropagation(); toggleTheme(a.id, t); }}><Icon name="x" size={11} /></button>
                  </span>
                ))}
                <button className="chip chip-add" onClick={(e) => { e.stopPropagation(); setThemePopFor(themePopFor === a.id ? null : a.id); }}>
                  <Icon name="plus" size={12} /> tag
                </button>
                {themePopFor === a.id && (
                  <ThemePop anns={a.themes} onPick={(id) => toggleTheme(a.id, id)} close={() => setThemePopFor(null)} />
                )}
              </div>
              <div className="note-foot">
                <Avatar name={a.author} color={a.author === "Elena Hart" ? "oklch(0.47 0.08 162)" : a.author === "Marcus Reed" ? "oklch(0.55 0.11 250)" : "oklch(0.58 0.12 30)"} size={18} />
                {a.author} · p.{a.page}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function ThemePop({ anns, onPick, close }) {
  const L = window.LR;
  return (
    <>
      <div className="menu-scrim" onClick={close} />
      <div className="theme-pop fade-enter" style={{ top: 28, left: 0 }}>
        {L.themes.map((t) => (
          <button key={t.id} onClick={(e) => { e.stopPropagation(); onPick(t.id); }}>
            <span className="tp-dot" /> {t.name}
            {anns.includes(t.id) && <Icon name="check" size={14} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------- Review composer ---------- */
function Composer({ nav }) {
  const L = window.LR;
  const [blocks, setBlocks] = React.useState([
    { id: "b1", kind: "prose", text: "Across the cognitive-load literature, fading worked examples emerges as the most consistent lever for novice learning. The earliest formulation is unambiguous:" },
    { id: "b2", kind: "annotation", annId: "a3" },
    { id: "b3", kind: "prose", text: "Later work qualifies this by tying the rate of fading to the learner's growing expertise, rather than treating it as a fixed schedule." },
    { id: "b4", kind: "annotation", annId: "a4" },
    { id: "b5", kind: "prose", text: "" },
  ]);
  const annById = Object.fromEntries(L.annotations.map((a) => [a.id, a]));

  function removeBlock(id) { setBlocks((b) => b.filter((x) => x.id !== id)); }
  function move(id, dir) {
    setBlocks((b) => {
      const i = b.findIndex((x) => x.id === id);
      const j = i + dir;
      if (j < 0 || j >= b.length) return b;
      const c = [...b]; [c[i], c[j]] = [c[j], c[i]]; return c;
    });
  }
  function addAnn(annId) {
    setBlocks((b) => [...b.slice(0, b.length - 1), { id: "b" + Date.now(), kind: "annotation", annId }, b[b.length - 1]]);
  }

  const usedAnn = new Set(blocks.filter((b) => b.kind === "annotation").map((b) => b.annId));
  const availNotes = L.annotations.filter((a) => !usedAnn.has(a.id));

  return (
    <div className="composer">
      <div className="composer-main">
        <div className="reader-topbar">
          <button className="reader-back" onClick={() => nav("collection", { id: "c_fading" })}>
            <Icon name="chevronLeft" size={16} /> Worked-example fading
          </button>
          <div className="grow" />
          <span className="badge badge-ready"><span className="dot" /> Saved</span>
          <button className="btn btn-ghost btn-sm"><Icon name="book" size={15} /> Read view</button>
          <button className="btn btn-primary btn-sm"><Icon name="check" size={15} /> Publish</button>
        </div>

        <div className="composer-doc">
          <input className="composer-title-in" defaultValue="Worked-example fading: a synthesis" />
          <div className="composer-sub">
            <span>Collection · Worked-example fading</span>
            <span>{blocks.length} blocks</span>
            <span>by Elena Hart</span>
          </div>

          {blocks.map((b) => (
            <div className="block" key={b.id}>
              <div className="block-handle">
                <button title="Move up" onClick={() => move(b.id, -1)}><Icon name="chevronDown" size={14} style={{ transform: "rotate(180deg)" }} /></button>
                <button title="Drag"><Icon name="drag" size={14} /></button>
                <button title="Move down" onClick={() => move(b.id, 1)}><Icon name="chevronDown" size={14} /></button>
                <button title="Remove" onClick={() => removeBlock(b.id)}><Icon name="trash" size={14} /></button>
              </div>
              {b.kind === "prose"
                ? <div className="block-prose">
                    <textarea defaultValue={b.text} rows={Math.max(2, Math.ceil((b.text.length || 1) / 64))} placeholder="Write your synthesis…"
                      onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} />
                  </div>
                : <div className="block-ann">
                    <div className="ann-card">
                      <div className="ac-quote">"{annById[b.annId]?.quote}"</div>
                      <div className="ac-meta">
                        <Icon name="quote" size={13} style={{ color: "var(--accent)" }} />
                        {(b.annId === "a3" ? "Sweller, 1988" : "Sweller, 1988")} · p.{annById[b.annId]?.page} ·
                        {(annById[b.annId]?.themes || []).map((t) => " #" + L.themeById[t].name.toLowerCase().replace(/ /g, "-")).join("")}
                      </div>
                    </div>
                  </div>}
            </div>
          ))}

          <div className="block-add">
            <button className="btn btn-ghost btn-sm" onClick={() => setBlocks((b) => [...b, { id: "b" + Date.now(), kind: "prose", text: "" }])}>
              <Icon name="plus" size={14} /> Prose block
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => availNotes[0] && addAnn(availNotes[0].id)}>
              <Icon name="note" size={14} /> Insert note
            </button>
          </div>
        </div>
      </div>

      <aside className="composer-rail themed">
        <div className="rail-head">Your notes · drag to insert</div>
        {availNotes.length === 0 && <p className="meta">All notes added.</p>}
        {availNotes.map((a) => (
          <div className="rail-note" key={a.id} onClick={() => addAnn(a.id)}>
            <div className="rn-q">"{a.quote}"</div>
            <div className="rn-add"><Icon name="plus" size={13} /> Add to review</div>
          </div>
        ))}
      </aside>
    </div>
  );
}

Object.assign(window, { Reader, Composer });
