const pad2 = (n: number) => String(n).padStart(2, "0");

export const mytDate = (y: number, m: number, d: number): string =>
  `${y}-${pad2(m)}-${pad2(d)}`;

export const isoMyt = (date: string, h: number, m: number, s: number): string =>
  `${date}T${pad2(h)}:${pad2(m)}:${pad2(s)}+08:00`;

export const addDaysMyt = (date: string, days: number): string => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utc = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(utc);
  return mytDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};
