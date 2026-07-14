// The "business day" in Asia/Kolkata as a 'YYYY-MM-DD' string (matches the
// tokens.business_day date column). Single JS source of truth so numbering and
// all live queries agree at the midnight boundary. India has no DST.
export function businessDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
