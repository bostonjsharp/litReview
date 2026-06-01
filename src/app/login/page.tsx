import { signInAction } from "@/app/actions/auth";
import { Icon } from "@/components/ui/Icon";

const FEATS = [
  { icon: "highlighter", title: "Read & annotate", desc: "Highlight passages and attach notes that stay linked to the source." },
  { icon: "grid", title: "Synthesize in a matrix", desc: "Turn notes into a literature matrix across themes and papers." },
  { icon: "chat", title: "Ask your corpus", desc: "Get answers drawn only from your papers, with citations." },
];

export default function Login() {
  return (
    <div className="auth-stage">
      <div className="auth-split">
        <aside className="auth-aside themed">
          <div className="auth-aside-stripes" />
          <div className="auth-brand">
            <span className="brand-mark">LR</span><span className="brand-name serif">LitReview</span>
          </div>
          <div className="auth-quote">
            <div className="q serif">A shared desk for the papers your lab <em>actually</em> reads.</div>
          </div>
          <div className="auth-feats">
            {FEATS.map((f) => (
              <div className="auth-feat" key={f.title}>
                <span className="fi"><Icon name={f.icon} size={18} /></span>
                <div><h4>{f.title}</h4><p>{f.desc}</p></div>
              </div>
            ))}
          </div>
        </aside>
        <div className="auth-panel">
          <div className="auth-card fade-enter">
            <h1>Sign in</h1>
            <p className="lede">Continue to your research workspace.</p>
            <form action={signInAction}>
              <button type="submit" className="btn-google"><Icon name="google" size={20} /> Continue with Google</button>
            </form>
            <p className="auth-fine">By continuing you agree to the acceptable-use policy for your workspace.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
