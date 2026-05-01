# Deportistas import (CSV / Excel) — Design

**Status:** Approved 2026-05-01
**Owner:** Club Admin Portal
**Scope:** Bulk import of athletes (kids) and their parents from a spreadsheet, followed by an assisted plan-assignment stage. Email invitations sent to new parents. WhatsApp channel is out of scope but the design must not preclude it.

## Goal

Let a club admin upload a roster file once, materialize parents + kids in the database, send each new parent an invitation email, then assign plans in bulk on a follow-up screen. Re-running the same file must be safe (idempotent on RUT).

## Non-goals

- Importing past invoices or payments.
- Importing discounts or custom enrollment dates.
- WhatsApp delivery (channel left extensible only).
- Bulk editing existing parents/kids via spreadsheet — this is import, not sync.

## User flow

1. `/club/deportistas` shows an **Importar deportistas** button.
2. Admin lands on `/club/deportistas/importar` (Stage 1: upload + preview).
3. Admin downloads the `.xlsx` template, fills it, and uploads it (`.csv` or `.xlsx` accepted).
4. Server parses + validates + previews the rows.
5. Admin clicks **Confirmar importación** — non-error rows are committed, an `import_batches` row is created, invitation emails are dispatched.
6. Admin is redirected to `/club/deportistas/importar/[batchId]/asignar` (Stage 2: bulk plan assignment) where they assign plans to selected subsets of the imported kids.
7. Admin clicks **Terminar** and returns to `/club/deportistas`. Kids without plans live in the system unenrolled and can be enrolled later via existing pages.

## Spreadsheet template

| Column | Required | Notes |
|---|---|---|
| `parent_name` | yes | First name |
| `parent_last_names` | yes | One or both surnames |
| `parent_rut` | yes | Any common Chilean format accepted |
| `parent_email` | yes | Used for invitation |
| `parent_phone` | no | Mobile, any format; reserved for WhatsApp |
| `parent_date_of_birth` | no | Multiple formats accepted |
| `kid_name` | yes | First name |
| `kid_last_names` | yes | One or both surnames |
| `kid_rut` | yes | Any common Chilean format accepted |
| `kid_date_of_birth` | yes | Multiple formats accepted |

Multiple kids per parent are represented as multiple rows sharing the same `parent_rut`.

### Schema change

Migration: `ALTER TABLE profiles ALTER COLUMN date_of_birth DROP NOT NULL;` so imported parents can be created without DOB. Existing UI that consumes the field must tolerate `NULL` (sign-up flow can prompt for it later).

## Normalization (applied before validation)

- **RUT** — accepts `12.345.678-9`, `12345678-9`, `123456789`, with `K`/`k`. Strips dots and dashes, validates modulo-11, stores canonical `XXXXXXXX-X` with lowercase `k`. Reuses helpers in `src/lib/rut/`; extend as needed for input variants.
- **Date of birth** — accepts `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `D/M/YY`, and Excel date serial numbers. Ambiguous `XX/XX/YYYY` is parsed as DD/MM (Chile). Stored as ISO `YYYY-MM-DD`.
- **Names** — trim, collapse repeated whitespace, normalize to Title Case preserving accents and `ñ`. `"juan PÉREZ  lópez"` → `"Juan Pérez López"`.
- **Email** — trim + lowercase.
- **Phone** — strip spaces, dots, parens; keep leading `+` if present.

The preview shows the normalized value so the admin sees what will actually be saved.

## Validation

Per-row checks after normalization:

- All required columns present and non-empty.
- RUT passes modulo-11 (parent and kid).
- Email is well-formed.
- Kid DOB is a real, parseable date and not in the future.
- Within the file: same kid RUT cannot appear in two rows (second occurrence is an error).

Cross-DB checks:

- **Parent RUT exists** → status `Reutilizar parent`. Existing profile fields are not overwritten; row's parent fields are ignored.
- **Kid RUT exists, same parent** → status `Sin cambios` (idempotent re-import).
- **Kid RUT exists, different parent** → status `Error: hijo ya pertenece a otro apoderado`.
- **Email exists in `auth.users` but no profile** → row commits the kid against the matched user where possible; if matching is ambiguous, status `Error: email ya registrado, no se asoció`.

## Stage 1 UI — preview

Table columns: row #, kid name, kid RUT, parent name, parent RUT, parent email, status badge.

Status badges:
- `Nuevo` (default — both parent and kid will be created)
- `Reutilizar parent` (existing parent profile, new kid)
- `Sin cambios` (parent + kid both already exist for this club admin's data)
- `Error: <razón>` (won't be committed)

Footer counts (`X nuevos · Y reutilizan · Z sin cambios · W con errores`) and two actions:
- `Subir otro archivo` — discard and start over
- `Confirmar importación` — disabled until at least one non-error row exists

Confirming commits all non-error rows; error rows are dropped from the batch.

## Stage 2 UI — bulk plan assignment

URL: `/club/deportistas/importar/[batchId]/asignar`. Shows kids linked to the batch via `import_batch_kids`.

- Each row: checkbox, kid name, parent name, chips for plans already assigned in this session.
- Header: `Seleccionar todos` / `Deseleccionar todos`.
- Sticky toolbar: `Deporte ▾` `Plan ▾` `[Asignar a seleccionados]`. Plan dropdown is filtered by the chosen sport.
- After assignment, chips appear on each affected row, the toolbar resets, and selection clears so the admin can pick the next subset.
- `Terminar` button always available — admin can leave kids unassigned.

Plan assignment uses the existing `enrollments.insert` path (relies on `idx_enrollments_unique` for duplicate protection).

## Auth + invitation flow per row

For each *new* parent (status `Nuevo`):

1. Server action (service role) calls `supabase.auth.admin.createUser({ email, email_confirm: false })` to create an auth user with no password.
2. `INSERT INTO profiles` with that user's id and the normalized imported fields. `date_of_birth` may be NULL.
3. `INSERT INTO club_parents (club_id, parent_id)` to associate them with this club.
4. `INSERT INTO invitations` with `status='pending'`, `email` set, no phone yet.
5. Send the existing invitation email; link points to `/invite/[token]`. Because the profile already exists, the existing invitation page detects the established profile and routes the parent to a "set password" form instead of full registration.

For *existing* parents (`Reutilizar parent`): skip steps 1–4. Upsert `club_parents` with `{ ignoreDuplicates: true }` so the row is INSERT-only and never trips the missing UPDATE policy. Do not send a fresh invitation if they already have an account on this club.

WhatsApp extensibility: the invitation send function takes a `channels: ('email' | 'whatsapp')[]` parameter; today only `email` is implemented but the call site already passes the array, so adding WhatsApp later is a one-place change.

## Data model changes

```
ALTER TABLE profiles ALTER COLUMN date_of_birth DROP NOT NULL;

CREATE TABLE import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed'
  rows_total INT NOT NULL DEFAULT 0,
  rows_imported INT NOT NULL DEFAULT 0,
  rows_skipped INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE import_batch_kids (
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  kid_id UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, kid_id)
);
```

RLS:
- `import_batches` and `import_batch_kids`: club admins of the batch's `club_id` may SELECT/INSERT/UPDATE; super admins bypass; parents have no access.

No changes to `kids`, `club_parents`, `invitations`, `enrollments`.

## Server actions / surface area

- `parseImportFile(file: File) → ParsedRow[]` — uses `xlsx` (handles both CSV and XLSX).
- `validateImportRows(clubId, rows) → ValidatedRow[]` — applies normalization, file-level dedup, DB lookups; returns rows tagged with status + errors.
- `commitImportBatch(clubId, validatedRows) → { batchId, summary }` — runs in a single transactional path: creates `import_batches`, creates auth users + profiles + club_parents + kids + invitations, queues invitation emails, populates `import_batch_kids`. Returns counts.
- `assignPlansToKids(batchId, kidIds[], sportId, planId)` — existing enrollment insert path; updates the batch's chip data.
- `finishImportBatch(batchId)` — flips `status` to `completed`.

All server actions verify the caller is an admin of the target club.

## Error handling

- File parse failure (corrupt, missing required columns) → upload rejected with a clear message naming the missing column.
- Per-row validation errors → preview shows them; admin chooses to skip errors or fix the file and re-upload.
- Commit-time race (two admins importing the same RUT) → that row fails, the batch counts it as skipped, admin sees a final summary card.
- `auth.admin.createUser` failure (email collision) → row skipped with reason surfaced in the summary.
- Email send failure → row still imported (data is the source of truth); the failed notification is logged in `notifications` and visible in the existing notifications log.

## Testing

- **Unit:**
  - Parser: every accepted RUT and DOB format, name normalization, email/phone normalization, malformed rows.
  - Validator: required fields, file-level dedup, DB-level dedup, kid-belongs-to-different-parent guard, ambiguous email match.
- **Server action:**
  - Commit path with mocked Supabase: new parent + new kid, existing parent + new kid, existing kid same parent (no-op), existing kid different parent (error), partial commit on per-row failure.
  - Idempotency: running the same validated batch twice produces no new rows.
- **Manual smoke:**
  - Upload sample → preview → commit → bulk-assign one plan to "select all" → verify Deportistas page shows imported kids with that plan and `total mensual`.

## Out of scope / future

- WhatsApp invitation channel.
- Re-using an `import_batches` row for partial re-imports (currently each upload creates a new batch).
- Editing imported rows from the preview screen (today the admin re-uploads).
- Importing discounts and custom billing settings.
