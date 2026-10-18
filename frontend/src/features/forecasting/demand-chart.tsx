"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDate, formatInteger, formatShortDate } from "@/lib/format";

import type { WeeklyPoint } from "./weekly-series";

const CHART_HEIGHT = 288;
const ACTUAL_COLOR = "#94a3b8";
const FORECAST_COLOR = "#0e8573";

export function DemandChart({ points, unit }: { points: WeeklyPoint[]; unit: string }) {
  return (
    <div style={{ height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="15%">
          <CartesianGrid stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="weekStart" tickFormatter={formatShortDate} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tickFormatter={(value: number) => formatInteger(value)} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} />
          <Tooltip
            labelFormatter={(label) => `Tuần từ ${formatDate(String(label))}`}
            formatter={(value, name) => [`${formatInteger(Number(value))} ${unit}`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="actual" name="Thực xuất" fill={ACTUAL_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="forecast" name="Dự báo" fill={FORECAST_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
