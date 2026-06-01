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
