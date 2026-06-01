export function PageHead({ eyebrow, title, sub, children }: {
  eyebrow?: string; title: string; sub?: string; children?: React.ReactNode;
}) {
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
