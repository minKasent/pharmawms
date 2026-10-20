"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCompactCurrency, formatCurrency, formatDate, formatInteger, formatShortDate } from "@/lib/format";

import type { TrendPoint } from "./schemas";

const CHART_HEIGHT = 256;
const BRAND = "#0e8573";

export function IssueTrendChart({ points }: { points: TrendPoint[] }) {
  return (
    <div style={{ height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="issueValueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="day" tickFormatter={formatShortDate} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={(value: number) => formatCompactCurrency(value)} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} width={72} />
          <Tooltip
            labelFormatter={(label) => formatDate(String(label))}
            formatter={(value, _name, item) => [
              `${formatCurrency(Number(value))} · ${formatInteger((item.payload as TrendPoint).quantity)} đơn vị`,
              "Giá trị xuất",
            ]}
          />
          <Area type="monotone" dataKey="value" stroke={BRAND} strokeWidth={2} fill="url(#issueValueFill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
