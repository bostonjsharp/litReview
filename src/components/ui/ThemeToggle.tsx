"use client";
import { useSyncExternalStore } from "react";
import { Icon } from "./Icon";

function getThemeSnapshot(): "light" | "dark" {
  return (document.documentElement.getAttribute("data-theme") as "light" | "dark") || "light";
}

function subscribe(cb: () => void): () => void {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, () => "light");

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("lr-theme", next); } catch {}
  }
  return (
    <button className="btn-icon" title="Toggle theme" onClick={toggle}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
