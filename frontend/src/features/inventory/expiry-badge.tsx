import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

import { batchStatus, expiryText, expiryTone } from "./labels";

export function ExpiryCell({ expiryDate, daysToExpiry }: { expiryDate: string | null | undefined; daysToExpiry: number | null | undefined }) {
  if (!expiryDate) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="tabular-nums">{formatDate(expiryDate)}</span>
      <Badge tone={expiryTone(daysToExpiry)}>{expiryText(daysToExpiry)}</Badge>
    </div>
  );
}

export function BatchStatusBadge({ status }: { status: string }) {
  const display = batchStatus(status);
  return <Badge tone={display.tone}>{display.label}</Badge>;
}
