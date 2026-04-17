"use client";

import { useState } from "react";
import { RutInput } from "@/components/shared/rut-input";
import { CHILEAN_BANKS, BANK_ACCOUNT_TYPES, type BankAccountType } from "@/lib/banks";
import { updateClubPaymentConfig } from "@/lib/actions/update-club-payment-config";
import type { Club } from "@/types";

interface Props {
  club: Club;
}

interface ToggleRowProps {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function ToggleRow({ id, label, description, tooltip, checked, onChange }: ToggleRowProps) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 py-3 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/20"
      />
      <div className="flex-1 text-sm">
        <div className="flex items-center gap-1 font-medium text-text">
          <span>{label}</span>
          {tooltip && (
            <span
              className="text-text-secondary cursor-help"
              title={tooltip}
              aria-label={tooltip}
            >
              (?)
            </span>
          )}
        </div>
        {description && <p className="text-text-secondary">{description}</p>}
      </div>
    </label>
  );
}

export function PaymentMethodsSection({ club }: Props) {
  const [pmCard, setPmCard] = useState(club.pm_card);
  const [pmFlowTransfer, setPmFlowTransfer] = useState(club.pm_flow_transfer);
  const [pmWallet, setPmWallet] = useState(club.pm_wallet);
  const [pmInstallments, setPmInstallments] = useState(club.pm_installments);
  const [pmDirectTransfer, setPmDirectTransfer] = useState(club.pm_direct_transfer);

  const [holderName, setHolderName] = useState(club.bank_holder_name ?? "");
  const [holderRut, setHolderRut] = useState(club.bank_holder_rut ?? "");
  const [rutValid, setRutValid] = useState(
    club.bank_holder_rut ? true : false
  );
  const [bankName, setBankName] = useState(club.bank_name ?? "");
  const [accountType, setAccountType] = useState<"" | BankAccountType>(
    (club.bank_account_type as BankAccountType | null) ?? ""
  );
  const [accountNumber, setAccountNumber] = useState(club.bank_account_number ?? "");
  const [notifEmail, setNotifEmail] = useState(club.bank_notification_email ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const anyEnabled =
      pmCard || pmFlowTransfer || pmWallet || pmInstallments || pmDirectTransfer;
    if (!anyEnabled) {
      setError("Debes habilitar al menos un método de pago");
      return;
    }
    if (pmDirectTransfer) {
      if (
        !holderName.trim() ||
        !holderRut.trim() ||
        !bankName ||
        !accountType ||
        !accountNumber.trim()
      ) {
        setError("Completa todos los datos bancarios para transferencia directa");
        return;
      }
      if (!rutValid) {
        setError("El RUT del titular no es válido");
        return;
      }
    }

    setSaving(true);
    const result = await updateClubPaymentConfig({
      pm_card: pmCard,
      pm_flow_transfer: pmFlowTransfer,
      pm_wallet: pmWallet,
      pm_installments: pmInstallments,
      pm_direct_transfer: pmDirectTransfer,
      bank_holder_name: holderName,
      bank_holder_rut: holderRut,
      bank_name: bankName,
      bank_account_type: accountType,
      bank_account_number: accountNumber,
      bank_notification_email: notifEmail,
    });
    setSaving(false);

    if (!result.success) {
      setError(result.error ?? "No pudimos guardar la configuración");
      return;
    }
    setSuccess(true);
  }

  const inputClass =
    "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
  const labelClass = "block text-sm font-medium text-text mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold text-text">Medios de pago</h2>
        <p className="text-sm text-text-secondary">
          Elige qué formas de pago ofreces a los padres.
        </p>
      </div>

      {error && (
        <div className="bg-danger-light text-danger text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-success-light text-success text-sm px-4 py-3 rounded-lg">
          Medios de pago guardados
        </div>
      )}

      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl px-4">
        <ToggleRow
          id="pm_card"
          label="Tarjeta de crédito o débito"
          description="Webpay · abono al día hábil siguiente"
          checked={pmCard}
          onChange={setPmCard}
        />
        <ToggleRow
          id="pm_flow_transfer"
          label="Transferencia bancaria Flow"
          description="Pago inmediato desde la banca online"
          tooltip="El padre transfiere desde su banco en línea, Flow concilia al instante."
          checked={pmFlowTransfer}
          onChange={setPmFlowTransfer}
        />
        <ToggleRow
          id="pm_wallet"
          label="Billetera digital"
          description="MachBank, Onepay"
          tooltip="Apps de billetera chilenas como MachBank y Onepay."
          checked={pmWallet}
          onChange={setPmWallet}
        />
        <ToggleRow
          id="pm_installments"
          label="Cuotas sin tarjeta"
          description="banca.me"
          tooltip="El padre paga en cuotas con banca.me. El club recibe el monto completo upfront."
          checked={pmInstallments}
          onChange={setPmInstallments}
        />
        <ToggleRow
          id="pm_direct_transfer"
          label="Transferencia directa a tu cuenta"
          description="Conciliación manual · tú marcas como pagado al recibir el comprobante"
          checked={pmDirectTransfer}
          onChange={setPmDirectTransfer}
        />
      </div>

      {pmDirectTransfer && (
        <div className="border border-gray-100 rounded-xl p-4 space-y-4">
          <p className="text-sm font-medium text-text">Datos bancarios</p>

          <div>
            <label htmlFor="bank_holder_name" className={labelClass}>
              Titular *
            </label>
            <input
              id="bank_holder_name"
              type="text"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>RUT del titular *</label>
            <RutInput
              value={holderRut}
              onChange={(value, isValid) => {
                setHolderRut(value);
                setRutValid(isValid);
              }}
            />
          </div>

          <div>
            <label htmlFor="bank_name" className={labelClass}>
              Banco *
            </label>
            <select
              id="bank_name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className={inputClass}
            >
              <option value="">Selecciona un banco</option>
              {CHILEAN_BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bank_account_type" className={labelClass}>
              Tipo de cuenta *
            </label>
            <select
              id="bank_account_type"
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as BankAccountType)}
              className={inputClass}
            >
              <option value="">Selecciona un tipo</option>
              {BANK_ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bank_account_number" className={labelClass}>
              Número de cuenta *
            </label>
            <input
              id="bank_account_number"
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="bank_notification_email" className={labelClass}>
              Email para comprobantes (opcional)
            </label>
            <input
              id="bank_notification_email"
              type="email"
              value={notifEmail}
              onChange={(e) => setNotifEmail(e.target.value)}
              className={inputClass}
              placeholder="pagos@miclub.cl"
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
      >
        {saving ? "Guardando..." : "Guardar medios de pago"}
      </button>
    </form>
  );
}
