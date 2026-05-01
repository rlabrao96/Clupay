"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseImportFile, REQUIRED_COLUMNS } from "@/lib/import/parse";
import type { ValidatedRow } from "@/lib/import/types";
import { validateImportRowsAction } from "@/lib/actions/validate-import-rows";
import { commitImportBatch } from "@/lib/actions/commit-import-batch";

const STATUS_LABEL: Record<ValidatedRow["status"], string> = {
  new: "Nuevo",
  reuse_parent: "Reutilizar parent",
  no_change: "Sin cambios",
  error: "Error",
};

const STATUS_BADGE: Record<ValidatedRow["status"], string> = {
  new: "bg-success-light text-success",
  reuse_parent: "bg-blue-100 text-blue-700",
  no_change: "bg-gray-100 text-gray-600",
  error: "bg-danger-light text-danger",
};

export function ImportClient({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<ValidatedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setRows(null);
    try {
      const ext = file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
      const buf = ext === "csv" ? await file.text() : await file.arrayBuffer();
      const parsed = parseImportFile(buf, ext);
      const validated = await validateImportRowsAction(clubId, parsed);
      setRows(validated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al leer el archivo");
    }
  }

  async function handleConfirm() {
    if (!rows) return;
    setSubmitting(true);
    try {
      const result = await commitImportBatch(clubId, rows);
      router.push(`/club/deportistas/importar/${result.batchId}/asignar`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al confirmar");
      setSubmitting(false);
    }
  }

  const counts = {
    new: rows?.filter((r) => r.status === "new").length ?? 0,
    reuse: rows?.filter((r) => r.status === "reuse_parent").length ?? 0,
    nochange: rows?.filter((r) => r.status === "no_change").length ?? 0,
    error: rows?.filter((r) => r.status === "error").length ?? 0,
  };
  const eligible = counts.new + counts.reuse;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      {!rows && (
        <>
          <p className="text-sm text-text-secondary mb-4">
            El archivo debe contener las columnas:
            <br />
            <code className="text-xs">{REQUIRED_COLUMNS.join(", ")}</code>
          </p>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="block w-full text-sm"
          />
        </>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-danger-light text-danger text-sm p-3">
          {error}
        </div>
      )}

      {rows && (
        <div>
          <div className="mb-4 text-sm">
            <strong>{counts.new}</strong> nuevos · <strong>{counts.reuse}</strong>{" "}
            reutilizan · <strong>{counts.nochange}</strong> sin cambios ·{" "}
            <strong className="text-danger">{counts.error}</strong> con errores
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-text-secondary border-b">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Hijo</th>
                <th className="py-2 pr-2">Apoderado</th>
                <th className="py-2 pr-2">Email</th>
                <th className="py-2 pr-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rowNumber} className="border-b last:border-0">
                  <td className="py-2 pr-2 text-text-secondary">{r.rowNumber}</td>
                  <td className="py-2 pr-2">
                    {r.kid.name} {r.kid.last_names}{" "}
                    <span className="text-text-secondary">{r.kid.rut}</span>
                  </td>
                  <td className="py-2 pr-2">
                    {r.parent.name} {r.parent.last_names}{" "}
                    <span className="text-text-secondary">{r.parent.rut}</span>
                  </td>
                  <td className="py-2 pr-2">{r.parent.email}</td>
                  <td className="py-2 pr-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${STATUS_BADGE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    {r.errors.length > 0 && (
                      <div className="text-xs text-danger mt-1">
                        {r.errors.join("; ")}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setRows(null)}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
            >
              Subir otro archivo
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={eligible === 0 || submitting}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50"
            >
              {submitting ? "Importando..." : `Confirmar importación (${eligible})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
