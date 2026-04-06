# Invitation Acceptance Flow — Design Spec

_2026-04-06_

## Overview

When a club admin invites a parent via email, the parent receives a link to `/invite/[token]`. This page handles the full onboarding: authentication, parent-club association, kid selection/creation, and sport/plan enrollment — all in one flow. The invitation is single-use and expires after 10 days.

## Goals

- Complete the invitation → enrollment loop end-to-end
- Onboard parents with minimal friction (one page, one session)
- Support enrolling multiple kids and/or multiple sports in a single visit
- Establish an explicit parent-club relationship for future data access

## Non-Goals

- Email delivery of the invitation link (Phase 1 — email notifications, separate spec)
- Payment collection during enrollment (Phase 2 — Flow.cl integration)

## Database Changes

### New table: `club_parents`

Links parents to clubs explicitly, independent of kid enrollments.

```sql
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
```

RLS policies:
- Parents can read their own `club_parents` rows
- Club admins can read `club_parents` for their club
- Super admins can read all

### Migration: Change invitation expiry default

Update the `invitations` table default from 30 days to 10 days:

```sql
ALTER TABLE invitations
  ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '10 days');
```

## Page: `/invite/[token]`

### Route Structure

- Route: `src/app/invite/[token]/page.tsx` (outside any portal route group — accessible without role guard)
- Server component fetches invitation + club data, passes to client component
- Client component manages the multi-step form state

### Page States

| State | Condition | What renders |
|-------|-----------|-------------|
| **Loading** | Token being validated | Centered spinner |
| **Invalid** | Token not found in DB | "Invitación no encontrada" message + link to `/login` |
| **Expired** | `expires_at < now()` or `status != 'pending'` | "Esta invitación ha expirado" + contact club message |
| **Not authenticated** | Valid token, no session | Club info + "Crear cuenta" and "Ya tengo cuenta" buttons |
| **Authenticated (form)** | Valid token, user logged in | Club info + enrollment form |
| **Authenticated (success)** | After enrollment(s) completed | Summary of all enrollments + "Ir al portal" / "Inscribir otro" buttons |

### Auth Handling

When the parent is not authenticated:
- Show club name and invitation details (who invited them)
- Two buttons:
  - **"Crear cuenta"** → navigates to `/register?redirect=/invite/[token]`
  - **"Ya tengo cuenta"** → navigates to `/login?redirect=/invite/[token]`
- The existing `/register` and `/login` pages need to support a `redirect` query param. After successful auth, redirect to that URL instead of the default role-based redirect.

### Enrollment Form (Authenticated State)

Single-card layout with three stacked sections:

**1. Kid selection**
- Show parent's existing kids as selectable chips
- Include a "+ Agregar hijo" chip that expands an inline form (name, last names, RUT via `RutInput`, date of birth)
- On inline kid creation, insert into `kids` table immediately, then auto-select the new kid

**2. Sport selection**
- Show all active sports for the club as selectable cards
- Fetched from `sports` table filtered by `club_id`

**3. Plan selection**
- Show plans for the selected sport with name and price (CLP formatted)
- Fetched from `plans` table filtered by `sport_id`
- Plans appear only after a sport is selected

**Submit button:** "Inscribir a {kidName} en {sportName}" — dynamic label reflecting current selections.

### On Submit

1. If this is the first enrollment in the session:
   - Insert into `club_parents` (parent_id, club_id) — use upsert to handle idempotency
   - Update `invitations` set `status = 'accepted'`, `accepted_at = now()` where token matches
2. Insert into `enrollments` (kid_id, club_id, sport_id, plan_id, status='active')
3. Add enrollment to local summary state
4. Transition to success/summary view

### "Add Another" Loop

After each enrollment, the page shows:
- **Green summary box** at the top listing all enrollments made so far (kid · sport plan · price/month)
- **Running monthly total** at the bottom of the summary
- The form resets below the summary for another enrollment
- **"Finalizar"** button below the form to exit

When the parent clicks "Finalizar" or "Ir al portal de apoderado":
- Navigate to `/app`

### Inline Kid Creation

When the parent clicks "+ Agregar hijo":
- Expand an inline form within the kid selection area
- Fields: nombre, apellido paterno, apellido materno, RUT (via `RutInput` component), fecha de nacimiento
- On save: insert into `kids` table with `parent_id = current user`, auto-select the new kid
- On cancel: collapse the inline form

### Edge Cases

| Case | Behavior |
|------|----------|
| Token not found | "Invitación no encontrada" + link to login |
| Token expired (`expires_at < now()`) | "Esta invitación ha expirado. Contacta al club para una nueva invitación." |
| Token already used (`status = 'accepted'`) | "Esta invitación ya fue utilizada." + link to login |
| Duplicate enrollment (kid + sport + plan active) | Show error: "{kidName} ya está inscrito/a en este plan" — DB unique index prevents insert |
| Club has no sports configured | "Este club aún no tiene deportes configurados. Contacta al administrador del club." |
| Sport has no plans configured | Disable sport selection, show "(sin planes)" label |
| Kid inline creation with invalid RUT | RutInput component handles validation — submit blocked until valid |
| Auth session expires mid-flow | Supabase client detects expired session — redirect to login with redirect param preserved |

## Components

### New Components

- `src/app/invite/[token]/page.tsx` — Server component: validates token, fetches club/sports/plans data
- `src/components/invite/invitation-client.tsx` — Client component: manages all page states and form logic
- `src/components/invite/inline-kid-form.tsx` — Client component: inline kid creation (reuses `RutInput`)

### Modified Components/Pages

- `src/app/(auth)/login/page.tsx` — Support `redirect` query param. After successful login, redirect to `redirect` param value instead of `/` (which does role-based redirect).
- `src/app/(auth)/register/page.tsx` — Support `redirect` query param. After successful registration, redirect to `redirect` param value instead of `/`.
- `src/app/(auth)/callback/route.ts` — If the OAuth callback flow is used, preserve the `redirect` param through the OAuth state and redirect accordingly after callback.

## Data Fetching

| Data | Where fetched | How |
|------|--------------|-----|
| Invitation + club info | Server component (`page.tsx`) | `invitations` join `clubs` where `token = params.token` |
| Sports for club | Server component, passed as prop | `sports` where `club_id` and `active = true` |
| Plans for club | Server component, passed as prop | `plans` join `sports` where `sports.club_id` |
| Parent's kids | Client component, on auth | `kids` where `parent_id = user.id` |

Sports and plans are fetched server-side since they don't depend on auth state. Kids are fetched client-side after authentication since they depend on the logged-in user.

## Parent Portal: "Enroll More" Flow

After the initial onboarding via invitation, parents can enroll additional kids or sports from within the parent portal.

### Route

`src/app/(app)/app/inscribir/page.tsx` — protected by `AuthGuard requiredRole="parent"`.

### Entry Points

- Button on the kids listing page (`/app/hijos`): "Inscribir en deporte"
- Could also be a CTA on the parent dashboard

### Flow

1. **Club selection** — if the parent belongs to multiple clubs (via `club_parents`), show a club picker. If only one club, auto-select.
2. **Enrollment form** — same single-card layout as the invitation page: kid → sport → plan
3. **"Add another" loop** — same pattern: running summary with monthly total, form resets for next enrollment
4. **Done** — navigate back to `/app/hijos`

### Differences from Invitation Page

| Aspect | `/invite/[token]` | `/app/inscribir` |
|--------|-------------------|------------------|
| Auth gate | Register/login required | Already authenticated |
| Token validation | Yes | No token — direct access |
| `club_parents` insert | Creates on first enrollment | Already exists |
| Invitation status update | Marks as accepted | N/A |
| Club selection | From invitation (single club) | Parent picks from their clubs |

### Components

- `src/app/(app)/app/inscribir/page.tsx` — Server component: fetches parent's clubs, sports, plans
- Reuses `invitation-client.tsx` enrollment form logic (extract shared enrollment form component)

The enrollment form core (kid selector, sport/plan picker, summary, add-another loop) should be extracted into a shared component used by both `/invite/[token]` and `/app/inscribir`.

## UI Design

- **Mobile-first** — parent portal target device
- **Single card layout** — all form sections stacked vertically in one white card
- **Chip-based selection** for kids and sports (tap to select, highlighted border)
- **List-based selection** for plans (rows with name + price)
- **Green summary box** for completed enrollments with running total
- **Design tokens** — uses existing Tailwind config (primary, success, danger, text, text-secondary colors)
- Follows existing parent portal visual language (rounded corners, subtle borders, clean typography)
