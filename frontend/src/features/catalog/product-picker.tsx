"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Search from "lucide-react/dist/esm/icons/search";
import { type KeyboardEvent, useId, useState } from "react";

import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export type ProductOption = {
  id: number;
  name: string;
  sku: string;
  baseUnit: string;
  /** Secondary line, e.g. available stock or category. */
  detail?: string;
};

type ProductPickerProps<Option extends ProductOption> = {
  label: string;
  /** Distinguishes cached results of different sources (stock vs catalog). */
  queryKey: string;
  search: (term: string, signal: AbortSignal) => Promise<Option[]>;
  onSelect: (option: Option) => void;
  excludeIds?: ReadonlySet<number>;
  placeholder?: string;
};

const SEARCH_DEBOUNCE_MS = 250;

/** WAI-ARIA combobox (list autocomplete) that searches the backend as the user types. */
export function ProductPicker<Option extends ProductOption>({
  label,
  queryKey,
  search,
  onSelect,
  excludeIds,
  placeholder,
}: ProductPickerProps<Option>) {
  const inputId = useId();
  const listId = useId();
  const [term, setTerm] = useState("");
  const [isOpen, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedTerm = useDebouncedValue(term.trim(), SEARCH_DEBOUNCE_MS);

  const results = useQuery({
    queryKey: ["product-picker", queryKey, debouncedTerm],
    queryFn: ({ signal }) => search(debouncedTerm, signal),
    enabled: isOpen,
    placeholderData: keepPreviousData,
  });
  const options = (results.data ?? []).filter((option) => !excludeIds?.has(option.id));
  const activeOption = options[Math.min(activeIndex, options.length - 1)];
  const optionId = (index: number) => `${listId}-option-${index}`;

  function choose(option: Option) {
    onSelect(option);
    setTerm("");
    setActiveIndex(0);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && isOpen && activeOption) {
      event.preventDefault();
      choose(activeOption);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative mt-1.5">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-activedescendant={isOpen && activeOption ? optionId(options.indexOf(activeOption)) : undefined}
          value={term}
          placeholder={placeholder ?? "Gõ tên thuốc hoặc mã SKU…"}
          onChange={(event) => {
            setTerm(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="block h-10 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-9 text-sm shadow-sm placeholder:text-slate-400"
        />
      </div>
      {isOpen ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {results.isPending ? (
            <li className="px-3 py-2 text-sm text-slate-500">Đang tìm…</li>
          ) : results.isError ? (
            <li className="px-3 py-2 text-sm text-red-600">Không tải được danh sách thuốc.</li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">Không tìm thấy thuốc phù hợp.</li>
          ) : (
            options.map((option, index) => (
              <li
                key={option.id}
                id={optionId(index)}
                role="option"
                aria-selected={option === activeOption}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn("cursor-pointer px-3 py-2 text-sm", option === activeOption && "bg-brand-50")}
              >
                <span className="font-medium text-slate-900">{option.name}</span>
                <span className="block text-xs text-slate-500">
                  {option.sku}
                  {option.detail ? ` · ${option.detail}` : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
