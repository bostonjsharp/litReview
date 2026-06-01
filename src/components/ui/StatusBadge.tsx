const MAP: Record<string, [string, string]> = {
  ready: ["badge-ready", "Ready"],
  processing: ["badge-processing", "Processing"],
  pending: ["badge-pending", "Pending"],
  failed: ["badge-failed", "Failed"],
  metadata_only: ["badge-pending", "Metadata only"],
};
export function StatusBadge({ status }: { status: string }) {
  const [cls, label] = MAP[status] || MAP.pending;
  return <span className={"badge " + cls}><span className="dot" />{label}</span>;
}
