import { Badge } from "@/components/ui/badge";

import { type PurchaseOrderStatus, poStatusLabel } from "./schemas";

export function PoStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const { label, tone } = poStatusLabel[status];
  return <Badge tone={tone}>{label}</Badge>;
}
