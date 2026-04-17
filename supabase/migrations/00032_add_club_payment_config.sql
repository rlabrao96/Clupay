-- Payment method toggles per club. Defaults preserve current behavior
-- (all Flow methods enabled). Direct transfer defaults off until the
-- club fills in its bank data.
ALTER TABLE clubs
  ADD COLUMN pm_card                 BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pm_flow_transfer        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pm_wallet               BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pm_installments         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pm_direct_transfer      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN bank_holder_name        TEXT,
  ADD COLUMN bank_holder_rut         TEXT,
  ADD COLUMN bank_name               TEXT,
  ADD COLUMN bank_account_type       TEXT,
  ADD COLUMN bank_account_number     TEXT,
  ADD COLUMN bank_notification_email TEXT;

ALTER TABLE clubs
  ADD CONSTRAINT clubs_has_at_least_one_payment_method CHECK (
    pm_card OR pm_flow_transfer OR pm_wallet OR pm_installments OR pm_direct_transfer
  ),
  ADD CONSTRAINT clubs_direct_transfer_requires_bank_data CHECK (
    NOT pm_direct_transfer OR (
      bank_holder_name    IS NOT NULL AND
      bank_holder_rut     IS NOT NULL AND
      bank_name           IS NOT NULL AND
      bank_account_type   IN ('corriente', 'vista', 'ahorro') AND
      bank_account_number IS NOT NULL
    )
  );

-- Extend payment_method enum so payments.method can reflect the real channel.
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'flow_transfer';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'flow_wallet';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'flow_installments';
