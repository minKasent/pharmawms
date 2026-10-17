import { formatDateTime } from "@/lib/format";

import { PoStatusBadge } from "./po-status-badge";
import type { PurchaseOrder } from "./schemas";

export function PoTimeline({ events }: { events: PurchaseOrder["events"] }) {
  return (
    <ol className="relative space-y-5 border-l border-slate-200 pl-5">
      {events.map((event, index) => (
        <li key={`${event.occurredAt}-${index}`} className="relative">
          <span aria-hidden="true" className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-white bg-brand-600 ring-1 ring-brand-200" />
          <div className="flex flex-wrap items-center gap-2">
            {event.fromStatus && event.fromStatus !== event.toStatus ? (
              <>
                <PoStatusBadge status={event.fromStatus} />
                <span aria-label="chuyển sang" className="text-slate-400">
                  →
                </span>
              </>
            ) : null}
            <PoStatusBadge status={event.toStatus} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {formatDateTime(event.occurredAt)} · {event.performedByName ?? "Hệ thống"}
          </p>
          {event.note ? <p className="mt-1 text-sm text-slate-700">{event.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}
