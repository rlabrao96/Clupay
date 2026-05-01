"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { assignPlansToKids } from "@/lib/actions/assign-plans-to-kids";
import { finishImportBatch } from "@/lib/actions/finish-import-batch";
import type { Sport, Plan } from "@/types";

interface KidRow {
  id: string;
  name: string;
  parentName: string;
}

interface Assignment {
  sportName: string;
  planName: string;
}

interface Props {
  batchId: string;
  kids: KidRow[];
  sports: Sport[];
  plans: Plan[];
}

export function AsignarClient({ batchId, kids, sports, plans }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sportId, setSportId] = useState<string>("");
  const [planId, setPlanId] = useState<string>("");
  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const plansForSport = useMemo(
    () => plans.filter((p) => p.sport_id === sportId),
    [plans, sportId]
  );

  function toggleAll() {
    if (selected.size === kids.length) setSelected(new Set());
    else setSelected(new Set(kids.map((k) => k.id)));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAssign() {
    if (!sportId || !planId || selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await assignPlansToKids({
        batchId,
        kidIds: Array.from(selected),
        sportId,
        planId,
      });
      const sport = sports.find((s) => s.id === sportId)!;
      const plan = plansForSport.find((p) => p.id === planId)!;
      setAssignments((prev) => {
        const next = { ...prev };
        for (const kid of selected) {
          next[kid] = [
            ...(next[kid] ?? []),
            { sportName: sport.name, planName: plan.name },
          ];
        }
        return next;
      });
      setSelected(new Set());
      setSportId("");
      setPlanId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    setBusy(true);
    try {
      await finishImportBatch(batchId);
      router.push("/club/deportistas");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="sticky top-0 bg-white pb-4 mb-4 border-b">
        <div className="flex flex-wrap gap-3 items-center">
          <button
            type="button"
            onClick={toggleAll}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
          >
            {selected.size === kids.length
              ? "Deseleccionar todos"
              : "Seleccionar todos"}
          </button>
          <select
            value={sportId}
            onChange={(e) => {
              setSportId(e.target.value);
              setPlanId("");
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
          >
            <option value="">Deporte…</option>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            disabled={!sportId}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-50"
          >
            <option value="">Plan…</option>
            {plansForSport.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!sportId || !planId || selected.size === 0 || busy}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50"
          >
            Asignar a seleccionados ({selected.size})
          </button>
          <div className="ml-auto">
            <button
              type="button"
              onClick={handleFinish}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-success text-success text-sm"
            >
              Terminar
            </button>
          </div>
        </div>
        {error && <div className="text-danger text-sm mt-2">{error}</div>}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-text-secondary border-b">
            <th className="py-2 w-10"></th>
            <th className="py-2">Hijo</th>
            <th className="py-2">Apoderado</th>
            <th className="py-2">Planes asignados</th>
          </tr>
        </thead>
        <tbody>
          {kids.map((k) => (
            <tr key={k.id} className="border-b last:border-0">
              <td className="py-2">
                <input
                  type="checkbox"
                  checked={selected.has(k.id)}
                  onChange={() => toggle(k.id)}
                />
              </td>
              <td className="py-2">{k.name}</td>
              <td className="py-2 text-text-secondary">{k.parentName}</td>
              <td className="py-2">
                <div className="flex flex-wrap gap-1">
                  {(assignments[k.id] ?? []).map((a, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-success-light text-success text-xs"
                    >
                      {a.sportName} · {a.planName}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
