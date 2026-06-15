import { useMemo, useState } from "react";
import type { Feature } from "../types";
import { Badge, Card } from "./ui";
import { fmt } from "../data";

type SortKey = "feature_id" | "correlation" | "win_assoc";

export default function FeaturesTable({ features }: { features: Feature[] }) {
  const [sort, setSort] = useState<SortKey>("win_assoc");
  const [onlyPass, setOnlyPass] = useState(false);

  const rows = useMemo(() => {
    let r = [...features];
    if (onlyPass) r = r.filter((f) => f.fidelity_pass);
    r.sort((a, b) => Math.abs((b[sort] as number) ?? 0) - Math.abs((a[sort] as number) ?? 0));
    return r;
  }, [features, sort, onlyPass]);

  return (
    <Card>
      <div className="mb-3 flex items-center gap-4">
        <h2 className="text-lg font-semibold">Features ({rows.length})</h2>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" checked={onlyPass} onChange={(e) => setOnlyPass(e.target.checked)} />
          verified only
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-edge bg-ink px-2 py-1 text-sm"
        >
          <option value="win_assoc">sort by |win&nbsp;assoc|</option>
          <option value="correlation">sort by |fidelity|</option>
          <option value="feature_id">sort by id</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">concept</th>
              <th className="py-2 pr-3">behavior</th>
              <th className="py-2 pr-3">fidelity</th>
              <th className="py-2 pr-3">win&nbsp;assoc</th>
              <th className="py-2 pr-3">status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.feature_id} className="border-t border-edge/60 hover:bg-edge/30">
                <td className="py-2 pr-3 font-mono text-slate-500">{f.feature_id}</td>
                <td className="py-2 pr-3 text-slate-200">{f.concept ?? "—"}</td>
                <td className="py-2 pr-3 text-slate-400">{f.behavior ?? "—"}</td>
                <td className="py-2 pr-3 font-mono">{fmt(f.correlation, 2)}</td>
                <td className="py-2 pr-3 font-mono">
                  <span className={(f.win_assoc ?? 0) >= 0 ? "text-good" : "text-bad"}>
                    {(f.win_assoc ?? 0) >= 0 ? "+" : ""}
                    {fmt(f.win_assoc, 3)}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <Badge ok={!!f.fidelity_pass}>{f.fidelity_pass ? "verified" : "unverified"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
