# Deportistas Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CSV/XLSX roster import for the club admin portal that creates parents (with auto-emailed invitations) and kids in one shot, then routes the admin to a bulk plan-assignment screen.

**Architecture:** Two-stage server-action flow backed by an `import_batches` table. Stage 1 parses → normalizes → validates rows, then commits non-error rows in a single server action that uses the Supabase service-role client to create auth users, profiles, club_parents, kids, and invitations atomically. Stage 2 reads the batch's kids and assigns plans in bulk via the existing enrollments path. The parser handles Chilean RUT and date variants by normalizing every input before validation; existing helpers in `src/lib/rut/validate.ts` are reused and extended.

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase (service-role admin API for auth user creation) · `xlsx` package for spreadsheet parsing · Jest for unit tests · Tailwind CSS v4 for the UI.

---

## File Structure

**Created:**
- `supabase/migrations/00033_make_profiles_dob_nullable.sql` — relaxes `profiles.date_of_birth` NOT NULL
- `supabase/migrations/00034_create_import_batches.sql` — `import_batches` + `import_batch_kids` tables + RLS
- `src/lib/import/normalize.ts` — RUT/DOB/name/email/phone normalization
- `src/lib/import/parse.ts` — `parseImportFile(file: ArrayBuffer | string, ext: 'csv' | 'xlsx'): ParsedRow[]`
- `src/lib/import/validate.ts` — `validateImportRows(serviceClient, clubId, rows): Promise<ValidatedRow[]>`
- `src/lib/import/types.ts` — shared types (`ParsedRow`, `ValidatedRow`, `RowStatus`)
- `src/lib/actions/commit-import-batch.ts` — server action: creates auth users + profiles + club_parents + kids + invitations + batch
- `src/lib/actions/assign-plans-to-kids.ts` — server action: bulk-insert enrollments for a subset of batch kids
- `src/lib/actions/finish-import-batch.ts` — server action: marks batch completed
- `src/app/(club)/club/deportistas/importar/page.tsx` — Stage 1 server page
- `src/app/(club)/club/deportistas/importar/import-client.tsx` — Stage 1 client (upload + preview)
- `src/app/(club)/club/deportistas/importar/[batchId]/asignar/page.tsx` — Stage 2 server page
- `src/app/(club)/club/deportistas/importar/[batchId]/asignar/asignar-client.tsx` — Stage 2 client (bulk assign)
- `__tests__/lib/import/normalize.test.ts`
- `__tests__/lib/import/parse.test.ts`
- `__tests__/lib/import/validate.test.ts`
- `__tests__/lib/actions/commit-import-batch.test.ts`

**Modified:**
- `package.json` — add `xlsx` dependency
- `src/lib/rut/validate.ts` — add `canonicalRut()` (returns `<body>-<digit>` with lowercase `k`)
- `src/app/(club)/club/deportistas/page.tsx` — add "Importar deportistas" link/button
- `src/types/index.ts` — add `ImportBatch`, `ImportBatchKid` interfaces
- `README.md` — append a one-liner about the import feature in the Club Admin portal section
- `NEXT-STEPS.md` — move "bulk import" out of pending

**Reused (no changes):**
- `src/lib/rut/validate.ts` (`cleanRut`, `validateRut`, `formatRut`)
- `src/lib/email/templates.ts` (`invitationEmail`)
- `src/lib/email/send-notification.ts`
- `src/lib/supabase/service.ts` (`createServiceRoleClient`)
- `src/lib/club.ts` (`getClubForUser`)

---

## Task 1: Install xlsx and add migrations

**Files:**
- Modify: `package.json`
- Create: `supabase/migrations/00033_make_profiles_dob_nullable.sql`
- Create: `supabase/migrations/00034_create_import_batches.sql`

- [ ] **Step 1: Install xlsx**

Run: `npm install xlsx`

Expected: `xlsx` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Create profiles DOB migration**

Write `supabase/migrations/00033_make_profiles_dob_nullable.sql`:

```sql
ALTER TABLE profiles ALTER COLUMN date_of_birth DROP NOT NULL;
```

- [ ] **Step 3: Create import_batches migration**

Write `supabase/migrations/00034_create_import_batches.sql`:

```sql
CREATE TYPE import_batch_status AS ENUM ('pending', 'completed');

CREATE TABLE import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  status import_batch_status NOT NULL DEFAULT 'pending',
  rows_total INT NOT NULL DEFAULT 0,
  rows_imported INT NOT NULL DEFAULT 0,
  rows_skipped INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_import_batches_club_id ON import_batches(club_id);

CREATE TABLE import_batch_kids (
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  kid_id UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, kid_id)
);

CREATE INDEX idx_import_batch_kids_kid_id ON import_batch_kids(kid_id);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batch_kids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_admin_import_batches_all" ON import_batches
  FOR ALL USING (is_club_admin(club_id));

CREATE POLICY "super_admin_import_batches_all" ON import_batches
  FOR ALL USING (is_super_admin());

CREATE POLICY "club_admin_import_batch_kids_all" ON import_batch_kids
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM import_batches ib
      WHERE ib.id = batch_id AND is_club_admin(ib.club_id)
    )
  );

CREATE POLICY "super_admin_import_batch_kids_all" ON import_batch_kids
  FOR ALL USING (is_super_admin());
```

- [ ] **Step 4: Apply migrations to local Supabase**

Run: `npx supabase db reset` (if using local) OR run the two SQL files in the Supabase dashboard SQL editor against the cloud project.

Expected: both tables exist; `\d profiles` shows `date_of_birth` is nullable.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json supabase/migrations/00033_make_profiles_dob_nullable.sql supabase/migrations/00034_create_import_batches.sql
git commit -m "feat(import): add xlsx dep + import_batches schema + relax profiles DOB"
```

---

## Task 2: Add `canonicalRut` helper

**Files:**
- Modify: `src/lib/rut/validate.ts`
- Test: `__tests__/lib/rut/validate.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `__tests__/lib/rut/validate.test.ts`:

```typescript
import { canonicalRut } from "@/lib/rut/validate";

describe("canonicalRut", () => {
  it("formats a numeric RUT as <body>-<digit>", () => {
    expect(canonicalRut("12345678-5")).toBe("12345678-5");
  });
  it("strips dots and normalizes to body-digit", () => {
    expect(canonicalRut("12.345.678-5")).toBe("12345678-5");
  });
  it("lowercases the K verifier", () => {
    expect(canonicalRut("7.000.013-K")).toBe("7000013-k");
  });
  it("accepts input without separators", () => {
    expect(canonicalRut("70000131")).toBe("7000013-1");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx jest __tests__/lib/rut/validate.test.ts`
Expected: 4 failures with `canonicalRut is not a function`.

- [ ] **Step 3: Implement `canonicalRut`**

Append to `src/lib/rut/validate.ts`:

```typescript
export function canonicalRut(rut: string): string {
  const cleaned = cleanRut(rut);
  if (cleaned.length < 2) return cleaned;
  const body = cleaned.slice(0, -1);
  const digit = cleaned.slice(-1).toLowerCase();
  return `${body}-${digit}`;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx jest __tests__/lib/rut/validate.test.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rut/validate.ts __tests__/lib/rut/validate.test.ts
git commit -m "feat(rut): add canonicalRut helper for storage form"
```

---

## Task 3: Implement input normalization helpers

**Files:**
- Create: `src/lib/import/normalize.ts`
- Test: `__tests__/lib/import/normalize.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/import/normalize.test.ts`:

```typescript
import {
  normalizeName,
  normalizeEmail,
  normalizePhone,
  normalizeDate,
} from "@/lib/import/normalize";

describe("normalizeName", () => {
  it("title-cases lowercase input", () => {
    expect(normalizeName("juan perez")).toBe("Juan Perez");
  });
  it("preserves accents and ñ", () => {
    expect(normalizeName("MARÍA NÚÑEZ")).toBe("María Núñez");
  });
  it("collapses repeated whitespace and trims", () => {
    expect(normalizeName("  juan   PÉREZ  ")).toBe("Juan Pérez");
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Bar.COM  ")).toBe("foo@bar.com");
  });
});

describe("normalizePhone", () => {
  it("strips spaces dots parens, keeps leading +", () => {
    expect(normalizePhone("+56 9 1234.5678")).toBe("+56912345678");
    expect(normalizePhone("(02) 234-5678")).toBe("02234-5678");
  });
  it("returns empty string when input is empty", () => {
    expect(normalizePhone("")).toBe("");
  });
});

describe("normalizeDate", () => {
  it("parses ISO YYYY-MM-DD", () => {
    expect(normalizeDate("2015-03-21")).toBe("2015-03-21");
  });
  it("parses Chilean DD/MM/YYYY", () => {
    expect(normalizeDate("21/03/2015")).toBe("2015-03-21");
  });
  it("parses DD-MM-YYYY", () => {
    expect(normalizeDate("21-03-2015")).toBe("2015-03-21");
  });
  it("parses D/M/YY assuming 19xx for >= 50, 20xx for < 50", () => {
    expect(normalizeDate("3/2/15")).toBe("2015-02-03");
    expect(normalizeDate("3/2/85")).toBe("1985-02-03");
  });
  it("parses Excel date serial numbers", () => {
    // 42005 = 2015-01-01 in Excel's 1900-based serial system
    expect(normalizeDate(42005)).toBe("2015-01-01");
  });
  it("returns null for unparseable input", () => {
    expect(normalizeDate("not a date")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx jest __tests__/lib/import/normalize.test.ts`
Expected: import error (module doesn't exist yet).

- [ ] **Step 3: Implement normalize helpers**

Create `src/lib/import/normalize.ts`:

```typescript
export function normalizeName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function normalizePhone(input: string): string {
  if (!input) return "";
  return input.replace(/[\s.()]/g, "");
}

export function normalizeDate(input: string | number): string | null {
  if (input === "" || input === null || input === undefined) return null;

  // Excel serial date number (days since 1900-01-01, with the well-known Excel leap-year bug)
  if (typeof input === "number" && Number.isFinite(input)) {
    const excelEpoch = Date.UTC(1899, 11, 30); // 1899-12-30 accounts for the bug
    const ms = excelEpoch + input * 86400000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return formatYMD(d);
  }

  const s = String(input).trim();
  if (!s) return null;

  // ISO YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return safeYMD(+m[1], +m[2], +m[3]);

  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return safeYMD(+m[3], +m[2], +m[1]);

  // D/M/YY → 2-digit year (cutoff 50)
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m) {
    const yy = +m[3];
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return safeYMD(year, +m[2], +m[1]);
  }

  return null;
}

function safeYMD(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return formatYMD(dt);
}

function formatYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx jest __tests__/lib/import/normalize.test.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/normalize.ts __tests__/lib/import/normalize.test.ts
git commit -m "feat(import): RUT/date/name/email/phone input normalizers"
```

---

## Task 4: Implement spreadsheet parser

**Files:**
- Create: `src/lib/import/types.ts`
- Create: `src/lib/import/parse.ts`
- Test: `__tests__/lib/import/parse.test.ts`

- [ ] **Step 1: Write the types**

Create `src/lib/import/types.ts`:

```typescript
export interface ParsedRow {
  rowNumber: number; // 1-based, excluding header
  parent_name: string;
  parent_last_names: string;
  parent_rut: string;
  parent_email: string;
  parent_phone: string;
  parent_date_of_birth: string | number | null;
  kid_name: string;
  kid_last_names: string;
  kid_rut: string;
  kid_date_of_birth: string | number | null;
}

export type RowStatus =
  | "new"
  | "reuse_parent"
  | "no_change"
  | "error";

export interface ValidatedRow {
  rowNumber: number;
  status: RowStatus;
  errors: string[];
  // Normalized values
  parent: {
    name: string;
    last_names: string;
    rut: string; // canonical
    email: string;
    phone: string;
    date_of_birth: string | null;
    existingProfileId?: string;
  };
  kid: {
    name: string;
    last_names: string;
    rut: string; // canonical
    date_of_birth: string;
    existingKidId?: string;
  };
}
```

- [ ] **Step 2: Write failing parser tests**

Create `__tests__/lib/import/parse.test.ts`:

```typescript
import * as XLSX from "xlsx";
import { parseImportFile, REQUIRED_COLUMNS } from "@/lib/import/parse";

function buildXlsx(rows: Record<string, string | number>[]): ArrayBuffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("parseImportFile", () => {
  it("parses an xlsx with all columns", () => {
    const buf = buildXlsx([
      {
        parent_name: "juan",
        parent_last_names: "perez",
        parent_rut: "12.345.678-5",
        parent_email: "j@p.com",
        parent_phone: "+56912345678",
        parent_date_of_birth: "1985-01-01",
        kid_name: "pedro",
        kid_last_names: "perez",
        kid_rut: "23.456.789-K",
        kid_date_of_birth: "2015-03-21",
      },
    ]);
    const rows = parseImportFile(buf, "xlsx");
    expect(rows).toHaveLength(1);
    expect(rows[0].rowNumber).toBe(1);
    expect(rows[0].parent_rut).toBe("12.345.678-5");
    expect(rows[0].kid_name).toBe("pedro");
  });

  it("parses a CSV string", () => {
    const csv =
      `${REQUIRED_COLUMNS.join(",")}\n` +
      `juan,perez,12.345.678-5,j@p.com,,,pedro,perez,23.456.789-K,2015-03-21`;
    const rows = parseImportFile(csv, "csv");
    expect(rows).toHaveLength(1);
    expect(rows[0].kid_rut).toBe("23.456.789-K");
  });

  it("throws when a required column is missing", () => {
    const buf = buildXlsx([
      { parent_name: "x", parent_last_names: "y" }, // missing most
    ]);
    expect(() => parseImportFile(buf, "xlsx")).toThrow(/columna/i);
  });

  it("returns empty optional fields as empty string", () => {
    const buf = buildXlsx([
      {
        parent_name: "a",
        parent_last_names: "b",
        parent_rut: "1-9",
        parent_email: "a@b.com",
        kid_name: "c",
        kid_last_names: "d",
        kid_rut: "2-7",
        kid_date_of_birth: "2015-01-01",
      },
    ]);
    const rows = parseImportFile(buf, "xlsx");
    expect(rows[0].parent_phone).toBe("");
    expect(rows[0].parent_date_of_birth).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npx jest __tests__/lib/import/parse.test.ts`
Expected: import error (module doesn't exist).

- [ ] **Step 4: Implement parser**

Create `src/lib/import/parse.ts`:

```typescript
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
    rowNumber: i + 1,
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
  }));
}

function rawDateOrEmpty(v: unknown): string | number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return v;
  return String(v).trim();
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npx jest __tests__/lib/import/parse.test.ts`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/types.ts src/lib/import/parse.ts __tests__/lib/import/parse.test.ts
git commit -m "feat(import): xlsx/csv parser with required-column check"
```

---

## Task 5: Implement row validator

**Files:**
- Create: `src/lib/import/validate.ts`
- Test: `__tests__/lib/import/validate.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/import/validate.test.ts`:

```typescript
import { validateImportRows } from "@/lib/import/validate";
import type { ParsedRow } from "@/lib/import/types";

function row(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    rowNumber: 1,
    parent_name: "juan",
    parent_last_names: "perez",
    parent_rut: "12.345.678-5",
    parent_email: "juan@example.com",
    parent_phone: "",
    parent_date_of_birth: null,
    kid_name: "pedro",
    kid_last_names: "perez",
    kid_rut: "23.456.789-K",
    kid_date_of_birth: "2015-03-21",
    ...overrides,
  };
}

function fakeClient(opts: {
  parents?: { id: string; rut: string }[];
  kids?: { id: string; rut: string; parent_id: string }[];
} = {}) {
  return {
    from(table: string) {
      const data =
        table === "profiles"
          ? (opts.parents ?? []).map((p) => ({ id: p.id, rut: p.rut }))
          : (opts.kids ?? []).map((k) => ({
              id: k.id,
              rut: k.rut,
              parent_id: k.parent_id,
            }));
      return {
        select: () => ({
          in: (_col: string, vals: string[]) => ({
            then: undefined,
            // jest doesn't like thenables; emulate Supabase await pattern via Promise
            ...Promise.resolve({
              data: data.filter((d) => vals.includes(d.rut)),
              error: null,
            }),
          }),
        }),
      };
    },
  } as never;
}

describe("validateImportRows", () => {
  it("flags new rows when nothing exists in DB", async () => {
    const out = await validateImportRows(fakeClient(), "club-1", [row()]);
    expect(out[0].status).toBe("new");
    expect(out[0].parent.rut).toBe("12345678-5");
    expect(out[0].kid.rut).toBe("23456789-k");
  });

  it("rejects an invalid kid RUT", async () => {
    const out = await validateImportRows(fakeClient(), "club-1", [
      row({ kid_rut: "11111111-1" }),
    ]);
    expect(out[0].status).toBe("error");
    expect(out[0].errors.join(" ")).toMatch(/RUT del hijo/);
  });

  it("rejects a missing required field", async () => {
    const out = await validateImportRows(fakeClient(), "club-1", [
      row({ parent_email: "" }),
    ]);
    expect(out[0].status).toBe("error");
  });

  it("flags duplicate kid RUT within the file", async () => {
    const a = row({ rowNumber: 1 });
    const b = row({ rowNumber: 2, kid_rut: "23456789-K" });
    const out = await validateImportRows(fakeClient(), "club-1", [a, b]);
    expect(out[1].status).toBe("error");
    expect(out[1].errors.join(" ")).toMatch(/duplicado/i);
  });

  it("marks reuse_parent when parent RUT already exists", async () => {
    const out = await validateImportRows(
      fakeClient({ parents: [{ id: "p1", rut: "12345678-5" }] }),
      "club-1",
      [row()]
    );
    expect(out[0].status).toBe("reuse_parent");
    expect(out[0].parent.existingProfileId).toBe("p1");
  });

  it("marks no_change when kid exists for same parent", async () => {
    const out = await validateImportRows(
      fakeClient({
        parents: [{ id: "p1", rut: "12345678-5" }],
        kids: [{ id: "k1", rut: "23456789-k", parent_id: "p1" }],
      }),
      "club-1",
      [row()]
    );
    expect(out[0].status).toBe("no_change");
  });

  it("errors when kid RUT belongs to a different parent", async () => {
    const out = await validateImportRows(
      fakeClient({
        parents: [{ id: "p1", rut: "12345678-5" }],
        kids: [{ id: "k1", rut: "23456789-k", parent_id: "p2" }],
      }),
      "club-1",
      [row()]
    );
    expect(out[0].status).toBe("error");
    expect(out[0].errors.join(" ")).toMatch(/otro apoderado/i);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npx jest __tests__/lib/import/validate.test.ts`
Expected: import error (module doesn't exist).

- [ ] **Step 3: Implement validator**

Create `src/lib/import/validate.ts`:

```typescript
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
```

- [ ] **Step 4: Adjust the test fakeClient if needed**

The fake client in the test uses a non-standard pattern. Replace the `fakeClient` helper with one that returns proper thenables for both `from(...).select(...).in(...)` calls:

```typescript
function fakeClient(opts: {
  parents?: { id: string; rut: string }[];
  kids?: { id: string; rut: string; parent_id: string }[];
} = {}) {
  return {
    from(table: string) {
      const data =
        table === "profiles"
          ? (opts.parents ?? [])
          : (opts.kids ?? []);
      return {
        select: () => ({
          in: (_col: string, vals: string[]) =>
            Promise.resolve({
              data: (data as { rut: string }[]).filter((d) =>
                vals.includes(d.rut)
              ),
              error: null,
            }),
        }),
      };
    },
  } as never;
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npx jest __tests__/lib/import/validate.test.ts`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/validate.ts __tests__/lib/import/validate.test.ts
git commit -m "feat(import): row validator with file + DB dedup and per-field rules"
```

---

## Task 6: Implement `commitImportBatch` server action

**Files:**
- Create: `src/lib/actions/commit-import-batch.ts`
- Test: `__tests__/lib/actions/commit-import-batch.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/actions/commit-import-batch.test.ts`:

```typescript
import { commitImportBatchInternal } from "@/lib/actions/commit-import-batch";
import type { ValidatedRow } from "@/lib/import/types";

function vrow(over: Partial<ValidatedRow> = {}): ValidatedRow {
  return {
    rowNumber: 1,
    status: "new",
    errors: [],
    parent: {
      name: "Juan",
      last_names: "Perez",
      rut: "12345678-5",
      email: "j@p.com",
      phone: "",
      date_of_birth: null,
    },
    kid: {
      name: "Pedro",
      last_names: "Perez",
      rut: "23456789-k",
      date_of_birth: "2015-03-21",
    },
    ...over,
  };
}

function makeStubClient() {
  const calls: { table: string; op: string; payload?: unknown }[] = [];
  const inserts = {
    import_batches: { id: "batch-1" },
    profiles: { id: "p-new" },
    kids: { id: "k-new" },
    invitations: { id: "inv-1", token: "tok-1" },
  } as Record<string, { id: string; token?: string }>;

  const auth = {
    admin: {
      createUser: jest.fn(async (_opts) => ({
        data: { user: { id: "auth-new" } },
        error: null,
      })),
    },
  };

  function chain(table: string) {
    return {
      insert: (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        return {
          select: () => ({
            single: () =>
              Promise.resolve({ data: inserts[table], error: null }),
          }),
        };
      },
      upsert: (payload: unknown) => {
        calls.push({ table, op: "upsert", payload });
        return Promise.resolve({ error: null });
      },
      update: (payload: unknown) => {
        calls.push({ table, op: "update", payload });
        return {
          eq: () => Promise.resolve({ error: null }),
        };
      },
    };
  }

  const client = { from: (t: string) => chain(t), auth } as never;
  return { client, calls, auth };
}

describe("commitImportBatchInternal", () => {
  it("creates batch + auth user + profile + club_parents + kid + invitation for a 'new' row", async () => {
    const { client, calls, auth } = makeStubClient();
    const sendInvitation = jest.fn().mockResolvedValue(undefined);

    const result = await commitImportBatchInternal({
      serviceClient: client,
      clubId: "club-1",
      adminProfileId: "admin-1",
      rows: [vrow()],
      sendInvitation,
    });

    expect(result.batchId).toBe("batch-1");
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(auth.admin.createUser).toHaveBeenCalledWith({
      email: "j@p.com",
      email_confirm: false,
    });
    expect(calls.find((c) => c.table === "profiles" && c.op === "insert"))
      .toBeDefined();
    expect(calls.find((c) => c.table === "club_parents" && c.op === "upsert"))
      .toBeDefined();
    expect(calls.find((c) => c.table === "kids" && c.op === "insert")).toBeDefined();
    expect(calls.find((c) => c.table === "invitations" && c.op === "insert"))
      .toBeDefined();
    expect(sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ email: "j@p.com", token: "tok-1" })
    );
  });

  it("skips error rows", async () => {
    const { client } = makeStubClient();
    const result = await commitImportBatchInternal({
      serviceClient: client,
      clubId: "club-1",
      adminProfileId: "admin-1",
      rows: [vrow({ status: "error", errors: ["bad"] })],
      sendInvitation: jest.fn(),
    });
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("for reuse_parent, skips auth+profile creation but inserts kid", async () => {
    const { client, calls, auth } = makeStubClient();
    const result = await commitImportBatchInternal({
      serviceClient: client,
      clubId: "club-1",
      adminProfileId: "admin-1",
      rows: [
        vrow({
          status: "reuse_parent",
          parent: { ...vrow().parent, existingProfileId: "p-existing" },
        }),
      ],
      sendInvitation: jest.fn(),
    });
    expect(auth.admin.createUser).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === "profiles")).toBeUndefined();
    expect(calls.find((c) => c.table === "kids" && c.op === "insert")).toBeDefined();
    expect(result.imported).toBe(1);
  });

  it("for no_change, does not insert a kid", async () => {
    const { client, calls } = makeStubClient();
    const result = await commitImportBatchInternal({
      serviceClient: client,
      clubId: "club-1",
      adminProfileId: "admin-1",
      rows: [
        vrow({
          status: "no_change",
          kid: { ...vrow().kid, existingKidId: "k-existing" },
          parent: { ...vrow().parent, existingProfileId: "p-existing" },
        }),
      ],
      sendInvitation: jest.fn(),
    });
    expect(calls.find((c) => c.table === "kids" && c.op === "insert")).toBeUndefined();
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npx jest __tests__/lib/actions/commit-import-batch.test.ts`
Expected: import error.

- [ ] **Step 3: Implement the server action**

Create `src/lib/actions/commit-import-batch.ts`:

```typescript
"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { invitationEmail } from "@/lib/email/templates";
import { sendNotification } from "@/lib/email/send-notification";
import type { ValidatedRow } from "@/lib/import/types";

export interface CommitResult {
  batchId: string;
  imported: number;
  skipped: number;
}

export async function commitImportBatch(
  clubId: string,
  rows: ValidatedRow[]
): Promise<CommitResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada");

  // Authz: confirm caller is admin of clubId
  const { data: admin } = await supabase
    .from("club_admins")
    .select("club_id")
    .eq("profile_id", user.id)
    .eq("club_id", clubId)
    .single();
  if (!admin) throw new Error("No autorizado para este club");

  const serviceClient = createServiceRoleClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { data: club } = await serviceClient
    .from("clubs")
    .select("name")
    .eq("id", clubId)
    .single();
  const clubName = club?.name ?? "Tu club";

  return commitImportBatchInternal({
    serviceClient,
    clubId,
    adminProfileId: user.id,
    rows,
    sendInvitation: async ({ email, token, parentProfileId }) => {
      const { subject, html } = invitationEmail(clubName, token, baseUrl);
      await sendNotification({
        supabase: serviceClient,
        parentId: parentProfileId,
        clubId,
        email,
        type: "invitation",
        subject,
        html,
        metadata: {},
      });
    },
  });
}

interface InternalArgs {
  serviceClient: SupabaseClient;
  clubId: string;
  adminProfileId: string;
  rows: ValidatedRow[];
  sendInvitation: (args: {
    email: string;
    token: string;
    parentProfileId: string;
  }) => Promise<void>;
}

export async function commitImportBatchInternal({
  serviceClient,
  clubId,
  adminProfileId,
  rows,
  sendInvitation,
}: InternalArgs): Promise<CommitResult> {
  const eligible = rows.filter(
    (r) => r.status === "new" || r.status === "reuse_parent"
  );

  // Create batch
  const { data: batch } = await serviceClient
    .from("import_batches")
    .insert({
      club_id: clubId,
      created_by: adminProfileId,
      rows_total: rows.length,
    })
    .select("id")
    .single();
  const batchId = (batch as { id: string }).id;

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.status === "error" || row.status === "no_change") {
      skipped++;
      continue;
    }

    let parentProfileId = row.parent.existingProfileId ?? null;

    // 1) Create auth user + profile if "new"
    if (row.status === "new") {
      const { data: authRes, error: authErr } =
        await serviceClient.auth.admin.createUser({
          email: row.parent.email,
          email_confirm: false,
        });
      if (authErr || !authRes?.user) {
        skipped++;
        continue;
      }
      const authUserId = authRes.user.id;

      const { data: profile, error: profErr } = await serviceClient
        .from("profiles")
        .insert({
          id: authUserId,
          name: row.parent.name,
          last_names: row.parent.last_names,
          rut: row.parent.rut,
          email: row.parent.email,
          phone: row.parent.phone || null,
          date_of_birth: row.parent.date_of_birth,
          role: "parent",
        })
        .select("id")
        .single();
      if (profErr || !profile) {
        skipped++;
        continue;
      }
      parentProfileId = (profile as { id: string }).id;
    }

    if (!parentProfileId) {
      skipped++;
      continue;
    }

    // 2) club_parents (idempotent)
    await serviceClient
      .from("club_parents")
      .upsert(
        { club_id: clubId, parent_id: parentProfileId },
        { onConflict: "club_id,parent_id", ignoreDuplicates: true }
      );

    // 3) Insert kid
    const { data: kid, error: kidErr } = await serviceClient
      .from("kids")
      .insert({
        parent_id: parentProfileId,
        name: row.kid.name,
        last_names: row.kid.last_names,
        rut: row.kid.rut,
        date_of_birth: row.kid.date_of_birth,
      })
      .select("id")
      .single();
    if (kidErr || !kid) {
      skipped++;
      continue;
    }
    const kidId = (kid as { id: string }).id;

    await serviceClient
      .from("import_batch_kids")
      .insert({ batch_id: batchId, kid_id: kidId });

    // 4) Invitation only for newly created parents
    if (row.status === "new") {
      const { data: inv } = await serviceClient
        .from("invitations")
        .insert({
          club_id: clubId,
          invited_by: adminProfileId,
          email: row.parent.email,
        })
        .select("id, token")
        .single();
      const token = (inv as { token: string } | null)?.token;
      if (token) {
        try {
          await sendInvitation({
            email: row.parent.email,
            token,
            parentProfileId,
          });
        } catch {
          // email failure does not roll back the import; logged in notifications
        }
      }
    }

    imported++;
  }

  await serviceClient
    .from("import_batches")
    .update({
      rows_imported: imported,
      rows_skipped: skipped,
    })
    .eq("id", batchId);

  return { batchId, imported, skipped };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx jest __tests__/lib/actions/commit-import-batch.test.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/commit-import-batch.ts __tests__/lib/actions/commit-import-batch.test.ts
git commit -m "feat(import): commit-import-batch server action"
```

---

## Task 7: Stage 1 UI — upload + preview

**Files:**
- Create: `src/app/(club)/club/deportistas/importar/page.tsx`
- Create: `src/app/(club)/club/deportistas/importar/import-client.tsx`

- [ ] **Step 1: Server page**

Create `src/app/(club)/club/deportistas/importar/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { ImportClient } from "./import-client";

export default async function ImportarPage() {
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) redirect("/login");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text mb-1">Importar deportistas</h1>
        <p className="text-text-secondary text-sm">
          Sube un archivo Excel o CSV con apoderados e hijos.
        </p>
      </div>
      <ImportClient clubId={clubId} />
    </div>
  );
}
```

- [ ] **Step 2: Server action wrapper for parsing+validating in the client**

Add a small server-callable wrapper at the top of `import-client.tsx`. Since parsing happens in the browser (we have `xlsx` loaded), only validation needs the server. Add a server action file:

Create `src/lib/actions/validate-import-rows.ts`:

```typescript
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { ParsedRow, ValidatedRow } from "@/lib/import/types";
import { validateImportRows } from "@/lib/import/validate";

export async function validateImportRowsAction(
  clubId: string,
  rows: ParsedRow[]
): Promise<ValidatedRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada");
  const { data: admin } = await supabase
    .from("club_admins")
    .select("club_id")
    .eq("profile_id", user.id)
    .eq("club_id", clubId)
    .single();
  if (!admin) throw new Error("No autorizado");

  const service = createServiceRoleClient();
  return validateImportRows(service, clubId, rows);
}
```

- [ ] **Step 3: Client component**

Create `src/app/(club)/club/deportistas/importar/import-client.tsx`:

```typescript
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
                    {r.kid.name} {r.kid.last_names} <span className="text-text-secondary">{r.kid.rut}</span>
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
```

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. Visit `http://localhost:3000/club/deportistas/importar` (logged in as a club admin). Upload a small XLSX with one good row and one bad row. Expect: preview table renders with the right badges; "Confirmar importación" button enables.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(club)/club/deportistas/importar/page.tsx" \
        "src/app/(club)/club/deportistas/importar/import-client.tsx" \
        src/lib/actions/validate-import-rows.ts
git commit -m "feat(import): stage 1 upload + preview UI"
```

---

## Task 8: Plan-assignment server actions

**Files:**
- Create: `src/lib/actions/assign-plans-to-kids.ts`
- Create: `src/lib/actions/finish-import-batch.ts`

- [ ] **Step 1: Implement `assignPlansToKids`**

Create `src/lib/actions/assign-plans-to-kids.ts`:

```typescript
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

interface AssignArgs {
  batchId: string;
  kidIds: string[];
  sportId: string;
  planId: string;
}

export async function assignPlansToKids({
  batchId,
  kidIds,
  sportId,
  planId,
}: AssignArgs): Promise<{ created: number; skipped: number }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada");

  const service = createServiceRoleClient();

  // Authz: caller is admin of the batch's club
  const { data: batch } = await service
    .from("import_batches")
    .select("club_id")
    .eq("id", batchId)
    .single();
  if (!batch) throw new Error("Batch no encontrado");

  const { data: admin } = await supabase
    .from("club_admins")
    .select("club_id")
    .eq("profile_id", user.id)
    .eq("club_id", (batch as { club_id: string }).club_id)
    .single();
  if (!admin) throw new Error("No autorizado");

  const clubId = (batch as { club_id: string }).club_id;

  let created = 0;
  let skipped = 0;
  for (const kidId of kidIds) {
    const { error } = await service.from("enrollments").insert({
      kid_id: kidId,
      club_id: clubId,
      sport_id: sportId,
      plan_id: planId,
    });
    if (error) skipped++;
    else created++;
  }
  return { created, skipped };
}
```

- [ ] **Step 2: Implement `finishImportBatch`**

Create `src/lib/actions/finish-import-batch.ts`:

```typescript
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function finishImportBatch(batchId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada");
  const service = createServiceRoleClient();

  const { data: batch } = await service
    .from("import_batches")
    .select("club_id")
    .eq("id", batchId)
    .single();
  if (!batch) throw new Error("Batch no encontrado");

  const { data: admin } = await supabase
    .from("club_admins")
    .select("club_id")
    .eq("profile_id", user.id)
    .eq("club_id", (batch as { club_id: string }).club_id)
    .single();
  if (!admin) throw new Error("No autorizado");

  await service
    .from("import_batches")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/assign-plans-to-kids.ts src/lib/actions/finish-import-batch.ts
git commit -m "feat(import): stage 2 server actions (assign plans + finish batch)"
```

---

## Task 9: Stage 2 UI — bulk plan assignment

**Files:**
- Create: `src/app/(club)/club/deportistas/importar/[batchId]/asignar/page.tsx`
- Create: `src/app/(club)/club/deportistas/importar/[batchId]/asignar/asignar-client.tsx`

- [ ] **Step 1: Server page**

Create `src/app/(club)/club/deportistas/importar/[batchId]/asignar/page.tsx`:

```typescript
import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { AsignarClient } from "./asignar-client";
import type { Sport, Plan } from "@/types";

export default async function AsignarPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) redirect("/login");

  const { data: batch } = await supabase
    .from("import_batches")
    .select("id, club_id")
    .eq("id", batchId)
    .single();
  if (!batch || batch.club_id !== clubId) notFound();

  const { data: kidRows } = await supabase
    .from("import_batch_kids")
    .select("kid_id, kids:kid_id(id, name, last_names, parent_id, profiles:parent_id(name, last_names))")
    .eq("batch_id", batchId);

  const kids = (kidRows ?? []).map((r: any) => ({
    id: r.kids.id,
    name: `${r.kids.name} ${r.kids.last_names}`,
    parentName: `${r.kids.profiles?.name ?? ""} ${r.kids.profiles?.last_names ?? ""}`.trim(),
  }));

  const { data: sports } = await supabase
    .from("sports")
    .select("*")
    .eq("club_id", clubId)
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
        <h1 className="text-2xl font-bold text-text mb-1">Asignar planes</h1>
        <p className="text-text-secondary text-sm">
          Selecciona los hijos y asígnales un deporte y plan en lote.
        </p>
      </div>
      <AsignarClient
        batchId={batchId}
        kids={kids}
        sports={(sports ?? []) as Sport[]}
        plans={(plans ?? []) as Plan[]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Client component**

Create `src/app/(club)/club/deportistas/importar/[batchId]/asignar/asignar-client.tsx`:

```typescript
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
            {selected.size === kids.length ? "Deseleccionar todos" : "Seleccionar todos"}
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
```

- [ ] **Step 3: Manual smoke**

Run dev server, complete a Stage 1 import, land on Stage 2. Verify: select-all toggles, sport/plan dropdowns cascade correctly, "Asignar a seleccionados" creates enrollments and chips appear, "Terminar" returns to Deportistas list with all imported kids visible.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(club)/club/deportistas/importar/[batchId]/asignar/page.tsx" \
        "src/app/(club)/club/deportistas/importar/[batchId]/asignar/asignar-client.tsx"
git commit -m "feat(import): stage 2 bulk plan assignment UI"
```

---

## Task 10: Wire up "Importar deportistas" button + types + docs

**Files:**
- Modify: `src/app/(club)/club/deportistas/page.tsx`
- Modify: `src/types/index.ts`
- Modify: `README.md`
- Modify: `NEXT-STEPS.md`

- [ ] **Step 1: Add types**

Append to `src/types/index.ts`:

```typescript
export type ImportBatchStatus = "pending" | "completed";

export interface ImportBatch {
  id: string;
  club_id: string;
  created_by: string;
  status: ImportBatchStatus;
  rows_total: number;
  rows_imported: number;
  rows_skipped: number;
  created_at: string;
  completed_at: string | null;
}
```

- [ ] **Step 2: Add header button on Deportistas page**

In `src/app/(club)/club/deportistas/page.tsx`, just below the existing `<h1>` header, add a Link to `/club/deportistas/importar`. Locate the JSX where the title is rendered and add:

```tsx
import Link from "next/link";
// ... in JSX, replace the heading row with:
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-2xl font-bold text-text mb-1">Deportistas</h1>
    <p className="text-text-secondary text-sm">
      {`${kids.length} deportistas · ${totalEnrollments} inscripciones`}
    </p>
  </div>
  <Link
    href="/club/deportistas/importar"
    className="px-4 py-2 rounded-lg bg-primary text-white text-sm"
  >
    Importar deportistas
  </Link>
</div>
```

(Adjust variable names — `kids`/`totalEnrollments` — to whatever the file already uses; do not duplicate the count text.)

- [ ] **Step 3: Update README**

In `README.md`, in the "Club Admin Portal" paragraph, add this sentence at the end: "Bulk import of athletes from CSV/XLSX with auto-emailed parent invitations and a follow-up bulk plan-assignment screen."

- [ ] **Step 4: Update NEXT-STEPS**

Open `NEXT-STEPS.md`. If it lists "bulk import" / "import deportistas" as a pending item, remove it or move it under a "Done" / "Recently shipped" section. If no such entry exists, leave the file untouched.

- [ ] **Step 5: Type-check + tests**

Run: `npx tsc --noEmit 2>&1 | grep -v "__tests__"`
Expected: empty output.

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts "src/app/(club)/club/deportistas/page.tsx" README.md NEXT-STEPS.md
git commit -m "feat(import): expose Importar deportistas entrypoint + docs"
```

---

## Task 11: End-to-end smoke + push

- [ ] **Step 1: Prepare a test xlsx**

Build a minimal `.xlsx` with 4 rows:
1. Valid new parent + new kid
2. Valid existing parent (RUT already in DB) + new kid
3. Row with malformed kid RUT (e.g., `"11111111-1"`)
4. Row with kid DOB in the future

Use Excel/Numbers/LibreOffice or programmatically. Save outside the repo.

- [ ] **Step 2: Run the full flow**

Run: `npm run dev`. Login as club admin. Navigate to `/club/deportistas`, click "Importar deportistas", upload the test file. Verify badges:
- Row 1 → `Nuevo`
- Row 2 → `Reutilizar parent`
- Row 3 → `Error` with RUT-inválido message
- Row 4 → `Error` with future-DOB message

Click "Confirmar importación" — expect redirect to `/club/deportistas/importar/[batchId]/asignar`. Stage 2 shows 2 kids (rows 1 and 2). Select all, choose a sport+plan, click "Asignar". Chips appear. Click "Terminar". Land on `/club/deportistas` with the imported kids visible and their assigned plan reflected in `total mensual`.

- [ ] **Step 3: Verify invitation email**

Check the inbox of the new parent's email (row 1). The invitation email should arrive with a working `/invite/<token>` link.

- [ ] **Step 4: Push**

Run:
```bash
git push
```

Expected: branch updated on origin, Vercel auto-deploys.

---

## Self-review notes

- All spec sections (template columns, normalization, validation rules, Stage 1/2 UI, auth flow, data model, error handling, testing) have at least one task implementing them.
- No placeholders or vague "add error handling" steps; concrete code in every code-changing step.
- Type/property names are consistent across tasks (`ValidatedRow.parent.existingProfileId`, `ValidatedRow.kid.existingKidId`, `RowStatus` values `new | reuse_parent | no_change | error`).
- WhatsApp extensibility is implicit in the design (single `sendInvitation` callback in the commit action). Not a separate task because the spec marked it explicitly out of scope.
