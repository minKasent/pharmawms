import Link from "next/link";

import { formatInteger } from "@/lib/format";

import { buttonClass } from "./button";

type PaginationProps = {
  page: number;
  totalPages: number;
  totalElements: number;
  /** Builds the href for a zero-based page index, preserving the caller's other query params. */
  hrefFor: (page: number) => string;
};

export function Pagination({ page, totalPages, totalElements, hrefFor }: PaginationProps) {
  const hasPrevious = page > 0;
  const hasNext = page + 1 < totalPages;
  return (
    <nav aria-label="Phân trang" className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
      <p>
        Trang {formatInteger(Math.min(page + 1, Math.max(totalPages, 1)))}/{formatInteger(Math.max(totalPages, 1))} ·{" "}
        {formatInteger(totalElements)} bản ghi
      </p>
      <div className="flex gap-2">
        {hasPrevious ? (
          <Link href={hrefFor(page - 1)} className={buttonClass("secondary", "sm")} rel="prev">
            Trước
          </Link>
        ) : (
          <span aria-disabled="true" className={buttonClass("secondary", "sm", "pointer-events-none opacity-50")}>
            Trước
          </span>
        )}
        {hasNext ? (
          <Link href={hrefFor(page + 1)} className={buttonClass("secondary", "sm")} rel="next">
            Sau
          </Link>
        ) : (
          <span aria-disabled="true" className={buttonClass("secondary", "sm", "pointer-events-none opacity-50")}>
            Sau
          </span>
        )}
      </div>
    </nav>
  );
}

/** Serializes defined query params into a path, e.g. withQuery("/stock", { page: 2, search: "para" }). */
export function withQuery(path: string, params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}
