import { initials } from "@/lib/ui/display";

export function Avatar({ name, color, size = 32 }: { name: string; color?: string; size?: number }) {
  return (
    <div className="avatar" style={{ width: size, height: size, background: color || "var(--accent)", fontSize: size * 0.4 }}>
      {initials(name)}
    </div>
  );
}
