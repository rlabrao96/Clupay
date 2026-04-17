"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { validateRut } from "@/lib/rut/validate";

export interface UpdateClubPaymentConfigInput {
  pm_card: boolean;
  pm_flow_transfer: boolean;
  pm_wallet: boolean;
  pm_installments: boolean;
  pm_direct_transfer: boolean;
  bank_holder_name: string;
  bank_holder_rut: string;
  bank_name: string;
  bank_account_type: "" | "corriente" | "vista" | "ahorro";
  bank_account_number: string;
  bank_notification_email: string;
}

interface UpdateResult {
  success: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateClubPaymentConfig(
  input: UpdateClubPaymentConfigInput
): Promise<UpdateResult> {
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) return { success: false, error: "No tienes un club asignado" };

  const anyEnabled =
    input.pm_card ||
    input.pm_flow_transfer ||
    input.pm_wallet ||
    input.pm_installments ||
    input.pm_direct_transfer;
  if (!anyEnabled) {
    return { success: false, error: "Debes habilitar al menos un método de pago" };
  }

  if (input.pm_direct_transfer) {
    const holder = input.bank_holder_name.trim();
    const rut = input.bank_holder_rut.trim();
    const bank = input.bank_name.trim();
    const accType = input.bank_account_type;
    const accNum = input.bank_account_number.trim();

    if (!holder || !rut || !bank || !accType || !accNum) {
      return {
        success: false,
        error: "Completa todos los datos bancarios para transferencia directa",
      };
    }
    if (!validateRut(rut)) {
      return { success: false, error: "El RUT del titular no es válido" };
    }
    if (!["corriente", "vista", "ahorro"].includes(accType)) {
      return { success: false, error: "Tipo de cuenta inválido" };
    }
  }

  const notifEmail = input.bank_notification_email.trim();
  if (notifEmail && !EMAIL_RE.test(notifEmail)) {
    return { success: false, error: "El email de notificación no es válido" };
  }

  const payload = input.pm_direct_transfer
    ? {
        pm_card: input.pm_card,
        pm_flow_transfer: input.pm_flow_transfer,
        pm_wallet: input.pm_wallet,
        pm_installments: input.pm_installments,
        pm_direct_transfer: true,
        bank_holder_name: input.bank_holder_name.trim(),
        bank_holder_rut: input.bank_holder_rut.trim(),
        bank_name: input.bank_name.trim(),
        bank_account_type: input.bank_account_type || null,
        bank_account_number: input.bank_account_number.trim(),
        bank_notification_email: notifEmail || null,
      }
    : {
        pm_card: input.pm_card,
        pm_flow_transfer: input.pm_flow_transfer,
        pm_wallet: input.pm_wallet,
        pm_installments: input.pm_installments,
        pm_direct_transfer: false,
        bank_holder_name: null,
        bank_holder_rut: null,
        bank_name: null,
        bank_account_type: null,
        bank_account_number: null,
        bank_notification_email: null,
      };

  const { error } = await supabase.from("clubs").update(payload).eq("id", clubId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/club/configuracion");
  return { success: true };
}
