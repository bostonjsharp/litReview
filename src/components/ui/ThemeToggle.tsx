"use client";
import { useState } from "react";
import { Icon } from "./Icon";

function getTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return (document.documentElement.getAttribute("data-theme") as "light" | "dark") || "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(getTheme);
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
