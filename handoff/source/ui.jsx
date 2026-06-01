/* ============================================================
   LitReview — shared UI primitives (Icon, chrome, helpers)
   ============================================================ */

/* ---- minimal stroke icon set (24 viewBox, 1.7 stroke) ---- */
const ICONS = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  chevronLeft: "M15 6l-6 6 6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  google: "GOOGLE",
  book: "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5ZM4 19a2 2 0 0 0 2 2h12",
  layers: "M12 3l9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17l9 5 9-5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  chat: "M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10Z",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 20v-2a4 4 0 0 0-3-3.87M16 2.13A4 4 0 0 1 16 10",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  copy: "M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2ZM5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2",
  refresh: "M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6L6 18",
  file: "M14 3v5h5M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5Z",
  highlighter: "M9 11l-4 4v4h4l4-4M9 11l6-6 4 4-6 6M9 11l4 4",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3",
  drag: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
  note: "M11 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M8 9h6M8 13h4M16 3l5 5-9 9H7v-5l9-9Z",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z",
  filter: "M3 5h18l-7 8v6l-4-2v-4L3 5Z",
  quote: "M7 7h4v6a4 4 0 0 1-4 4M15 7h4v6a4 4 0 0 1-4 4",
  page: "M14 3v5h5M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5Z",
};

function Icon({ name, size, stroke, style, className }) {
  if (name === "google") {
    return (
      <svg width={size || 18} height={size || 18} viewBox="0 0 24 24" style={style} className={className}>
        <path fill="#4285F4" d="M22.5 12.2c0-.7-.06-1.4-.18-2H12v3.8h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-7.8Z" />
        <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.8A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2a11 11 0 0 0 0 9.8l3.7-2.8Z" />
        <path fill="#EA4335" d="M12 4.8c1.6 0 3 .55 4.2 1.6l3.1-3.1A11 11 0 0 0 2 7.1l3.7 2.8C6.6 7.3 9.1 4.8 12 4.8Z" />
      </svg>
    );
  }
  const d = ICONS[name] || "";
  return (
    <svg width={size || 18} height={size || 18} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke || 1.7} strokeLinecap="round" strokeLinejoin="round"
      style={style} className={className}>
      {d.split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}
    </svg>
  );
}

function Avatar({ name, color, size }) {
  const s = size || 32;
  return (
    <div className="avatar" style={{ width: s, height: s, background: color || "var(--accent)", fontSize: s * 0.4 }}>
      {window.LR.initials(name)}
    </div>
  );
}

function Badge({ status }) {
  const map = {
    ready: ["badge-ready", "Ready"],
    processing: ["badge-processing", "Processing"],
    pending: ["badge-pending", "Pending"],
    failed: ["badge-failed", "Failed"],
  };
  const [cls, label] = map[status] || map.pending;
  return <span className={"badge " + cls}><span className="dot" />{label}</span>;
}

/* ---- App chrome: left rail + top bar with workspace switcher ---- */
function Sidebar({ nav, route }) {
  const items = [
    { key: "dashboard", icon: "layers", label: "Collections" },
    { key: "matrix", icon: "grid", label: "Literature matrix" },
    { key: "chat", icon: "chat", label: "Chat" },
    { key: "members", icon: "users", label: "Members" },
  ];
  return (
    <aside className="sidebar themed">
      <button className="brand" onClick={() => nav("dashboard")}>
        <span className="brand-mark">LR</span>
        <span className="brand-name serif">LitReview</span>
      </button>

      <button className="btn btn-primary btn-block" style={{ margin: "0 0 6px" }} onClick={() => nav("upload")}>
        <Icon name="upload" /> Add paper
      </button>

      <nav className="side-nav">
        {items.map((it) => (
          <button key={it.key}
            className={"side-link" + (route === it.key ? " active" : "")}
            onClick={() => nav(it.key)}>
            <Icon name={it.icon} size={18} /> {it.label}
          </button>
        ))}
      </nav>

      <div className="side-section">
        <div className="side-head">Collections</div>
        {window.LR.collections.map((c) => (
          <button key={c.id} className="side-coll" onClick={() => nav("collection", { id: c.id })}>
            <span className="dot" style={{ background: c.color }} />
            <span className="side-coll-name">{c.name}</span>
          </button>
        ))}
      </div>
      <div className="grow" />
    </aside>
  );
}

function Topbar({ nav, theme, setTheme, workspace, setWsOpen, wsOpen }) {
  return (
    <header className="topbar themed">
      <div className="ws-switch-wrap">
        <button className="ws-switch" onClick={() => setWsOpen(!wsOpen)}>
          <span className="ws-mark">{window.LR.initials(workspace.name)}</span>
          <span className="ws-text">
            <span className="ws-name">{workspace.name}</span>
            <span className="ws-role">{workspace.role === "owner" ? "Owner" : "Member"} · {workspace.memberCount} members</span>
          </span>
          <Icon name="chevronDown" size={16} style={{ color: "var(--muted)" }} />
        </button>
        {wsOpen && <WsMenu nav={nav} workspace={workspace} close={() => setWsOpen(false)} />}
      </div>

      <div className="topbar-search">
        <Icon name="search" size={17} style={{ color: "var(--faint)" }} />
        <input placeholder="Search papers, notes, themes…" />
        <span className="kbd">⌘K</span>
      </div>

      <div className="row gap2">
        <button className="btn-icon" title="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
        <button className="topbar-me" onClick={() => nav("home")} title="Your account">
          <Avatar name="Elena Hart" color="oklch(0.47 0.08 162)" size={32} />
        </button>
      </div>
    </header>
  );
}

function WsMenu({ nav, workspace, close }) {
  return (
    <>
      <div className="menu-scrim" onClick={close} />
      <div className="menu ws-menu fade-enter">
        <div className="menu-label">Workspaces</div>
        {window.LR.workspaces.map((w) => (
          <button key={w.id} className={"menu-ws" + (w.id === workspace.id ? " active" : "")}
            onClick={() => { close(); nav("dashboard", { ws: w.id }); }}>
            <span className="ws-mark sm">{window.LR.initials(w.name)}</span>
            <span className="col" style={{ alignItems: "flex-start", gap: 1 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{w.name}</span>
              <span className="meta">{w.role} · {w.paperCount} papers</span>
            </span>
            {w.id === workspace.id && <Icon name="check" size={16} style={{ color: "var(--accent)", marginLeft: "auto" }} />}
          </button>
        ))}
        <div className="divider" style={{ margin: "6px 0" }} />
        <button className="menu-item" onClick={() => { close(); nav("onboarding"); }}>
          <Icon name="plus" size={16} /> Create or join workspace
        </button>
        <button className="menu-item" onClick={() => { close(); nav("home"); }}>
          <Icon name="grid" size={16} /> All workspaces
        </button>
        <button className="menu-item danger" onClick={() => { close(); nav("signin"); }}>
          <Icon name="logout" size={16} /> Sign out
        </button>
      </div>
    </>
  );
}

/* page header used across app screens */
function PageHead({ eyebrow, title, sub, children }) {
  return (
    <div className="page-head">
      <div className="col" style={{ gap: 6, minWidth: 0 }}>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="row gap2" style={{ flex: "none" }}>{children}</div>}
    </div>
  );
}

Object.assign(window, { Icon, Avatar, Badge, Sidebar, Topbar, WsMenu, PageHead });
