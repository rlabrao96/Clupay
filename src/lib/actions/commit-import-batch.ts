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
  const clubName = (club as { name: string } | null)?.name ?? "Tu club";

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
  // Create batch
  const { data: batch, error: batchErr } = await serviceClient
    .from("import_batches")
    .insert({
      club_id: clubId,
      created_by: adminProfileId,
      rows_total: rows.length,
    })
    .select("id")
    .single();
  if (batchErr || !batch) {
    throw new Error(`No se pudo crear el batch de importación: ${batchErr?.message ?? "desconocido"}`);
  }
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

      if (authErr) {
        const msg = (authErr.message ?? "").toLowerCase();
        const isExisting =
          /already.*registered|email.*exists|already.*been.*registered/.test(msg);
        if (isExisting) {
          // Look up the existing profile by email and treat as reuse_parent.
          const { data: existingByEmail } = await serviceClient
            .from("profiles")
            .select("id")
            .eq("email", row.parent.email)
            .maybeSingle();
          const existingId = (existingByEmail as { id: string } | null)?.id;
          if (!existingId) {
            skipped++;
            continue;
          }
          parentProfileId = existingId;
        } else {
          skipped++;
          continue;
        }
      } else if (!authRes?.user) {
        skipped++;
        continue;
      } else {
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
          // Rollback the dangling auth user so the parent can be re-imported.
          try {
            await serviceClient.auth.admin.deleteUser(authUserId);
          } catch {
            // best effort
          }
          skipped++;
          continue;
        }
        parentProfileId = (profile as { id: string }).id;
      }
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

    const { error: bkErr } = await serviceClient
      .from("import_batch_kids")
      .insert({ batch_id: batchId, kid_id: kidId });
    if (bkErr) {
      // Roll back the kid so it stays out of the system rather than orphaned.
      try {
        await serviceClient.from("kids").delete().eq("id", kidId);
      } catch {
        // best effort
      }
      skipped++;
      continue;
    }

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
