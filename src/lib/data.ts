import Papa from "papaparse";

export type ColType = "number" | "date" | "category" | "text";
export type Row = Record<string, string | number | Date | null>;
export interface Column {
  name: string;
  type: ColType;
  unique: number;
}
export interface Dataset {
  name: string;
  columns: Column[];
  rows: Row[];
}

const NUM_RE = /^-?[$€£₹]?\s?-?[\d,]*\.?\d+%?$/;

function toNumber(v: string): number | null {
  const s = v.trim();
  if (!s || !NUM_RE.test(s)) return null;
  const n = Number(s.replace(/[$€£₹,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toDate(v: string): Date | null {
  const s = v.trim();
  if (!s || /^-?\d+(\.\d+)?$/.test(s)) return null;
  if (!/[-/]|\d{4}|[a-z]{3}/i.test(s)) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const y = d.getFullYear();
  return y > 1900 && y < 2200 ? d : null;
}

export function detectColumns(raw: Record<string, string>[], fields: string[]): Column[] {
  const sample = raw.slice(0, 500);
  return fields.map((name) => {
    const vals = sample.map((r) => (r[name] ?? "").toString()).filter((v) => v.trim() !== "");
    const uniq = new Set(raw.map((r) => r[name])).size;
    const n = vals.length || 1;
    const nums = vals.filter((v) => toNumber(v) !== null).length;
    const dates = vals.filter((v) => toDate(v) !== null).length;
    let type: ColType;
    if (dates / n > 0.9) type = "date";
    else if (nums / n > 0.9) type = "number";
    else if (uniq <= Math.max(30, raw.length * 0.05)) type = "category";
    else type = "text";
    return { name, type, unique: uniq };
  });
}

export function buildDataset(name: string, raw: Record<string, string>[], fields: string[]): Dataset {
  const columns = detectColumns(raw, fields);
  const rows: Row[] = raw.map((r) => {
    const o: Row = {};
    for (const c of columns) {
      const v = (r[c.name] ?? "").toString();
      if (c.type === "number") o[c.name] = toNumber(v);
      else if (c.type === "date") o[c.name] = toDate(v);
      else o[c.name] = v.trim() || null;
    }
    return o;
  });
  return { name, columns, rows };
}

export function parseCsv(file: File): Promise<Dataset> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: false,
      complete: (res) => {
        const fields = (res.meta.fields ?? []).filter(Boolean);
        if (!fields.length || !res.data.length) return reject(new Error("CSV has no rows or headers"));
        resolve(buildDataset(file.name, res.data, fields));
      },
      error: (err) => reject(err),
    });
  });
}

export interface Filters {
  from: string; // yyyy-mm-dd
  to: string;
  category: Record<string, string>; // column -> value ("" = all)
  search: string;
}
export const emptyFilters = (): Filters => ({ from: "", to: "", category: {}, search: "" });

export function applyFilters(ds: Dataset, f: Filters, dateCol?: string): Row[] {
  const from = f.from ? new Date(f.from + "T00:00:00").getTime() : -Infinity;
  const to = f.to ? new Date(f.to + "T23:59:59").getTime() : Infinity;
  const cats = Object.entries(f.category).filter(([, v]) => v);
  const q = f.search.trim().toLowerCase();
  const textCols = ds.columns.filter((c) => c.type === "category" || c.type === "text").map((c) => c.name);
  return ds.rows.filter((r) => {
    if (dateCol && (f.from || f.to)) {
      const d = r[dateCol] as Date | null;
      if (!d) return false;
      const t = d.getTime();
      if (t < from || t > to) return false;
    }
    for (const [k, v] of cats) if (r[k] !== v) return false;
    if (q && !textCols.some((c) => String(r[c] ?? "").toLowerCase().includes(q))) return false;
    return true;
  });
}

export type Agg = "sum" | "avg" | "count" | "min" | "max";

export function aggregate(rows: Row[], groupBy: string, metric: string | null, agg: Agg, isDate: boolean, bucket: "day" | "month" = "month") {
  const map = new Map<string, { sum: number; n: number; min: number; max: number; sort: number }>();
  for (const r of rows) {
    const g = r[groupBy];
    if (g == null) continue;
    let key: string;
    let sort = 0;
    if (isDate) {
      const d = g as Date;
      key = bucket === "month" ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : d.toISOString().slice(0, 10);
      sort = bucket === "month" ? d.getFullYear() * 12 + d.getMonth() : d.getTime();
    } else key = String(g);
    const v = metric ? (r[metric] as number | null) : 1;
    if (metric && v == null) continue;
    const e = map.get(key) ?? { sum: 0, n: 0, min: Infinity, max: -Infinity, sort };
    e.sum += v as number;
    e.n += 1;
    e.min = Math.min(e.min, v as number);
    e.max = Math.max(e.max, v as number);
    map.set(key, e);
  }
  const out = [...map.entries()].map(([name, e]) => ({
    name,
    value: round(agg === "sum" ? e.sum : agg === "avg" ? e.sum / e.n : agg === "count" ? e.n : agg === "min" ? e.min : e.max),
    sort: e.sort,
  }));
  if (isDate) out.sort((a, b) => a.sort - b.sort);
  else out.sort((a, b) => b.value - a.value);
  return out;
}

export const round = (n: number) => Math.round(n * 100) / 100;

export function formatNum(n: number) {
  return Intl.NumberFormat("en", { notation: Math.abs(n) >= 10000 ? "compact" : "standard", maximumFractionDigits: 2 }).format(n);
}

export function formatCell(v: Row[string]) {
  if (v == null) return "—";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return v.toLocaleString("en");
  return v;
}

export function toCsv(ds: Dataset, rows: Row[]) {
  const data = rows.map((r) => {
    const o: Record<string, string | number> = {};
    for (const c of ds.columns) {
      const v = r[c.name];
      o[c.name] = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : v;
    }
    return o;
  });
  return Papa.unparse(data, { columns: ds.columns.map((c) => c.name) });
}

export function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sampleDataset(n = 12000): Dataset {
  const regions = ["North", "South", "East", "West", "Central"];
  const products = ["Atlas", "Beacon", "Comet", "Drift", "Echo", "Flux"];
  const channels = ["Online", "Retail", "Partner"];
  const now = Date.now();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const raw: Record<string, string>[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now - Math.floor(rnd() * 365) * 86400000);
    const units = 1 + Math.floor(rnd() * 20);
    const price = 20 + Math.floor(rnd() * 180);
    raw.push({
      order_id: `ORD-${100000 + i}`,
      date: d.toISOString().slice(0, 10),
      region: regions[Math.floor(rnd() * regions.length)],
      product: products[Math.floor(rnd() * products.length)],
      channel: channels[Math.floor(rnd() * channels.length)],
      units: String(units),
      sales: (units * price).toFixed(2),
      profit: (units * price * (0.1 + rnd() * 0.3)).toFixed(2),
    });
  }
  return buildDataset("sample-sales.csv", raw, Object.keys(raw[0]!));
}
