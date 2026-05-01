import * as XLSX from "xlsx";
import type { ParsedRow } from "@/lib/import/types";

export const REQUIRED_COLUMNS = [
  "parent_name",
  "parent_last_names",
  "parent_rut",
  "parent_email",
  "parent_phone",
  "parent_date_of_birth",
  "kid_name",
  "kid_last_names",
  "kid_rut",
  "kid_date_of_birth",
] as const;

const REQUIRED_NON_EMPTY = [
  "parent_name",
  "parent_last_names",
  "parent_rut",
  "parent_email",
  "kid_name",
  "kid_last_names",
  "kid_rut",
  "kid_date_of_birth",
] as const;

export function parseImportFile(
  source: ArrayBuffer | string,
  ext: "csv" | "xlsx"
): ParsedRow[] {
  const wb =
    ext === "csv"
      ? XLSX.read(source as string, { type: "string" })
      : XLSX.read(source, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("El archivo no contiene hojas.");

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: true,
  });

  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const missing = REQUIRED_NON_EMPTY.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    throw new Error(`Falta la columna obligatoria: ${missing.join(", ")}`);
  }

  return rows.map((r, i) => ({
    rowNumber: i + 2,
    parent_name: String(r.parent_name ?? "").trim(),
    parent_last_names: String(r.parent_last_names ?? "").trim(),
    parent_rut: String(r.parent_rut ?? "").trim(),
    parent_email: String(r.parent_email ?? "").trim(),
    parent_phone: String(r.parent_phone ?? "").trim(),
    parent_date_of_birth: rawDateOrEmpty(r.parent_date_of_birth),
    kid_name: String(r.kid_name ?? "").trim(),
    kid_last_names: String(r.kid_last_names ?? "").trim(),
    kid_rut: String(r.kid_rut ?? "").trim(),
    kid_date_of_birth: rawDateOrEmpty(r.kid_date_of_birth),
  })).filter((parsed) => {
    const allBlank =
      !parsed.parent_name &&
      !parsed.parent_last_names &&
      !parsed.parent_rut &&
      !parsed.parent_email &&
      !parsed.kid_name &&
      !parsed.kid_last_names &&
      !parsed.kid_rut &&
      !parsed.kid_date_of_birth;
    return !allBlank;
  });
}

function rawDateOrEmpty(v: unknown): string | number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return v;
  return String(v).trim();
}
