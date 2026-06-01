/* ============================================================
   LitReview — Sign in (2 variants), Onboarding, Home
   ============================================================ */

const FEATURES = [
  { icon: "book", h: "Read & annotate", p: "Highlight a passage, write a note, and tag it with a theme — your marginalia, searchable." },
  { icon: "grid", h: "Synthesize in a matrix", p: "Line up papers against themes and watch the literature organize itself into a review." },
  { icon: "chat", h: "Ask your corpus", p: "Questions answered only from your team's papers, every claim linked to its source passage." },
];

/* ---------- Variant A: editorial split ---------- */
function SignInSplit({ nav }) {
  return (
    <div className="auth-split">
      <div className="auth-aside themed">
        <div className="auth-aside-stripes" />
        <div className="auth-brand">
          <span className="brand-mark">LR</span>
          <span className="brand-name serif">LitReview</span>
        </div>
        <div className="auth-quote">
          <div className="q">A shared desk for the papers your lab <em>actually</em> reads.</div>
          <div className="by">// private workspaces for research teams</div>
        </div>
        <div className="auth-feats">
          {FEATURES.map((f) => (
            <div className="auth-feat" key={f.h}>
              <span className="fi"><Icon name={f.icon} size={18} /></span>
              <div>
                <h4>{f.h}</h4>
                <p>{f.p}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-card fade-enter">
          <h1>Sign in</h1>
          <p className="lede">Welcome back. Pick up where your reading left off.</p>
          <button className="btn-google" onClick={() => nav("home")}>
            <Icon name="google" size={20} /> Continue with Google
          </button>
          <div className="auth-or">Institutional access</div>
          <button className="btn btn-ghost btn-block" style={{ height: 48 }} onClick={() => nav("home")}>
            Continue with university SSO
          </button>
          <p className="auth-fine">
            By continuing you agree to the <a href="#">terms</a> and <a href="#">privacy policy</a>.
            Your corpus stays private to your workspace.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Variant B: centered reading card ---------- */
function SignInCentered({ nav }) {
  return (
    <div className="auth-centered">
      <div className="auth-centered-bg" />
      <div className="auth-c-card fade-enter">
        <div className="auth-c-mark">LR</div>
        <h1>Welcome to LitReview</h1>
        <p className="lede">A calm home for your team's papers, notes, and the reviews that tie them together.</p>
        <button className="btn-google" onClick={() => nav("home")}>
          <Icon name="google" size={20} /> Continue with Google
        </button>
        <div className="auth-c-feats">
          {FEATURES.map((f) => (
            <div className="auth-c-feat" key={f.h}>
              <span className="fi"><Icon name={f.icon} size={16} /></span>
              <span><b>{f.h}.</b> {f.p.split(" — ")[0].split(",")[0]}.</span>
            </div>
          ))}
        </div>
        <p className="auth-fine" style={{ marginTop: 22 }}>
          Private by default · <a href="#">Terms</a> · <a href="#">Privacy</a>
        </p>
      </div>
    </div>
  );
}

function SignIn({ nav, variant, setVariant }) {
  return (
    <div className="auth-stage">
      {variant === "split" ? <SignInSplit nav={nav} /> : <SignInCentered nav={nav} />}
      <div className="variant-toggle">
        <span className="vt-label">Sign-in direction</span>
        <button className={variant === "split" ? "on" : ""} onClick={() => setVariant("split")}>Editorial split</button>
        <button className={variant === "centered" ? "on" : ""} onClick={() => setVariant("centered")}>Reading card</button>
      </div>
    </div>
  );
}

/* ---------- Onboarding ---------- */
function Onboarding({ nav }) {
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  return (
    <div className="onb-stage">
      <div className="onb-wrap fade-enter">
        <div className="onb-head">
          <span className="eyebrow">Step 1 of 1 · Set up</span>
          <h1>Find your workspace</h1>
          <p>A workspace is the private home your team shares — collections, papers, notes and reviews all live inside it.</p>
        </div>
        <div className="onb-grid">
          <div className="card onb-card primary">
            <span className="onb-ico"><Icon name="plus" size={22} /></span>
            <div>
              <h3>Create a workspace</h3>
              <p>Start fresh and invite your collaborators with a link.</p>
            </div>
            <div className="field">
              <label className="label">Workspace name</label>
              <input className="input input-lg" placeholder="e.g. Cognitive Load Lab"
                value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-lg btn-block" disabled={!name.trim()} onClick={() => nav("dashboard")}>
              Create workspace <Icon name="arrowRight" />
            </button>
          </div>

          <div className="card onb-card">
            <span className="onb-ico"><Icon name="users" size={22} /></span>
            <div>
              <h3>Join a workspace</h3>
              <p>Already invited? Paste the code from your team's link.</p>
            </div>
            <div className="field">
              <label className="label">Invite code</label>
              <div className="code-input">
                <input className="input input-lg" placeholder="7F3K-92QD"
                  value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-ghost btn-lg btn-block" disabled={!code.trim()} onClick={() => nav("dashboard")}>
              Join workspace
            </button>
          </div>
        </div>
        <p className="onb-foot">You can belong to several workspaces and switch between them anytime.</p>
      </div>
    </div>
  );
}

/* ---------- Home / workspace switcher ---------- */
function Home({ nav, theme, setTheme }) {
  return (
    <div className="home-stage">
      <div className="home-top themed">
        <div className="auth-brand">
          <span className="brand-mark">LR</span>
          <span className="brand-name serif">LitReview</span>
        </div>
        <div className="row gap2">
          <button className="btn-icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <Icon name={theme === "dark" ? "sun" : "moon"} />
          </button>
          <button className="btn btn-quiet btn-sm" onClick={() => nav("signin")}>
            <Icon name="logout" size={15} /> Sign out
          </button>
        </div>
      </div>

      <div className="home-wrap fade-enter">
        <div className="home-greet">
          <span className="eyebrow">Signed in as elena.hart@univ.edu</span>
          <h1 style={{ marginTop: 10 }}>Good morning, Elena.</h1>
          <p className="muted">Choose a workspace to continue.</p>
        </div>

        <div className="ws-list">
          {window.LR.workspaces.map((w) => (
            <div className="card card-hover ws-row" key={w.id} onClick={() => nav("dashboard", { ws: w.id })}>
              <span className="ws-mark">{window.LR.initials(w.name)}</span>
              <div className="ws-row-main">
                <h3>{w.name}</h3>
                <div className="ws-row-stats">
                  <span className="meta">{w.collectionCount} collections</span>
                  <span className="meta">{w.paperCount} papers</span>
                  <span className="meta">{w.memberCount} members</span>
                </div>
              </div>
              <span className={"role-tag " + (w.role === "owner" ? "role-owner" : "role-member")}>{w.role}</span>
              <Icon name="chevronRight" size={18} style={{ color: "var(--faint)" }} />
            </div>
          ))}
        </div>

        <div className="home-add">
          <button className="home-add-card" onClick={() => nav("onboarding")}>
            <Icon name="plus" size={18} /> Create a workspace
          </button>
          <button className="home-add-card" onClick={() => nav("onboarding")}>
            <Icon name="users" size={18} /> Join with a code
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SignIn, Onboarding, Home });
