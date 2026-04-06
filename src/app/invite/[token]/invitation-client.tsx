"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EnrollmentForm } from "@/components/invite/enrollment-form";
import type { Sport, Plan } from "@/types";

interface InvitationClientProps {
  token: string;
  clubId: string;
  clubName: string;
  clubLogoUrl: string | null;
  sports: Sport[];
  plans: Plan[];
}

export function InvitationClient({
  token,
  clubId,
  clubName,
  clubLogoUrl,
  sports,
  plans,
}: InvitationClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
    }
    checkAuth();
  }, [supabase]);

  // Loading state
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        {/* Club header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
            {clubLogoUrl ? (
              <img
                src={clubLogoUrl}
                alt={clubName}
                className="w-10 h-10 rounded-lg object-cover"
              />
            ) : (
              <span className="text-primary text-xl font-bold">
                {clubName.charAt(0)}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-text">{clubName}</h1>
          <p className="text-sm text-text-secondary mt-1">
            Te ha invitado a unirse al club
          </p>
        </div>

        {/* Not authenticated */}
        {!isAuthenticated && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
            <p className="text-sm text-text-secondary mb-6">
              Para aceptar esta invitación, necesitas una cuenta en CluPay.
            </p>
            <div className="space-y-3">
              <a
                href={`/register?redirect=/invite/${token}`}
                className="block w-full py-3 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-dark transition-colors text-center"
              >
                Crear cuenta
              </a>
              <a
                href={`/login?redirect=/invite/${token}`}
                className="block w-full py-3 bg-gray-100 text-text-secondary text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors text-center"
              >
                Ya tengo cuenta
              </a>
            </div>
          </div>
        )}

        {/* Authenticated — show enrollment form */}
        {isAuthenticated && (
          <EnrollmentForm
            clubId={clubId}
            clubName={clubName}
            sports={sports}
            plans={plans}
            invitationToken={token}
            onFinish={() => router.push("/app")}
          />
        )}
      </div>
    </div>
  );
}
