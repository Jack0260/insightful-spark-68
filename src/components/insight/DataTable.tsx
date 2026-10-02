import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { formatCell, type Dataset, type Row } from "@/lib/data";

const ROW_H = 36;

export function DataTable({ ds, rows }: { ds: Dataset; rows: Row[] }) {
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { col, dir } = sort;
    return [...rows].sort((a, b) => {
      const x = a[col], y = b[col];
      if (x == null) return 1;
      if (y == null) return -1;
      const xv = x instanceof Date ? x.getTime() : x;
      const yv = y instanceof Date ? y.getTime() : y;
      return (xv < yv ? -1 : xv > yv ? 1 : 0) * dir;
    });
  }, [rows, sort]);

  const v = useVirtualizer({ count: sorted.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 12 });
  const cols = ds.columns;
  const template = `repeat(${cols.length}, minmax(130px, 1fr))`;

  const toggle = (col: string) =>
    setSort((s) => (!s || s.col !== col ? { col, dir: 1 } : s.dir === 1 ? { col, dir: -1 } : null));

  return (
    <section className="panel overflow-hidden" aria-labelledby="table-title">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 id="table-title" className="text-sm font-semibold">Rows</h2>
        <span className="text-xs text-muted-foreground num" aria-live="polite">{sorted.length.toLocaleString()} rows</span>
      </div>
      <div
        ref={parentRef}
        className="h-[460px] overflow-auto"
        tabIndex={0}
        role="table"
        aria-label={`Data table, ${sorted.length} rows. Use arrow keys to scroll.`}
        aria-rowcount={sorted.length + 1}
      >
        <div style={{ minWidth: cols.length * 130 }}>
          <div role="row" className="sticky top-0 z-10 grid bg-muted border-b" style={{ gridTemplateColumns: template }}>
            {cols.map((c) => {
              const active = sort?.col === c.name;
              return (
                <div key={c.name} role="columnheader" aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button
                    onClick={() => toggle(c.name)}
                    className="w-full flex items-center gap-1.5 px-3 h-10 text-left text-xs font-semibold hover:bg-secondary"
                    aria-label={`Sort by ${c.name}`}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="text-[10px] uppercase text-muted-foreground font-normal">{c.type}</span>
                    {active ? sort!.dir === 1 ? <ArrowUp className="size-3 ml-auto" aria-hidden /> : <ArrowDown className="size-3 ml-auto" aria-hidden /> : <ArrowUpDown className="size-3 ml-auto opacity-40" aria-hidden />}
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ height: v.getTotalSize(), position: "relative" }}>
            {v.getVirtualItems().map((vi) => {
              const r = sorted[vi.index]!;
              return (
                <div
                  key={vi.key}
                  role="row"
                  aria-rowindex={vi.index + 2}
                  className={`grid absolute left-0 right-0 border-b text-sm ${vi.index % 2 ? "bg-muted/40" : ""}`}
                  style={{ gridTemplateColumns: template, height: ROW_H, transform: `translateY(${vi.start}px)` }}
                >
                  {cols.map((c) => (
                    <div key={c.name} role="cell" className={`px-3 flex items-center truncate ${c.type === "number" ? "num justify-end" : ""}`}>
                      {formatCell(r[c.name] ?? null)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
