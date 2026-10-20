const DAYS_PER_WEEK = 7;
const MILLIS_PER_DAY = 86_400_000;

export type WeeklyPoint = {
  weekStart: string;
  actual: number | null;
  forecast: number | null;
};

function addDays(isoDay: string, days: number): string {
  return new Date(Date.parse(`${isoDay}T00:00:00Z`) + days * MILLIS_PER_DAY).toISOString().slice(0, "yyyy-mm-dd".length);
}

/**
 * Daily history → complete 7-day buckets ending on the as-of date, followed by the forecast
 * horizon spread evenly over weeks. Weekly totals read better than noisy daily issue counts.
 */
export function toWeeklySeries(
  history: Array<{ day: string; quantity: number }>,
  forecastQuantity: number,
  horizonDays: number,
  asOfDate: string,
): WeeklyPoint[] {
  const completeWeeks = Math.floor(history.length / DAYS_PER_WEEK);
  const usable = history.slice(history.length - completeWeeks * DAYS_PER_WEEK);
  const points: WeeklyPoint[] = [];
  for (let week = 0; week < completeWeeks; week += 1) {
    const days = usable.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK);
    points.push({
      weekStart: days[0]?.day ?? asOfDate,
      actual: days.reduce((sum, day) => sum + day.quantity, 0),
      forecast: null,
    });
  }
  const forecastWeeks = Math.max(1, Math.round(horizonDays / DAYS_PER_WEEK));
  const perWeek = forecastQuantity / forecastWeeks;
  for (let week = 0; week < forecastWeeks; week += 1) {
    points.push({ weekStart: addDays(asOfDate, 1 + week * DAYS_PER_WEEK), actual: null, forecast: perWeek });
  }
  return points;
}
