"use client";

import { Button } from "./button";

export function PrintButton({ label = "In phiếu" }: { label?: string }) {
  return (
    <Button variant="secondary" className="no-print" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
