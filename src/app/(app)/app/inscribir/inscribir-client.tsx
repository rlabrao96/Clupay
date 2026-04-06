"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EnrollmentForm } from "@/components/invite/enrollment-form";
import type { Club, Sport, Plan } from "@/types";

interface InscribirClientProps {
  clubs: Club[];
  sports: Sport[];
  plans: Plan[];
}

export function InscribirClient({ clubs, sports, plans }: InscribirClientProps) {
  const router = useRouter();
  const [selectedClubId, setSelectedClubId] = useState<string | null>(
    clubs.length === 1 ? clubs[0].id : null
  );

  const selectedClub = clubs.find((c) => c.id === selectedClubId);
  const clubSports = sports.filter((s) => s.club_id === selectedClubId);
  const clubSportIds = clubSports.map((s) => s.id);
  const clubPlans = plans.filter((p) => clubSportIds.includes(p.sport_id));

  return (
    <div>
      {/* Club selection (only if multiple clubs) */}
      {clubs.length > 1 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
            Selecciona un club
          </p>
          <div className="flex gap-2 flex-wrap">
            {clubs.map((club) => (
              <button
                key={club.id}
                type="button"
                onClick={() => setSelectedClubId(club.id)}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  selectedClubId === club.id
                    ? "bg-primary/10 border-2 border-primary text-primary"
                    : "bg-gray-50 border border-gray-200 text-text-secondary hover:border-primary/50"
                }`}
              >
                {club.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Enrollment form */}
      {selectedClub && (
        <EnrollmentForm
          clubId={selectedClub.id}
          clubName={selectedClub.name}
          sports={clubSports}
          plans={clubPlans}
          onFinish={() => router.push("/app/hijos")}
        />
      )}
    </div>
  );
}
