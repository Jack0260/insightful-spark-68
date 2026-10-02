import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { formatNum } from "@/lib/data";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
};

export function ChartCard({ title, kind, data, className = "" }: { title: string; kind: "line" | "bar" | "pie"; data: { name: string; value: number }[]; className?: string }) {
  const summary = data.length ? `${data.length} points. Highest: ${[...data].sort((a, b) => b.value - a.value)[0]!.name}.` : "No data";
  let shown = data;
  if (kind === "pie" && data.length > 6) {
    const top = data.slice(0, 5);
    shown = [...top, { name: "Other", value: data.slice(5).reduce((s, d) => s + d.value, 0) }];
  }
  if (kind === "bar" && data.length > 15) shown = data.slice(0, 15);
  return (
    <figure className={`panel p-4 flex flex-col ${className}`} aria-label={`${title} ${kind} chart. ${summary}`}>
      <figcaption className="text-sm font-semibold mb-3 flex items-center justify-between gap-2">
        <span>{title}</span>
        <span className="text-xs font-normal uppercase tracking-wider text-muted-foreground">{kind}</span>
      </figcaption>
      <div className="h-64" role="img" aria-label={summary}>
        {data.length === 0 ? (
          <p className="h-full grid place-items-center text-sm text-muted-foreground">No rows match the filters</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {kind === "line" ? (
              <LineChart data={shown} margin={{ left: 4, right: 12, top: 4 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tickFormatter={formatNum} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={52} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatNum(v)} />
                <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            ) : kind === "bar" ? (
              <BarChart data={shown} margin={{ left: 4, right: 12, top: 4 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={0} />
                <YAxis tickFormatter={formatNum} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={52} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} formatter={(v: number) => formatNum(v)} />
                <Bar dataKey="value" fill="var(--chart-2)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            ) : (
              <PieChart>
                <Pie data={shown} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="80%" paddingAngle={2} isAnimationActive={false}>
                  {shown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--card)" />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatNum(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}
