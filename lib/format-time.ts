export function shortTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}j`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}h`;
  const week = Math.floor(day / 7);
  if (week < 4) return `${week}mg`;
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
