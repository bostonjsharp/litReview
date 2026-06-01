/* ============================================================
   LitReview — router, theme, mount
   ============================================================ */
const { useState, useEffect } = React;

const IMMERSIVE = ["signin", "onboarding", "home", "reader", "composer"];
const FILLERS = ["matrix", "chat"];

function load(key, fb) { try { return JSON.parse(localStorage.getItem(key)) ?? fb; } catch { return fb; } }

function App() {
  const [theme, setThemeState] = useState(() => load("lr_theme", "light"));
  const [navState, setNavState] = useState(() => load("lr_nav", { route: "signin", params: {} }));
  const [variant, setVariant] = useState(() => load("lr_variant", "split"));
  const [wsId, setWsId] = useState(() => load("lr_ws", "w_cll"));
  const [wsOpen, setWsOpen] = useState(false);

  const { route, params } = navState;

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("lr_theme", JSON.stringify(theme)); }, [theme]);
  useEffect(() => { localStorage.setItem("lr_nav", JSON.stringify(navState)); }, [navState]);
  useEffect(() => { localStorage.setItem("lr_variant", JSON.stringify(variant)); }, [variant]);
  useEffect(() => { localStorage.setItem("lr_ws", JSON.stringify(wsId)); }, [wsId]);

  function nav(route, p = {}) {
    if (p.ws) setWsId(p.ws);
    setNavState({ route, params: p });
    setWsOpen(false);
    const sc = document.querySelector(".app-region");
    if (sc) sc.scrollTo({ top: 0 });
  }
  const setTheme = (t) => setThemeState(t);

  const workspace = window.LR.workspaces.find((w) => w.id === wsId) || window.LR.workspaces[0];

  let screen;
  switch (route) {
    case "signin": screen = <SignIn nav={nav} variant={variant} setVariant={setVariant} />; break;
    case "onboarding": screen = <Onboarding nav={nav} />; break;
    case "home": screen = <Home nav={nav} theme={theme} setTheme={setTheme} />; break;
    case "dashboard": screen = <Dashboard nav={nav} workspace={workspace} />; break;
    case "collection": screen = <Collection nav={nav} params={params} />; break;
    case "members": screen = <Members nav={nav} workspace={workspace} />; break;
    case "upload": screen = <Upload nav={nav} workspace={workspace} />; break;
    case "reader": screen = <Reader nav={nav} params={params} />; break;
    case "composer": screen = <Composer nav={nav} />; break;
    case "matrix": screen = <Matrix nav={nav} />; break;
    case "chat": screen = <Chat nav={nav} />; break;
    default: screen = <SignIn nav={nav} variant={variant} setVariant={setVariant} />;
  }

  if (IMMERSIVE.includes(route)) {
    return <div className="immersive" style={{ height: "100%" }}>{screen}</div>;
  }

  const isFiller = FILLERS.includes(route);
  return (
    <div className="app-shell">
      <Sidebar nav={nav} route={route} />
      <div className="app-main">
        <Topbar nav={nav} theme={theme} setTheme={setTheme} workspace={workspace}
          wsOpen={wsOpen} setWsOpen={setWsOpen} />
        <div className={"app-region" + (isFiller ? " fill" : " scroll")} key={route}>
          {screen}
        </div>
      </div>
    </div>
  );
}

function mount() {
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
}
// Render only once the web fonts are ready, so text wraps with correct
// metrics on first paint (prevents serif lines overflowing into meta rows).
if (document.fonts && document.fonts.ready) {
  let done = false;
  const go = () => { if (!done) { done = true; mount(); } };
  document.fonts.ready.then(go);
  setTimeout(go, 1500); // safety net
} else {
  mount();
}
