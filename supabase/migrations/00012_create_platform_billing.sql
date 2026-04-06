CREATE TABLE platform_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,
  fixed_fee INTEGER NOT NULL,
  commission_percent NUMERIC(5,2) NOT NULL,
  total_collected INTEGER NOT NULL DEFAULT 0,
  commission_amount INTEGER NOT NULL DEFAULT 0,
  platform_revenue INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER platform_billing_updated_at
  BEFORE UPDATE ON platform_billing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE UNIQUE INDEX idx_platform_billing_unique
  ON platform_billing(club_id, period_month, period_year);
