const LOCALE = "vi-VN";
/** Fixed so server and browser render identical text regardless of the machine time zone. */
const TIME_ZONE = "Asia/Ho_Chi_Minh";
const PLACEHOLDER = "—";

const integerFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const currencyFormat = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const oneDecimalFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const COMPACT_UNITS = [
  { threshold: 1e9, suffix: "tỷ" },
  { threshold: 1e6, suffix: "triệu" },
  { threshold: 1e3, suffix: "nghìn" },
] as const;
const percentFormat = new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const shortDateFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type Maybe<T> = T | null | undefined;

export function formatInteger(value: Maybe<number>): string {
  return value == null ? PLACEHOLDER : integerFormat.format(value);
}

export function formatDecimal(value: Maybe<number>): string {
  return value == null ? PLACEHOLDER : decimalFormat.format(value);
}

export function formatCurrency(value: Maybe<number>): string {
  return value == null ? PLACEHOLDER : currencyFormat.format(value);
}

/** "1,4 tỷ ₫", "188,9 triệu ₫": the way Vietnamese users read large amounts. */
export function formatCompactCurrency(value: Maybe<number>): string {
  if (value == null) return PLACEHOLDER;
  const unit = COMPACT_UNITS.find(({ threshold }) => Math.abs(value) >= threshold);
  return unit ? `${oneDecimalFormat.format(value / unit.threshold)} ${unit.suffix} ₫` : currencyFormat.format(value);
}

export function formatPercent(ratio: Maybe<number>): string {
  return ratio == null ? PLACEHOLDER : percentFormat.format(ratio);
}

/** Accepts ISO dates ("2026-10-12") and instants ("2026-10-12T03:00:00Z"). */
export function formatDate(value: Maybe<string>): string {
  return value ? dateFormat.format(toDate(value)) : PLACEHOLDER;
}

export function formatShortDate(value: Maybe<string>): string {
  return value ? shortDateFormat.format(toDate(value)) : PLACEHOLDER;
}

export function formatDateTime(value: Maybe<string>): string {
  return value ? dateTimeFormat.format(new Date(value)) : PLACEHOLDER;
}

function toDate(value: string): Date {
  // Date-only strings are calendar days; anchor them at noon UTC so no time zone shifts the day.
  return value.length === "yyyy-mm-dd".length ? new Date(`${value}T12:00:00Z`) : new Date(value);
}
