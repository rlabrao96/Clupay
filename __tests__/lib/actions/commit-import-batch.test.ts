import { commitImportBatchInternal } from "@/lib/actions/commit-import-batch";
import type { ValidatedRow } from "@/lib/import/types";

function vrow(over: Partial<ValidatedRow> = {}): ValidatedRow {
  return {
    rowNumber: 2,
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
      rut: "1000005-k",
      date_of_birth: "2015-03-21",
    },
    ...over,
  };
}

function makeStubClient(opts: { failProfilesInsert?: boolean } = {}) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];
  const inserts: Record<string, { id: string; token?: string }> = {
    import_batches: { id: "batch-1" },
    profiles: { id: "p-new" },
    kids: { id: "k-new" },
    invitations: { id: "inv-1", token: "tok-1" },
    import_batch_kids: { id: "bk-1" },
  };

  const auth = {
    admin: {
      createUser: jest.fn(async () => ({
        data: { user: { id: "auth-new" } },
        error: null,
      })),
      deleteUser: jest.fn(async () => ({ data: null, error: null })),
    },
  };

  function chain(table: string) {
    return {
      insert: (payload: unknown) => {
        calls.push({ table, op: "insert", payload });

        const shouldFail = opts.failProfilesInsert && table === "profiles";
        const resolvedData = shouldFail ? null : inserts[table];
        const resolvedError = shouldFail ? { message: "boom" } : null;

        return {
          select: () => ({
            single: () =>
              Promise.resolve({ data: resolvedData, error: resolvedError }),
          }),
          // also support insert without .select (e.g. import_batch_kids)
          then: undefined as unknown,
          ...Promise.resolve({ data: resolvedData, error: resolvedError }),
        };
      },
      select: (_cols?: string) => ({
        eq: (_col: string, _val: unknown) => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          single: () =>
            Promise.resolve({ data: inserts[table] ?? null, error: null }),
        }),
      }),
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
      delete: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
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

  it("rolls back the auth user when the profiles insert fails", async () => {
    const { client, auth } = makeStubClient({ failProfilesInsert: true });
    const result = await commitImportBatchInternal({
      serviceClient: client,
      clubId: "club-1",
      adminProfileId: "admin-1",
      rows: [vrow()],
      sendInvitation: jest.fn(),
    });
    expect(auth.admin.createUser).toHaveBeenCalled();
    expect(auth.admin.deleteUser).toHaveBeenCalledWith("auth-new");
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
