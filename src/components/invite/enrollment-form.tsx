"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCLP } from "@/lib/format";
import { InlineKidForm } from "@/components/invite/inline-kid-form";
import type { Kid, Sport, Plan } from "@/types";

interface EnrollmentSummaryItem {
  kidName: string;
  sportName: string;
  planName: string;
  price: number;
}

interface EnrollmentFormProps {
  clubId: string;
  clubName: string;
  sports: Sport[];
  plans: Plan[];
  /** If provided, skip club_parents insert and invitation update */
  invitationToken?: string;
  onFinish: () => void;
}

export function EnrollmentForm({
  clubId,
  clubName,
  sports,
  plans,
  invitationToken,
  onFinish,
}: EnrollmentFormProps) {
  const supabase = createClient();
  const [kids, setKids] = useState<Kid[]>([]);
  const [loadingKids, setLoadingKids] = useState(true);
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);
  const [selectedSportId, setSelectedSportId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showInlineKidForm, setShowInlineKidForm] = useState(false);
  const [enrollments, setEnrollments] = useState<EnrollmentSummaryItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchKids() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("kids")
        .select("*")
        .eq("parent_id", user.id)
        .order("name");
      setKids(data ?? []);
      setLoadingKids(false);
    }
    fetchKids();
  }, [supabase]);

  const plansForSport = plans.filter((p) => p.sport_id === selectedSportId && p.is_active);
  const selectedKid = kids.find((k) => k.id === selectedKidId);
  const selectedSport = sports.find((s) => s.id === selectedSportId);
  const selectedPlan = plansForSport.find((p) => p.id === selectedPlanId);
  const totalMonthly = enrollments.reduce((sum, e) => sum + e.price, 0);

  function handleKidCreated(kid: Kid) {
    setKids((prev) => [...prev, kid]);
    setSelectedKidId(kid.id);
    setShowInlineKidForm(false);
  }

  // Reset plan when sport changes
  function handleSportSelect(sportId: string) {
    setSelectedSportId(sportId);
    setSelectedPlanId(null);
  }

  async function handleEnroll() {
    if (!selectedKidId || !selectedSportId || !selectedPlanId) return;
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada");
      setSaving(false);
      return;
    }

    // On first enrollment: create club_parents association + mark invitation
    if (enrollments.length === 0) {
      const { error: cpError } = await supabase.from("club_parents").upsert(
        { club_id: clubId, parent_id: user.id },
        { onConflict: "club_id,parent_id" }
      );
      if (cpError) {
        setError(cpError.message);
        setSaving(false);
        return;
      }

      if (invitationToken) {
        const { error: invError } = await supabase
          .from("invitations")
          .update({ status: "accepted", accepted_at: new Date().toISOString() })
          .eq("token", invitationToken);
        if (invError) {
          setError(invError.message);
          setSaving(false);
          return;
        }
      }
    }

    // Create enrollment
    const { error: enrollError } = await supabase.from("enrollments").insert({
      kid_id: selectedKidId,
      club_id: clubId,
      sport_id: selectedSportId,
      plan_id: selectedPlanId,
    });

    if (enrollError) {
      if (enrollError.message.includes("idx_enrollments_unique")) {
        setError(
          `${selectedKid?.name ?? "Este hijo"} ya está inscrito/a en este plan`
        );
      } else {
        setError(enrollError.message);
      }
      setSaving(false);
      return;
    }

    // Add to summary
    setEnrollments((prev) => [
      ...prev,
      {
        kidName: `${selectedKid!.name} ${selectedKid!.last_names}`,
        sportName: selectedSport!.name,
        planName: selectedPlan!.name,
        price: selectedPlan!.price,
      },
    ]);

    // Reset form for next enrollment
    setSelectedKidId(null);
    setSelectedSportId(null);
    setSelectedPlanId(null);
    setError(null);
    setSaving(false);
  }

  const canSubmit = selectedKidId && selectedSportId && selectedPlanId && !saving;

  if (loadingKids) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary of completed enrollments */}
      {enrollments.length > 0 && (
        <div className="bg-success-light border border-success/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">✓</span>
            <p className="text-xs font-semibold text-success uppercase tracking-wide">
              Inscripciones realizadas
            </p>
          </div>
          {enrollments.map((e, i) => (
            <div
              key={i}
              className="flex justify-between items-center py-1.5 border-b border-success/10 last:border-0"
            >
              <p className="text-sm text-text">
                <span className="font-semibold">{e.kidName}</span> · {e.sportName}{" "}
                {e.planName}
              </p>
              <p className="text-sm font-semibold text-success">
                {formatCLP(e.price)}/mes
              </p>
            </div>
          ))}
          <div className="border-t border-success/20 mt-2 pt-2 flex justify-between">
            <p className="text-xs font-semibold text-success">Total mensual</p>
            <p className="text-sm font-bold text-success">
              {formatCLP(totalMonthly)}
            </p>
          </div>
        </div>
      )}

      {/* Enrollment form */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        {enrollments.length > 0 && (
          <p className="text-sm font-semibold text-text mb-4">
            Agregar otra inscripción
          </p>
        )}

        {error && (
          <div className="bg-danger-light text-danger text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* 1. Kid selection */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
            1. Selecciona un hijo
          </p>
          <div className="flex gap-2 flex-wrap">
            {kids.map((kid) => (
              <button
                key={kid.id}
                type="button"
                onClick={() => setSelectedKidId(kid.id)}
                className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                  selectedKidId === kid.id
                    ? "bg-primary/10 border-2 border-primary text-primary"
                    : "bg-gray-50 border border-gray-200 text-text-secondary"
                }`}
              >
                {kid.name} {kid.last_names}
              </button>
            ))}
            {!showInlineKidForm && (
              <button
                type="button"
                onClick={() => setShowInlineKidForm(true)}
                className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-50 border border-dashed border-gray-300 text-text-secondary hover:border-primary hover:text-primary transition-colors"
              >
                + Agregar hijo
              </button>
            )}
          </div>
          {showInlineKidForm && (
            <div className="mt-3">
              <InlineKidForm
                onCreated={handleKidCreated}
                onCancel={() => setShowInlineKidForm(false)}
              />
            </div>
          )}
        </div>

        {/* 2. Sport selection */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
            2. Deporte
          </p>
          {sports.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Este club aún no tiene deportes configurados. Contacta al
              administrador del club.
            </p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {sports.map((sport) => {
                const sportPlans = plans.filter(
                  (p) => p.sport_id === sport.id && p.is_active
                );
                const disabled = sportPlans.length === 0;
                return (
                  <button
                    key={sport.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSportSelect(sport.id)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      selectedSportId === sport.id
                        ? "bg-primary/10 border-2 border-primary text-primary"
                        : disabled
                          ? "bg-gray-50 border border-gray-200 text-gray-300 cursor-not-allowed"
                          : "bg-gray-50 border border-gray-200 text-text-secondary hover:border-primary/50"
                    }`}
                  >
                    {sport.name}
                    {disabled && (
                      <span className="block text-xs text-gray-300">
                        (sin planes)
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Plan selection */}
        {selectedSportId && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
              3. Plan
            </p>
            <div className="space-y-2">
              {plansForSport.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`w-full flex justify-between items-center px-4 py-3 rounded-xl text-sm transition-colors ${
                    selectedPlanId === plan.id
                      ? "bg-primary/10 border-2 border-primary text-primary"
                      : "bg-gray-50 border border-gray-200 text-text-secondary hover:border-primary/50"
                  }`}
                >
                  <span className="font-medium">{plan.name}</span>
                  <span className="font-bold">{formatCLP(plan.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleEnroll}
          disabled={!canSubmit}
          className="w-full py-3.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving
            ? "Inscribiendo..."
            : selectedKid && selectedSport
              ? `Inscribir a ${selectedKid.name} en ${selectedSport.name}`
              : "Selecciona hijo, deporte y plan"}
        </button>
      </div>

      {/* Finish button (only after at least one enrollment) */}
      {enrollments.length > 0 && (
        <button
          type="button"
          onClick={onFinish}
          className="w-full py-3.5 bg-gray-100 text-text-secondary text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
        >
          Finalizar
        </button>
      )}
    </div>
  );
}
