/** Returns today's date as a date-only `YYYY-MM-DD` string, local time. */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatBytes(n: number): string {
  return n > 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(2)} MB` : `${Math.round(n / 1024)} KB`;
}
