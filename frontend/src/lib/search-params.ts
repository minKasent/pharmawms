type ParamValue = string | string[] | undefined;

const MAX_SEARCH_LENGTH = 100;

export function stringParam(value: ParamValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim().slice(0, MAX_SEARCH_LENGTH);
  return trimmed ? trimmed : undefined;
}

/** Zero-based page index; anything invalid falls back to the first page. */
export function pageParam(value: ParamValue): number {
  const parsed = Number.parseInt(stringParam(value) ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function positiveIntParam(value: ParamValue): number | undefined {
  const parsed = Number.parseInt(stringParam(value) ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function enumParam<const Values extends readonly string[]>(value: ParamValue, allowed: Values): Values[number] | undefined {
  const raw = stringParam(value);
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as Values[number]) : undefined;
}
