CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,
  subtotal INTEGER NOT NULL,
  discount_total INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  due_date DATE NOT NULL,
  status invoice_status NOT NULL DEFAULT 'generated',
  pdf_url TEXT,
  receipt_pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_invoices_parent_id ON invoices(parent_id);
CREATE INDEX idx_invoices_club_id ON invoices(club_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

CREATE UNIQUE INDEX idx_invoices_unique_period
  ON invoices(parent_id, club_id, period_month, period_year);

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  kid_id UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);
