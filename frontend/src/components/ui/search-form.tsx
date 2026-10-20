import Search from "lucide-react/dist/esm/icons/search";
import Form from "next/form";
import type { ReactNode } from "react";

import { buttonClass } from "./button";

type SearchFormProps = {
  action: string;
  defaultValue?: string;
  placeholder: string;
  label: string;
  /** Extra filter controls rendered before the submit button (they submit with the form). */
  children?: ReactNode;
};

/** GET form that updates the URL, so filtered lists stay shareable and render on the server. */
export function SearchForm({ action, defaultValue, placeholder, label, children }: SearchFormProps) {
  return (
    <Form action={action} className="flex flex-wrap items-end gap-2" role="search">
      <div className="relative min-w-60 flex-1">
        <label htmlFor="search" className="sr-only">
          {label}
        </label>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input
          id="search"
          name="search"
          type="search"
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="block h-10 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-9 text-sm shadow-sm placeholder:text-slate-400"
        />
      </div>
      {children}
      <button type="submit" className={buttonClass("secondary")}>
        Lọc
      </button>
    </Form>
  );
}
