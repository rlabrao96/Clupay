import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedRow, ValidatedRow } from "@/lib/import/types";
import { canonicalRut, validateRut } from "@/lib/rut/validate";
import {
  normalizeDate,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from "@/lib/import/normalize";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function validateImportRows(
  serviceClient: SupabaseClient,
  _clubId: string,
  rows: ParsedRow[]
): Promise<ValidatedRow[]> {
  // Pre-normalize all rows
  const prepared = rows.map((r) => prepareRow(r));

  // Collect all RUTs we need to look up
  const parentRuts = uniq(prepared.map((p) => p.parent.rut).filter(Boolean));
  const kidRuts = uniq(prepared.map((p) => p.kid.rut).filter(Boolean));

  const [{ data: existingParents }, { data: existingKids }] = await Promise.all(
    [
      parentRuts.length
        ? serviceClient.from("profiles").select("id, rut").in("rut", parentRuts)
        : Promise.resolve({ data: [], error: null }),
      kidRuts.length
        ? serviceClient
            .from("kids")
            .select("id, rut, parent_id")
            .in("rut", kidRuts)
        : Promise.resolve({ data: [], error: null }),
    ]
  );

  const parentByRut = new Map(
    (existingParents ?? []).map((p: { id: string; rut: string }) => [p.rut, p])
  );
  const kidByRut = new Map(
    (existingKids ?? []).map(
      (k: { id: string; rut: string; parent_id: string }) => [k.rut, k]
    )
  );

  // File-level dedup tracking
  const seenKidRuts = new Set<string>();

  return prepared.map((row) => {
    if (row.errors.length > 0) {
      return { ...row, status: "error" as const };
    }

    if (seenKidRuts.has(row.kid.rut)) {
      return {
        ...row,
        status: "error" as const,
        errors: ["RUT del hijo duplicado en el archivo"],
      };
    }
    seenKidRuts.add(row.kid.rut);

    const existingParent = parentByRut.get(row.parent.rut);
    const existingKid = kidByRut.get(row.kid.rut);

    if (existingParent) {
      row.parent.existingProfileId = existingParent.id;
    }
    if (existingKid) {
      row.kid.existingKidId = existingKid.id;
      const sameParent =
        existingParent && existingKid.parent_id === existingParent.id;
      if (!sameParent) {
        return {
          ...row,
          status: "error" as const,
          errors: ["El hijo ya pertenece a otro apoderado"],
        };
      }
      return { ...row, status: "no_change" as const };
    }

    if (existingParent) {
      return { ...row, status: "reuse_parent" as const };
    }

    return { ...row, status: "new" as const };
  });
}

function prepareRow(r: ParsedRow): ValidatedRow {
  const errors: string[] = [];

  // Required-field checks
  const required: [string, string, string][] = [
    ["parent_name", r.parent_name, "Nombre del apoderado"],
    ["parent_last_names", r.parent_last_names, "Apellidos del apoderado"],
    ["parent_rut", r.parent_rut, "RUT del apoderado"],
    ["parent_email", r.parent_email, "Email del apoderado"],
    ["kid_name", r.kid_name, "Nombre del hijo"],
    ["kid_last_names", r.kid_last_names, "Apellidos del hijo"],
    ["kid_rut", r.kid_rut, "RUT del hijo"],
  ];
  for (const [, val, label] of required) {
    if (!val || !val.trim()) errors.push(`Falta ${label}`);
  }

  const parentRutValid = r.parent_rut && validateRut(r.parent_rut);
  const kidRutValid = r.kid_rut && validateRut(r.kid_rut);
  if (r.parent_rut && !parentRutValid) errors.push("RUT del apoderado inválido");
  if (r.kid_rut && !kidRutValid) errors.push("RUT del hijo inválido");

  const parentEmailNorm = normalizeEmail(r.parent_email);
  if (parentEmailNorm && !EMAIL_RE.test(parentEmailNorm)) {
    errors.push("Email del apoderado inválido");
  }

  const kidDob = normalizeDate(r.kid_date_of_birth ?? "");
  if (!kidDob) errors.push("Fecha de nacimiento del hijo inválida");
  else if (kidDob > new Date().toISOString().slice(0, 10))
    errors.push("Fecha de nacimiento del hijo en el futuro");

  const parentDob = r.parent_date_of_birth
    ? normalizeDate(r.parent_date_of_birth)
    : null;
  if (r.parent_date_of_birth && !parentDob) {
    errors.push("Fecha de nacimiento del apoderado inválida");
  }

  return {
    rowNumber: r.rowNumber,
    status: "error", // updated by caller
    errors,
    parent: {
      name: normalizeName(r.parent_name),
      last_names: normalizeName(r.parent_last_names),
      rut: parentRutValid ? canonicalRut(r.parent_rut) : "",
      email: parentEmailNorm,
      phone: normalizePhone(r.parent_phone),
      date_of_birth: parentDob,
    },
    kid: {
      name: normalizeName(r.kid_name),
      last_names: normalizeName(r.kid_last_names),
      rut: kidRutValid ? canonicalRut(r.kid_rut) : "",
      date_of_birth: kidDob ?? "",
    },
  };
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
