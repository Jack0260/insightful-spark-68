import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Download, FileUp, MessageSquareText, Save, Trash2, X, Database, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChartCard } from "@/components/insight/ChartCard";
import { DataTable } from "@/components/insight/DataTable";
import { aggregate, applyFilters, download, emptyFilters, formatNum, parseCsv, sampleDataset, toCsv, type Dataset, type Filters } from "@/lib/data";
import { parseQuestion, type AskResult } from "@/lib/ask";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "InsightBoard — Instant CSV analytics dashboard" },
      { name: "description", content: "Upload a CSV and get KPIs, charts, filters and a plain-English 'Ask your data' box instantly." },
      { property: "og:title", content: "InsightBoard — Instant CSV analytics dashboard" },
      { property: "og:description", content: "Upload a CSV and get KPIs, charts, filters and a plain-English 'Ask your data' box instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

interface SavedView { id: string; name: string; dataset: string; filters: Filters; metric: string; question: string }
const VIEWS_KEY = "insightboard.views";
const selectCls = "h-9 rounded-md border border-input bg-card px-2 text-sm";

function Index() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [metric, setMetric] = useState("");
  const [question, setQuestion] = useState("");
  const [ask, setAsk] = useState<AskResult | null>(null);
  const [askError, setAskError] = useState("");
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { setViews(JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "[]")); } catch { /* ignore */ }
  }, []);
  const persistViews = (v: SavedView[]) => { setViews(v); localStorage.setItem(VIEWS_KEY, JSON.stringify(v)); };

  const load = (d: Dataset) => {
    setDs(d);
    setFilters(emptyFilters());
    setMetric(d.columns.find((c) => c.type === "number")?.name ?? "");
    setAsk(null); setQuestion(""); setAskError("");
  };
  const onFile = async (f?: File | null) => {
    if (!f) return;
    setLoading(true);
    try { load(await parseCsv(f)); toast.success(`Loaded ${f.name}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not parse CSV"); }
    finally { setLoading(false); }
  };

  const cols = ds?.columns ?? [];
  const dateCol = cols.find((c) => c.type === "date")?.name;
  const cats = cols.filter((c) => c.type === "category");
  const nums = cols.filter((c) => c.type === "number");

  const filtered = useMemo(() => (ds ? applyFilters(ds, filters, dateCol) : []), [ds, filters, dateCol]);
  const maxDate = useMemo(() => {
    if (!ds || !dateCol) return undefined;
    let m = 0;
    for (const r of ds.rows) { const d = r[dateCol] as Date | null; if (d && d.getTime() > m) m = d.getTime(); }
    return m ? new Date(m) : undefined;
  }, [ds, dateCol]);

  const kpis = useMemo(() => {
    const out: { label: string; value: string; hint: string }[] = [{ label: "Rows", value: filtered.length.toLocaleString(), hint: ds ? `of ${ds.rows.length.toLocaleString()}` : "" }];
    for (const c of nums.slice(0, 3)) {
      let s = 0, n = 0;
      for (const r of filtered) { const v = r[c.name] as number | null; if (v != null) { s += v; n++; } }
      out.push({ label: `Total ${c.name}`, value: formatNum(s), hint: `avg ${formatNum(n ? s / n : 0)}` });
    }
    return out;
  }, [filtered, nums, ds]);

  const agg = metric ? "sum" : "count";
  const m = metric || null;
  const lineData = useMemo(() => (dateCol ? aggregate(filtered, dateCol, m, agg, true) : []), [filtered, dateCol, m, agg]);
  const barData = useMemo(() => (cats[0] ? aggregate(filtered, cats[0].name, m, agg, false) : []), [filtered, cats, m, agg]);
  const pieCol = cats[1] ?? cats[0];
  const pieData = useMemo(() => (pieCol ? aggregate(filtered, pieCol.name, m, agg, false) : []), [filtered, pieCol, m, agg]);

  const askData = useMemo(() => {
    if (!ask || !ds) return [];
    let rows = filtered;
    if (ask.from && dateCol) { const t = new Date(ask.from).getTime(); rows = rows.filter((r) => { const d = r[dateCol] as Date | null; return d && d.getTime() >= t; }); }
    return aggregate(rows, ask.groupBy, ask.metric, ask.agg, ask.isDate, ask.bucket);
  }, [ask, ds, filtered, dateCol]);

  const runAsk = (q: string) => {
    if (!ds || !q.trim()) return;
    const r = parseQuestion(q, ds.columns, maxDate);
    if ("error" in r) { setAsk(null); setAskError(r.error); } else { setAsk(r); setAskError(""); }
  };
  const onAsk = (e: FormEvent) => { e.preventDefault(); runAsk(question); };

  const saveView = () => {
    if (!ds) return;
    const name = window.prompt("Name this view", `View ${views.length + 1}`);
    if (!name) return;
    persistViews([...views, { id: crypto.randomUUID(), name, dataset: ds.name, filters, metric, question: ask ? question : "" }]);
    toast.success(`Saved "${name}"`);
  };
  const applyView = (v: SavedView) => {
    setFilters(v.filters); setMetric(v.metric); setQuestion(v.question);
    if (v.question) runAsk(v.question); else setAsk(null);
  };

  const suggestions = ds
    ? [
        nums[0] && cats[0] && `${nums[0].name} by ${cats[0].name} last 3 months`,
        nums[0] && dateCol && `average ${nums[0].name} per month`,
        cats[1] && `count by ${cats[1].name} as pie`,
      ].filter(Boolean) as string[]
    : [];

  return (
    <div className="min-h-screen">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 mr-auto">
            <span className="size-8 rounded-md bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-display font-bold" aria-hidden>I</span>
            <h1 className="text-lg font-semibold">InsightBoard</h1>
            {ds && <span className="text-xs text-sidebar-foreground/70 num truncate max-w-48">· {ds.name}</span>}
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" id="csv-input" aria-label="Upload CSV file" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><FileUp aria-hidden />Upload CSV</Button>
          {ds && (
            <>
              <Button size="sm" variant="secondary" onClick={saveView}><Save aria-hidden />Save view</Button>
              <Button size="sm" className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" onClick={() => download(`filtered-${ds.name}`, toCsv(ds, filtered))}>
                <Download aria-hidden />Export {filtered.length.toLocaleString()} rows
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
        {!ds ? (
          <section
            aria-label="Upload a CSV to begin"
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
            className={`panel border-2 border-dashed p-12 text-center transition-colors ${drag ? "border-ring bg-accent/30" : ""}`}
          >
            <h2 className="text-3xl sm:text-4xl font-semibold max-w-xl mx-auto">Drop a CSV. Get a dashboard.</h2>
            <p className="mt-3 text-muted-foreground max-w-lg mx-auto">Column types are detected automatically — KPIs, charts, filters and a sortable table appear instantly. Then ask questions in plain English.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={() => fileRef.current?.click()} disabled={loading}><FileUp aria-hidden />{loading ? "Parsing…" : "Choose CSV file"}</Button>
              <Button size="lg" variant="outline" onClick={() => load(sampleDataset())}><Database aria-hidden />Try 12k-row sample</Button>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">Your file stays in your browser.</p>
          </section>
        ) : (
          <>
            {/* Ask your data */}
            <section className="panel p-4 sm:p-5 bg-primary text-primary-foreground border-primary" aria-labelledby="ask-title">
              <h2 id="ask-title" className="text-sm font-semibold flex items-center gap-2 mb-3"><MessageSquareText className="size-4 text-accent" aria-hidden />Ask your data</h2>
              <form onSubmit={onAsk} className="flex gap-2" role="search">
                <label htmlFor="ask" className="sr-only">Ask a question about your data</label>
                <Input id="ask" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={suggestions[0] ? `e.g. ${suggestions[0]}` : "e.g. sales by region last 3 months"} className="h-11 bg-card text-card-foreground border-transparent" />
                <Button type="submit" className="h-11 bg-accent text-accent-foreground hover:bg-accent/90">Ask</Button>
              </form>
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Example questions">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => { setQuestion(s); runAsk(s); }} className="text-xs rounded-full border border-primary-foreground/25 px-3 py-1 hover:bg-primary-foreground/10">{s}</button>
                ))}
              </div>
              <p role="status" aria-live="polite" className="text-sm mt-2 text-accent">{askError}</p>
            </section>
            {ask && (
              <div className="relative">
                <ChartCard title={ask.title} kind={ask.chart} data={askData} />
                <Button size="icon" variant="ghost" className="absolute top-2 right-2" aria-label="Close answer chart" onClick={() => setAsk(null)}><X aria-hidden /></Button>
              </div>
            )}

            {/* Filters */}
            <section className="panel p-4 flex flex-wrap items-end gap-4" aria-label="Filters">
              {dateCol && (
                <>
                  <div className="flex flex-col gap-1"><label htmlFor="from" className="text-xs font-medium text-muted-foreground">From</label>
                    <Input id="from" type="date" className="h-9 w-40" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
                  <div className="flex flex-col gap-1"><label htmlFor="to" className="text-xs font-medium text-muted-foreground">To</label>
                    <Input id="to" type="date" className="h-9 w-40" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
                </>
              )}
              {cats.slice(0, 3).map((c) => {
                const values = [...new Set(ds.rows.map((r) => r[c.name] as string | null))].filter(Boolean).sort() as string[];
                return (
                  <div key={c.name} className="flex flex-col gap-1">
                    <label htmlFor={`cat-${c.name}`} className="text-xs font-medium text-muted-foreground">{c.name}</label>
                    <select id={`cat-${c.name}`} className={selectCls} value={filters.category[c.name] ?? ""} onChange={(e) => setFilters({ ...filters, category: { ...filters.category, [c.name]: e.target.value } })}>
                      <option value="">All</option>
                      {values.map((v) => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                );
              })}
              {nums.length > 0 && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="metric" className="text-xs font-medium text-muted-foreground">Chart metric</label>
                  <select id="metric" className={selectCls} value={metric} onChange={(e) => setMetric(e.target.value)}>
                    <option value="">Row count</option>
                    {nums.map((c) => <option key={c.name}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1 flex-1 min-w-48">
                <label htmlFor="search" className="text-xs font-medium text-muted-foreground">Search</label>
                <Input id="search" type="search" className="h-9" placeholder="Search text columns…" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
              </div>
              <Button variant="outline" size="sm" className="h-9" onClick={() => setFilters(emptyFilters())}><RotateCcw aria-hidden />Reset</Button>
            </section>

            {views.filter((v) => v.dataset === ds.name).length > 0 && (
              <nav aria-label="Saved views" className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Saved views:</span>
                {views.filter((v) => v.dataset === ds.name).map((v) => (
                  <span key={v.id} className="inline-flex items-center rounded-full border bg-card text-sm">
                    <button className="pl-3 pr-1 py-1 hover:underline" onClick={() => applyView(v)}>{v.name}</button>
                    <button className="p-1.5 text-muted-foreground hover:text-destructive" aria-label={`Delete view ${v.name}`} onClick={() => persistViews(views.filter((x) => x.id !== v.id))}><Trash2 className="size-3.5" aria-hidden /></button>
                  </span>
                ))}
              </nav>
            )}

            {/* KPIs */}
            <section aria-label="Key metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {kpis.map((k, i) => (
                <div key={k.label} className="panel p-4 relative overflow-hidden">
                  {i === 0 && <span className="absolute inset-x-0 top-0 h-1 bg-accent" aria-hidden />}
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{k.label}</p>
                  <p className="mt-2 text-2xl sm:text-3xl font-semibold num">{k.value}</p>
                  <p className="text-xs text-muted-foreground num mt-1">{k.hint}</p>
                </div>
              ))}
            </section>

            {/* Charts */}
            <section aria-label="Charts" className="grid lg:grid-cols-3 gap-4">
              {dateCol && <ChartCard className="lg:col-span-3" title={`${metric || "Rows"} over time (monthly)`} kind="line" data={lineData} />}
              {cats[0] && <ChartCard className="lg:col-span-2" title={`${metric || "Rows"} by ${cats[0].name}`} kind="bar" data={barData} />}
              {pieCol && <ChartCard title={`Share by ${pieCol.name}`} kind="pie" data={pieData} />}
            </section>

            <section aria-label="Detected columns" className="flex flex-wrap gap-2 text-xs">
              {cols.map((c) => (
                <span key={c.name} className="rounded-md border bg-card px-2 py-1"><span className="font-medium">{c.name}</span> <span className="text-muted-foreground">· {c.type}</span></span>
              ))}
            </section>

            <DataTable ds={ds} rows={filtered} />
          </>
        )}
      </main>
    </div>
  );
}
