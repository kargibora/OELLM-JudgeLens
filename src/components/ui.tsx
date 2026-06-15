import React from "react";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-edge bg-panel/70 p-4 shadow-lg ${className}`}>
      {children}
    </div>
  );
}

export function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-2xl font-semibold text-slate-100">{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </Card>
  );
}

export function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        ok ? "bg-good/15 text-good" : "bg-slate-600/20 text-slate-400"
      }`}
    >
      {children}
    </span>
  );
}

// red (negative) → slate (zero) → green (positive), magnitude-scaled
export function divergeColor(v: number, max: number): string {
  const t = Math.max(-1, Math.min(1, max ? v / max : 0));
  if (t >= 0) {
    const a = 0.25 + 0.75 * t;
    return `rgba(52, 211, 153, ${a.toFixed(2)})`;
  }
  const a = 0.25 + 0.75 * -t;
  return `rgba(248, 113, 113, ${a.toFixed(2)})`;
}
