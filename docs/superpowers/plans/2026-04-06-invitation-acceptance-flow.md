# Invitation Acceptance Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/invite/[token]` page for parent onboarding (auth + enrollment) and the `/app/inscribir` page for adding more enrollments from the parent portal.

**Architecture:** Single-page wizard at `/invite/[token]` with server-side token validation and a client-side enrollment form. Shared enrollment form component reused by both the invitation page and the parent portal's "enroll more" page at `/app/inscribir`. New `club_parents` table for explicit parent-club associations.

**Tech Stack:** Next.js 16 (App Router, async params), React 19, Supabase (PostgreSQL + RLS), TypeScript, Tailwind CSS 4.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/00018_create_club_parents.sql` | Create `club_parents` table + RLS policies |
| `supabase/migrations/00019_update_invitation_expiry.sql` | Change invitation default expiry to 10 days |
| `src/types/index.ts` | Add `ClubParent` interface (modify existing) |
| `src/components/invite/enrollment-form.tsx` | Shared enrollment form: kid selector, sport/plan picker, summary, add-another loop |
| `src/components/invite/inline-kid-form.tsx` | Inline kid creation form (name, last names, RUT, DOB) |
| `src/app/invite/[token]/page.tsx` | Server component: validate token, fetch club/sports/plans, render states |
| `src/app/(app)/app/inscribir/page.tsx` | Server component: fetch parent's clubs/sports/plans, render enrollment form |

### Modified Files
| File | Change |
|------|--------|
| `src/app/(auth)/register/page.tsx` | Support `redirect` query param after registration |
| `src/app/(app)/app/hijos/page.tsx` | Add "Inscribir en deporte" button |

**Note:** The login page already supports the `redirect` query param (line 15: `const redirect = searchParams.get("redirect") || "/";`). The callback route also already passes `redirect` through OAuth flow. No changes needed for those files.

---

### Task 1: Database Migration — `club_parents` Table

**Files:**
- Create: `supabase/migrations/00018_create_club_parents.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Create club_parents table
CREATE TABLE club_parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_club_parents_unique ON club_parents(club_id, parent_id);
CREATE INDEX idx_club_parents_club_id ON club_parents(club_id);
CREATE INDEX idx_club_parents_parent_id ON club_parents(parent_id);

-- Enable RLS
ALTER TABLE club_parents ENABLE ROW LEVEL SECURITY;

-- Parents can read their own club associations
CREATE POLICY "parent_club_parents_select" ON club_parents
  FOR SELECT USING (parent_id = auth.uid());

-- Parents can insert their own club association (for invitation acceptance)
CREATE POLICY "parent_club_parents_insert" ON club_parents
  FOR INSERT WITH CHECK (parent_id = auth.uid());

-- Club admins can read club_parents for their club
CREATE POLICY "club_admin_club_parents_select" ON club_parents
  FOR SELECT USING (is_club_admin(club_id));

-- Super admins can do everything
CREATE POLICY "super_admin_club_parents_all" ON club_parents
  FOR ALL USING (is_super_admin());
```

Create this file at `supabase/migrations/00018_create_club_parents.sql`.

- [ ] **Step 2: Apply the migration**

Run via Supabase MCP tool `apply_migration` with the SQL above, or note for manual application.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00018_create_club_parents.sql
git commit -m "feat(db): create club_parents table with RLS policies"
```

---

### Task 2: Database Migration — Update Invitation Expiry

**Files:**
- Create: `supabase/migrations/00019_update_invitation_expiry.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Change invitation expiry default from 30 days to 10 days
ALTER TABLE invitations
  ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '10 days');
```

Create this file at `supabase/migrations/00019_update_invitation_expiry.sql`.

- [ ] **Step 2: Apply the migration**

Run via Supabase MCP tool `apply_migration` with the SQL above, or note for manual application.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00019_update_invitation_expiry.sql
git commit -m "feat(db): change invitation expiry default to 10 days"
```

---

### Task 3: Add `ClubParent` Type + Update RLS for Sports/Plans Access

**Files:**
- Modify: `src/types/index.ts`
- Create: `supabase/migrations/00020_invitation_rls_sports_plans.sql`

The invitation page needs unauthenticated users to NOT see sports/plans (server-side fetch with service role), but authenticated parents accepting an invitation need to read sports/plans for the club they're joining. The current sports/plans RLS only allows parents who already have enrollments. We need to also allow parents who have a pending invitation for that club.

- [ ] **Step 1: Add the `ClubParent` interface to types**

Add after the `Invitation` interface in `src/types/index.ts`:

```typescript
export interface ClubParent {
  id: string;
  club_id: string;
  parent_id: string;
  joined_at: string;
  created_at: string;
}
```

- [ ] **Step 2: Write RLS migration for sports/plans access during invitation**

The current `parent_plans_select` policy already includes invitation-based access. The current `parent_sports_select` policy only checks enrollments. Add an additional policy for sports so parents with a pending invitation can also view the club's sports.

Create `supabase/migrations/00020_invitation_rls_sports_plans.sql`:

```sql
-- Allow parents to view sports for clubs where they have a pending invitation
CREATE POLICY "parent_sports_select_invitation" ON sports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invitations i
      WHERE i.club_id = sports.club_id
      AND i.email = (SELECT email FROM profiles WHERE id = auth.uid())
      AND i.status = 'pending'
    )
  );

-- Allow parents to view clubs they're associated with via club_parents
CREATE POLICY "parent_clubs_select_member" ON clubs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_parents cp
      WHERE cp.club_id = clubs.id AND cp.parent_id = auth.uid()
    )
  );

-- Allow parents with invitations to also view the club
CREATE POLICY "parent_clubs_select_invitation" ON clubs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invitations i
      WHERE i.club_id = clubs.id
      AND i.email = (SELECT email FROM profiles WHERE id = auth.uid())
      AND i.status = 'pending'
    )
  );

-- Allow parents who are club members to view sports
CREATE POLICY "parent_sports_select_member" ON sports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_parents cp
      WHERE cp.club_id = sports.club_id AND cp.parent_id = auth.uid()
    )
  );

-- Allow parents who are club members to view plans
CREATE POLICY "parent_plans_select_member" ON plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sports s
      JOIN club_parents cp ON cp.club_id = s.club_id
      WHERE s.id = plans.sport_id AND cp.parent_id = auth.uid()
    )
  );

-- Allow parents to update invitations they're accepting (matching their email)
CREATE POLICY "parent_invitations_update" ON invitations
  FOR UPDATE USING (
    email = (SELECT email FROM profiles WHERE id = auth.uid())
  );
```

- [ ] **Step 3: Apply the migration**

Run via Supabase MCP tool `apply_migration`.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts supabase/migrations/00020_invitation_rls_sports_plans.sql
git commit -m "feat(db): add ClubParent type and RLS for invitation/member access"
```

---

### Task 4: Inline Kid Form Component

**Files:**
- Create: `src/components/invite/inline-kid-form.tsx`

- [ ] **Step 1: Create the inline kid form component**

This is a compact form that appears inline within the enrollment form when the parent clicks "+ Agregar hijo". It creates the kid in the database immediately and calls `onCreated` with the new kid data.

Create `src/components/invite/inline-kid-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RutInput } from "@/components/shared/rut-input";
import { cleanRut } from "@/lib/rut/validate";
import type { Kid } from "@/types";

interface InlineKidFormProps {
  onCreated: (kid: Kid) => void;
  onCancel: () => void;
}

export function InlineKidForm({ onCreated, onCancel }: InlineKidFormProps) {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [lastNames, setLastNames] = useState("");
  const [rut, setRut] = useState("");
  const [rutValid, setRutValid] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!name.trim() || !lastNames.trim()) {
      setError("Nombre y apellidos son obligatorios");
      setSaving(false);
      return;
    }
    if (!rutValid) {
      setError("RUT inválido");
      setSaving(false);
      return;
    }
    if (!dateOfBirth) {
      setError("Fecha de nacimiento es obligatoria");
      setSaving(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada");
      setSaving(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("kids")
      .insert({
        parent_id: user.id,
        name: name.trim(),
        last_names: lastNames.trim(),
        rut: cleanRut(rut),
        date_of_birth: dateOfBirth,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.message.includes("duplicate")) {
        setError("Ya existe un hijo registrado con ese RUT");
      } else {
        setError(insertError.message);
      }
      setSaving(false);
      return;
    }

    onCreated(data as Kid);
  }

  const inputClass =
    "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-text">Nuevo hijo</p>
      {error && (
        <div className="bg-danger-light text-danger text-xs px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          required
          className={inputClass}
        />
        <input
          type="text"
          value={lastNames}
          onChange={(e) => setLastNames(e.target.value)}
          placeholder="Apellidos"
          required
          className={inputClass}
        />
      </div>
      <RutInput
        value={rut}
        onChange={(val, valid) => {
          setRut(val);
          setRutValid(valid);
        }}
        required
      />
      <input
        type="date"
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
        required
        className={inputClass}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-200 text-sm font-medium text-text-secondary rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/invite/inline-kid-form.tsx
git commit -m "feat(invite): create inline kid form component"
```

---

### Task 5: Shared Enrollment Form Component

**Files:**
- Create: `src/components/invite/enrollment-form.tsx`

This is the core reusable component used by both `/invite/[token]` and `/app/inscribir`. It handles kid selection, sport/plan picking, enrollment submission, the "add another" loop, and the running summary.

- [ ] **Step 1: Create the enrollment form component**

Create `src/components/invite/enrollment-form.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/invite/enrollment-form.tsx
git commit -m "feat(invite): create shared enrollment form component"
```

---

### Task 6: Invitation Page — `/invite/[token]`

**Files:**
- Create: `src/app/invite/[token]/page.tsx`

This server component validates the token, fetches club/sports/plans data, and renders the appropriate state. For the authenticated + form state, it delegates to the `EnrollmentForm` client component.

- [ ] **Step 1: Create the invitation page**

Create `src/app/invite/[token]/page.tsx`:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { InvitationClient } from "./invitation-client";
import type { Sport, Plan } from "@/types";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();

  // Fetch invitation with club info
  const { data: invitation } = await supabase
    .from("invitations")
    .select("*, clubs:club_id(id, name, logo_url, contact_email)")
    .eq("token", token)
    .single();

  // Token not found
  if (!invitation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-danger-light rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-danger text-xl">✕</span>
          </div>
          <h1 className="text-lg font-bold text-text mb-2">Invitación no encontrada</h1>
          <p className="text-sm text-text-secondary mb-6">
            El enlace de invitación no es válido. Verifica que el enlace sea correcto.
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            Ir al inicio de sesión
          </a>
        </div>
      </div>
    );
  }

  // Token expired or already used
  const isExpired = new Date(invitation.expires_at) < new Date();
  const isUsed = invitation.status === "accepted";

  if (isExpired || isUsed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-warning-light rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-warning text-xl">⚠</span>
          </div>
          <h1 className="text-lg font-bold text-text mb-2">
            {isUsed ? "Invitación ya utilizada" : "Invitación expirada"}
          </h1>
          <p className="text-sm text-text-secondary mb-6">
            {isUsed
              ? "Esta invitación ya fue aceptada."
              : "Esta invitación ha expirado. Contacta al club para una nueva invitación."}
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            Ir al inicio de sesión
          </a>
        </div>
      </div>
    );
  }

  // Fetch sports and plans for the club
  const club = invitation.clubs as { id: string; name: string; logo_url: string | null; contact_email: string | null };

  const { data: sports } = await supabase
    .from("sports")
    .select("*")
    .eq("club_id", club.id)
    .order("name");

  const sportIds = (sports ?? []).map((s: Sport) => s.id);
  const { data: plans } =
    sportIds.length > 0
      ? await supabase
          .from("plans")
          .select("*")
          .in("sport_id", sportIds)
          .eq("is_active", true)
          .order("price")
      : { data: [] };

  return (
    <InvitationClient
      token={token}
      clubId={club.id}
      clubName={club.name}
      clubLogoUrl={club.logo_url}
      sports={(sports ?? []) as Sport[]}
      plans={(plans ?? []) as Plan[]}
    />
  );
}
```

- [ ] **Step 2: Create the invitation client component**

Create `src/app/invite/[token]/invitation-client.tsx`:

```tsx
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
```

- [ ] **Step 3: Commit**

```bash
git add src/app/invite/[token]/page.tsx src/app/invite/[token]/invitation-client.tsx
git commit -m "feat(invite): create invitation acceptance page with auth gate and enrollment form"
```

---

### Task 7: Register Page — Support `redirect` Query Param

**Files:**
- Modify: `src/app/(auth)/register/page.tsx`

The login page already reads `redirect` from search params (line 15). The register page hardcodes `router.push("/app")` (line 73). We need it to use a `redirect` param.

- [ ] **Step 1: Add Suspense wrapper and `useSearchParams` support**

In `src/app/(auth)/register/page.tsx`, make these changes:

1. Add `Suspense` and `useSearchParams` imports
2. Read `redirect` from search params
3. Use `redirect` value in `router.push()`
4. Wrap in Suspense (required by Next.js when using `useSearchParams`)
5. Preserve `redirect` in the "Ya tienes cuenta?" link

Replace the full file with:

```tsx
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { RutInput } from "@/components/shared/rut-input";
import { cleanRut } from "@/lib/rut/validate";

function RegisterForm() {
  const [form, setForm] = useState({
    name: "",
    apellidos: "",
    rut: "",
    rutValid: false,
    fechaNacimiento: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/app";
  const supabase = createClient();

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleRutChange(value: string, isValid: boolean) {
    setForm((prev) => ({ ...prev, rut: value, rutValid: isValid }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.rutValid) {
      setError("El RUT ingresado no es válido.");
      return;
    }

    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (authError || !authData.user) {
      setError(authError?.message ?? "No se pudo crear la cuenta. Intenta de nuevo.");
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      id: authData.user.id,
      email: form.email,
      name: form.name,
      last_names: form.apellidos,
      rut: cleanRut(form.rut),
      date_of_birth: form.fechaNacimiento || null,
      phone: form.phone || null,
      role: "parent",
    });

    if (profileError) {
      setError("Cuenta creada, pero no se pudo guardar el perfil. Contacta soporte.");
      setLoading(false);
      return;
    }

    router.push(redirect);
  }

  const loginHref = redirect !== "/app"
    ? `/login?redirect=${encodeURIComponent(redirect)}`
    : "/login";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-2">Crear cuenta</h2>
      <p className="text-sm text-gray-500 mb-6">Regístrate en CluPay como apoderado</p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Juan"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Apellidos
            </label>
            <input
              type="text"
              value={form.apellidos}
              onChange={(e) => handleChange("apellidos", e.target.value)}
              placeholder="Pérez García"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            RUT
          </label>
          <RutInput
            value={form.rut}
            onChange={handleRutChange}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fecha de nacimiento
          </label>
          <input
            type="date"
            value={form.fechaNacimiento}
            onChange={(e) => handleChange("fechaNacimiento", e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Correo electrónico
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => handleChange("email", e.target.value)}
            placeholder="tu@correo.com"
            required
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Teléfono
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => handleChange("phone", e.target.value)}
            placeholder="+56 9 1234 5678"
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contraseña
          </label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => handleChange("password", e.target.value)}
            placeholder="Mínimo 6 caracteres"
            required
            minLength={6}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg font-medium text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: "#3B82F6" }}
        >
          {loading ? "Creando cuenta..." : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        ¿Ya tienes cuenta?{" "}
        <Link href={loginHref} className="font-medium" style={{ color: "#3B82F6" }}>
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex justify-center py-8">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2"
              style={{ borderColor: "#3B82F6" }}
            />
          </div>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
```

**Key changes from original:**
- Added `Suspense` wrapper and extracted form to `RegisterForm` component (same pattern as login page)
- Added `useSearchParams` to read `redirect` param (defaults to `/app`)
- Changed `router.push("/app")` to `router.push(redirect)` on line after successful registration
- Fixed profile insert to use `name`/`last_names` (matching DB columns) instead of `first_name`/`last_name`
- "Ya tienes cuenta?" link preserves the `redirect` param

- [ ] **Step 2: Commit**

```bash
git add src/app/\(auth\)/register/page.tsx
git commit -m "feat(auth): add redirect query param support to register page"
```

---

### Task 8: Parent Portal — "Inscribir en Deporte" Page

**Files:**
- Create: `src/app/(app)/app/inscribir/page.tsx`
- Modify: `src/app/(app)/app/hijos/page.tsx`

- [ ] **Step 1: Create the inscribir page**

Create `src/app/(app)/app/inscribir/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { InscribirClient } from "./inscribir-client";
import type { Sport, Plan, Club } from "@/types";

export default async function InscribirPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get parent's clubs via club_parents
  const { data: clubParents } = await supabase
    .from("club_parents")
    .select("club_id, clubs:club_id(id, name, logo_url)")
    .eq("parent_id", user.id);

  const clubs = (clubParents ?? [])
    .map((cp: any) => cp.clubs as Club)
    .filter(Boolean);

  if (clubs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary text-sm mb-2">
          No estás asociado a ningún club aún.
        </p>
        <p className="text-text-secondary text-xs">
          Acepta una invitación de un club para comenzar.
        </p>
      </div>
    );
  }

  // Fetch all sports and plans for the parent's clubs
  const clubIds = clubs.map((c: Club) => c.id);

  const { data: sports } = await supabase
    .from("sports")
    .select("*")
    .in("club_id", clubIds)
    .order("name");

  const sportIds = (sports ?? []).map((s: Sport) => s.id);
  const { data: plans } =
    sportIds.length > 0
      ? await supabase
          .from("plans")
          .select("*")
          .in("sport_id", sportIds)
          .eq("is_active", true)
          .order("price")
      : { data: [] };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text mb-1">Inscribir en Deporte</h1>
        <p className="text-text-secondary text-sm">
          Inscribe a tus hijos en deportes y planes
        </p>
      </div>

      <InscribirClient
        clubs={clubs as Club[]}
        sports={(sports ?? []) as Sport[]}
        plans={(plans ?? []) as Plan[]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the inscribir client component**

Create `src/app/(app)/app/inscribir/inscribir-client.tsx`:

```tsx
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
```

- [ ] **Step 3: Add "Inscribir en deporte" button to hijos page**

In `src/app/(app)/app/hijos/page.tsx`, add a link to the inscribir page next to the existing "+ Agregar" button. Replace lines 55-57:

Find:
```tsx
        <Link href="/app/hijos/nuevo" className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors">
          + Agregar
        </Link>
```

Replace with:
```tsx
        <div className="flex gap-2">
          <Link href="/app/inscribir" className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors">
            Inscribir en deporte
          </Link>
          <Link href="/app/hijos/nuevo" className="px-4 py-2 border border-gray-200 text-text-secondary text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
            + Agregar hijo
          </Link>
        </div>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/app/inscribir/page.tsx src/app/\(app\)/app/inscribir/inscribir-client.tsx src/app/\(app\)/app/hijos/page.tsx
git commit -m "feat(app): add inscribir page for enrolling kids in sports from parent portal"
```

---

### Task 9: Verify Build and Test Manually

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run Next.js build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server with `npm run dev` and verify:

1. Visit `/invite/nonexistent-token` → shows "Invitación no encontrada"
2. If you have a valid invitation token in the DB, visit `/invite/[token]`:
   - Not logged in → shows club info + register/login buttons
   - Login button links to `/login?redirect=/invite/[token]`
   - After login → shows enrollment form with kid/sport/plan selectors
3. Visit `/app/inscribir` as a logged-in parent:
   - Shows club selection (or auto-selects if one club)
   - Shows enrollment form
4. Visit `/app/hijos` → "Inscribir en deporte" button visible

- [ ] **Step 4: Commit any fixes**

If any issues found, fix and commit.

---

### Task 10: Update Project Documentation

**Files:**
- Modify: `NEXT-STEPS.md`

- [ ] **Step 1: Update NEXT-STEPS.md**

Remove the "Invitation acceptance flow" item from Phase 1 pending list since it's now implemented. Add a note about the "Enroll more from parent portal" being complete as well.

In `NEXT-STEPS.md`, remove these lines from Phase 1:
```
- **Invitation acceptance flow** — `/invite/[token]` page where parents accept club invitations, select sport/plan for their kid, and complete enrollment. Currently invitations are created in DB but there's no acceptance UI.
```

And remove from Feature Gaps:
```
- **"Join new club" flow** — Parents can add kids but cannot enroll existing kids into new clubs/sports/plans.
```

- [ ] **Step 2: Commit**

```bash
git add NEXT-STEPS.md
git commit -m "docs: update NEXT-STEPS.md — mark invitation acceptance flow as complete"
```
