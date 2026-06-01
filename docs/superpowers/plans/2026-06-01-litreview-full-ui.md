# LitReview Full UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the high-fidelity "Quiet Press" design (`handoff/`) across all 11 LitReview screens, wired to the real Next.js App Router + Drizzle + Postgres backend.

**Architecture:** Copy the prototype's three stylesheets as a class-based token/style layer; load the three typefaces via `next/font`; nest all workspace content under `/workspaces/[id]/` with `(app)`/`(immersive)` route groups so `workspaceId` is always a route param. Server components fetch data; existing client components are restyled and re-wired against the unchanged `/api/**` routes.

**Tech Stack:** Next.js 16 (App Router, React 19), `next/font/google`, Drizzle ORM, Postgres, next-auth v5, vitest (node env).

**Reference files (read while implementing each screen):**
- Visual/markup: `handoff/source/{ui,auth,workspace,reader,synthesis}.jsx`
- Styles (copied verbatim): `handoff/source/{styles,layout,screens}.css`
- Spec: `docs/superpowers/specs/2026-06-01-litreview-full-ui-design.md`

**Conventions for every task:**
- "Verify build" = run `npm run build` and expect it to complete without type/compile errors.
- "Verify lint" = run `npm run lint` and expect no new errors.
- This repo is **not** a git repo. Do Task 0 to enable the commit steps; otherwise treat every "Commit" step as a manual checkpoint and skip the command.
- Before writing any Next.js code, heed `AGENTS.md`: skim the relevant guide under `node_modules/next/dist/docs/` (App Router, route groups, `next/font`, server/client components) — the framework version differs from training data.

---

## Phase 0 — Setup

### Task 0: Enable version control (optional but recommended)

**Files:** none (repo init)

- [ ] **Step 1: Init git so the plan's commit checkpoints work**

Run:
```bash
git init
git add -A
git commit -m "chore: snapshot before UI implementation"
```
Expected: a repo with one baseline commit. If you skip this task, ignore all later "Commit" steps.

---

## Phase 1 — Foundation (tokens, fonts, theme, icons, chrome, routing)

### Task 1: Style layer (copy the three stylesheets)

**Files:**
- Create: `src/app/styles/tokens.css` (copy of `handoff/source/styles.css`)
- Create: `src/app/styles/layout.css` (copy of `handoff/source/layout.css`)
- Create: `src/app/styles/screens.css` (copy of `handoff/source/screens.css`)
- Modify: `src/app/globals.css` (replace contents)

- [ ] **Step 1: Copy the three CSS files verbatim**

Copy each `handoff/source/*.css` to the matching `src/app/styles/*.css`. Do not edit them except: in `tokens.css`, the `--serif/--sans/--mono` declarations will be overridden in Task 2 — leave them for now (they act as fallbacks).

- [ ] **Step 2: Replace `globals.css` with imports + app-root sizing**

```css
@import "./styles/tokens.css";
@import "./styles/layout.css";
@import "./styles/screens.css";

/* App fills the viewport; immersive + shell wrappers size to 100% */
html, body { height: 100%; }
body { min-height: 100%; }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: completes; CSS imported without error.

- [ ] **Step 4: Commit**

```bash
git add src/app/styles src/app/globals.css
git commit -m "feat(ui): add Quiet Press style/token layer"
```

---

### Task 2: Fonts + theme + root layout

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/components/ui/ThemeToggle.tsx`

- [ ] **Step 1: Rewrite the root layout — load 3 fonts, wire tokens, no-flash theme script**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Spectral, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const serif = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-spectral",
  display: "block",
});
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "block",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "block",
});

export const metadata: Metadata = {
  title: "LitReview",
  description: "Store, link, and query literature reviews and their source papers.",
};

// Runs before paint: applies persisted/system theme to <html data-theme>.
const themeScript = `(function(){try{var t=localStorage.getItem('lr-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Override the font tokens to the next/font variables**

Append to `src/app/styles/tokens.css` `:root` (or add a new rule at the top of `globals.css` after the imports):
```css
:root {
  --serif: var(--font-spectral), Georgia, "Times New Roman", serif;
  --sans: var(--font-hanken), system-ui, -apple-system, sans-serif;
  --mono: var(--font-plex-mono), ui-monospace, "SF Mono", monospace;
}
```

- [ ] **Step 3: Create the ThemeToggle client component**

`src/components/ui/ThemeToggle.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const t = (document.documentElement.getAttribute("data-theme") as "light" | "dark") || "light";
    setTheme(t);
  }, []);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("lr-theme", next); } catch {}
    setTheme(next);
  }
  return (
    <button className="btn-icon" title="Toggle theme" onClick={toggle}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
```
(`Icon` is created in Task 3; if implementing strictly in order, stub the import or do Task 3 first.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: completes; fonts resolve.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/styles/tokens.css src/components/ui/ThemeToggle.tsx
git commit -m "feat(ui): next/font typefaces + data-theme toggle with no-flash script"
```

---

### Task 3: Icon component (port the SVG set)

**Files:**
- Create: `src/components/ui/Icon.tsx`

- [ ] **Step 1: Port `ICONS` + `<Icon>` from `handoff/source/ui.jsx` (lines 6–60)**

`src/components/ui/Icon.tsx`:
```tsx
const ICONS: Record<string, string> = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  chevronLeft: "M15 6l-6 6 6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
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

export function Icon({ name, size = 18, stroke = 1.7, style, className }: {
  name: string; size?: number; stroke?: number; style?: React.CSSProperties; className?: string;
}) {
  if (name === "google") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className}>
        <path fill="#4285F4" d="M22.5 12.2c0-.7-.06-1.4-.18-2H12v3.8h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-7.8Z" />
        <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.8A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2a11 11 0 0 0 0 9.8l3.7-2.8Z" />
        <path fill="#EA4335" d="M12 4.8c1.6 0 3 .55 4.2 1.6l3.1-3.1A11 11 0 0 0 2 7.1l3.7 2.8C6.6 7.3 9.1 4.8 12 4.8Z" />
      </svg>
    );
  }
  const d = ICONS[name] || "";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
      {d.split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}
    </svg>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: completes.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Icon.tsx
git commit -m "feat(ui): port inline SVG icon set"
```

---

### Task 4: Display helpers (initials + deterministic colors) — TDD

**Files:**
- Create: `src/lib/ui/display.ts`
- Test: `tests/ui/display.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/ui/display.test.ts`:
```ts
import { initials, colorForId } from "@/lib/ui/display";

describe("initials", () => {
  it("takes first letters of first two words, uppercased", () => {
    expect(initials("Elena Hart")).toBe("EH");
  });
  it("handles a single word", () => {
    expect(initials("Reading")).toBe("RE");
  });
  it("handles empty/falsy", () => {
    expect(initials("")).toBe("?");
  });
});

describe("colorForId", () => {
  it("is deterministic for the same id", () => {
    expect(colorForId("abc")).toBe(colorForId("abc"));
  });
  it("returns an oklch string from the palette", () => {
    expect(colorForId("abc")).toMatch(/^oklch\(/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/display.test.ts`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Implement**

`src/lib/ui/display.ts`:
```ts
export function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Stable per-id color drawn from a calm academic palette (used for collection
// dots and member avatars — the schema has no color column).
const PALETTE = [
  "oklch(0.47 0.08 162)", "oklch(0.55 0.11 250)", "oklch(0.58 0.12 30)",
  "oklch(0.55 0.1 300)", "oklch(0.6 0.1 90)", "oklch(0.52 0.1 200)",
];
export function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/display.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/display.ts tests/ui/display.test.ts
git commit -m "feat(ui): initials + deterministic color helpers"
```

---

### Task 5: Shared chrome primitives (Avatar, StatusBadge, PageHead)

**Files:**
- Create: `src/components/ui/Avatar.tsx`
- Create: `src/components/ui/StatusBadge.tsx`
- Create: `src/components/ui/PageHead.tsx`

- [ ] **Step 1: Avatar**

`src/components/ui/Avatar.tsx`:
```tsx
import { initials } from "@/lib/ui/display";

export function Avatar({ name, color, size = 32 }: { name: string; color?: string; size?: number }) {
  return (
    <div className="avatar" style={{ width: size, height: size, background: color || "var(--accent)", fontSize: size * 0.4 }}>
      {initials(name)}
    </div>
  );
}
```

- [ ] **Step 2: StatusBadge**

`src/components/ui/StatusBadge.tsx`:
```tsx
const MAP: Record<string, [string, string]> = {
  ready: ["badge-ready", "Ready"],
  processing: ["badge-processing", "Processing"],
  pending: ["badge-pending", "Pending"],
  failed: ["badge-failed", "Failed"],
};
export function StatusBadge({ status }: { status: string }) {
  const [cls, label] = MAP[status] || MAP.pending;
  return <span className={"badge " + cls}><span className="dot" />{label}</span>;
}
```

- [ ] **Step 3: PageHead** (port `ui.jsx` lines 191–202)

`src/components/ui/PageHead.tsx`:
```tsx
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
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: completes.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Avatar.tsx src/components/ui/StatusBadge.tsx src/components/ui/PageHead.tsx
git commit -m "feat(ui): Avatar, StatusBadge, PageHead primitives"
```

---

### Task 6: Route restructure + app-shell / immersive layouts + chrome

**Files:**
- Create: `src/app/workspaces/[id]/(app)/layout.tsx`
- Create: `src/app/workspaces/[id]/(immersive)/layout.tsx`
- Create: `src/components/chrome/Sidebar.tsx`
- Create: `src/components/chrome/Topbar.tsx`
- Create: `src/components/chrome/WorkspaceMenu.tsx`
- Move/rename existing pages into the new tree (see Step 1)

- [ ] **Step 1: Create the directory tree and move pages**

Target tree (move existing `page.tsx` files into the new locations; create folders as needed):
```
src/app/workspaces/[id]/(app)/page.tsx                    <- replaces old workspaces/[id]/page.tsx (Dashboard, Task 11)
src/app/workspaces/[id]/(app)/members/page.tsx            <- old workspaces/[id]/members/page.tsx
src/app/workspaces/[id]/(app)/upload/page.tsx             <- old app/upload/page.tsx
src/app/workspaces/[id]/(app)/chat/page.tsx               <- old app/chat/page.tsx
src/app/workspaces/[id]/(app)/collections/[cid]/page.tsx          <- NEW (Task 12)
src/app/workspaces/[id]/(app)/collections/[cid]/matrix/page.tsx   <- old app/collections/[id]/matrix/page.tsx
src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx         <- old app/papers/[id]/page.tsx
src/app/workspaces/[id]/(immersive)/reviews/[rid]/edit/page.tsx   <- old app/reviews/[id]/edit/page.tsx
```
Delete the now-empty old folders: `src/app/upload`, `src/app/chat`, `src/app/papers`, `src/app/collections`, `src/app/reviews`, and the old `src/app/workspaces/[id]/page.tsx` / `members/page.tsx` locations.
Note: dynamic param names change (`[id]`→`[pid]`/`[cid]`/`[rid]`); update each moved page's `params` destructuring accordingly. The `[id]` at the workspace level remains the workspace id.

- [ ] **Step 2: App-shell layout (membership guard + data for chrome)**

`src/app/workspaces/[id]/(app)/layout.tsx`:
```tsx
import { redirect, notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/chrome/Sidebar";
import { Topbar } from "@/components/chrome/Topbar";

export default async function AppShellLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) redirect("/login");

  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
  if (!ws) notFound();
  const [membership] = await db.select().from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, id), eq(schema.workspaceMembers.userId, user.id)));
  if (!membership) redirect("/");

  const collections = await db.select({ id: schema.collections.id, name: schema.collections.name })
    .from(schema.collections).where(eq(schema.collections.workspaceId, id));
  const memberRows = await db.select().from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, id));
  const allWs = await db.select({ id: schema.workspaces.id, name: schema.workspaces.name })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
    .where(eq(schema.workspaceMembers.userId, user.id));

  return (
    <div className="app-shell">
      <Sidebar workspaceId={id} collections={collections} />
      <div className="app-main">
        <Topbar
          workspace={{ id, name: ws.name, role: membership.role, memberCount: memberRows.length }}
          workspaces={allWs}
          userName={user.name || user.email}
        />
        <div className="app-scroll">
          <div className="app-canvas fade-enter">{children}</div>
        </div>
      </div>
    </div>
  );
}
```
Note: pages that manage their own full-height scroll (Matrix, Chat) should render with `app-region` instead of `app-canvas`; for those, this layout still wraps them — keep them inside `app-canvas` unless their CSS needs the full region. Matrix/Chat tasks (15, 16) note the wrapper they expect; if a page needs the fill region, it can render a top-level element with `style={{height:'100%'}}` and its own scroll. Keep it simple: leave the canvas wrapper; Chat/Matrix use their own internal scroll containers.

- [ ] **Step 3: Immersive layout**

`src/app/workspaces/[id]/(immersive)/layout.tsx`:
```tsx
import { redirect, notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireUser } from "@/lib/session";

export default async function ImmersiveLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) redirect("/login");
  const [membership] = await db.select().from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, id), eq(schema.workspaceMembers.userId, user.id)));
  if (!membership) notFound();
  return <div style={{ height: "100%" }}>{children}</div>;
}
```

- [ ] **Step 4: Sidebar** (port `ui.jsx` 83–123; real links + active state)

`src/components/chrome/Sidebar.tsx`:
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { colorForId } from "@/lib/ui/display";

export function Sidebar({ workspaceId, collections }: {
  workspaceId: string; collections: { id: string; name: string }[];
}) {
  const path = usePathname();
  const base = `/workspaces/${workspaceId}`;
  const nav = [
    { href: base, icon: "layers", label: "Collections", match: (p: string) => p === base },
    { href: `${base}/matrix`, icon: "grid", label: "Literature matrix", match: (p: string) => p.includes("/matrix") },
    { href: `${base}/chat`, icon: "chat", label: "Chat", match: (p: string) => p.endsWith("/chat") },
    { href: `${base}/members`, icon: "users", label: "Members", match: (p: string) => p.endsWith("/members") },
  ];
  return (
    <aside className="sidebar themed">
      <Link className="brand" href={base}>
        <span className="brand-mark">LR</span>
        <span className="brand-name serif">LitReview</span>
      </Link>
      <Link className="btn btn-primary btn-block" style={{ margin: "0 0 6px" }} href={`${base}/upload`}>
        <Icon name="upload" /> Add paper
      </Link>
      <nav className="side-nav">
        {nav.map((it) => (
          <Link key={it.href} href={it.href} className={"side-link" + (it.match(path) ? " active" : "")}>
            <Icon name={it.icon} size={18} /> {it.label}
          </Link>
        ))}
      </nav>
      <div className="side-section">
        <div className="side-head">Collections</div>
        {collections.map((c) => (
          <Link key={c.id} className="side-coll" href={`${base}/collections/${c.id}`}>
            <span className="dot" style={{ background: colorForId(c.id) }} />
            <span className="side-coll-name">{c.name}</span>
          </Link>
        ))}
      </div>
      <div className="grow" />
    </aside>
  );
}
```
Note: the prototype's matrix nav has no collection context; here "Literature matrix" links to `${base}/matrix`. Add a tiny redirect page at `(app)/matrix/page.tsx` that redirects to the first collection's matrix, or, simpler, point this link at the first collection's matrix when collections exist (`collections[0] ? \`${base}/collections/${collections[0].id}/matrix\` : \`${base}\``). Use the latter to avoid an extra route.

- [ ] **Step 5: Topbar + WorkspaceMenu** (port `ui.jsx` 125–188; styled search, real ws switcher, sign out)

`src/components/chrome/Topbar.tsx`:
```tsx
"use client";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { WorkspaceMenu } from "./WorkspaceMenu";
import { initials } from "@/lib/ui/display";

export function Topbar({ workspace, workspaces, userName }: {
  workspace: { id: string; name: string; role: string; memberCount: number };
  workspaces: { id: string; name: string }[];
  userName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <header className="topbar themed">
      <div className="ws-switch-wrap">
        <button className="ws-switch" onClick={() => setOpen(!open)}>
          <span className="ws-mark">{initials(workspace.name)}</span>
          <span className="ws-text">
            <span className="ws-name">{workspace.name}</span>
            <span className="ws-role">{workspace.role === "owner" ? "Owner" : "Member"} · {workspace.memberCount} members</span>
          </span>
          <Icon name="chevronDown" size={16} style={{ color: "var(--muted)" }} />
        </button>
        {open && <WorkspaceMenu activeId={workspace.id} workspaces={workspaces} close={() => setOpen(false)} />}
      </div>
      <div className="topbar-search">
        <Icon name="search" size={17} style={{ color: "var(--faint)" }} />
        <input placeholder="Search papers, notes, themes…" aria-label="Search (coming soon)" />
        <span className="kbd">⌘K</span>
      </div>
      <div className="row gap2">
        <ThemeToggle />
        <a className="topbar-me" href="/" title="Your account"><Avatar name={userName} size={32} /></a>
      </div>
    </header>
  );
}
```

`src/components/chrome/WorkspaceMenu.tsx`:
```tsx
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
```

- [ ] **Step 6: Shared sign-out / sign-in server actions**

`src/app/actions/auth.ts`:
```ts
"use server";
import { signIn, signOut } from "@/auth";

export async function signInAction() {
  await signIn("google", { redirectTo: "/" });
}
export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
```

- [ ] **Step 7: Update each moved page's params + verify no flat-route links remain**

For each moved page, fix the `params` type/name (e.g. `papers/[pid]` → `params: Promise<{ id: string; pid: string }>`). Then search the repo for stale links:

Run: `npx grep -rn "href=\"/papers\|href=\"/chat\|href=\"/upload\|href=\"/collections\|/reviews/" src` (or use the editor search). Update any to nested `/workspaces/${wsId}/...` forms. (These pages are restyled in later tasks; here just make them compile under the new paths with their existing markup.)

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: completes; all routes resolve at their new paths.

- [ ] **Step 9: Commit**

```bash
git add src/app/workspaces src/components/chrome src/app/actions
git commit -m "feat(ui): route restructure + app-shell/immersive layouts + chrome"
```

---

## Phase 2 — Immersive entry screens

### Task 7: Sign-in (Variant A, editorial split)

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Rebuild as the split layout (Google only, no SSO)** — reference `handoff/source/auth.jsx` `SignInSplit` + `layout.css` `.auth-split/.auth-aside/.auth-panel/.auth-card`.

`src/app/login/page.tsx`:
```tsx
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
```

- [ ] **Step 2: Verify build + visual check**

Run: `npm run build`. Then `npm run dev`, open `/login`, compare to `handoff/source/LitReview.html` (sign-in). Confirm split layout, pull-quote with accent italic *actually*, three feature rows, Google button. Toggle dark mode via devtools (`document.documentElement.setAttribute('data-theme','dark')`).

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(ui): editorial-split sign-in"
```

---

### Task 8: Onboarding

**Files:**
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/components/WorkspaceOnboarding.tsx`

- [ ] **Step 1: Page wrapper** — reference `auth.jsx` `Onboarding` + `layout.css` `.onb-*`.

`src/app/onboarding/page.tsx`:
```tsx
import { WorkspaceOnboarding } from "@/components/WorkspaceOnboarding";

export default function OnboardingPage() {
  return (
    <div className="onb-stage">
      <div className="onb-wrap fade-enter">
        <div className="onb-head">
          <div className="eyebrow">Step 1 of 1 · Set up</div>
          <h1>Find your workspace</h1>
          <p>Create a shared space for your lab, or join one with an invite code.</p>
        </div>
        <WorkspaceOnboarding />
        <div className="onb-foot">You can belong to several workspaces and switch between them anytime.</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Restyle `WorkspaceOnboarding`** — keep its existing state + the two fetch calls (`POST /api/workspaces`, `POST /api/workspaces/join`) and `router.push(\`/workspaces/${id}\`)`. Replace markup with the two-card grid:

```tsx
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
          <p>Start a private space for your team's papers and reviews.</p>
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
```

- [ ] **Step 3: Verify build + visual check** (`/onboarding`).

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/page.tsx src/components/WorkspaceOnboarding.tsx
git commit -m "feat(ui): onboarding two-card layout"
```

---

### Task 9: Home / workspace picker

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Rebuild with own top bar + workspace card rows + counts** — reference `auth.jsx` `Home` + `layout.css` `.home-*`/`.ws-*`.

Fetch: current user, their workspaces, and per-workspace counts (collections, papers, members). Use Drizzle `count()` aggregates grouped by workspace, or per-row counts. Render:
```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Avatar } from "@/components/ui/Avatar";
import { initials } from "@/lib/ui/display";
import { signOutAction } from "@/app/actions/auth";

export default async function Home() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const memberships = user
    ? await db.select({ id: schema.workspaces.id, name: schema.workspaces.name, role: schema.workspaceMembers.role })
        .from(schema.workspaceMembers)
        .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
        .where(eq(schema.workspaceMembers.userId, user.id))
    : [];
  if (memberships.length === 0) redirect("/onboarding");

  // counts per workspace
  const rows = await Promise.all(memberships.map(async (w) => {
    const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(schema.collections).where(eq(schema.collections.workspaceId, w.id));
    const [{ p }] = await db.select({ p: sql<number>`count(*)::int` }).from(schema.papers).where(eq(schema.papers.workspaceId, w.id));
    const [{ m }] = await db.select({ m: sql<number>`count(*)::int` }).from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, w.id));
    return { ...w, collections: c, papers: p, members: m };
  }));

  return (
    <div className="home-stage">
      <header className="home-top themed">
        <div className="auth-brand"><span className="brand-mark">LR</span><span className="brand-name serif">LitReview</span></div>
        <div className="row gap2"><ThemeToggle /><form action={signOutAction}><button className="btn btn-quiet btn-sm">Sign out</button></form></div>
      </header>
      <div className="home-wrap fade-enter">
        <div className="home-greet">
          <div className="eyebrow">Signed in as {email}</div>
          <h1>Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.</h1>
          <p className="muted">Choose a workspace to continue.</p>
        </div>
        <div className="ws-list">
          {rows.map((w) => (
            <Link key={w.id} href={`/workspaces/${w.id}`} className="card card-hover ws-row">
              <span className="ws-mark">{initials(w.name)}</span>
              <div className="ws-row-main">
                <h3>{w.name}</h3>
                <div className="ws-row-stats meta">{w.collections} collections · {w.papers} papers · {w.members} members</div>
              </div>
              <span className={"role-tag " + (w.role === "owner" ? "role-owner" : "role-member")}>{w.role}</span>
              <Icon name="chevronRight" size={18} style={{ color: "var(--faint)" }} />
            </Link>
          ))}
        </div>
        <div className="home-add">
          <Link href="/onboarding" className="home-add-card"><Icon name="plus" size={18} /> Create a workspace</Link>
          <Link href="/onboarding" className="home-add-card"><Icon name="users" size={18} /> Join with a code</Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + visual check** (`/`).

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): home workspace picker"
```

---

## Phase 3 — App-shell screens

### Task 10: Collection card colors helper reuse + Dashboard

**Files:**
- Create/replace: `src/app/workspaces/[id]/(app)/page.tsx`

- [ ] **Step 1: Build the Dashboard** — reference `workspace.jsx` `Dashboard` + `layout.css` `.stat-row/.coll-grid/.coll-card/.coll-new`.

Fetch (server): collections in workspace; counts for papers, annotations, themes; per-collection paper & review counts. Render `PageHead` (eyebrow = workspace name, title "Collections", actions: Members link + "Add paper" link), `.stat-row` (4 stats + "Ask the corpus" → chat), `.coll-grid` of `.coll-card` (dot color `colorForId(c.id)`, mono name, research question, footer `N papers · N reviews`) + dashed `.coll-new` card.

For "New collection" use a small client component `NewCollectionCard` that POSTs to `/api/collections` with `{ workspaceId, name, researchQuestion }` then `router.refresh()`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
export function NewCollectionCard({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [q, setQ] = useState("");
  async function create() {
    const res = await fetch("/api/collections", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, name, researchQuestion: q }) });
    if (res.ok) { setOpen(false); setName(""); setQ(""); router.refresh(); }
  }
  if (!open) return <button className="card coll-card coll-new" onClick={() => setOpen(true)}><Icon name="plus" size={20} /><span>New collection</span></button>;
  return (
    <div className="card coll-card">
      <input className="input" placeholder="Collection name" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea className="textarea" placeholder="Research question" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row gap2"><button className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={create}>Create</button><button className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </div>
  );
}
```
Place `NewCollectionCard` at `src/components/workspace/NewCollectionCard.tsx`. The dashboard server component maps collections to `<Link href={\`/workspaces/${id}/collections/${c.id}\`}>` cards and appends `<NewCollectionCard workspaceId={id} />`.

- [ ] **Step 2: Verify build + visual check** (`/workspaces/<id>`).

- [ ] **Step 3: Commit**

```bash
git add "src/app/workspaces/[id]/(app)/page.tsx" src/components/workspace/NewCollectionCard.tsx
git commit -m "feat(ui): workspace dashboard"
```

---

### Task 11: Collection detail (NEW)

**Files:**
- Create: `src/app/workspaces/[id]/(app)/collections/[cid]/page.tsx`

- [ ] **Step 1: Build the page** — reference `workspace.jsx` `Collection` + `layout.css` `.coll-hero/.list-head/.paper-row/.paper-thumb/.paper-title/.paper-meta/.ann-pill`.

Fetch (server): the collection; papers where `collectionId = cid` (+ per-paper annotation count via subquery/group, + page count from `pageOffsets` length); reviews where `collectionId = cid`. Render:
- "All collections" back `<Link href={\`/workspaces/${id}\`}>`.
- `.coll-hero`: dot (`colorForId`), name, "Research question" eyebrow, question (Spectral 25px), action row: Add paper (→ upload), Open matrix (→ `collections/${cid}/matrix`), Ask about this (→ chat).
- Papers `.list-card`: each `.paper-row`. Ready rows wrapped in `<Link href={\`/workspaces/${id}/papers/${p.id}\`}>` with `.click`. Non-ready show `StatusBadge`; failed rows show a Retry button (client component calling `POST /api/process` with `{parentType:'paper', parentId:p.id}`).
- Reviews list: rows → `/workspaces/${id}/reviews/${r.id}/edit`.

Retry button `src/components/workspace/RetryButton.tsx`:
```tsx
"use client";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
export function RetryButton({ parentType, parentId }: { parentType: "paper" | "review"; parentId: string }) {
  const router = useRouter();
  async function retry() {
    await fetch("/api/process", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentType, parentId }) });
    router.refresh();
  }
  return <button className="btn btn-ghost btn-sm" onClick={retry}><Icon name="refresh" size={14} /> Retry</button>;
}
```

- [ ] **Step 2: Verify build + visual check** (navigate from dashboard into a collection).

- [ ] **Step 3: Commit**

```bash
git add "src/app/workspaces/[id]/(app)/collections/[cid]/page.tsx" src/components/workspace/RetryButton.tsx
git commit -m "feat(ui): collection detail page"
```

---

### Task 12: Members & invite

**Files:**
- Modify: `src/app/workspaces/[id]/(app)/members/page.tsx`
- Modify: `src/components/MembersPanel.tsx`

- [ ] **Step 1: Page** — fetch workspace + current user role + members, pass to panel. Use `PageHead` (eyebrow workspace name, title "Members", sub).

- [ ] **Step 2: Rebuild `MembersPanel`** — reference `workspace.jsx` `Members` + `screens.css` `.invite-card/.invite-link/.member-row/.role-tag/.you-tag`. Keep existing fetches (`GET members`, `POST invite-code`) and add owner-only Remove (`DELETE /api/workspaces/[id]/members/[userId]` then refresh). Props: `{ workspaceId, inviteCode, currentUserId, isOwner }`.
  - `.invite-card`: left text; right `.invite-box` with `.invite-link` showing `litreview.app/join/` + `<span className="code">{code}</span>`, a Copy button (writes `${origin}/join/${code}` to clipboard, swaps label to "Copied ✓" for 1.6s via `setTimeout`), and owner-only Regenerate quiet button.
  - `.member-row` list: `Avatar` (`colorForId(userId)`), name + `(you)` `.you-tag` when `userId === currentUserId`, mono email, `.role-tag`. Owner sees `.btn-danger` Remove on non-owner rows.

- [ ] **Step 3: Verify build + visual check** (`/workspaces/<id>/members`; test Copy + (as owner) Regenerate/Remove).

- [ ] **Step 4: Commit**

```bash
git add "src/app/workspaces/[id]/(app)/members/page.tsx" src/components/MembersPanel.tsx
git commit -m "feat(ui): members & invite screen"
```

---

### Task 13: Upload / import

**Files:**
- Modify: `src/app/workspaces/[id]/(app)/upload/page.tsx`
- Modify: `src/components/UploadForm.tsx`

- [ ] **Step 1: Page** — fetch collections for the `<select>`, pass `workspaceId` + collections to `UploadForm`. Wrap in `.upload-wrap`, `PageHead` (eyebrow `<workspace> · import`).

- [ ] **Step 2: Rebuild `UploadForm`** (client) — reference `workspace.jsx` `Upload` + `screens.css` `.seg/.dropzone/.queue/.queue-item/.q-bar`. Props `{ workspaceId, collections }`. State: `kind: 'paper'|'review'`, `collectionId`, `queue: {id,name,status}[]`.
  - Segmented `.seg` Paper/Review toggle; Collection `<select>`.
  - `.dropzone`: hidden `<input type=file accept=.pdf>` + browse link + "Paste text instead" (toggles a textarea). On file/text submit, POST `FormData` to `/api/upload` with `kind`, `workspaceId`, optional `collectionId`, `title`, `file`/`text`. Push `{id, name, status:'pending'}` to queue.
  - Wiring note line: `<div className="meta">workspace {workspaceId}</div>`.
  - `.queue`: each item shows file icon, mono filename, `StatusBadge`, and a `.q-prog`/`.q-bar` when processing. **Poll** each non-terminal item every 2.5s via `GET /api/papers/[id]` (papers) — read `paper.status` — and update; stop on `ready`/`failed`. (Reviews have no GET-by-id route; for reviews, leave status at last known and show a manual Refresh, or add polling only for papers. Document this.) Failed items show error line + `RetryButton`.

- [ ] **Step 3: Verify build + visual check** (`/workspaces/<id>/upload`; upload a small PDF, watch it advance).

- [ ] **Step 4: Commit**

```bash
git add "src/app/workspaces/[id]/(app)/upload/page.tsx" src/components/UploadForm.tsx
git commit -m "feat(ui): upload/import screen with status queue"
```

---

## Phase 4 — Hero: Reader & Composer

### Task 14: Highlight slicing (offset-based) — TDD

**Files:**
- Create: `src/lib/annotate/highlights.ts`
- Test: `tests/ui/highlights.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/ui/highlights.test.ts`:
```ts
import { sliceSegment } from "@/lib/annotate/highlights";

// segment "Hello world foo" starting at absolute offset 100
const seg = { offset: 100, text: "Hello world foo" };

describe("sliceSegment", () => {
  it("returns one plain part when no annotations overlap", () => {
    expect(sliceSegment(seg, [])).toEqual([{ text: "Hello world foo" }]);
  });
  it("wraps a single overlapping annotation", () => {
    // 'world' is chars 106..111 absolute
    const parts = sliceSegment(seg, [{ id: "a1", charStart: 106, charEnd: 111 }]);
    expect(parts).toEqual([
      { text: "Hello " },
      { text: "world", annId: "a1" },
      { text: " foo" },
    ]);
  });
  it("clamps an annotation that starts before the segment", () => {
    const parts = sliceSegment(seg, [{ id: "a2", charStart: 90, charEnd: 105 }]);
    expect(parts).toEqual([
      { text: "Hello", annId: "a2" },
      { text: " world foo" },
    ]);
  });
  it("handles two non-overlapping annotations in order", () => {
    const parts = sliceSegment(seg, [
      { id: "a1", charStart: 100, charEnd: 105 },
      { id: "a3", charStart: 112, charEnd: 115 },
    ]);
    expect(parts).toEqual([
      { text: "Hello", annId: "a1" },
      { text: " world ", annId: undefined },
      { text: "foo", annId: "a3" },
    ].map((p) => p.annId === undefined ? { text: p.text } : p));
  });
  it("ignores annotations entirely outside the segment", () => {
    expect(sliceSegment(seg, [{ id: "x", charStart: 200, charEnd: 210 }])).toEqual([{ text: "Hello world foo" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/highlights.test.ts`
Expected: FAIL — `sliceSegment` undefined.

- [ ] **Step 3: Implement**

`src/lib/annotate/highlights.ts`:
```ts
import type { TextSegment } from "./offsets";

export interface HlAnnotation { id: string; charStart: number; charEnd: number }
export interface SegmentPart { text: string; annId?: string }

// Split a rendered segment into parts, marking sub-ranges covered by annotations.
// Offsets are absolute into full_text; the segment occupies [offset, offset+len).
// Assumes non-overlapping annotations (overlaps: first one wins for the shared span).
export function sliceSegment(seg: TextSegment, annotations: HlAnnotation[]): SegmentPart[] {
  const segStart = seg.offset;
  const segEnd = seg.offset + seg.text.length;
  const hits = annotations
    .map((a) => ({ id: a.id, s: Math.max(a.charStart, segStart), e: Math.min(a.charEnd, segEnd) }))
    .filter((a) => a.e > a.s)
    .sort((a, b) => a.s - b.s);
  if (hits.length === 0) return [{ text: seg.text }];

  const parts: SegmentPart[] = [];
  let cursor = segStart;
  for (const h of hits) {
    if (h.s < cursor) continue; // skip overlap
    if (h.s > cursor) parts.push({ text: seg.text.slice(cursor - segStart, h.s - segStart) });
    parts.push({ text: seg.text.slice(h.s - segStart, h.e - segStart), annId: h.id });
    cursor = h.e;
  }
  if (cursor < segEnd) parts.push({ text: seg.text.slice(cursor - segStart) });
  return parts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/highlights.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/annotate/highlights.ts tests/ui/highlights.test.ts
git commit -m "feat(reader): offset-based highlight slicing"
```

---

### Task 15: Reader (hero) — page + rebuilt AnnotationReader

**Files:**
- Modify: `src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx`
- Rewrite: `src/components/AnnotationReader.tsx`

- [ ] **Step 1: Server page — fetch everything the reader needs**

Fetch: paper (title, authors, year, journal, doi, fullText, pageOffsets, collectionId); annotations for the paper (id, charStart, charEnd, quote, comment, page, createdBy); collection themes; tags-by-annotation map (as the old page already builds); member display names for note footers (map createdBy → user name/color). Pass to `<AnnotationReader>` along with `workspaceId`, `collectionId`, and back-link target. Wrap markup in the design (no shell). Reference old page for the existing query shape.

- [ ] **Step 2: Rewrite `AnnotationReader`** (client) — reference `reader.jsx` `Reader`/`ThemePop` + `screens.css` `.reader*/.notes-*/.note*/.sel-pop/.theme-pop` and `mark.hl`.

Behavior (preserve `splitIntoSegments` + `resolveSelection` from `offsets.ts`; use `sliceSegment` from `highlights.ts`):
  - Build `segments = splitIntoSegments(fullText)`. Render each as `<p data-base={seg.offset}>` whose children come from `sliceSegment(seg, annotations)`: plain parts as text, `annId` parts as `<mark className={"hl"+(active? " active":"")} onClick=...>`.
  - **Selection popover:** keep the existing `onMouseUp` selection→`{charStart,charEnd}` logic (anchor/focus `data-base` + offsets via `resolveSelection`). If `charEnd-charStart >= 4`, also compute the range rect relative to the doc container ref to position `.sel-pop` (as in `reader.jsx` lines 39–47). Show "Highlight & note".
  - **Compose card:** clicking the popover opens `.note-compose` at the top of the rail (the rail is `.notes-scroll`, scroll it to top): quoted passage, autofocused comment `<textarea className="textarea">`, theme chips + `.chip-add` opening `.theme-pop`, Save/Cancel. Save → `POST /api/annotations` `{paperId, charStart, charEnd, quote, comment}`; on success prepend the returned annotation, then for each chosen theme `POST /api/annotations/[id]/themes {themeId}`.
  - **Notes rail:** `.note` cards (quote, comment, theme chips with remove via `DELETE .../themes/[themeId]` + `.chip-add` → `.theme-pop` add via `POST`), footer `Avatar` + `author · p.N`. Clicking a card sets `activeId`; clicking a `<mark>` sets `activeId` and scrolls the matching `#note-<id>` into view.
  - Inline comment edit (optional within scope): on blur of an editable comment, `PATCH /api/annotations/[id] {comment}`. If time-boxed, keep comments read-only after creation and note it.

- [ ] **Step 3: Verify build + visual check** — open a ready paper, select text → popover → save a note (confirm it persists on reload and appears as a `<mark>`), tag a theme, click a highlight to activate its note. Check dark mode.

- [ ] **Step 4: Commit**

```bash
git add "src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx" src/components/AnnotationReader.tsx
git commit -m "feat(reader): high-fidelity annotation reader (hero)"
```

---

### Task 16: Review composer

**Files:**
- Modify: `src/app/workspaces/[id]/(immersive)/reviews/[rid]/edit/page.tsx`
- Rewrite: `src/components/ReviewComposer.tsx`

- [ ] **Step 1: Server page — fetch review + entries + candidate notes**

Fetch: review (title, collectionId, createdBy name); entries via `getReviewEntries`; candidate annotations = annotations on papers where `collectionId = review.collectionId` (id, quote, page, source label like `lastname · year` from the paper), excluding annotationIds already used by annotation entries. Pass `reviewId`, `entries`, `candidates`, `meta` to `<ReviewComposer>`. For annotation entries, also resolve each `annotationId` → `{quote, page, sourceLabel, themes}` and pass a lookup map so blocks can render without extra fetches.

- [ ] **Step 2: Rewrite `ReviewComposer`** (client) — reference `reader.jsx` `Composer` + `screens.css` `.composer*/.block*/.ann-card/.rail-*`.
  - Keep existing entries API calls (`GET/POST/PATCH/DELETE /api/reviews/[id]/entries...`). State seeded from server `entries`.
  - Sticky bar: back link (to collection), "Saved" badge, "Read view" toggle (renders assembled prose+quotes read-only), "Publish" (no-op/stub button — no publish endpoint; style only, document).
  - `.composer-doc`: `.composer-title-in` input (title editing has no API — keep editable but local-only, or wire later; document as local). `.composer-sub` meta. Blocks: prose = auto-growing `<textarea className=...>` (on blur, if changed, there's no prose-update endpoint — only add/move/delete exist; so prose editing of existing blocks is local-only unless an entry PATCH for prose is added. **Scope decision:** prose blocks are added via the API and editable locally; persisting edited prose text is deferred (no endpoint). Document this clearly.) Annotation blocks render `.ann-card` from the lookup map.
  - `.block-handle` on hover: move up/down (`PATCH {direction}`), delete (`DELETE`), drag (visual only).
  - `.block-add`: "Prose block" (`POST {kind:'prose', prose:''}`), "Insert note" (insert first candidate via `POST {kind:'annotation', annotationId}`).
  - `.composer-rail`: candidate notes; click → add as annotation entry. After any mutation, re-fetch entries (existing pattern).

- [ ] **Step 3: Verify build + visual check** — open a review edit page, add a prose block + a note from the rail, reorder, delete.

- [ ] **Step 4: Commit**

```bash
git add "src/app/workspaces/[id]/(immersive)/reviews/[rid]/edit/page.tsx" src/components/ReviewComposer.tsx
git commit -m "feat(composer): block-based review composer"
```

---

## Phase 5 — Synthesis: Matrix & Chat

### Task 17: Literature matrix + suggest panel

**Files:**
- Modify: `src/app/workspaces/[id]/(app)/collections/[cid]/matrix/page.tsx`
- Rewrite: `src/components/MatrixGrid.tsx`
- Modify: `src/components/SuggestThemesPanel.tsx`

- [ ] **Step 1: Page** — call `getMatrix(cid)` (existing). Add `PageHead` (eyebrow collection name, title "Literature matrix") with "Suggest themes" action rendered by `SuggestThemesPanel`. Pass `workspaceId` + `cid` so cell links target `/workspaces/${id}/papers/${pid}`.

- [ ] **Step 2: Rewrite `MatrixGrid`** (can stay a server component) — reference `synthesis.jsx` `Matrix` + `screens.css` `.matrix*/.cell-note/.cell-empty-add/.row-paper-*`.
  - `<table className="matrix">`: sticky `thead` with corner `th.corner` + one `th` per theme (`.col-theme` name + `.col-count` `N papers` = number of papers with ≥1 note for that theme). `tbody`: one row per paper; sticky `th` first column (`.row-paper-title` + `.row-paper-meta`). Cells: `matrix.cells[paperId][themeId]` → `.cell-note` cards (italic quote + `.cn-p` `🔗 p.N` `<Link>` to the paper). Empty cells get class `empty` + a faint `.cell-empty-add` `+` (non-functional add, or links to the paper). Wrap the table in `.matrix-scroll`.

- [ ] **Step 3: Restyle `SuggestThemesPanel`** (client) — reference `synthesis.jsx` Suggest panel + `screens.css` `.suggest-*`. Keep existing calls: `POST .../suggest-themes`, `POST .../themes`, `POST /api/annotations/[id]/themes`. Replace markup: a "Suggest themes" `.btn btn-primary` trigger in the page head, and when open, a `.suggest-panel` slide-in (scrim + panel) listing each suggested theme as `.suggest-item` (name, `.si-why` rationale, `.si-count` "N annotations match", per-item **Add** → creates the theme + applies its assignments, then marks `.added`). `router.refresh()` after adds so new columns appear.

- [ ] **Step 4: Verify build + visual check** — open a collection matrix with tagged annotations; open Suggest themes; Add one and confirm a column appears.

- [ ] **Step 5: Commit**

```bash
git add "src/app/workspaces/[id]/(app)/collections/[cid]/matrix/page.tsx" src/components/MatrixGrid.tsx src/components/SuggestThemesPanel.tsx
git commit -m "feat(matrix): sticky literature matrix + suggest panel"
```

---

### Task 18: Chat

**Files:**
- Modify: `src/app/workspaces/[id]/(app)/chat/page.tsx`
- Rewrite: `src/components/ChatPanel.tsx`

- [ ] **Step 1: Page** — fetch collections (for scope pills) + paper count in workspace (for the hint). Pass `workspaceId`, `collections`, `paperCount` to `ChatPanel`.

- [ ] **Step 2: Rewrite `ChatPanel`** (client) — reference `synthesis.jsx` `Chat` + `screens.css` `.chat*/.msg-*/.answer/.cites/.cite*/.scope-pill`.
  - State: `scope` (`{kind:'workspace'} | {kind:'collection', collectionId} | {kind:'paper', parentId}`), `turns: {q, answer, citations}[]`, `input`.
  - `.chat-scope`: pills "Whole workspace" / each collection / (optional) "Single paper". Active = `.on`.
  - Empty state `.chat-empty` (chat-mark, "Ask your corpus", explainer, 3 suggested-question buttons that set input + send).
  - `.chat-scroll`: user `.msg-q` bubbles; answers `.msg-a` (ai-mark + `.answer`). Render the answer: split on `[n]` tokens (regex `/\[(\d+)\]/`) and replace each with `<sup>` linking to the matching citation; if no markers, render plain. Then `.cites` Sources: each `.cite` = `.cite-num` (index), `.cite-src` (`.cite-type` `type` + title + `p.N`), `.cite-q` italic quote (use citation title; the API citation has `{parentType, parentId, title, page}` — quote text isn't returned, so show title + page; if quote unavailable, omit `.cite-q`). `.cite` links to `/workspaces/${id}/papers/${parentId}` when `parentType==='paper'`.
  - Send: `POST /api/chat` `{ workspaceId, query, scope: mapScope() }` where `mapScope` builds `{collectionId}` or `{parentType:'paper', parentId}` or `{}`. Append the turn.
  - `.chat-input`: textarea (Enter sends, Shift+Enter newline), send button. `.chat-hint` mono shows `"${paperCount} papers in scope"`.

- [ ] **Step 3: Verify build + visual check** — ask a question in a workspace with a ready corpus; confirm an answer + Sources render and a source links to the reader.

- [ ] **Step 4: Commit**

```bash
git add "src/app/workspaces/[id]/(app)/chat/page.tsx" src/components/ChatPanel.tsx
git commit -m "feat(chat): scoped corpus chat with citations"
```

---

## Phase 6 — Verification

### Task 19: Cross-screen verification pass

**Files:** none (verification)

- [ ] **Step 1: Build + lint clean**

Run: `npm run build` then `npm run lint`. Expected: both pass with no errors.

- [ ] **Step 2: Unit tests pass**

Run: `npx vitest run tests/ui`. Expected: display + highlights tests PASS.

- [ ] **Step 3: Link integrity after route move**

Search for any remaining flat-route links/redirects: `/papers/`, `/chat`, `/upload`, `/collections/`, `/reviews/` not prefixed by `/workspaces/${...}/`. Expected: none outside `/join/[code]` and `/onboarding`/`/login`.

- [ ] **Step 4: Manual walkthrough (dev server) against the prototype**

Run: `npm run dev`. Walk: `/login` → onboarding → home → dashboard → collection → reader (select→note→theme) → composer → matrix (suggest) → chat. Toggle theme on each; confirm fidelity vs `handoff/source/LitReview.html`. Note any gaps.

- [ ] **Step 5: Commit (docs/notes if any)**

```bash
git add -A
git commit -m "chore(ui): verification pass"
```

---

## Coverage map (spec → tasks)

- Foundation (CSS/fonts/theme/icons/chrome): Tasks 1–6
- Routing restructure + workspace threading: Task 6
- Sign-in (Variant A, no SSO): Task 7
- Onboarding: Task 8 · Home: Task 9
- Dashboard: Task 10 · Collection detail (NEW): Task 11 · Members: Task 12 · Upload: Task 13
- Reader (hero) incl. offset highlights: Tasks 14–15 · Composer: Task 16
- Matrix + Suggest: Task 17 · Chat: Task 18
- Decorative/deferred (search unwired, SSO omitted, composer DnD, publish/prose-persist deferred): documented in Tasks 6/7/13/16/17
- Verification: Task 19
