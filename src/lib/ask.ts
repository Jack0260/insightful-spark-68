import type { Agg, Column } from "./data";

export interface AskResult {
  chart: "line" | "bar" | "pie";
  metric: string | null;
  agg: Agg;
  groupBy: string;
  isDate: boolean;
  bucket: "day" | "month";
  from?: string | undefined;
  title: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[_\-]+/g, " ");

function findCol(q: string, cols: Column[]): Column | undefined {
  // prefer longest name match, also tolerate plural/singular
  const sorted = [...cols].sort((a, b) => b.name.length - a.name.length);
  return sorted.find((c) => {
    const n = norm(c.name);
    return new RegExp(`\\b${escape(n)}(s|es)?\\b`).test(q) || (n.endsWith("s") && new RegExp(`\\b${escape(n.slice(0, -1))}\\b`).test(q));
  });
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Rule-based parser: "sales by region last 3 months", "average profit per month as line", "count by channel pie" */
export function parseQuestion(input: string, cols: Column[], maxDate?: Date): AskResult | { error: string } {
  const q = " " + norm(input) + " ";
  const nums = cols.filter((c) => c.type === "number");
  const dims = cols.filter((c) => c.type === "category" || c.type === "date");
  const dateCol = cols.find((c) => c.type === "date");

  let agg: Agg = "sum";
  if (/\b(average|avg|mean)\b/.test(q)) agg = "avg";
  else if (/\b(count|number of|how many)\b/.test(q)) agg = "count";
  else if (/\b(max|maximum|highest|top)\b/.test(q)) agg = "max";
  else if (/\b(min|minimum|lowest)\b/.test(q)) agg = "min";

  // split on "by/per/over"
  const m = q.match(/\b(?:by|per|over|across|for each)\b(.*)/);
  const left = m ? q.slice(0, m.index) : q;
  const right = m?.[1] ?? "";

  let metric: Column | null = findCol(left, nums) ?? null;
  if (!metric && agg !== "count") metric = findCol(q, nums) ?? null;
  if (!metric && agg !== "count") {
    if (!nums.length) agg = "count";
    else metric = nums[0] ?? null;
  }

  let group = findCol(right, dims);
  let bucket: "day" | "month" = "month";
  if (/\b(month|monthly|time|trend|over time)\b/.test(right || q) && dateCol && !group) group = dateCol;
  if (/\b(day|daily)\b/.test(right || q) && dateCol) {
    if (!group) group = dateCol;
    bucket = "day";
  }
  if (!group) group = findCol(q, dims.filter((d) => d.name !== metric?.name));
  if (!group) group = dims.find((d) => d.type === "category") ?? dateCol;
  if (!group) return { error: "I couldn't find a column to group by. Try naming a category or date column." };

  // time window
  let from: string | undefined;
  const t = q.match(/\b(?:last|past|previous)\s+(\d+)?\s*(day|week|month|year)s?\b/);
  if (t && dateCol) {
    const nUnits = Number(t[1] ?? 1);
    const end = maxDate ? new Date(maxDate) : new Date();
    const days = ({ day: 1, week: 7, month: 30.44, year: 365 } as Record<string, number>)[t[2] ?? "day"] ?? 1;
    from = iso(new Date(end.getTime() - Math.round(nUnits * days) * 86400000));
  } else if (/\b(this year|ytd)\b/.test(q) && dateCol) {
    from = `${(maxDate ?? new Date()).getFullYear()}-01-01`;
  }

  const isDate = group.type === "date";
  let chart: AskResult["chart"] = isDate ? "line" : "bar";
  if (/\b(pie|share|breakdown|proportion|split)\b/.test(q)) chart = "pie";
  else if (/\b(line|trend)\b/.test(q)) chart = "line";
  else if (/\b(bar|column|compare)\b/.test(q)) chart = "bar";

  const metricLabel = agg === "count" ? "Count of rows" : `${agg === "sum" ? "Total" : agg.charAt(0).toUpperCase() + agg.slice(1)} ${metric!.name}`;
  const title = `${metricLabel} by ${group.name}${isDate ? ` (${bucket})` : ""}${t ? ` · last ${t[1] ?? 1} ${t[2]}${Number(t[1] ?? 1) > 1 ? "s" : ""}` : ""}`;
  return { chart, metric: agg === "count" ? null : metric!.name, agg, groupBy: group.name, isDate, bucket, from, title };
}
