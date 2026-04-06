ALTER TABLE clubs ADD COLUMN due_day INTEGER NOT NULL DEFAULT 10
  CHECK (due_day >= 1 AND due_day <= 28);

ALTER TABLE clubs ADD COLUMN auto_approve_invoices BOOLEAN NOT NULL DEFAULT false;
