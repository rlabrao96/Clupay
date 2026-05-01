import { validateImportRows } from "@/lib/import/validate";
import type { ParsedRow } from "@/lib/import/types";

// Valid RUTs (verified against modulo-11 algorithm):
//   parent: 12.345.678-5  → canonical "12345678-5"
//   kid:    1.000.005-K   → canonical "1000005-k"
//   invalid kid: 11.111.111-2  (correct digit for 11111111 is 1, so 2 is wrong)

function row(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    rowNumber: 2,
    parent_name: "juan",
    parent_last_names: "perez",
    parent_rut: "12.345.678-5",
    parent_email: "juan@example.com",
    parent_phone: "",
    parent_date_of_birth: null,
    kid_name: "pedro",
    kid_last_names: "perez",
    kid_rut: "1.000.005-K",
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

describe("validateImportRows", () => {
  it("flags new rows when nothing exists in DB", async () => {
    const out = await validateImportRows(fakeClient(), "club-1", [row()]);
    expect(out[0].status).toBe("new");
    expect(out[0].parent.rut).toBe("12345678-5");
    expect(out[0].kid.rut).toBe("1000005-k");
  });

  it("rejects an invalid kid RUT", async () => {
    const out = await validateImportRows(fakeClient(), "club-1", [
      row({ kid_rut: "11.111.111-2" }),
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
    const a = row({ rowNumber: 2 });
    const b = row({ rowNumber: 3, kid_rut: "1.000.005-K" });
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
        kids: [{ id: "k1", rut: "1000005-k", parent_id: "p1" }],
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
        kids: [{ id: "k1", rut: "1000005-k", parent_id: "p2" }],
      }),
      "club-1",
      [row()]
    );
    expect(out[0].status).toBe("error");
    expect(out[0].errors.join(" ")).toMatch(/otro apoderado/i);
  });
});
