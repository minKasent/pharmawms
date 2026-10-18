"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/feedback";

export const IssueTrendChartLazy = dynamic(() => import("./issue-trend-chart").then((module) => module.IssueTrendChart), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});
