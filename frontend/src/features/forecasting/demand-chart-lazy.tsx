"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/feedback";

export const DemandChartLazy = dynamic(() => import("./demand-chart").then((module) => module.DemandChart), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full" />,
});
