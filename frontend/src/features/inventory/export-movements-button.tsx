"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { errorMessage, toApiError } from "@/lib/api/api-error";
import { sessionExpiredPath } from "@/lib/session/paths";

export function ExportMovementsButton() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setIsPending(true);
    setError(null);
    try {
      const response = await fetch("/api/backend/exports/stock-movements", {
        headers: { Accept: "text/csv, application/json" },
      });
      if (response.status === 401) {
        window.location.assign(sessionExpiredPath(window.location.pathname + window.location.search));
        return;
      }
      if (!response.ok) {
        throw await toApiError(response);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "stock-movements.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" disabled={isPending} onClick={() => void handleExport()}>
        {isPending ? "Đang xuất CSV…" : "Xuất sổ cái CSV (TT 11/2025)"}
      </Button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-red-600">
          {error}
        </span>
      ) : null}
    </div>
  );
}
