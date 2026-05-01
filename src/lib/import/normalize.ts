export function normalizeName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function normalizePhone(input: string): string {
  if (!input) return "";
  return input.replace(/[\s.()]/g, "");
}

export function normalizeDate(input: string | number): string | null {
  if (input === "" || input === null || input === undefined) return null;

  // Excel serial date number (days since 1900-01-01, with the well-known Excel leap-year bug)
  if (typeof input === "number" && Number.isFinite(input)) {
    const excelEpoch = Date.UTC(1899, 11, 30); // 1899-12-30 accounts for the bug
    const ms = excelEpoch + input * 86400000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return formatYMD(d);
  }

  const s = String(input).trim();
  if (!s) return null;

  // ISO YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return safeYMD(+m[1], +m[2], +m[3]);

  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return safeYMD(+m[3], +m[2], +m[1]);

  // D/M/YY → 2-digit year (cutoff 50)
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m) {
    const yy = +m[3];
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return safeYMD(year, +m[2], +m[1]);
  }

  return null;
}

function safeYMD(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return formatYMD(dt);
}

function formatYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
